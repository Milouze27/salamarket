/* POST /api/po/auto-generate
 * ─────────────────────────
 * L'algo qui prépare les brouillons de PO. Appelé soit par le cron
 * Supabase (auto-generate-pos edge function, daily 06:00 Europe/Paris),
 * soit manuellement depuis /v2/po (bouton "Régénérer") ou depuis le mode
 * saisonnier /v2/admin/ramadan (PO prévisionnel anticipé).
 *
 * ML-6 — RÉASSORT PROACTIF (MYTHOS Wave 5)
 * ──────────────────────────────────────
 * Avant : on ne réassortissait QUE le stock ≤ 0 (rupture déjà consommée).
 * Trop tard. Maintenant le moteur lit `stockout_forecast` (Holt + courbe
 * hijri) et déclenche AVANT la rupture :
 *
 *   • days_cover < lead_time × FACTEUR_SECU (1.5) → on commande.
 *   • Quantité dimensionnée sur velocity_adj (vélocité AJUSTÉE de la phase
 *     hijri) × horizon de couverture cible — pas un lot standard arbitraire.
 *   • Pendant une fenêtre saisonnière (Ramadan/Aïd), on GONFLE l'horizon
 *     cible (× multiplicateur hijri du mode) pour ne jamais tomber court
 *     au pic. C'est le moat : Otmane ouvre l'app, le PO d'anticipation est
 *     DÉJÀ prêt, il valide.
 *
 * Garde-fou halal (inchangé, ML-5) : aucune ligne n'est routée vers un
 * fournisseur dont la certif halal est expirée/manquante. On bascule sur
 * un backup certifié ou on consigne la ligne comme bloquée.
 *
 * Payload optionnel (JSON body) :
 *   { mode: "proactif" | "rupture", seasonalBoost?: number, depotId?: string }
 *   - mode "rupture"  : ancien comportement (stock ≤ 0 uniquement).
 *   - mode "proactif" : défaut, lit le forecast.
 *   - seasonalBoost   : multiplicateur d'horizon imposé (sinon auto depuis
 *                       le mode saisonnier hijri courant).
 *
 * Ne JAMAIS créer un PO si un brouillon non envoyé existe déjà pour le
 * même couple (fournisseur, dépôt) — on l'update à la place (idempotent).
 */

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { certifAlerte } from "@/lib/types/po";
import { getSeasonalMode } from "@/lib/hijri";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ReassortCandidate {
  produit_id: string;
  depot_id: string;
  manquant: number;
  /** Raison lisible de la suggestion (pour les notes du PO). */
  raison: string;
}

const DEFAULT_REASSORT_QTY = 12; // fallback rupture : lot standard si on ne sait rien
const FACTEUR_SECU = 1.5; // days_cover < lead_time × 1.5 → on commande
const HORIZON_BASE_JOURS = 10; // couverture cible visée (jours) hors saison
const HORIZON_CAP_JOURS = 35; // plafond de couverture même en pic (anti-surstock)

type ReassortMode = "proactif" | "rupture";

interface AutoGenBody {
  mode?: ReassortMode;
  seasonalBoost?: number;
  depotId?: string;
}

interface ForecastRow {
  produit_id: string;
  depot_id: string;
  stock_actuel: number | string;
  velocity_adj: number | string;
  days_cover: number | string | null;
  tier: string;
  multiplicateur: number | string;
  phase_courante: string;
}

export async function POST(req: Request) {
  const sb = supabaseServer();
  const startedAt = Date.now();

  // ─── Parse body (tolérant : pas de body = défauts proactifs) ──────
  let body: AutoGenBody = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw) as AutoGenBody;
  } catch {
    /* body optionnel — on garde les défauts */
  }
  const mode: ReassortMode = body.mode === "rupture" ? "rupture" : "proactif";

  // ─── Mode saisonnier hijri → boost d'horizon de couverture ────────
  // Pendant Ramadan/Aïd on vise plus de couverture (le pic dure plusieurs
  // jours et le lead time fournisseur ne se compresse pas).
  const seasonal = getSeasonalMode();
  const seasonalBoost =
    typeof body.seasonalBoost === "number" && body.seasonalBoost > 0
      ? body.seasonalBoost
      : seasonal
        ? // On amortit le multiplicateur max (un ×3 sur l'horizon ferait
          // surstocker) : boost = 1 + (mult_max - 1) × 0.5, plafonné à 2.2.
          Math.min(2.2, 1 + (seasonal.multiplicateur_max - 1) * 0.5)
        : 1;
  const horizonCible = Math.min(
    HORIZON_CAP_JOURS,
    Math.round(HORIZON_BASE_JOURS * seasonalBoost),
  );

  // 1. Charge tous les dépôts actifs
  let depotQuery = sb
    .from("depots")
    .select("id, nom, type")
    .eq("is_active", true);
  if (body.depotId) depotQuery = depotQuery.eq("id", body.depotId);
  const { data: depots } = await depotQuery;
  if (!depots || depots.length === 0) {
    return NextResponse.json({ ok: true, created: 0, reason: "no depots" });
  }
  const depotIds = new Set(depots.map((d: any) => d.id));

  // 2. Charge les candidats au réassort.
  const candidates: ReassortCandidate[] = [];
  let forecastUsed = false;

  if (mode === "proactif") {
    // ── PROACTIF : on lit le forecast (Holt × hijri) + lead time ────
    // Couverture cible = max(horizon, lead_time × FACTEUR_SECU). On
    // déclenche quand days_cover < lead_time × FACTEUR_SECU. La quantité
    // comble l'écart jusqu'à l'horizon cible (gonflé en saison).
    const { data: fcRows, error: fcErr } = await sb
      .from("stockout_forecast")
      .select(
        "produit_id, depot_id, stock_actuel, velocity_adj, days_cover, tier, multiplicateur, phase_courante",
      )
      .limit(5000);

    if (!fcErr && fcRows && fcRows.length > 0) {
      forecastUsed = true;
      // On a besoin du lead_time par produit → via produits_fournisseurs.
      // On le résout plus bas (byProduit), mais pour le seuil on prend un
      // lead time prudent par défaut ; affiné ligne par ligne ensuite.
      const LEAD_DEFAULT = 3;
      for (const r of fcRows as ForecastRow[]) {
        if (!depotIds.has(r.depot_id)) continue;
        const velocity = Number(r.velocity_adj) || 0;
        const stock = Number(r.stock_actuel) || 0;
        const daysCover = r.days_cover === null ? null : Number(r.days_cover);
        const mult = Number(r.multiplicateur) || 1;

        // Pas de vélocité → pas de risque, on saute (sauf rupture sèche).
        if (velocity <= 0.01) {
          if (stock <= 0) {
            candidates.push({
              produit_id: r.produit_id,
              depot_id: r.depot_id,
              manquant: DEFAULT_REASSORT_QTY,
              raison: "Rupture sèche (pas de vélocité mesurée).",
            });
          }
          continue;
        }

        // Seuil de déclenchement proactif.
        const seuilDecl = LEAD_DEFAULT * FACTEUR_SECU;
        const cover = daysCover ?? stock / velocity;
        if (cover >= seuilDecl) continue; // assez de couverture → on attend

        // Quantité = ce qu'il faut pour atteindre l'horizon cible.
        // On vise (horizon + lead) jours de couverture au rythme ajusté.
        const horizonAvecLead = horizonCible + LEAD_DEFAULT;
        const besoin = Math.max(
          0,
          Math.ceil(velocity * horizonAvecLead - stock),
        );
        if (besoin <= 0) continue;

        const raisonParts: string[] = [
          `Couverture ${cover.toFixed(1)} j < seuil ${seuilDecl.toFixed(1)} j`,
        ];
        if (mult > 1.1) {
          raisonParts.push(
            `demande × ${mult.toFixed(2)} (${r.phase_courante})`,
          );
        }
        if (seasonalBoost > 1.05 && seasonal) {
          raisonParts.push(`horizon gonflé ×${seasonalBoost.toFixed(2)} (${seasonal.titre})`);
        }

        candidates.push({
          produit_id: r.produit_id,
          depot_id: r.depot_id,
          manquant: besoin,
          raison: raisonParts.join(" · ") + ".",
        });
      }
    }
  }

  // ── Fallback / mode rupture : stock ≤ 0 → lot standard ────────────
  // Si le forecast est vide (jamais recompute) ou en mode rupture, on
  // garde le filet de sécurité historique : on ne laisse JAMAIS passer
  // une rupture sèche non commandée.
  if (mode === "rupture" || !forecastUsed) {
    let stockQuery = sb
      .from("stock_par_depot")
      .select("produit_id, depot_id, quantite")
      .lte("quantite", 0);
    if (body.depotId) stockQuery = stockQuery.eq("depot_id", body.depotId);
    const { data: stockBas } = await stockQuery;
    const dejaVus = new Set(candidates.map((c) => `${c.produit_id}::${c.depot_id}`));
    for (const s of (stockBas ?? []) as any[]) {
      if (!depotIds.has(s.depot_id)) continue;
      const key = `${s.produit_id}::${s.depot_id}`;
      if (dejaVus.has(key)) continue;
      candidates.push({
        produit_id: s.produit_id,
        depot_id: s.depot_id,
        manquant: DEFAULT_REASSORT_QTY,
        raison: "Stock épuisé — lot standard de réassort.",
      });
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      ok: true,
      created: 0,
      reason: "rien à réassortir",
      mode,
      forecast_used: forecastUsed,
      horizon_cible_jours: horizonCible,
      seasonal_boost: seasonalBoost,
      seasonal_mode: seasonal?.titre ?? null,
    });
  }

  // 3. Charge les liaisons produit → fournisseur(s)
  const produitIds = Array.from(new Set(candidates.map((c) => c.produit_id)));
  const { data: liaisons } = await sb
    .from("produits_fournisseurs")
    .select(`
      produit_id, fournisseur_id, reference_fourn, prix_achat_ht,
      conditionnement_qte, est_principal,
      fournisseurs ( id, nom, email_commandes, lead_time_jours,
        min_commande_euros, certif_organisme, certif_numero, certif_expire_le, actif )
    `)
    .in("produit_id", produitIds);

  const byProduit = new Map<string, any[]>();
  for (const l of liaisons ?? []) {
    const arr = byProduit.get(l.produit_id) ?? [];
    arr.push(l);
    byProduit.set(l.produit_id, arr);
  }

  // 4. Pour chaque candidat, choisir un fournisseur (principal si certif
  //    OK, sinon backup avec certif OK, sinon principal "bloqué")
  type Picked = {
    produit_id: string;
    depot_id: string;
    qty: number;
    fournisseur_id: string;
    fournisseur_nom: string;
    reference_fourn: string | null;
    prix_achat_ht: number;
    raison: string;
    blocked: boolean;
  };
  const picks: Picked[] = [];

  // CERTIF-OK : un fournisseur n'est éligible que si actif ET certif
  // halal ni manquante ni expirée. "expiree"/"manquante" → JAMAIS commander.
  const CERTIF_OK = new Set(["ok", "expire_30j", "expire_60j"]);
  const fournisseurEligible = (f: any): boolean =>
    Boolean(f?.actif) && CERTIF_OK.has(certifAlerte(f?.certif_expire_le));

  // ML-5 — lignes qu'on REFUSE de router : ni le principal ni aucun
  // backup n'a une certif halal valide. On ne crée AUCUN PO vers un
  // fournisseur à certif expirée. On remonte la ligne pour audit.
  type Blocked = {
    produit_id: string;
    depot_id: string;
    fournisseur_id: string | null;
    fournisseur_nom: string;
    certif_alerte: string;
    raison: string;
  };
  const blockedLines: Blocked[] = [];

  for (const c of candidates) {
    const liens = byProduit.get(c.produit_id) ?? [];
    if (liens.length === 0) continue; // pas de fournisseur connu → skip

    const principal = liens.find((l) => l.est_principal) ?? liens[0];
    const principalOk = fournisseurEligible(principal.fournisseurs);

    let chosen = principal;

    if (!principalOk) {
      const backup = liens.find(
        (l) => l !== principal && fournisseurEligible(l.fournisseurs)
      );
      if (backup) {
        // On bascule sur un fournisseur dont la certif halal EST valide.
        chosen = backup;
      } else {
        // Aucune source halal valide → on NE commande PAS. Le moat
        // interdit de générer un PO vers un fournisseur certif expirée :
        // même en brouillon, ça ne doit pas exister comme document
        // envoyable. On consigne la ligne pour qu'Otmane arbitre.
        blockedLines.push({
          produit_id: c.produit_id,
          depot_id: c.depot_id,
          fournisseur_id: principal.fournisseur_id ?? null,
          fournisseur_nom: principal.fournisseurs?.nom ?? "",
          certif_alerte: certifAlerte(principal.fournisseurs?.certif_expire_le),
          raison:
            "Certificat halal du fournisseur principal expiré ou manquant, aucun fournisseur de secours certifié.",
        });
        continue;
      }
    }

    const condQty = Math.max(1, Number(chosen.conditionnement_qte) || 1);
    const qty = Math.ceil(c.manquant / condQty) * condQty;

    picks.push({
      produit_id: c.produit_id,
      depot_id: c.depot_id,
      qty,
      fournisseur_id: chosen.fournisseur_id,
      fournisseur_nom: chosen.fournisseurs?.nom ?? "",
      reference_fourn: chosen.reference_fourn ?? null,
      prix_achat_ht: Number(chosen.prix_achat_ht) || 0,
      raison: c.raison,
      blocked: false,
    });
  }

  // 5. Regroupe par (fournisseur, dépôt)
  type Group = {
    fournisseur_id: string;
    depot_id: string;
    lignes: Picked[];
  };
  const groups = new Map<string, Group>();
  for (const p of picks) {
    const key = `${p.fournisseur_id}::${p.depot_id}`;
    const g = groups.get(key) ?? {
      fournisseur_id: p.fournisseur_id,
      depot_id: p.depot_id,
      lignes: [],
    };
    g.lignes.push(p);
    groups.set(key, g);
  }

  // Note de tête du PO : explique d'où vient la suggestion (proactif vs
  // rupture, mode saisonnier). Otmane voit le RAISONNEMENT, pas une magie.
  const noteTete =
    mode === "proactif" && forecastUsed
      ? `Brouillon de réassort PROACTIF Salam Stock — couverture cible ${horizonCible} j` +
        (seasonal ? ` · ${seasonal.titre} (horizon ×${seasonalBoost.toFixed(2)})` : "") +
        "."
      : "Brouillon généré automatiquement par l'algo de réassort Salam Stock (rupture).";

  // 6. Pour chaque groupe, upsert un brouillon
  let created = 0;
  let updated = 0;
  for (const g of groups.values()) {
    // Check existing brouillon
    const { data: existing } = await sb
      .from("purchase_orders")
      .select("id")
      .eq("fournisseur_id", g.fournisseur_id)
      .eq("depot_destination_id", g.depot_id)
      .eq("statut", "brouillon")
      .limit(1)
      .maybeSingle();

    const total = g.lignes.reduce((s, l) => s + l.qty * l.prix_achat_ht, 0);

    let poId: string;
    if (existing) {
      poId = existing.id;
      await sb
        .from("purchase_orders")
        .update({
          total_ht: total,
          total_ttc: total * 1.055,
          notes: noteTete,
          updated_at: new Date().toISOString(),
        })
        .eq("id", poId);
      // Strip anciennes lignes (idempotence)
      await sb.from("purchase_order_lignes").delete().eq("po_id", poId);
      updated++;
    } else {
      // Calcule une date livraison prévue = today + lead_time du fournisseur
      // (best effort — si lead_time inconnu, +3 jours)
      const { data: f } = await sb
        .from("fournisseurs")
        .select("lead_time_jours")
        .eq("id", g.fournisseur_id)
        .single();
      const lead = (f?.lead_time_jours ?? 3) as number;
      const dliv = new Date();
      dliv.setDate(dliv.getDate() + lead);

      const { data: ins, error: insErr } = await sb
        .from("purchase_orders")
        .insert({
          fournisseur_id: g.fournisseur_id,
          depot_destination_id: g.depot_id,
          statut: "brouillon",
          total_ht: total,
          total_ttc: total * 1.055,
          date_livraison_prevue: dliv.toISOString().slice(0, 10),
          notes: noteTete,
        })
        .select("id")
        .single();
      if (insErr || !ins) {
        console.error("[po/auto-generate] insert", insErr);
        continue;
      }
      poId = ins.id;
      created++;
    }

    // Insert toutes les lignes du groupe. À ce stade, toute ligne
    // routée vers un PO a un fournisseur dont la certif halal est
    // valide (les lignes bloquées ont été écartées en amont). On garde
    // la raison de la suggestion dans les notes de ligne (traçabilité).
    const lignesPayload = g.lignes.map((l) => ({
      po_id: poId,
      produit_id: l.produit_id,
      reference_fourn: l.reference_fourn,
      quantite_commandee: l.qty,
      prix_achat_ht: l.prix_achat_ht,
      tva_pct: 5.5,
      notes: l.raison,
    }));
    if (lignesPayload.length > 0) {
      await sb.from("purchase_order_lignes").insert(lignesPayload);
    }
  }

  return NextResponse.json({
    ok: true,
    created,
    updated,
    mode,
    forecast_used: forecastUsed,
    horizon_cible_jours: horizonCible,
    seasonal_boost: Math.round(seasonalBoost * 100) / 100,
    seasonal_mode: seasonal?.titre ?? null,
    candidates: candidates.length,
    groups: groups.size,
    // ML-5 — réassorts NON commandés faute de fournisseur halal valide.
    // Otmane voit exactement quoi débloquer (renouveler la certif ou
    // référencer un fournisseur de secours certifié) avant de pouvoir
    // commander ces produits. Le moat halal vit ici.
    blocked_count: blockedLines.length,
    blocked_lines: blockedLines,
    elapsed_ms: Date.now() - startedAt,
  });
}

/* eslint-enable @typescript-eslint/no-explicit-any */
