"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  CalendarDays,
  Copy,
  Factory,
  Loader2,
  Printer,
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
  const lotId = params?.id ?? "";
  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const publicUrl = useMemo(
    () => (lotId ? generateLotQrUrl(lotId) : ""),
    [lotId]
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
        `
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

  const certifValid = useMemo(() => {
    if (!lot?.certifier_valid_until) return null;
    return new Date(lot.certifier_valid_until) >= new Date();
  }, [lot]);

  function copyUrl() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl);
    toast.success("Lien copié");
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
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Étiquette lot ${lotId}</title>
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
              <span className="text-text-tertiary"> · {lot.produits.marque}</span>
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
              Le lot <code className="tabular-nums">{lotId}</code> n&apos;est pas
              dans <code>produits_lots</code>. Vérifie la migration 0031 et le
              seed.
            </p>
          </div>
        </div>
      )}

      {/* ─── Content ────────────────────────────────────────── */}
      {!loading && lot && (
        <div className="px-5 mt-6 space-y-4">
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
                className="w-full inline-flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-cream border border-rule text-[12px] font-semibold text-text-primary active:opacity-80"
              >
                <span className="truncate tabular-nums">{publicUrl}</span>
                <Copy className="w-4 h-4 text-text-secondary shrink-0" />
              </button>
              <div className="grid grid-cols-2 gap-2 w-full">
                <button
                  type="button"
                  onClick={printLabel}
                  className="btn-gold inline-flex items-center justify-center gap-2 py-3 rounded-xl text-[13px]"
                >
                  <Printer className="w-4 h-4" />
                  Imprimer
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-white text-[13px] font-bold active:opacity-90"
                >
                  Page publique
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          </section>

          {/* Certification */}
          <Section
            eyebrow="02 — Certification"
            title="Halal vérifié"
            icon={<ShieldCheck className="w-5 h-5" />}
          >
            <DataRow label="Certificateur" value={lot.certifier_name} />
            <DataRow
              label="Identifiant"
              value={lot.certifier_id}
              mono
            />
            {lot.certifier_valid_until && (
              <div className="flex items-center gap-2 py-1.5">
                <span
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                    certifValid === false
                      ? "bg-danger-soft text-danger"
                      : "bg-success-soft text-success"
                  }`}
                >
                  <BadgeCheck className="w-3.5 h-3.5" />
                  {certifValid === false ? "Expiré" : "Valide"} jusqu&apos;au{" "}
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
            <DataRow label="Fournisseur" value={lot.fournisseurs?.nom ?? null} />
            <DataRow label="SIRET" value={lot.fournisseurs?.siret ?? null} mono />
            <DataRow label="Lot fournisseur" value={lot.supplier_lot} mono />
            {lot.quantite_recue != null && (
              <DataRow
                label="Quantité reçue"
                value={`${lot.quantite_recue} ${lot.unite ?? ""}`.trim()}
              />
            )}
            {/* TODO : quantité restante — requiert jointure
                commandes_drive_lignes + sorties_stock par lot_id
                (Phase 1 post-démo). */}
            <DataRow
              label="Quantité restante"
              value="— (Phase 1)"
            />
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
            {lot.dlc && <DataRow label="DLC" value={formatDate(lot.dlc)} accent />}
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
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  accent?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-rule last:border-b-0">
      <span className="text-[12px] font-semibold text-text-secondary shrink-0">
        {label}
      </span>
      <span
        className={`text-[14px] font-bold text-right truncate ${mono ? "tabular-nums" : ""} ${accent ? "text-primary" : "text-text-primary"}`}
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
