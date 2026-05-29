/* POST /api/po/send
 * ─────────────────
 * Body: { po_id: string }
 *
 * Envoie le PO au fournisseur :
 *   1. Charge le PO + lignes + fournisseur + dépôt
 *   2. Vérifie certif halal (sinon 422, l'algo doit avoir filtré mais
 *      ceinture et bretelles)
 *   3. Génère un PDF jsPDF en mémoire
 *   4. Crée un token signé pour le bouton "Confirmer"
 *   5. Envoie via Resend si configuré, sinon log et retourne ok=true
 *      (mode démo local — toujours utile pour Otmane le 10 juin)
 *   6. Update statut → 'envoyee', le trigger SQL snapshot la certif
 *
 * Pas de cron ici — c'est l'action manuelle. Le cron est dans
 * /api/po/auto-generate.
 */

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { jsPDF } from "jspdf";
import { supabaseServer } from "@/lib/supabase-server";
import { signPoToken } from "@/lib/po-token";
import { certifAlerte, ORGANISME_LABELS } from "@/lib/types/po";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SendBody {
  po_id: string;
}

function eur(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(n);
}

function dateFr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + (iso.length === 10 ? "T00:00:00" : "")).toLocaleDateString(
    "fr-FR",
    { day: "2-digit", month: "long", year: "numeric" }
  );
}

interface PoForPdf {
  numero_po: string;
  date_creation: string;
  date_livraison_prevue: string | null;
  notes: string | null;
  fournisseurs: {
    nom: string;
    email_commandes: string | null;
    email: string | null;
    adresse: string | null;
    certif_organisme: string | null;
    certif_numero: string | null;
    certif_expire_le: string | null;
  } | null;
  depots: { nom: string; adresse: string | null } | null;
  purchase_order_lignes: Array<{
    reference_fourn: string | null;
    produit_id: string;
    quantite_commandee: number;
    prix_achat_ht: number;
    tva_pct: number;
  }>;
}

/** Génère le PDF du bon de commande. Sapin/or, sobre, A4. */
function buildPoPdf(po: PoForPdf): Buffer {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as any;
  const W = 210;
  const M = 16;
  let y = 18;

  // ── Header bande sapin ──
  doc.setFillColor(14, 59, 46);
  doc.rect(0, 0, W, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("SALAM MARKET", M, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("K&A FOOD — Toulouse · SIRET 802 773 812", M, 21);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("BON DE COMMANDE", W - M, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(po.numero_po, W - M, 21, { align: "right" });

  // Liseré or sous le header
  doc.setFillColor(201, 162, 39);
  doc.rect(0, 28, W, 1.2, "F");

  y = 42;
  doc.setTextColor(15, 26, 20);

  // ── Bloc fournisseur / livraison ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Fournisseur", M, y);
  doc.text("Livraison vers", W / 2 + 4, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  y += 6;
  doc.text(po.fournisseurs?.nom ?? "—", M, y);
  doc.text(po.depots?.nom ?? "—", W / 2 + 4, y);
  y += 5;
  if (po.fournisseurs?.adresse) {
    doc.text(po.fournisseurs.adresse, M, y, { maxWidth: 80 });
  }
  if (po.depots?.adresse) {
    doc.text(po.depots.adresse, W / 2 + 4, y, { maxWidth: 80 });
  }
  y += 6;
  doc.setTextColor(90, 100, 112);
  doc.setFontSize(9);
  doc.text(`Date d'émission : ${dateFr(po.date_creation)}`, M, y);
  if (po.date_livraison_prevue) {
    doc.text(
      `Date livraison souhaitée : ${dateFr(po.date_livraison_prevue)}`,
      W / 2 + 4,
      y
    );
  }
  doc.setTextColor(15, 26, 20);
  y += 10;

  // ── Tableau lignes ──
  doc.setFillColor(248, 245, 232);
  doc.rect(M, y, W - M * 2, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Référence", M + 3, y + 5.5);
  doc.text("Qté", W - M - 56, y + 5.5, { align: "right" });
  doc.text("Prix HT", W - M - 30, y + 5.5, { align: "right" });
  doc.text("Total HT", W - M - 3, y + 5.5, { align: "right" });
  y += 11;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let totalHt = 0;
  for (const l of po.purchase_order_lignes) {
    const totalLine = (l.prix_achat_ht || 0) * (l.quantite_commandee || 0);
    totalHt += totalLine;
    const ref = (l.reference_fourn ?? l.produit_id.slice(0, 8)).substring(0, 60);
    doc.text(ref, M + 3, y, { maxWidth: 110 });
    doc.text(String(l.quantite_commandee), W - M - 56, y, { align: "right" });
    doc.text(eur(l.prix_achat_ht || 0), W - M - 30, y, { align: "right" });
    doc.text(eur(totalLine), W - M - 3, y, { align: "right" });
    y += 6;
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
  }

  // ── Totaux ──
  y += 4;
  doc.setDrawColor(232, 228, 216);
  doc.line(M, y, W - M, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.text("Total HT", W - M - 30, y, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.text(eur(totalHt), W - M - 3, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.text("TVA 5,5 %", W - M - 30, y, { align: "right" });
  doc.text(eur(totalHt * 0.055), W - M - 3, y, { align: "right" });
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Total TTC", W - M - 30, y, { align: "right" });
  doc.text(eur(totalHt * 1.055), W - M - 3, y, { align: "right" });

  // ── Bloc certif halal (snapshot) ──
  y += 14;
  doc.setFillColor(244, 233, 196);
  doc.roundedRect(M, y, W - M * 2, 18, 2, 2, "F");
  doc.setTextColor(139, 111, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CERTIFICAT HALAL VÉRIFIÉ À L'ENVOI", M + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const org = po.fournisseurs?.certif_organisme
    ? ORGANISME_LABELS[
        po.fournisseurs.certif_organisme as keyof typeof ORGANISME_LABELS
      ]
    : "—";
  doc.text(
    `Organisme : ${org} · n° ${po.fournisseurs?.certif_numero ?? "—"} · valide jusqu'au ${dateFr(po.fournisseurs?.certif_expire_le ?? null)}`,
    M + 4,
    y + 12
  );

  // Footer
  doc.setTextColor(123, 134, 147);
  doc.setFontSize(8);
  doc.text(
    "Document généré automatiquement par Salam Stock. Confirmation attendue par retour d'email.",
    W / 2,
    285,
    { align: "center" }
  );

  return Buffer.from(doc.output("arraybuffer"));
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function htmlEmail(opts: {
  fournisseurNom: string;
  numeroPo: string;
  depotNom: string;
  dateLiv: string;
  totalHt: number;
  confirmUrl: string;
  organisme: string;
  expireLe: string;
}): string {
  const { fournisseurNom, numeroPo, depotNom, dateLiv, totalHt, confirmUrl, organisme, expireLe } = opts;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Bon de commande ${numeroPo}</title></head>
<body style="margin:0;padding:0;background:#FAF7EE;font-family:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0F1A14;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7EE;padding:24px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 2px 12px rgba(14,59,46,0.06);">
        <tr><td style="background:linear-gradient(180deg,#0E3B2E,#082A20);padding:24px 28px;color:#fff;">
          <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#DDB31C;font-weight:700;">Salam Market — K&amp;A Food</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;">Nouveau bon de commande</div>
          <div style="font-size:13px;margin-top:6px;color:#D7E0DA;">${numeroPo}</div>
        </td></tr>
        <tr><td style="padding:24px 28px;">
          <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">
            Bonjour <strong>${fournisseurNom}</strong>,<br/>
            Voici notre bon de commande à livrer chez <strong>${depotNom}</strong> pour le <strong>${dateLiv}</strong>.
          </p>
          <div style="background:#FAF7EE;border:1px solid #E8E4D8;border-radius:14px;padding:16px;margin:18px 0;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5A6470;font-weight:700;">Total HT</div>
            <div style="font-size:28px;font-weight:800;color:#0F1A14;margin-top:4px;">${eur(totalHt)}</div>
            <div style="font-size:12px;color:#5A6470;margin-top:8px;">Détail complet dans le PDF en pièce jointe.</div>
          </div>
          <a href="${confirmUrl}" style="display:block;text-align:center;background:#0E3B2E;color:#fff;text-decoration:none;border-radius:999px;padding:16px 24px;font-weight:700;font-size:15px;margin:8px 0 20px 0;">
            ✓ Confirmer la commande
          </a>
          <p style="margin:0;font-size:12px;color:#5A6470;text-align:center;">
            Un seul clic — pas de login. Tu peux confirmer depuis ton téléphone.
          </p>
          <hr style="border:none;border-top:1px solid #E8E4D8;margin:22px 0;"/>
          <div style="background:#F4E9C4;border-radius:12px;padding:12px 14px;font-size:12px;color:#8B6F0E;">
            <strong>Certif halal vérifié</strong> · ${organisme} · valide jusqu'au ${expireLe}
          </div>
        </td></tr>
        <tr><td style="padding:14px 28px 22px 28px;font-size:11px;color:#7B8693;text-align:center;">
          Salam Market · K&amp;A Food Toulouse · SIRET 802 773 812
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function POST(req: Request) {
  let body: SendBody;
  try {
    body = (await req.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!body.po_id) {
    return NextResponse.json({ error: "po_id requis" }, { status: 400 });
  }

  const sb = supabaseServer();

  const { data: po, error } = await sb
    .from("purchase_orders")
    .select(`
      id, numero_po, statut, date_creation, date_livraison_prevue, notes, fournisseur_id,
      fournisseurs:fournisseur_id ( nom, email, email_commandes, adresse, certif_organisme, certif_numero, certif_expire_le ),
      depots:depot_destination_id ( nom, adresse ),
      purchase_order_lignes ( reference_fourn, produit_id, quantite_commandee, prix_achat_ht, tva_pct )
    `)
    .eq("id", body.po_id)
    .single();

  if (error || !po) {
    return NextResponse.json({ error: "PO introuvable" }, { status: 404 });
  }

  const poTyped = po as unknown as PoForPdf & { statut: string; id: string };

  if (poTyped.statut !== "brouillon") {
    return NextResponse.json(
      { error: `PO déjà au statut ${poTyped.statut}` },
      { status: 409 }
    );
  }

  // Vérif certif halal — l'algo doit avoir filtré, c'est notre filet
  const alerte = certifAlerte(poTyped.fournisseurs?.certif_expire_le);
  if (alerte === "expiree" || alerte === "manquante") {
    return NextResponse.json(
      {
        error: `Envoi bloqué — certif halal ${alerte === "expiree" ? "expiré" : "manquant"} pour ${poTyped.fournisseurs?.nom ?? "ce fournisseur"}.`,
      },
      { status: 422 }
    );
  }

  const to = poTyped.fournisseurs?.email_commandes ?? poTyped.fournisseurs?.email;
  if (!to) {
    return NextResponse.json(
      { error: "Aucun email commandes renseigné chez ce fournisseur" },
      { status: 422 }
    );
  }

  // Génère token + PDF
  const token = signPoToken(body.po_id);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;
  const confirmUrl = `${base}/po/confirm/${token}`;
  const pdfBuf = buildPoPdf(poTyped);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "onboarding@resend.dev";
  let messageId: string | null = null;
  let demoMode = false;

  if (apiKey && !apiKey.includes("PLACEHOLDER")) {
    try {
      const resend = new Resend(apiKey);
      const subject = `Bon de commande ${poTyped.numero_po} — Salam Market`;
      const html = htmlEmail({
        fournisseurNom: poTyped.fournisseurs?.nom ?? "",
        numeroPo: poTyped.numero_po,
        depotNom: poTyped.depots?.nom ?? "—",
        dateLiv: dateFr(poTyped.date_livraison_prevue),
        totalHt:
          poTyped.purchase_order_lignes.reduce(
            (s, l) => s + (l.prix_achat_ht || 0) * (l.quantite_commandee || 0),
            0
          ) || 0,
        confirmUrl,
        organisme:
          poTyped.fournisseurs?.certif_organisme
            ? ORGANISME_LABELS[
                poTyped.fournisseurs
                  .certif_organisme as keyof typeof ORGANISME_LABELS
              ]
            : "—",
        expireLe: dateFr(poTyped.fournisseurs?.certif_expire_le ?? null),
      });
      const { data, error: sendErr } = await resend.emails.send({
        from: `Salam Market <${from}>`,
        to: [to],
        subject,
        html,
        attachments: [
          {
            filename: `${poTyped.numero_po}.pdf`,
            content: pdfBuf.toString("base64"),
          },
        ],
      });
      if (sendErr) throw new Error(JSON.stringify(sendErr));
      messageId = data?.id ?? null;
    } catch (err) {
      console.error("[po/send] resend error", err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 502 }
      );
    }
  } else {
    // Mode démo : pas de Resend configuré → on log et on update quand
    // même le statut pour qu'Otmane voie le PO passer "envoyé" pendant
    // la démo du 10 juin sans avoir besoin de SMTP.
    demoMode = true;
    console.log("[po/send DEMO]", {
      to,
      numero: poTyped.numero_po,
      confirmUrl,
      bytes: pdfBuf.length,
    });
  }

  // Update statut → envoyee (trigger SQL fait le snapshot certif)
  const { error: updErr } = await sb
    .from("purchase_orders")
    .update({
      statut: "envoyee",
      email_envoye_a: to,
      email_message_id: messageId,
    })
    .eq("id", body.po_id);

  if (updErr) {
    return NextResponse.json(
      { error: `Email envoyé mais statut non mis à jour : ${updErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    email: to,
    message_id: messageId,
    confirm_url: confirmUrl,
    demo_mode: demoMode,
  });
}
