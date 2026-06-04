import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { parseCashmagCsv, type CashmagRow } from "@/lib/cashbox/cashmag-parse";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Empreinte stable d'une ligne CashMag pour l'idempotence d'import.
 *
 * DOIT rester byte-pour-byte alignée avec le backfill SQL de la migration
 * 20260604000010_cashmag_idempotence.sql (sha256 hex). Une ligne = une
 * ligne CSV brute = un hash. Réimporter le même fichier → ON CONFLICT
 * DO NOTHING → no-op, pas de doublon, CA magasin juste.
 *
 * Canonique :
 *   - raw_line non vide → sha256(raw_line)
 *   - sinon → sha256 d'une concat déterministe des champs d'identité,
 *     séparés par \x1f (U+001F, absent des données CashMag), NULL → "".
 */
function cashmagRawHash(r: CashmagRow): string {
  const canonical =
    r.raw_line && r.raw_line.length > 0
      ? r.raw_line
      : [
          r.date_vente ?? "",
          r.heure_vente ?? "",
          r.numero_ticket ?? "",
          r.code_barre ?? "",
          r.designation ?? "",
          numToPg(r.quantite),
          numToPg(r.prix_ttc),
          r.mode_paiement ?? "",
        ].join("\x1f");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/** Sérialise un nombre comme Postgres `numeric::text` (pas de notation expo,
 *  pas de zéros superflus). Suffit pour le chemin de secours sans raw_line. */
function numToPg(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(n);
}

export async function POST(req: Request) {
  const sb = supabase();
  if (!sb) {
    return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  }
  let body: { csv?: string; importedBy?: string };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.csv || typeof body.csv !== "string") {
    return NextResponse.json({ error: "csv manquant" }, { status: 400 });
  }

  const result = parseCashmagCsv(body.csv);
  if (result.rows.length === 0) {
    return NextResponse.json({
      ok: false, meta: result.meta,
      errors: result.errors.slice(0, 50), inserted: 0,
    });
  }

  // Idempotence : on déduplique d'abord DANS le fichier (deux lignes CSV
  // strictement identiques → un seul hash, donc une seule insertion), puis
  // on laisse l'index unique sur raw_hash absorber les réimports via
  // ignoreDuplicates (ON CONFLICT DO NOTHING).
  const seen = new Set<string>();
  const deduped: Array<CashmagRow & { raw_hash: string }> = [];
  let skippedInFile = 0;
  for (const r of result.rows) {
    const raw_hash = cashmagRawHash(r);
    if (seen.has(raw_hash)) {
      skippedInFile++;
      continue;
    }
    seen.add(raw_hash);
    deduped.push({ ...r, raw_hash });
  }

  let inserted = 0;
  const dbErrors: string[] = [];
  for (let i = 0; i < deduped.length; i += 200) {
    const chunk = deduped.slice(i, i + 200).map((r) => ({
      date_vente: r.date_vente, heure_vente: r.heure_vente,
      numero_ticket: r.numero_ticket, code_barre: r.code_barre,
      designation: r.designation, quantite: r.quantite,
      prix_ttc: r.prix_ttc, prix_ht: r.prix_ht,
      tva_taux: r.tva_taux, mode_paiement: r.mode_paiement,
      raw_line: r.raw_line, raw_hash: r.raw_hash,
      imported_by: body.importedBy ?? "manual",
    }));
    const { error, count } = await sb
      .from("ventes_cashmag_import")
      .upsert(chunk, {
        // Réimport du même fichier → conflit sur raw_hash → ligne ignorée.
        onConflict: "raw_hash",
        count: "exact", ignoreDuplicates: true,
      });
    if (error) dbErrors.push(error.message);
    else inserted += count ?? 0;
  }

  const duplicatesSkipped = deduped.length - inserted;

  return NextResponse.json({
    ok: dbErrors.length === 0, inserted,
    parsed: result.rows.length,
    // Lignes ignorées car déjà en base (réimport) ou doublons internes.
    duplicates_skipped: duplicatesSkipped + skippedInFile,
    parseErrors: result.errors.slice(0, 50), dbErrors, meta: result.meta,
  });
}
