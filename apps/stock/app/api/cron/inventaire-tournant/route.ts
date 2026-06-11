/**
 * GET /api/cron/inventaire-tournant
 *
 * Cron Vercel quotidien (`0 7 * * *` UTC = 9h Paris en été).
 * Pour chaque dépôt actif (hors entrepôt) :
 *   1. Tire au sort UN employé du dépôt
 *   2. Lui assigne 7 produits aléatoires
 *   3. Lui envoie une push notif iPhone "Inventaire tournant à faire"
 *
 * Auth : Bearer ${CRON_SECRET} si défini, sinon GET libre (démo).
 */

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface DepotRow {
  id: string;
  nom: string;
  type: string;
}
interface EmpRow {
  id: string;
  prenom: string | null;
  nom: string;
}
interface StockRow {
  produit_id: string;
  quantite: number;
  cout_achat_ht: number | null;
  prix_vente: number | null;
}
interface MovementRow {
  produit_id: string;
  delta: number;
}
interface DernierComptageRow {
  produit_id: string;
  dernier_comptage_at: string | null;
}

export async function GET(req: Request) {
  // SÉCURITÉ (durci 2026-05-31) : refuse si CRON_SECRET non configuré.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/inventaire-tournant] CRON_SECRET non configuré");
    return NextResponse.json(
      { error: "cron_misconfigured" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({
      ok: true,
      mode: "noop",
      reason: "Supabase non configuré — cron noop.",
    });
  }
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Dépôts actifs (hors entrepôt — Sodrune n'a pas d'inventaire tournant)
  const { data: depotsRaw, error: e1 } = await sb
    .from("depots")
    .select("id, nom, type")
    .eq("is_active", true);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const depots = (depotsRaw ?? []).filter(
    (d) => (d as DepotRow).type !== "entrepot"
  ) as DepotRow[];

  const today = new Date().toISOString().slice(0, 10);
  const summary: Array<{
    depot: string;
    employe: string | null;
    products: number;
    pushSent: boolean;
    skipped?: string;
  }> = [];

  // URL absolue pour fetch interne (push send)
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    req.headers.get("origin") ||
    `https://${req.headers.get("host") ?? "salam-stock.vercel.app"}`;

  for (const d of depots) {
    // 2. Skip si batch du jour déjà créé
    const { data: existing } = await sb
      .from("inventaires_tournants")
      .select("id")
      .eq("depot_id", d.id)
      .eq("date_assignation", today)
      .limit(1);
    if (existing && existing.length > 0) {
      summary.push({
        depot: d.nom,
        employe: null,
        products: 0,
        pushSent: false,
        skipped: "batch déjà existant",
      });
      continue;
    }

    // 3. Employés du dépôt
    const { data: empsRaw } = await sb
      .from("employes")
      .select("id, prenom, nom")
      .eq("depot_principal_id", d.id)
      .eq("is_active", true);
    const emps = (empsRaw ?? []) as EmpRow[];
    if (emps.length === 0) {
      summary.push({
        depot: d.nom,
        employe: null,
        products: 0,
        pushSent: false,
        skipped: "aucun employé actif",
      });
      continue;
    }

    // 4. Tire UN seul employé random
    const chosen = emps[Math.floor(Math.random() * emps.length)];

    // 5. Stock visible avec qty > 0
    const { data: stockRaw } = await sb
      .from("stock_par_depot")
      .select("produit_id, quantite, cout_achat_ht, prix_vente")
      .eq("depot_id", d.id)
      .eq("is_visible", true)
      .gt("quantite", 0);
    const stock = (stockRaw ?? []) as StockRow[];
    if (stock.length === 0) {
      summary.push({
        depot: d.nom,
        employe: `${chosen.prenom ?? ""} ${chosen.nom}`.trim(),
        products: 0,
        pushSent: false,
        skipped: "aucun produit en stock",
      });
      continue;
    }

    // 5b. INVENTAIRE GUIDÉ IA — scoreur déterministe de sélection.
    // On compte en priorité ce qui PÈSE le plus si l'écart est réel :
    //   score = valeur immobilisée × rotation × ancienneté du dernier comptage.
    // - valeur    = quantite × (cout_achat_ht ou prix_vente) → un écart sur un
    //               produit cher coûte plus → on le surveille de près.
    // - rotation  = volume sorti sur 30 j → un produit qui tourne vite dérive
    //               plus vite (casse, vol, erreurs de caisse) → à recompter.
    // - ancienneté = jours depuis le dernier comptage validé (jamais compté =
    //               ancienneté maximale) → couverture équitable du catalogue.
    // Chaque facteur est normalisé [0..1] sur le dépôt, sans aléatoire : à
    // données égales, la sélection est reproductible et auditable.
    const sample = scoreEtSelectionne(
      stock,
      await rotationParProduit(sb, d.id),
      await dernierComptageParProduit(sb, d.id),
      7,
    );
    const inserts = sample.map((s) => ({
      depot_id: d.id,
      produit_id: s.produit_id,
      employe_assigne_id: chosen.id,
      date_assignation: today,
      quantite_attendue: s.quantite,
      statut: "assigne" as const,
    }));
    const { error: insertErr } = await sb
      .from("inventaires_tournants")
      .insert(inserts);
    if (insertErr) {
      console.error("[cron] insert err", insertErr);
      summary.push({
        depot: d.nom,
        employe: `${chosen.prenom ?? ""} ${chosen.nom}`.trim(),
        products: 0,
        pushSent: false,
        skipped: insertErr.message,
      });
      continue;
    }

    // 6. Push notif iPhone à l'employé tiré
    let pushSent = false;
    try {
      const r = await fetch(`${origin}/api/push/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // HOTFIX vague 7 : /api/push/send exige x-internal-secret.
          "x-internal-secret": process.env.INTERNAL_API_SECRET ?? "",
        },
        body: JSON.stringify({
          title: `📋 Inventaire tournant · ${d.nom}`,
          body: `${chosen.prenom ?? "Bonjour"}, ${inserts.length} produits à compter ce matin sur ton dépôt.`,
          url: "/v2/inventaire",
          tag: `inventaire-${today}-${d.id}`,
          urgent: false,
          employe_ids: [chosen.id],
        }),
      });
      pushSent = r.ok;
    } catch (e) {
      console.warn("[cron] push fail (non-bloquant):", e);
    }

    summary.push({
      depot: d.nom,
      employe: `${chosen.prenom ?? ""} ${chosen.nom}`.trim(),
      products: inserts.length,
      pushSent,
    });
  }

  return NextResponse.json({
    ok: true,
    today,
    summary,
  });
}

/* ────────────────── Scoreur inventaire guidé IA ──────────────────
 *
 * Déterministe : aucune randomisation. À données identiques, même tirage.
 * Chaque facteur est normalisé [0..1] sur le périmètre du dépôt puis les
 * trois sont multipliés (un produit doit être pertinent sur PLUSIEURS axes
 * pour remonter, pas juste cher OU juste rapide). On ajoute un epsilon par
 * facteur pour qu'un produit excellent sur 2 axes mais nul sur le 3e (ex.
 * compté hier) reste sélectionnable au lieu de tomber à 0.
 */

type AnySb = SupabaseClient;

/** Somme des unités SORTIES sur 30 j par produit (proxy de rotation). */
async function rotationParProduit(
  sb: AnySb,
  depotId: string,
): Promise<Map<string, number>> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const map = new Map<string, number>();
  // stock_movements peut être absent si le ledger n'est pas migré → fallback
  // gracieux : rotation neutre (toutes à 0, le facteur devient l'epsilon).
  const { data, error } = await sb
    .from("stock_movements")
    .select("produit_id, delta")
    .eq("depot_id", depotId)
    .eq("type", "sortie")
    .gte("created_at", since);
  if (error || !data) return map;
  for (const m of data as MovementRow[]) {
    const sorti = Math.abs(Number(m.delta) || 0);
    map.set(m.produit_id, (map.get(m.produit_id) ?? 0) + sorti);
  }
  return map;
}

/** Date du dernier comptage validé par produit (vue produit_dernier_comptage). */
async function dernierComptageParProduit(
  sb: AnySb,
  depotId: string,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  // Vue créée par 20260612000050. Absente avant migration → fallback : tout le
  // monde "jamais compté" (ancienneté max), couverture neutre.
  const { data, error } = await sb
    .from("produit_dernier_comptage")
    .select("produit_id, dernier_comptage_at")
    .eq("depot_id", depotId);
  if (error || !data) return map;
  for (const r of data as DernierComptageRow[]) {
    if (r.dernier_comptage_at) {
      map.set(r.produit_id, new Date(r.dernier_comptage_at).getTime());
    }
  }
  return map;
}

function scoreEtSelectionne(
  stock: StockRow[],
  rotation: Map<string, number>,
  dernierComptage: Map<string, number>,
  count: number,
): StockRow[] {
  const now = Date.now();
  const eps = 0.05;

  // Valeurs brutes par produit.
  const valeurs = stock.map((s) => {
    const pu = Number(s.cout_achat_ht ?? s.prix_vente ?? 0);
    const valeur = (Number(s.quantite) || 0) * (pu > 0 ? pu : 0);
    const rot = rotation.get(s.produit_id) ?? 0;
    const last = dernierComptage.get(s.produit_id);
    // Ancienneté en jours ; jamais compté → 365 j (plafond), priorité haute.
    const anciennete =
      last === undefined
        ? 365
        : Math.min(365, Math.max(0, (now - last) / 86400_000));
    return { s, valeur, rot, anciennete };
  });

  const maxVal = Math.max(...valeurs.map((v) => v.valeur), 0);
  const maxRot = Math.max(...valeurs.map((v) => v.rot), 0);
  const maxAnc = Math.max(...valeurs.map((v) => v.anciennete), 0);

  const scored = valeurs
    .map((v) => {
      const nVal = maxVal > 0 ? v.valeur / maxVal : 0;
      const nRot = maxRot > 0 ? v.rot / maxRot : 0;
      const nAnc = maxAnc > 0 ? v.anciennete / maxAnc : 1;
      const score = (nVal + eps) * (nRot + eps) * (nAnc + eps);
      return { produit_id: v.s.produit_id, s: v.s, score };
    })
    // Tri déterministe : score desc, puis produit_id pour départager.
    .sort((a, b) =>
      b.score !== a.score
        ? b.score - a.score
        : a.produit_id.localeCompare(b.produit_id),
    );

  return scored.slice(0, count).map((x) => x.s);
}
