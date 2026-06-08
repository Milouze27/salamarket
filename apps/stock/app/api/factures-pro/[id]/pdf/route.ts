import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildFactureProPdf,
  type FactureProLigne,
} from "@/lib/pdf/facture-pro";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/factures-pro/[id]/pdf
 * Génère la facture PDF d'une commande Pro (B2B) sur le module brand canonique.
 * `id` = commandes_pro.id. Disponible dès que la commande est facturée.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> } | { params: { id: string } },
) {
  const params = await (ctx.params as Promise<{ id: string }>);
  const id = params.id;
  if (!id) {
    return NextResponse.json({ error: "id manquant" }, { status: 400 });
  }

  const sb = supabaseServer();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase non configuré" },
      { status: 500 },
    );
  }

  // 1. Commande Pro
  const { data: cmd, error: errCmd } = await sb
    .from("commandes_pro")
    .select(
      "id, numero_commande, facture_numero, date_commande, date_echeance, montant_ht, montant_tva, montant_ttc, compte_pro_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (errCmd || !cmd) {
    return NextResponse.json(
      { error: "commande introuvable" },
      { status: 404 },
    );
  }
  const c = cmd as {
    id: string;
    numero_commande: string | null;
    facture_numero: string | null;
    date_commande: string | null;
    date_echeance: string | null;
    montant_ht: number | null;
    montant_tva: number | null;
    montant_ttc: number | null;
    compte_pro_id: string | null;
  };

  // 2. Client Pro
  let client = {
    raisonSociale: "Client professionnel",
    siret: null as string | null,
    tvaIntracom: null as string | null,
    adresse: null as string | null,
  };
  let conditionsPaiement: string | null = null;
  if (c.compte_pro_id) {
    const { data: cp } = await sb
      .from("comptes_pro")
      .select(
        "raison_sociale, siret, tva_intracom, adresse_facturation, conditions_paiement",
      )
      .eq("id", c.compte_pro_id)
      .maybeSingle();
    if (cp) {
      const r = cp as {
        raison_sociale: string | null;
        siret: string | null;
        tva_intracom: string | null;
        adresse_facturation: string | null;
        conditions_paiement: string | null;
      };
      client = {
        raisonSociale: r.raison_sociale ?? "Client professionnel",
        siret: r.siret,
        tvaIntracom: r.tva_intracom,
        adresse: r.adresse_facturation,
      };
      conditionsPaiement = r.conditions_paiement;
    }
  }

  // 3. Lignes + noms produits
  const { data: lignesRaw } = await sb
    .from("commandes_pro_lignes")
    .select(
      "produit_id, quantite_unitaire_totale, prix_ht_unitaire, prix_ht_total, tva_taux",
    )
    .eq("commande_pro_id", id);
  const rows = (lignesRaw ?? []) as Array<{
    produit_id: string | null;
    quantite_unitaire_totale: number | null;
    prix_ht_unitaire: number | null;
    prix_ht_total: number | null;
    tva_taux: number | null;
  }>;
  const ids = rows.map((r) => r.produit_id).filter(Boolean) as string[];
  const noms = new Map<string, string>();
  const prodTva = new Map<string, number | null>();
  if (ids.length) {
    const { data: prods } = await sb
      .from("produits")
      .select("id, nom, tva_taux")
      .in("id", ids);
    for (const p of (prods ?? []) as Array<{
      id: string;
      nom: string;
      tva_taux: number | null;
    }>) {
      noms.set(p.id, p.nom);
      prodTva.set(p.id, p.tva_taux);
    }
  }
  const lignes: FactureProLigne[] = rows.map((r) => ({
    designation: (r.produit_id && noms.get(r.produit_id)) || "Produit",
    quantite: Number(r.quantite_unitaire_totale ?? 0),
    prixHtUnitaire: Number(r.prix_ht_unitaire ?? 0),
    prixHtTotal: Number(r.prix_ht_total ?? 0),
    // Fallback en cascade : ligne → taux du produit → 5,5 % (alimentaire FR).
    // Évite qu'une tva_taux NULL retombe à 0 % et fausse la ventilation TVA
    // (qui divergerait alors du montant_tva total facturé).
    tvaTaux: Number(
      r.tva_taux ?? (r.produit_id ? prodTva.get(r.produit_id) : null) ?? 5.5,
    ),
  }));

  try {
    const pdf = await buildFactureProPdf({
      numero: c.facture_numero ?? c.numero_commande ?? c.id.slice(0, 8),
      dateFacture: c.date_commande ?? new Date().toISOString(),
      dateEcheance: c.date_echeance,
      conditionsPaiement,
      client,
      lignes,
      montantHt: Number(c.montant_ht ?? 0),
      montantTva: Number(c.montant_tva ?? 0),
      montantTtc: Number(c.montant_ttc ?? 0),
    });
    const filename = `facture-${(c.facture_numero ?? c.numero_commande ?? id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[factures-pro/pdf] génération échouée:", e);
    return NextResponse.json(
      { error: "génération PDF échouée" },
      { status: 500 },
    );
  }
}
