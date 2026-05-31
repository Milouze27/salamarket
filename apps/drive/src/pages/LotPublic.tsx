import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  CalendarDays,
  Factory,
  Loader2,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/config/brand";

/**
 * Public, anonymous halal lot trace page.
 *
 * URL : /lot/:id (e.g. /lot/L2026-05-A23)
 *
 * Reads `produits_lots` via RLS read-all. This page is the moat —
 * a customer scans the QR on their ticket, sees auto-verifiable
 * halal proof : certifier, validity, abattoir, dates. No login,
 * no app install, just a URL.
 *
 * Mobile-first by construction : 99 % of scans come from a phone.
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
  fournisseur_id: string | null;
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

const certifierLogoLabel = (certifierId: string | null): string => {
  if (!certifierId) return "Halal";
  switch (certifierId) {
    case "AVS":
      return "AVS";
    case "ARGML":
      return "ARGML";
    case "MOSQUEE_PARIS":
      return "GMP";
    default:
      return "Halal";
  }
};

const LotPublic = () => {
  const { id } = useParams<{ id: string }>();
  const [lot, setLot] = useState<Lot | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // ─── SEO : update <title> + meta description from the lot ────
  useEffect(() => {
    if (!id) return;
    document.title = `Lot ${id} · Traçabilité halal · Salamarket`;
  }, [id]);

  useEffect(() => {
    if (lot?.produits?.nom) {
      document.title = `Lot ${lot.id} — ${lot.produits.nom} · Traçabilité halal Salamarket`;
      const desc = document.querySelector('meta[name="description"]');
      const content = `Traçabilité halal du lot ${lot.id} — ${lot.produits.nom}. Certifié ${lot.certifier_name ?? "halal"}. Abattu à ${lot.abattoir_nom ?? "—"} le ${formatDate(lot.date_abattage)}. Page publique auto-vérifiable.`;
      if (desc) {
        desc.setAttribute("content", content);
      } else {
        const meta = document.createElement("meta");
        meta.name = "description";
        meta.content = content;
        document.head.appendChild(meta);
      }
    }
  }, [lot]);

  useEffect(() => {
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      // DEMO-008 — la table `fournisseurs` est verrouillée RLS staff
      // (lockdown 20260531000002), donc anon ne peut PAS join dessus.
      // Si on l'embarque dans le select() ça fait planter toute la
      // query avec 403 → "Lot introuvable" alors que le lot existe.
      // On charge produits_lots + produits (catalogue public), puis on
      // fetch fournisseurs séparément en best-effort : s'il est lisible
      // tant mieux, sinon on affiche juste "Fournisseur — Non renseigné".
      const { data, error } = await supabase
        .from("produits_lots" as never)
        .select(
          `
          id, produit_id, supplier_lot, fournisseur_id,
          certifier_id, certifier_name, certifier_valid_until,
          abattoir_nom, abattoir_pays, date_abattage,
          date_reception, dlc, ddm, quantite_recue, unite,
          qr_url, notes,
          produits ( id, nom, marque, categorie )
        `
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        setLot(null);
        setLoading(false);
        return;
      }
      const lotRow = data as unknown as Lot;

      // Best-effort fournisseur (peut être bloqué par RLS pour anon).
      if (lotRow.fournisseur_id) {
        const { data: f } = await supabase
          .from("fournisseurs" as never)
          .select("id, nom, siret")
          .eq("id", lotRow.fournisseur_id)
          .maybeSingle();
        if (f) lotRow.fournisseurs = f as unknown as FournisseurLite;
      }

      if (!cancelled) {
        setLot(lotRow);
        setNotFound(false);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const certifValid = useMemo(() => {
    if (!lot?.certifier_valid_until) return null;
    return new Date(lot.certifier_valid_until) >= new Date();
  }, [lot]);

  // ─── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        className="min-h-dvh flex items-center justify-center"
        style={{ background: BRAND.colors.bg }}
      >
        <Loader2
          className="h-7 w-7 animate-spin"
          style={{ color: BRAND.colors.primary }}
          aria-label="Chargement"
        />
      </div>
    );
  }

  // ─── Not found ──────────────────────────────────────────────
  if (notFound || !lot) {
    return (
      <div
        className="min-h-dvh flex flex-col px-6 pt-24 pb-12"
        style={{
          background: BRAND.colors.bg,
          fontFamily: `'${BRAND.font}', system-ui, sans-serif`,
          paddingTop: "calc(env(safe-area-inset-top) + 6rem)",
        }}
      >
        <div className="text-center max-w-sm mx-auto">
          <div
            className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-6"
            style={{ background: BRAND.colors.accentSoft }}
          >
            <PackageCheck
              className="w-8 h-8"
              style={{ color: BRAND.colors.primary }}
            />
          </div>
          <p
            className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2"
            style={{ color: BRAND.colors.accent }}
          >
            Traçabilité halal
          </p>
          <h1
            className="text-2xl font-extrabold tracking-tight mb-3"
            style={{ color: BRAND.colors.text }}
          >
            Lot introuvable
          </h1>
          <p
            className="text-sm leading-relaxed mb-8"
            style={{ color: BRAND.colors.muted }}
          >
            Le lot{" "}
            <span
              className="font-bold tabular-nums"
              style={{ color: BRAND.colors.text }}
            >
              {id}
            </span>{" "}
            n&apos;existe pas dans notre registre. Vérifiez le QR ou contactez
            le magasin.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-full font-bold text-sm transition-opacity active:opacity-80"
            style={{
              background: BRAND.colors.primary,
              color: BRAND.colors.bg,
            }}
          >
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const produit = lot.produits;
  const fournisseur = lot.fournisseurs;

  return (
    <div
      className="min-h-dvh"
      style={{
        background: BRAND.colors.bg,
        fontFamily: `'${BRAND.font}', system-ui, sans-serif`,
        color: BRAND.colors.text,
      }}
    >
      {/* ─── HERO ────────────────────────────────────────── */}
      <header
        className="px-6 pt-12 pb-10 relative overflow-hidden"
        style={{
          background: `linear-gradient(180deg, ${BRAND.colors.primary} 0%, ${BRAND.colors.primaryDark} 100%)`,
          color: BRAND.colors.bg,
        }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Sparkles
              className="w-4 h-4"
              style={{ color: BRAND.colors.accent }}
            />
            <p
              className="text-[11px] font-bold tracking-[0.22em] uppercase"
              style={{ color: BRAND.colors.accent }}
            >
              Traçabilité halal
            </p>
          </div>
          <p className="text-[12px] font-semibold opacity-80 mb-2 uppercase tracking-wider">
            Lot numéro
          </p>
          <h1
            className="text-[44px] sm:text-[52px] font-extrabold tracking-tight leading-none mb-4 break-all"
            style={{ color: BRAND.colors.accent }}
          >
            {lot.id}
          </h1>
          {produit && (
            <p className="text-base font-semibold opacity-95 leading-snug">
              {produit.nom}
              {produit.marque && (
                <span className="opacity-70 font-medium"> · {produit.marque}</span>
              )}
            </p>
          )}
        </div>
      </header>

      <main
        className="max-w-md mx-auto px-6 -mt-6 pb-12 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        {/* ─── 1. Certification halal ─────────────────────── */}
        <Section
          eyebrow="01 — Certification"
          title="Halal vérifié"
          icon={<ShieldCheck className="w-5 h-5" />}
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-lg"
              style={{
                background: BRAND.colors.accentSoft,
                color: "#8B6F0E",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {certifierLogoLabel(lot.certifier_id)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] leading-snug">
                {lot.certifier_name ?? "Certificateur halal"}
              </p>
              {lot.certifier_valid_until && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background:
                        certifValid === false
                          ? "rgba(229,72,61,0.12)"
                          : "rgba(45,122,79,0.12)",
                      color:
                        certifValid === false
                          ? BRAND.colors.destructive
                          : BRAND.colors.success,
                    }}
                  >
                    <BadgeCheck className="w-3.5 h-3.5" />
                    {certifValid === false ? "Expiré" : "Valide"} jusqu&apos;au{" "}
                    {formatDate(lot.certifier_valid_until)}
                  </span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ─── 2. Origine ─────────────────────────────────── */}
        <Section
          eyebrow="02 — Origine"
          title="Abattoir & date d'abattage"
          icon={<Factory className="w-5 h-5" />}
        >
          <DataRow label="Abattoir" value={lot.abattoir_nom} />
          <DataRow
            label="Pays"
            value={lot.abattoir_pays ? flagFor(lot.abattoir_pays) : null}
          />
          <DataRow label="Date d'abattage" value={formatDate(lot.date_abattage)} />
        </Section>

        {/* ─── 3. Fournisseur ─────────────────────────────── */}
        <Section
          eyebrow="03 — Fournisseur"
          title="Chaîne d'approvisionnement"
          icon={<MapPin className="w-5 h-5" />}
        >
          <DataRow label="Fournisseur" value={fournisseur?.nom ?? "Non renseigné"} />
          {fournisseur?.siret && (
            <DataRow label="SIRET" value={fournisseur.siret} mono />
          )}
          <DataRow
            label="Lot fournisseur"
            value={lot.supplier_lot}
            mono
          />
          {lot.quantite_recue != null && (
            <DataRow
              label="Quantité reçue"
              value={`${lot.quantite_recue} ${lot.unite ?? ""}`.trim()}
            />
          )}
        </Section>

        {/* ─── 4. Réception magasin ──────────────────────── */}
        <Section
          eyebrow="04 — Magasin"
          title="Réception & conservation"
          icon={<CalendarDays className="w-5 h-5" />}
        >
          <DataRow
            label="Date de réception"
            value={formatDate(lot.date_reception)}
          />
          {lot.dlc && (
            <DataRow label="DLC" value={formatDate(lot.dlc)} accent />
          )}
          {lot.ddm && <DataRow label="DDM" value={formatDate(lot.ddm)} />}
        </Section>

        {lot.notes && (
          <div
            className="p-5 rounded-2xl border"
            style={{
              borderColor: BRAND.colors.border,
              background: BRAND.colors.surface,
            }}
          >
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2"
              style={{ color: BRAND.colors.muted }}
            >
              Notes
            </p>
            <p className="text-[14px] leading-relaxed">{lot.notes}</p>
          </div>
        )}

        {/* ─── Bloc trust ─────────────────────────────────── */}
        <section
          className="p-5 rounded-2xl text-center"
          style={{
            background: BRAND.colors.accentSoft,
            border: `1px solid ${BRAND.colors.borderMedium}`,
          }}
        >
          <ShieldCheck
            className="w-6 h-6 mx-auto mb-2"
            style={{ color: "#8B6F0E" }}
          />
          <p
            className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2"
            style={{ color: "#8B6F0E" }}
          >
            Preuve auto-vérifiable
          </p>
          <p
            className="text-[13px] leading-relaxed"
            style={{ color: BRAND.colors.text }}
          >
            Cette page est publique et auto-vérifiable. Le QR est imprimé sur
            votre ticket. Conservez-le pour preuve halal.
          </p>
        </section>

        {/* ─── Footer ─────────────────────────────────────── */}
        <footer className="text-center pt-4">
          <Link
            to="/"
            className="inline-flex items-center justify-center min-h-[44px] px-4 text-[13px] font-semibold underline underline-offset-4"
            style={{ color: BRAND.colors.primary }}
          >
            {BRAND.name} · {BRAND.store.name}
          </Link>
        </footer>
      </main>
    </div>
  );
};

// ─── Tiny presentational helpers ─────────────────────────────────
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
    <section
      className="p-5 rounded-2xl border"
      style={{
        borderColor: BRAND.colors.border,
        background: BRAND.colors.surface,
        boxShadow: "0 1px 2px rgba(14,59,46,0.04)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p
            className="text-[10.5px] font-bold tracking-[0.18em] uppercase"
            style={{ color: BRAND.colors.accent }}
          >
            {eyebrow}
          </p>
          <h2
            className="text-[16px] font-extrabold tracking-tight"
            style={{ color: BRAND.colors.text }}
          >
            {title}
          </h2>
        </div>
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{
            background: BRAND.colors.bg,
            color: BRAND.colors.primary,
          }}
        >
          {icon}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
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
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b last:border-b-0"
      style={{ borderColor: BRAND.colors.border }}
    >
      <span
        className="text-[12px] font-semibold shrink-0"
        style={{ color: BRAND.colors.muted }}
      >
        {label}
      </span>
      <span
        className={`text-[14px] font-bold text-right truncate ${mono ? "tabular-nums" : ""}`}
        style={{
          color: accent ? BRAND.colors.primary : BRAND.colors.text,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function flagFor(country: string): string {
  const map: Record<string, string> = {
    FR: "France",
    BE: "Belgique",
    NL: "Pays-Bas",
    ES: "Espagne",
    IT: "Italie",
    DE: "Allemagne",
  };
  return map[country.toUpperCase()] ?? country;
}

export default LotPublic;
