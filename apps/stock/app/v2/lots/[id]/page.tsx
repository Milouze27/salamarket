"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowUpRight,
  Award,
  BadgeCheck,
  CalendarDays,
  CalendarX,
  Copy,
  Factory,
  Loader2,
  Printer,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { supabase } from "@/lib/supabase";
import { generateLotQrSvg, generateLotQrUrl } from "@/lib/qr-lot";

/**
 * Staff view of a halal lot — same data as the public /lot/:id page
 * on Drive PLUS admin-only fields (QR preview, print button, public
 * link). PIN-protected via V2Shell.
 *
 * For the demo : seeded lot L2026-05-A23 (see migration 0031).
 */

interface ProduitLite {
  id: string;
  nom: string;
  marque: string | null;
  categorie: string | null;
}

interface FournisseurLite {
  id: string;
  nom: string;
  siret: string | null;
}

interface Lot {
  id: string;
  produit_id: string;
  supplier_lot: string | null;
  certifier_id: string | null;
  certifier_name: string | null;
  certifier_valid_until: string | null;
  abattoir_nom: string | null;
  abattoir_pays: string | null;
  date_abattage: string | null;
  date_reception: string;
  dlc: string | null;
  ddm: string | null;
  quantite_recue: number | null;
  unite: string | null;
  qr_url: string | null;
  notes: string | null;
  produits: ProduitLite | null;
  fournisseurs: FournisseurLite | null;
}

const formatDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
};

export default function V2LotDetailPage() {
  const params = useParams<{ id: string }>();
  // Normalisation de l'ID lot (deep-link / QR / saisie manuelle) : les IDs
  // sont stockés en MAJUSCULES sans espace. On trim + uppercase AVANT toute
  // requête et tout affichage pour ne jamais déclarer « introuvable » un lot
  // qui existe (ex. /v2/lots/l2026-05-a23 ou un %20 en fin d'URL).
  const lotId = useMemo(
    () => (params?.id ? decodeURIComponent(params.id).trim().toUpperCase() : ""),
    [params?.id],
  );
  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const publicUrl = useMemo(
    () => (lotId ? generateLotQrUrl(lotId) : ""),
    [lotId],
  );

  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const client = supabase();
      if (!client) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }
      const { data, error } = await client
        .from("produits_lots")
        .select(
          `
          id, produit_id, supplier_lot,
          certifier_id, certifier_name, certifier_valid_until,
          abattoir_nom, abattoir_pays, date_abattage,
          date_reception, dlc, ddm, quantite_recue, unite,
          qr_url, notes,
          produits ( id, nom, marque, categorie ),
          fournisseurs ( id, nom, siret )
        `,
        )
        .eq("id", lotId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLot(null);
      } else {
        setLot(data as unknown as Lot);
        setNotFound(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  // Render the QR client-side once we know the lotId.
  useEffect(() => {
    if (!lotId) return;
    let cancelled = false;
    generateLotQrSvg(lotId, { size: 240 })
      .then((svg) => {
        if (!cancelled) setQrSvg(svg);
      })
      .catch((err) => {
        console.error("QR render failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [lotId]);

  // Jour courant en Europe/Paris au format ISO (YYYY-MM-DD) : sert de
  // référence pour comparer certif et DLC date-à-date sans dérive de fuseau.
  const todayParis = useMemo(
    () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }),
    [],
  );

  const certifValid = useMemo(() => {
    if (!lot?.certifier_valid_until) return null;
    // Comparaison date-à-date en Europe/Paris : le certif halal est valide
    // jusqu'à la FIN du jour `valid_until`. Comparer un timestamp à `new Date()`
    // le faisait expirer ~2 h trop tôt (minuit UTC) le jour de validité.
    return lot.certifier_valid_until.slice(0, 10) >= todayParis;
  }, [lot, todayParis]);

  // DLC dépassée : un lot dont la date limite de consommation est passée est
  // périmé. Le staff doit le voir, et le titre « Halal vérifié » ne doit pas
  // rester vert plein dessus. DLC qui tombe aujourd'hui = encore consommable.
  const dlcPassed = useMemo(() => {
    if (!lot?.dlc) return false;
    return lot.dlc.slice(0, 10) < todayParis;
  }, [lot, todayParis]);

  // Verdict global du moat (priorité : certif expiré > DLC dépassée > OK).
  const certifExpired = certifValid === false;

  function copyUrl() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl);
    toast.success("Lien copié");
  }

  /**
   * PDF-02 — ouvre le certificat de traçabilité halal A4 (route serveur
   * api/lots/[id]/certificat-pdf). Le PDF s'ouvre inline dans un nouvel
   * onglet, prêt à imprimer / encadrer.
   */
  function openCertificat() {
    if (!lotId) return;
    const href = `/api/lots/${encodeURIComponent(lotId)}/certificat-pdf`;
    const win = window.open(href, "_blank", "noopener,noreferrer");
    if (!win) {
      toast.error("Popup bloquée — autorise les popups pour le certificat.");
      return;
    }
    // Le PDF est généré côté serveur dans l'onglet ouvert : on annonce
    // l'ouverture (pas un succès de génération, qu'on ne peut pas observer ici).
    toast.success("Ouverture du certificat halal…");
  }

  function printLabel() {
    if (!qrSvg) {
      toast.error("QR pas encore prêt — réessaie dans 1s.");
      return;
    }
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) {
      toast.error("Popup bloquée — autorise les popups pour imprimer.");
      return;
    }
    const productNom = lot?.produits?.nom ?? "—";
    win.document
      .write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquette lot ${escapeHtml(lotId)}</title>
<style>
  @page { size: 62mm 80mm; margin: 0; }
  body { margin: 0; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; color: #0F1A14; padding: 6mm; box-sizing: border-box; }
  .eyebrow { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.18em; color: #C9A227; margin: 0 0 2mm; }
  .lot { font-size: 14pt; font-weight: 800; letter-spacing: -0.01em; margin: 0; }
  .product { font-size: 8.5pt; font-weight: 600; color: #5A6470; margin: 1mm 0 3mm; }
  .qr { display: flex; justify-content: center; margin: 2mm 0; }
  .qr svg { width: 42mm; height: 42mm; }
  .url { font-size: 6pt; text-align: center; color: #5A6470; word-break: break-all; margin-top: 2mm; }
  .footer { font-size: 6.5pt; text-align: center; color: #0E3B2E; font-weight: 700; margin-top: 2mm; }
</style></head><body>
  <p class="eyebrow">Traçabilité halal</p>
  <p class="lot">${escapeHtml(lotId)}</p>
  <p class="product">${escapeHtml(productNom)}</p>
  <div class="qr">${qrSvg}</div>
  <p class="url">${escapeHtml(publicUrl)}</p>
  <p class="footer">Scan = preuve halal</p>
  <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),200)};</script>
</body></html>`);
    win.document.close();
  }

  return (
    <V2Shell>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <p className="label-caps text-primary mt-3">01 — Traçabilité</p>
        <h1 className="h1-display text-text-primary mt-1">
          Lot <em>{lotId}</em>
        </h1>
        {lot?.produits?.nom && (
          <p className="body-md text-text-secondary mt-1">
            {lot.produits.nom}
            {lot.produits.marque && (
              <span className="text-text-tertiary">
                {" "}
                · {lot.produits.marque}
              </span>
            )}
          </p>
        )}
      </header>

      {/* ─── Loading ────────────────────────────────────────── */}
      {loading && (
        <div className="px-5 mt-10 flex justify-center">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      )}

      {/* ─── Not found ──────────────────────────────────────── */}
      {!loading && notFound && (
        <div className="px-5 mt-6">
          <div className="bg-white border border-rule rounded-2xl p-6 text-center">
            <p className="text-sm font-bold text-text-primary mb-1">
              Lot introuvable
            </p>
            <p className="text-[13px] text-text-secondary">
              Aucun lot ne correspond au code{" "}
              <span className="tabular-nums font-semibold">{lotId}</span>.
              Vérifie le code scanné ou saisi.
            </p>
          </div>
        </div>
      )}

      {/* ─── Content ────────────────────────────────────────── */}
      {!loading && lot && (
        <div className="px-5 mt-6 space-y-4">
          {/* Alertes intégrité du moat — vues EN PREMIER par le staff.
              Certificat expiré (rouge) et/ou DLC dépassée (ambre). */}
          {certifExpired && (
            <div
              role="alert"
              className="rounded-2xl p-4 flex items-start gap-3 bg-danger-soft border border-[var(--danger-border)]"
            >
              <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-danger" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-danger mb-0.5">
                  Certificat expiré
                </p>
                <p className="text-[13px] font-semibold text-text-primary leading-snug">
                  Certificat de traçabilité expiré le{" "}
                  {formatDate(lot.certifier_valid_until)}. Ne pas présenter ce
                  lot comme certifié sans renouvellement.
                </p>
              </div>
            </div>
          )}
          {dlcPassed && (
            <div
              role="alert"
              className="rounded-2xl p-4 flex items-start gap-3 bg-warning-soft border border-[var(--warning-border)]"
            >
              <CalendarX className="w-5 h-5 shrink-0 mt-0.5 text-warning" />
              <div className="min-w-0">
                <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-warning mb-0.5">
                  DLC dépassée
                </p>
                <p className="text-[13px] font-semibold text-text-primary leading-snug">
                  Date limite de consommation dépassée le {formatDate(lot.dlc)}.
                  Lot périmé — à retirer de la vente.
                </p>
              </div>
            </div>
          )}

          {/* QR card — admin-only preview + print */}
          <section className="bg-white border border-rule rounded-2xl p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-[color:var(--accent-gold)]">
                  QR public
                </p>
                <h2 className="text-[15px] font-extrabold text-text-primary">
                  Étiquette à coller sur le ticket
                </h2>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <div
                className="w-[200px] h-[200px] bg-white rounded-xl border border-rule p-2"
                aria-label="Aperçu du QR code"
              >
                {qrSvg ? (
                  <div
                    className="w-full h-full"
                    // QR is generated client-side from inert SVG markup we control.
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={copyUrl}
                className="w-full min-h-[44px] inline-flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-cream border border-rule text-[13px] font-semibold text-text-primary active:opacity-80"
              >
                <span className="truncate tabular-nums">{publicUrl}</span>
                <Copy className="w-4 h-4 text-text-secondary shrink-0" />
              </button>
              {/* PDF-02 — Certificat halal A4 : le moat, CTA primaire */}
              <button
                type="button"
                onClick={openCertificat}
                className="btn-gold w-full inline-flex items-center justify-center gap-2 min-h-[48px] py-3.5 rounded-xl text-[14px] font-bold"
              >
                <Award className="w-4 h-4" />
                Imprimer le certificat halal
              </button>
              <div className="grid grid-cols-3 gap-2 w-full">
                <button
                  type="button"
                  onClick={printLabel}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] py-3 rounded-xl bg-cream border border-rule text-[12.5px] font-bold text-text-primary active:opacity-80"
                >
                  <Printer className="w-4 h-4" />
                  Étiquette
                </button>
                <button
                  type="button"
                  onClick={copyUrl}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] py-3 rounded-xl bg-cream border border-rule text-[12.5px] font-bold text-text-primary active:opacity-80"
                >
                  <Copy className="w-4 h-4" />
                  Lien
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] py-3 rounded-xl bg-primary text-white text-[12.5px] font-bold active:opacity-90"
                >
                  Public
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          {/* Certification — le titre suit l'état réel du certificat :
              JAMAIS « Halal vérifié » sur un certificat expiré. */}
          <Section
            eyebrow="02 — Certification"
            title={certifExpired ? "Certificat expiré" : "Halal vérifié"}
            icon={
              certifExpired ? (
                <ShieldAlert className="w-5 h-5" />
              ) : (
                <ShieldCheck className="w-5 h-5" />
              )
            }
          >
            <DataRow label="Certificateur" value={lot.certifier_name} />
            <DataRow label="Identifiant" value={lot.certifier_id} mono />
            {lot.certifier_valid_until && (
              <div className="flex items-center gap-2 py-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    certifExpired
                      ? "bg-danger-soft text-danger"
                      : "bg-success-soft text-success"
                  }`}
                >
                  {certifExpired ? (
                    <ShieldAlert className="w-3.5 h-3.5" />
                  ) : (
                    <BadgeCheck className="w-3.5 h-3.5" />
                  )}
                  {certifExpired ? "Expiré le" : "Valide jusqu'au"}{" "}
                  {formatDate(lot.certifier_valid_until)}
                </span>
              </div>
            )}
          </Section>

          {/* Origine */}
          <Section
            eyebrow="03 — Origine"
            title="Abattoir"
            icon={<Factory className="w-5 h-5" />}
          >
            <DataRow label="Abattoir" value={lot.abattoir_nom} />
            <DataRow label="Pays" value={lot.abattoir_pays} />
            <DataRow
              label="Date d'abattage"
              value={formatDate(lot.date_abattage)}
            />
          </Section>

          {/* Fournisseur + quantités */}
          <Section
            eyebrow="04 — Fournisseur"
            title="Approvisionnement"
            icon={<Factory className="w-5 h-5" />}
          >
            <DataRow
              label="Fournisseur"
              value={lot.fournisseurs?.nom ?? null}
            />
            <DataRow
              label="SIRET"
              value={lot.fournisseurs?.siret ?? null}
              mono
            />
            <DataRow label="Lot fournisseur" value={lot.supplier_lot} mono />
            {lot.quantite_recue != null && (
              <DataRow
                label="Quantité reçue"
                value={`${lot.quantite_recue} ${lot.unite ?? ""}`.trim()}
              />
            )}
            <DataRow label="Quantité restante" value="Non suivi" />
          </Section>

          {/* Réception magasin */}
          <Section
            eyebrow="05 — Magasin"
            title="Réception & DLC"
            icon={<CalendarDays className="w-5 h-5" />}
          >
            <DataRow
              label="Date de réception"
              value={formatDate(lot.date_reception)}
            />
            {lot.dlc && (
              <DataRow
                label={dlcPassed ? "DLC dépassée" : "DLC"}
                value={formatDate(lot.dlc)}
                accent={!dlcPassed}
                danger={dlcPassed}
              />
            )}
            {lot.ddm && <DataRow label="DDM" value={formatDate(lot.ddm)} />}
          </Section>

          {lot.notes && (
            <section className="bg-white border border-rule rounded-2xl p-5">
              <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-text-secondary mb-2">
                Notes
              </p>
              <p className="text-[14px] leading-relaxed text-text-primary">
                {lot.notes}
              </p>
            </section>
          )}
        </div>
      )}
    </V2Shell>
  );
}

function Section({
  eyebrow,
  title,
  icon,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-rule rounded-2xl p-5 shadow-card">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-[color:var(--accent-gold)]">
            {eyebrow}
          </p>
          <h2 className="text-[15px] font-extrabold text-text-primary tracking-tight">
            {title}
          </h2>
        </div>
        <span className="w-9 h-9 rounded-full bg-cream text-primary flex items-center justify-center shrink-0">
          {icon}
        </span>
      </div>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function DataRow({
  label,
  value,
  mono = false,
  accent = false,
  danger = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  accent?: boolean;
  danger?: boolean;
}) {
  if (!value) return null;
  const valueColor = danger
    ? "text-warning"
    : accent
      ? "text-primary"
      : "text-text-primary";
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-rule last:border-b-0">
      <span
        className={`text-[12px] font-semibold shrink-0 ${danger ? "text-warning" : "text-text-secondary"}`}
      >
        {label}
      </span>
      <span
        className={`text-[14px] font-bold text-right truncate ${mono ? "tabular-nums" : ""} ${valueColor}`}
      >
        {value}
      </span>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
