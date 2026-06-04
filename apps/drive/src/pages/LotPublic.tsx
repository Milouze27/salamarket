import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeCheck,
  Factory,
  Loader2,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BRAND } from "@/config/brand";
import { qrSvg } from "@/lib/qr-svg";

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

  // ─── État du certificat halal — le cœur du moat ─────────────────
  // Trois états distincts, JAMAIS un faux "validé" :
  //   • "valide"   : date renseignée ET dans le futur (≥ aujourd'hui)
  //   • "expire"   : date renseignée ET dans le passé → bandeau ROUGE
  //   • "inconnu"  : pas de date enregistrée → état neutre, surtout pas vert
  // Comparaison à minuit (start of day) : un certif qui expire AUJOURD'HUI
  // est traité comme encore valide jusqu'à la fin de la journée.
  const certifState = useMemo<"valide" | "expire" | "inconnu">(() => {
    const raw = lot?.certifier_valid_until;
    if (!raw) return "inconnu";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(`${raw}${raw.length === 10 ? "T00:00:00" : ""}`);
    if (Number.isNaN(exp.getTime())) return "inconnu";
    return exp >= today ? "valide" : "expire";
  }, [lot]);
  const certifExpired = certifState === "expire";

  // ─── QR re-scannable (auto-encodé, zéro service externe) ─────────
  // Le client peut re-montrer / re-scanner / partager cette preuve.
  // On encode l'URL canonique du passeport côté navigateur — aucune
  // image tierce sur une page de preuve halal.
  const qrDataUrl = useMemo<string | null>(() => {
    if (!lot?.id) return null;
    try {
      const origin =
        typeof window !== "undefined"
          ? window.location.origin
          : "https://salamarket-drive.vercel.app";
      const svg = qrSvg(`${origin}/lot/${lot.id}`, {
        size: 220,
        dark: BRAND.colors.primary,
        light: "#FFFFFF",
        margin: 3,
      });
      if (!svg) return null;
      return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    } catch {
      return null;
    }
  }, [lot?.id]);

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
            <p className="text-base font-semibold opacity-95 leading-snug mb-6">
              {produit.nom}
              {produit.marque && (
                <span className="opacity-70 font-medium"> · {produit.marque}</span>
              )}
            </p>
          )}

          {/* ─── Badge de confiance — le verdict, vu d'un coup d'œil ─────
              Le client musulman doit savoir AVANT TOUT si la chaîne halal
              est vérifiée. Vert = certifié & vérifié, rouge = expiré,
              neutre = validité non renseignée (jamais un faux vert). */}
          <div
            className="inline-flex items-center gap-2.5 rounded-full pl-2.5 pr-4 py-2"
            style={{
              background: certifExpired
                ? "rgba(229,72,61,0.18)"
                : certifState === "inconnu"
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.14)",
              border: `1.5px solid ${
                certifExpired
                  ? BRAND.colors.destructive
                  : certifState === "inconnu"
                    ? "rgba(255,255,255,0.25)"
                    : BRAND.colors.accent
              }`,
            }}
          >
            <span
              className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: certifExpired
                  ? BRAND.colors.destructive
                  : certifState === "inconnu"
                    ? "rgba(255,255,255,0.2)"
                    : BRAND.colors.accent,
                color: certifExpired ? "#FFFFFF" : BRAND.colors.primary,
              }}
            >
              {certifExpired ? (
                <ShieldAlert className="w-4 h-4" />
              ) : certifState === "inconnu" ? (
                <ShieldQuestion className="w-4 h-4" />
              ) : (
                <ShieldCheck className="w-4 h-4" />
              )}
            </span>
            <span
              className="text-[13px] font-extrabold tracking-tight"
              style={{
                color: certifExpired
                  ? "#FFE7E4"
                  : certifState === "inconnu"
                    ? "rgba(255,255,255,0.9)"
                    : BRAND.colors.accent,
              }}
            >
              {certifExpired
                ? "Certificat expiré"
                : certifState === "inconnu"
                  ? "Validité non renseignée"
                  : "Certifié & vérifié"}
            </span>
          </div>
        </div>
      </header>

      <main
        className="max-w-md mx-auto px-6 -mt-6 pb-12 space-y-5"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3rem)" }}
      >
        {/* ─── Bandeau ROUGE : certificat expiré (intégrité du moat) ─
            Si le certificat de traçabilité halal du lot est expiré à la
            date de consultation, on l'annonce franchement EN PREMIER.
            On ne masque jamais l'expiration derrière un sceau vert. */}
        {certifExpired && (
          <div
            role="alert"
            className="p-5 rounded-2xl flex items-start gap-3"
            style={{
              background: "rgba(229,72,61,0.10)",
              border: `1.5px solid ${BRAND.colors.destructive}`,
            }}
          >
            <ShieldAlert
              className="w-6 h-6 shrink-0 mt-0.5"
              style={{ color: BRAND.colors.destructive }}
            />
            <div className="min-w-0">
              <p
                className="text-[11px] font-bold tracking-[0.16em] uppercase mb-1"
                style={{ color: BRAND.colors.destructive }}
              >
                Certificat expiré
              </p>
              <p
                className="text-[14px] font-bold leading-snug mb-1"
                style={{ color: BRAND.colors.text }}
              >
                Certificat de traçabilité expiré le{" "}
                {formatDate(lot.certifier_valid_until)}
              </p>
              <p
                className="text-[13px] leading-relaxed"
                style={{ color: BRAND.colors.muted }}
              >
                La validité du certificat halal de ce lot n&apos;est plus à jour
                dans notre registre. Contactez le magasin avant tout achat.
              </p>
            </div>
          </div>
        )}

        {/* ─── 1. Certification halal ─────────────────────── */}
        <Section
          eyebrow="01 — Certification"
          title={
            certifExpired
              ? "Certificat expiré"
              : certifState === "inconnu"
                ? "Validité non renseignée"
                : "Halal vérifié"
          }
          icon={
            certifExpired ? (
              <ShieldAlert className="w-5 h-5" />
            ) : certifState === "inconnu" ? (
              <ShieldQuestion className="w-5 h-5" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )
          }
          iconColor={
            certifExpired ? BRAND.colors.destructive : undefined
          }
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-16 h-16 rounded-2xl flex items-center justify-center font-extrabold text-lg"
              style={{
                background: certifExpired
                  ? "rgba(229,72,61,0.10)"
                  : BRAND.colors.accentSoft,
                color: certifExpired ? BRAND.colors.destructive : "#8B6F0E",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {certifierLogoLabel(lot.certifier_id)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[15px] leading-snug">
                {lot.certifier_name ?? "Certificateur halal"}
              </p>
              {lot.certifier_valid_until ? (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: certifExpired
                        ? "rgba(229,72,61,0.12)"
                        : "rgba(45,122,79,0.12)",
                      color: certifExpired
                        ? BRAND.colors.destructive
                        : BRAND.colors.success,
                    }}
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
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: "rgba(120,120,120,0.12)",
                      color: BRAND.colors.muted,
                    }}
                  >
                    <ShieldQuestion className="w-3.5 h-3.5" />
                    Validité non renseignée
                  </span>
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* ─── 2. Le parcours — timeline halal visuelle ──────────────
            Le cœur du passeport : la viande remonte sa chaîne sous les
            yeux du client. Abattoir → Fournisseur → Magasin → Vous.
            Chaque étape est un nœud relié par une ligne verticale ;
            on lit le voyage d'un seul coup d'œil. */}
        <section
          className="p-5 rounded-2xl border"
          style={{
            borderColor: BRAND.colors.border,
            background: BRAND.colors.surface,
            boxShadow: "0 1px 2px rgba(14,59,46,0.04)",
          }}
        >
          <div className="mb-5">
            <p
              className="text-[10.5px] font-bold tracking-[0.18em] uppercase"
              style={{ color: BRAND.colors.accentText }}
            >
              02 — Le parcours
            </p>
            <h2
              className="text-[16px] font-extrabold tracking-tight"
              style={{ color: BRAND.colors.text }}
            >
              De l&apos;abattoir jusqu&apos;à vous
            </h2>
          </div>

          <Timeline
            steps={[
              {
                icon: <Factory className="w-4 h-4" />,
                label: "Abattoir",
                title: lot.abattoir_nom ?? "Abattoir non renseigné",
                rows: [
                  {
                    k: "Pays",
                    v: lot.abattoir_pays ? flagFor(lot.abattoir_pays) : null,
                  },
                  { k: "Abattage", v: formatDate(lot.date_abattage) },
                ],
              },
              {
                icon: <Truck className="w-4 h-4" />,
                label: "Fournisseur",
                title: fournisseur?.nom ?? "Fournisseur non renseigné",
                rows: [
                  { k: "SIRET", v: fournisseur?.siret ?? null, mono: true },
                  { k: "Lot fournisseur", v: lot.supplier_lot, mono: true },
                  {
                    k: "Quantité",
                    v:
                      lot.quantite_recue != null
                        ? `${lot.quantite_recue} ${lot.unite ?? ""}`.trim()
                        : null,
                  },
                ],
              },
              {
                icon: <Store className="w-4 h-4" />,
                label: "Magasin",
                title: BRAND.store.name,
                rows: [
                  { k: "Réception", v: formatDate(lot.date_reception) },
                  { k: "DLC", v: lot.dlc ? formatDate(lot.dlc) : null, accent: true },
                  { k: "DDM", v: lot.ddm ? formatDate(lot.ddm) : null },
                ],
              },
              {
                icon: <ShoppingBag className="w-4 h-4" />,
                label: "Vous",
                title: "Entre vos mains",
                rows: [
                  {
                    k: "Vérifié le",
                    v: formatDate(new Date().toISOString()),
                  },
                ],
                last: true,
                highlight: !certifExpired,
              },
            ]}
          />
        </section>

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
        {certifExpired ? (
          <section
            className="p-5 rounded-2xl text-center"
            style={{
              background: "rgba(229,72,61,0.08)",
              border: `1px solid ${BRAND.colors.destructive}`,
            }}
          >
            <ShieldAlert
              className="w-6 h-6 mx-auto mb-2"
              style={{ color: BRAND.colors.destructive }}
            />
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2"
              style={{ color: BRAND.colors.destructive }}
            >
              Certificat à renouveler
            </p>
            <p
              className="text-[13px] leading-relaxed"
              style={{ color: BRAND.colors.text }}
            >
              Cette page reste publique et la traçabilité du lot est conservée,
              mais le certificat halal a expiré. Contactez le magasin pour
              connaître son statut à jour avant tout achat.
            </p>
          </section>
        ) : (
          <section
            className="p-6 rounded-2xl text-center"
            style={{
              background: BRAND.colors.accentSoft,
              border: `1px solid ${BRAND.colors.borderMedium}`,
            }}
          >
            <ShieldCheck
              className="w-6 h-6 mx-auto mb-2"
              style={{ color: BRAND.colors.accentText }}
            />
            <p
              className="text-[11px] font-bold tracking-[0.18em] uppercase mb-2"
              style={{ color: BRAND.colors.accentText }}
            >
              Preuve auto-vérifiable
            </p>
            <p
              className="text-[13px] leading-relaxed mb-5"
              style={{ color: BRAND.colors.text }}
            >
              Cette page est publique et auto-vérifiable. Scannez ce code à tout
              moment pour la retrouver, ou montrez-le à un proche.
            </p>

            {/* ─── QR re-scannable, encodé localement ───────────────── */}
            {qrDataUrl && (
              <div className="flex flex-col items-center">
                <div
                  className="rounded-2xl p-3"
                  style={{
                    background: "#FFFFFF",
                    border: `1px solid ${BRAND.colors.borderMedium}`,
                    boxShadow: "0 4px 16px rgba(14,59,46,0.10)",
                  }}
                >
                  <img
                    src={qrDataUrl}
                    alt={`QR du lot ${lot.id}`}
                    width={168}
                    height={168}
                    className="block"
                    style={{ width: 168, height: 168 }}
                  />
                </div>
                <p
                  className="mt-3 text-[11px] font-bold tracking-[0.08em] tabular-nums"
                  style={{ color: BRAND.colors.accentText }}
                >
                  LOT {lot.id}
                </p>
              </div>
            )}
          </section>
        )}

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
  iconColor,
  children,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  iconColor?: string;
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
            color: iconColor ?? BRAND.colors.primary,
          }}
        >
          {icon}
        </span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

// ─── Timeline halal : abattoir → fournisseur → magasin → vous ───────
interface TimelineRow {
  k: string;
  v: string | null;
  mono?: boolean;
  accent?: boolean;
}
interface TimelineStep {
  icon: React.ReactNode;
  label: string;
  title: string;
  rows: TimelineRow[];
  last?: boolean;
  highlight?: boolean;
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const visibleRows = step.rows.filter((r) => r.v);
        return (
          <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Ligne verticale reliant les nœuds */}
            {!step.last && (
              <span
                aria-hidden
                className="absolute left-[19px] top-10 bottom-0 w-[2px]"
                style={{ background: BRAND.colors.border }}
              />
            )}
            {/* Nœud */}
            <span
              className="relative z-10 shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
              style={{
                background: step.highlight
                  ? BRAND.colors.accent
                  : BRAND.colors.primary,
                color: step.highlight ? BRAND.colors.primary : "#FFFFFF",
                boxShadow: step.highlight
                  ? `0 0 0 4px ${BRAND.colors.accentSoft}`
                  : "none",
              }}
            >
              {step.icon}
            </span>
            {/* Contenu de l'étape */}
            <div className="flex-1 min-w-0 pt-0.5">
              <p
                className="text-[10px] font-bold tracking-[0.16em] uppercase mb-0.5"
                style={{ color: BRAND.colors.accentText }}
              >
                {step.label}
              </p>
              <p
                className="text-[15px] font-extrabold leading-snug mb-1.5"
                style={{ color: BRAND.colors.text }}
              >
                {step.title}
              </p>
              {visibleRows.length > 0 && (
                <div className="space-y-1">
                  {visibleRows.map((r, j) => (
                    <div
                      key={j}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span
                        className="text-[12px] font-semibold shrink-0"
                        style={{ color: BRAND.colors.muted }}
                      >
                        {r.k}
                      </span>
                      <span
                        className={`text-[13px] font-bold text-right truncate ${
                          r.mono ? "tabular-nums" : ""
                        }`}
                        style={{
                          color: r.accent
                            ? BRAND.colors.primary
                            : BRAND.colors.text,
                        }}
                      >
                        {r.v}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
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
