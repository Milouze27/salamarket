import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  buildTicketRetraitPdf,
  type TicketLigne,
} from "@/lib/pdf/ticket-retrait";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/commandes-drive/[id]/ticket
 * Ticket de caisse / reçu de retrait magasin (80 mm) d'une commande Drive.
 * `id` = commandes_drive.id.
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

  const { data: cmd, error } = await sb
    .from("commandes_drive")
    .select(
      "id, numero_commande, client_nom, total_ttc, montant_capture_ttc, bay_label, creneau_retrait, retired_at, pret_at, mode_paiement",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !cmd) {
    return NextResponse.json(
      { error: "commande introuvable" },
      { status: 404 },
    );
  }
  const c = cmd as {
    id: string;
    numero_commande: string | null;
    client_nom: string | null;
    total_ttc: number | null;
    montant_capture_ttc: number | null;
    bay_label: string | null;
    creneau_retrait: string | null;
    retired_at: string | null;
    pret_at: string | null;
    mode_paiement: string | null;
  };

  // Lignes + noms produits
  const { data: lignesRaw } = await sb
    .from("commandes_drive_lignes")
    .select(
      "produit_id, quantite, quantite_reelle_pesee, montant_reel_ttc, montant_estime_ttc, prix_unitaire",
    )
    .eq("commande_id", id);
  const rows = (lignesRaw ?? []) as Array<{
    produit_id: string | null;
    quantite: number | null;
    quantite_reelle_pesee: number | null;
    montant_reel_ttc: number | null;
    montant_estime_ttc: number | null;
    prix_unitaire: number | null;
  }>;
  const ids = rows.map((r) => r.produit_id).filter(Boolean) as string[];
  const noms = new Map<string, string>();
  if (ids.length) {
    const { data: prods } = await sb
      .from("produits")
      .select("id, nom")
      .in("id", ids);
    for (const p of (prods ?? []) as Array<{ id: string; nom: string }>) {
      noms.set(p.id, p.nom);
    }
  }

  const lignes: TicketLigne[] = rows.map((r) => {
    const montantEur = r.montant_reel_ttc ?? r.montant_estime_ttc ?? 0;
    const pese = r.quantite_reelle_pesee && r.quantite_reelle_pesee > 0;
    return {
      designation: (r.produit_id && noms.get(r.produit_id)) || "Produit",
      quantiteLabel: pese
        ? `${Number(r.quantite_reelle_pesee).toFixed(3)} kg`
        : `× ${Number(r.quantite ?? 1)}`,
      montantCents: Math.round(Number(montantEur) * 100),
    };
  });

  const totalEur = c.montant_capture_ttc ?? c.total_ttc ?? 0;

  try {
    const pdf = await buildTicketRetraitPdf({
      numeroCommande: c.numero_commande ?? c.id.slice(0, 8),
      clientNom: c.client_nom,
      dateRetrait: c.retired_at ?? c.pret_at ?? new Date().toISOString(),
      bayLabel: c.bay_label,
      lignes,
      totalCents: Math.round(Number(totalEur) * 100),
      modePaiement:
        c.mode_paiement === "stripe" || c.mode_paiement === "online"
          ? "En ligne (CB)"
          : "Sur place",
    });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ticket-${(c.numero_commande ?? id).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[commandes-drive/ticket] génération échouée:", e);
    return NextResponse.json(
      { error: "génération PDF échouée" },
      { status: 500 },
    );
  }
}
