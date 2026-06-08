import { NextResponse } from "next/server";
import { parseStockCsv } from "@/lib/cashbox/stock-import-parse";
import { supabase } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/cashbox/import-stock
 *
 * Import du CATALOGUE produits (onboarding) : crée/complète les fiches produits
 * (par EAN) puis initialise stock_par_depot pour le dépôt choisi (quantité +
 * prix de vente). Idempotent par EAN : ré-importer ne crée pas de doublon —
 * les produits existants sont conservés, seul leur stock/prix au dépôt est mis
 * à jour. Body : { csv: string, depot_id: string }.
 */
export async function POST(req: Request) {
  // Auth : import en masse → route server-to-server (server action
  // importStockAction qui injecte le secret). Un curl externe est refusé.
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return NextResponse.json(
      { error: "import-stock misconfigured (INTERNAL_API_SECRET missing)" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-internal-secret") !== internalSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Anti-abus : écritures DB en masse → 5 imports / h / IP.
  const rl = checkRateLimit(getClientIp(req), "import-stock", 5, 3_600_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const sb = supabase();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase non configuré" },
      { status: 500 },
    );
  }

  let body: { csv?: string; depot_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.csv || typeof body.csv !== "string") {
    return NextResponse.json({ error: "csv manquant" }, { status: 400 });
  }
  if (!body.depot_id || typeof body.depot_id !== "string") {
    return NextResponse.json({ error: "depot_id manquant" }, { status: 400 });
  }
  if (body.csv.length > 10_000_000) {
    return NextResponse.json({ error: "csv trop volumineux" }, { status: 413 });
  }
  const depotId = body.depot_id;

  const parsed = parseStockCsv(body.csv);
  if (parsed.rows.length === 0) {
    return NextResponse.json({
      ok: false,
      meta: parsed.meta,
      errors: parsed.errors.slice(0, 50),
      produits_crees: 0,
      stock_initialise: 0,
    });
  }

  const dbErrors: string[] = [];
  const eanToId = new Map<string, string>();

  // 1) Produits existants (par EAN) → on récupère leur id sans les écraser.
  const allEans = parsed.rows.map((r) => r.ean);
  for (let i = 0; i < allEans.length; i += 300) {
    const chunk = allEans.slice(i, i + 300);
    const { data, error } = await sb
      .from("produits")
      .select("id, ean")
      .in("ean", chunk);
    if (error) {
      dbErrors.push(`lecture produits: ${error.message}`);
      continue;
    }
    for (const p of (data ?? []) as Array<{ id: string; ean: string }>) {
      eanToId.set(p.ean, p.id);
    }
  }

  // 2) Insertion des nouveaux produits (EAN absent du catalogue).
  const nouveaux = parsed.rows.filter((r) => !eanToId.has(r.ean));
  let produitsCrees = 0;
  for (let i = 0; i < nouveaux.length; i += 200) {
    const chunk = nouveaux.slice(i, i + 200).map((r) => ({
      ean: r.ean,
      nom: r.nom,
      marque: r.marque,
      categorie: r.categorie,
      requires_barcode_print: false,
    }));
    const { data, error } = await sb
      .from("produits")
      .insert(chunk)
      .select("id, ean");
    if (error) {
      dbErrors.push(`création produits: ${error.message}`);
      continue;
    }
    for (const p of (data ?? []) as Array<{ id: string; ean: string }>) {
      eanToId.set(p.ean, p.id);
      produitsCrees++;
    }
  }

  // 3) Lignes stock_par_depot existantes pour ce dépôt (pour distinguer
  //    insert vs update sans dépendre d'une contrainte ON CONFLICT).
  const produitIds = parsed.rows
    .map((r) => eanToId.get(r.ean))
    .filter((x): x is string => Boolean(x));
  const stockExist = new Set<string>();
  for (let i = 0; i < produitIds.length; i += 300) {
    const chunk = produitIds.slice(i, i + 300);
    const { data, error } = await sb
      .from("stock_par_depot")
      .select("produit_id")
      .eq("depot_id", depotId)
      .in("produit_id", chunk);
    if (error) {
      dbErrors.push(`lecture stock: ${error.message}`);
      continue;
    }
    for (const s of (data ?? []) as Array<{ produit_id: string }>) {
      stockExist.add(s.produit_id);
    }
  }

  // 4) Insert des lignes stock manquantes ; update prix/quantité des existantes.
  let stockInit = 0;
  let stockMaj = 0;
  const aInserer: Array<Record<string, unknown>> = [];
  const aMettreAJour: Array<{
    produit_id: string;
    prix_vente: number;
    quantite: number;
  }> = [];
  for (const r of parsed.rows) {
    const pid = eanToId.get(r.ean);
    if (!pid) continue;
    if (stockExist.has(pid)) {
      aMettreAJour.push({
        produit_id: pid,
        prix_vente: r.prix_vente,
        quantite: r.quantite,
      });
    } else {
      aInserer.push({
        produit_id: pid,
        depot_id: depotId,
        quantite: r.quantite,
        prix_vente: r.prix_vente,
        is_visible: true,
      });
    }
  }
  for (let i = 0; i < aInserer.length; i += 200) {
    const { error, count } = await sb
      .from("stock_par_depot")
      .insert(aInserer.slice(i, i + 200), { count: "exact" });
    if (error) dbErrors.push(`init stock: ${error.message}`);
    else stockInit += count ?? 0;
  }
  for (const u of aMettreAJour) {
    const { error } = await sb
      .from("stock_par_depot")
      .update({ prix_vente: u.prix_vente, quantite: u.quantite })
      .eq("produit_id", u.produit_id)
      .eq("depot_id", depotId);
    if (error) dbErrors.push(`maj stock: ${error.message}`);
    else stockMaj++;
  }

  return NextResponse.json({
    ok: dbErrors.length === 0,
    meta: parsed.meta,
    produits_crees: produitsCrees,
    produits_existants: parsed.rows.length - produitsCrees,
    stock_initialise: stockInit,
    stock_maj: stockMaj,
    parseErrors: parsed.errors.slice(0, 50),
    dbErrors: dbErrors.slice(0, 20),
  });
}
