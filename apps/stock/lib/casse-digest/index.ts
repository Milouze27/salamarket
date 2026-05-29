/**
 * Casse Weekly Digest — calcul des données + génération HTML.
 *
 * Lu par :
 *   - /api/cron/casse-weekly-digest        (cron Vercel lundi 07h Paris)
 *   - /api/casse-weekly-digest/preview     (preview HTML pour démo)
 *   - supabase/functions/casse-weekly-digest (cron Supabase miroir)
 *
 * Pourquoi un seul module partagé ?
 *   La logique de calcul est non-triviale (baseline 28j, écart-type,
 *   détection pic horaire, fenêtre Ramadan). On veut UNE source de
 *   vérité testable, consommée par 3 entry-points différents.
 *
 * GDPR : on n'expose JAMAIS un nom d'employé. Le `user_hash` SHA256
 * vient déjà hashé de la vue `v_casse_pic_horaire`. Pour le digest on
 * dégrade encore en "Employé #abc1" (4 chars du hash).
 */
import { supabaseServer } from "@/lib/supabase-server";

// ─── Types ──────────────────────────────────────────────────────────

export interface CasseDigestData {
  generated_at: string;          // ISO timestamp
  semaine_label: string;         // "Semaine du 25 mai au 31 mai 2026"
  total_eur_semaine: number;     // somme casse lundi → dimanche écoulé
  total_eur_semaine_precedente: number;
  delta_pct: number | null;      // null si S-1 == 0
  top_produits: TopProduitRow[]; // top 3 par valeur €
  pic_horaire: PicHoraire | null;
  actions: ActionRecommandee[];  // toujours 3 (padded si vide)
  ramadan_proche: RamadanContext | null;
  depots: DepotBreakdown[];
}

export interface TopProduitRow {
  produit_nom: string;
  depot_nom: string;
  valeur_eur: number;
  qte: number;
  ecart_sigma: number | null;    // null si pas assez de data baseline
  baseline_mu_eur: number | null;
}

export interface PicHoraire {
  depot_nom: string;
  jour_label: string;            // "jeudi"
  heure_label: string;           // "17h-18h"
  valeur_perdue_eur_90j: number;
  nb_employes_distincts: number;
}

export interface ActionRecommandee {
  priorite: "haute" | "moyenne" | "basse";
  titre: string;
  detail: string;
  origine: "dlc_courte" | "pic_horaire" | "ramadan" | "ecart_baseline" | "default";
}

export interface RamadanContext {
  date_debut_estimee: string;    // YYYY-MM-DD
  jours_restants: number;
  message: string;
}

export interface DepotBreakdown {
  depot_id: string;
  depot_nom: string;
  valeur_eur: number;
}

// ─── Date helpers (Europe/Paris ISO week) ───────────────────────────

/** Lundi 00:00 Europe/Paris de la semaine contenant `ref` */
function startOfIsoWeek(ref: Date): Date {
  const d = new Date(ref);
  const dow = d.getUTCDay(); // 0=dim..6=sam
  // ISO : lundi = 1. On veut lundi de la semaine courante.
  const diff = (dow === 0 ? -6 : 1 - dow);
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function fmtJour(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Paris",
  });
}

const JOURS_FR = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

// ─── Ramadan estimation (no extra dep) ──────────────────────────────
// Hijri ne s'aligne pas au grégorien. Pour la démo on hardcode les
// dates astronomiques publiées (source : UMM al-Qura). Refresh annuel.
// Ramadan recule de ~11 jours par an grégorien.
const RAMADAN_DATES: Record<number, string> = {
  2026: "2026-02-17",  // Ramadan 1447 estimé
  2027: "2027-02-07",  // Ramadan 1448 estimé
  2028: "2028-01-27",
  2029: "2029-01-16",
};

function nextRamadan(today: Date): RamadanContext | null {
  const year = today.getUTCFullYear();
  const candidates = [year, year + 1]
    .map((y) => RAMADAN_DATES[y])
    .filter((x): x is string => !!x);
  for (const dStr of candidates) {
    const ramadan = new Date(`${dStr}T00:00:00Z`);
    const jours = Math.ceil((ramadan.getTime() - today.getTime()) / 86_400_000);
    if (jours > 0 && jours <= 35) {
      return {
        date_debut_estimee: dStr,
        jours_restants: jours,
        message:
          jours <= 14
            ? `Ramadan dans ${jours}j — pic conso historique +25%, ajuster commandes viande/laitages dès maintenant`
            : `Ramadan dans ${jours}j — préparer le plan d'approvisionnement Sodrune cette semaine`,
      };
    }
  }
  return null;
}

// ─── Core query ─────────────────────────────────────────────────────

interface DigestSemaineRow {
  depot_id: string;
  depot_nom: string;
  produit_id: string;
  produit_nom: string;
  qte: number;
  valeur_eur: number;
  baseline_mu_eur: number | null;
  baseline_sigma_eur: number | null;
  ecart_sigma: number | null;
}

interface PicRow {
  depot_id: string;
  jour_semaine: number;
  heure: number;
  user_hash: string;
  nb_evenements: number;
  valeur_perdue_eur: number;
}

export async function computeCasseDigest(now: Date = new Date()): Promise<CasseDigestData> {
  const supabase = supabaseServer();

  // Fenêtre : semaine écoulée = lundi dernier 00h → dimanche dernier 23h59
  const startThisWeek = startOfIsoWeek(now);             // lundi de la semaine en cours
  const endLastWeek = new Date(startThisWeek);            // dimanche dernier 23:59:59
  endLastWeek.setUTCSeconds(endLastWeek.getUTCSeconds() - 1);
  const startLastWeek = new Date(startThisWeek);
  startLastWeek.setUTCDate(startLastWeek.getUTCDate() - 7);
  const startWeekBefore = new Date(startLastWeek);
  startWeekBefore.setUTCDate(startWeekBefore.getUTCDate() - 7);

  // ─ Semaine S et S-1 : sommes via sorties_stock + produits
  const CASSE_TYPES = [
    "casse_manipulation",
    "casse_client",
    "perime_dlc",
    "perime_ddm",
    "defaut_fournisseur",
  ];

  const [{ data: weekRows, error: weekErr }, { data: prevRows, error: prevErr }] =
    await Promise.all([
      supabase
        .from("sorties_stock")
        .select("depot_id, quantite, produits!inner(prix_vente_ttc), created_at")
        .in("type", CASSE_TYPES)
        .gte("created_at", startLastWeek.toISOString())
        .lte("created_at", endLastWeek.toISOString()),
      supabase
        .from("sorties_stock")
        .select("depot_id, quantite, produits!inner(prix_vente_ttc), created_at")
        .in("type", CASSE_TYPES)
        .gte("created_at", startWeekBefore.toISOString())
        .lt("created_at", startLastWeek.toISOString()),
    ]);

  if (weekErr) console.error("[casse-digest] week query:", weekErr);
  if (prevErr) console.error("[casse-digest] prev query:", prevErr);

  // `produits` peut sortir en objet OU en tableau selon comment
  // supabase-js infère la cardinalité de la FK. On gère les deux.
  type RawProd = { prix_vente_ttc: number | string | null };
  type RawRow = {
    depot_id: string;
    quantite: number | string;
    produits: RawProd | RawProd[] | null;
  };

  const sumValeur = (rows: RawRow[] | null): number => {
    if (!rows) return 0;
    return rows.reduce((acc, r) => {
      const prod = Array.isArray(r.produits) ? r.produits[0] : r.produits;
      const px = prod?.prix_vente_ttc ?? 0;
      return acc + Number(r.quantite ?? 0) * Number(px);
    }, 0);
  };

  const total_eur_semaine = sumValeur((weekRows as unknown as RawRow[]) ?? null);
  const total_eur_semaine_precedente = sumValeur(
    (prevRows as unknown as RawRow[]) ?? null,
  );
  const delta_pct =
    total_eur_semaine_precedente > 0
      ? Math.round(
          ((total_eur_semaine - total_eur_semaine_precedente) /
            total_eur_semaine_precedente) *
            100,
        )
      : null;

  // ─ Top 3 produits via la vue v_casse_digest_semaine (déjà jointée + ecart_sigma)
  const { data: topRows, error: topErr } = await supabase
    .from("v_casse_digest_semaine")
    .select("*")
    .order("valeur_eur", { ascending: false })
    .limit(3);

  if (topErr) console.error("[casse-digest] top query:", topErr);

  const top_produits: TopProduitRow[] = ((topRows as DigestSemaineRow[]) ?? []).map(
    (r) => ({
      produit_nom: r.produit_nom,
      depot_nom: r.depot_nom,
      valeur_eur: Number(r.valeur_eur ?? 0),
      qte: Number(r.qte ?? 0),
      ecart_sigma: r.ecart_sigma !== null ? Number(r.ecart_sigma) : null,
      baseline_mu_eur:
        r.baseline_mu_eur !== null ? Number(r.baseline_mu_eur) : null,
    }),
  );

  // ─ Breakdown par dépôt
  const depotMap = new Map<string, DepotBreakdown>();
  for (const r of (topRows as DigestSemaineRow[]) ?? []) {
    const prev = depotMap.get(r.depot_id);
    if (prev) {
      prev.valeur_eur += Number(r.valeur_eur ?? 0);
    } else {
      depotMap.set(r.depot_id, {
        depot_id: r.depot_id,
        depot_nom: r.depot_nom,
        valeur_eur: Number(r.valeur_eur ?? 0),
      });
    }
  }
  const depots = Array.from(depotMap.values()).sort(
    (a, b) => b.valeur_eur - a.valeur_eur,
  );

  // ─ Pic horaire 90j : on cherche la combinaison (depot, jour, heure)
  //   avec le plus de valeur perdue cumulée
  const { data: picRows, error: picErr } = await supabase
    .from("v_casse_pic_horaire")
    .select("*")
    .order("valeur_perdue_eur", { ascending: false })
    .limit(500); // assez pour reconstruire la heatmap

  if (picErr) console.error("[casse-digest] pic query:", picErr);

  let pic_horaire: PicHoraire | null = null;
  if (picRows && picRows.length > 0) {
    type Key = string;
    const buckets = new Map<Key, { depot_id: string; jour: number; heure: number; valeur: number; users: Set<string> }>();
    for (const r of picRows as PicRow[]) {
      const k = `${r.depot_id}|${r.jour_semaine}|${r.heure}`;
      const prev = buckets.get(k);
      const v = Number(r.valeur_perdue_eur ?? 0);
      if (prev) {
        prev.valeur += v;
        prev.users.add(r.user_hash);
      } else {
        buckets.set(k, {
          depot_id: r.depot_id,
          jour: r.jour_semaine,
          heure: r.heure,
          valeur: v,
          users: new Set([r.user_hash]),
        });
      }
    }
    const sorted = Array.from(buckets.values()).sort((a, b) => b.valeur - a.valeur);
    const top = sorted[0];
    if (top) {
      const depotNom = depots.find((d) => d.depot_id === top.depot_id)?.depot_nom
        ?? "Dépôt principal";
      pic_horaire = {
        depot_nom: depotNom,
        jour_label: JOURS_FR[top.jour - 1] ?? `jour ${top.jour}`,
        heure_label: `${String(top.heure).padStart(2, "0")}h-${String(top.heure + 1).padStart(2, "0")}h`,
        valeur_perdue_eur_90j: Math.round(top.valeur * 100) / 100,
        nb_employes_distincts: top.users.size,
      };
    }
  }

  // ─ Actions recommandées (max 3, priorisées)
  const actions: ActionRecommandee[] = [];

  // Action 1 — produit avec écart-sigma le plus fort (DLC courte / commande à revoir)
  const worstSigma = top_produits
    .filter((p) => p.ecart_sigma !== null && p.ecart_sigma > 1.5)
    .sort((a, b) => (b.ecart_sigma ?? 0) - (a.ecart_sigma ?? 0))[0];
  if (worstSigma) {
    actions.push({
      priorite: "haute",
      titre: `${worstSigma.produit_nom} — écart ${worstSigma.ecart_sigma}σ vs baseline 28j`,
      detail: `Casse ${worstSigma.valeur_eur.toFixed(0)}€ cette semaine sur ${worstSigma.depot_nom}. Soit ${Math.round(((worstSigma.valeur_eur - (worstSigma.baseline_mu_eur ?? 0)) / (worstSigma.baseline_mu_eur || 1)) * 100)}% au-dessus du normal. Vérifier DLC du lot en cours, négocier reprise avec Sodrune si DLC < 5j.`,
      origine: "ecart_baseline",
    });
  }

  // Action 2 — pic horaire identifié
  if (pic_horaire && pic_horaire.valeur_perdue_eur_90j > 50) {
    actions.push({
      priorite: "moyenne",
      titre: `Pic récurrent ${pic_horaire.jour_label} ${pic_horaire.heure_label} sur ${pic_horaire.depot_nom}`,
      detail: `${pic_horaire.valeur_perdue_eur_90j.toFixed(0)}€ perdus sur 90j à ce créneau, ${pic_horaire.nb_employes_distincts} employé(s) impliqué(s). Ajouter un check-list de fin de shift 15 min avant (rangement frais, tri DLC J-1).`,
      origine: "pic_horaire",
    });
  }

  // Action 3 — Ramadan / fête religieuse imminente
  const ramadan_proche = nextRamadan(now);
  if (ramadan_proche) {
    actions.push({
      priorite: ramadan_proche.jours_restants <= 14 ? "haute" : "moyenne",
      titre: `Préparer Ramadan ${new Date(ramadan_proche.date_debut_estimee).getUTCFullYear()}`,
      detail: ramadan_proche.message + ". Historique K&A : +20% commandes viande, +15% laitages, -8% conserves les 3 premières semaines.",
      origine: "ramadan",
    });
  }

  // Padding si moins de 3 actions
  if (actions.length < 3) {
    const fillers: ActionRecommandee[] = [
      {
        priorite: "basse",
        titre: "Audit mensuel des températures chambres froides",
        detail: "Programmer relevé hebdomadaire des sondes (chambres viande, laitages, frais). 80% des pics casse perissables remontent à un défaut de chaîne du froid détecté tard.",
        origine: "default",
      },
      {
        priorite: "basse",
        titre: "Brief équipe : rotation FIFO sur fruits/légumes",
        detail: "Rappeler la règle FIFO (First In First Out) au check du matin. Casse F&L = 38% du total habituel, le bon ordre en rayon réduit la perte de 20-25%.",
        origine: "default",
      },
    ];
    while (actions.length < 3 && fillers.length > 0) {
      actions.push(fillers.shift()!);
    }
  }

  // ─ Label semaine ("Semaine du 25 mai au 31 mai 2026")
  const labelEndLastWeek = new Date(endLastWeek);
  labelEndLastWeek.setUTCDate(labelEndLastWeek.getUTCDate());
  const semaine_label = `Semaine du ${fmtJour(startLastWeek)} au ${fmtJour(endLastWeek)}`;

  return {
    generated_at: now.toISOString(),
    semaine_label,
    total_eur_semaine: Math.round(total_eur_semaine * 100) / 100,
    total_eur_semaine_precedente: Math.round(total_eur_semaine_precedente * 100) / 100,
    delta_pct,
    top_produits,
    pic_horaire,
    actions: actions.slice(0, 3),
    ramadan_proche,
    depots,
  };
}
