"use client";

/* /v2/lots — Liste des lots halal récents
 * ─────────────────────────────────────────
 * Audit demo : la page /v2/lots renvoyait 404, alors que V2Shell expose
 * un lien "Lots" dans la nav (ITEMS.lots). On crée la page liste —
 * complément de /v2/lots/[id] qui existe déjà pour le détail.
 *
 * Lit produits_lots ordered by created_at DESC LIMIT 50.
 * Pour chaque lot : id, abattoir, validité certif AVS, date_naissance
 * (date_abattage en réalité — pas de naissance dans le schéma 0031),
 * date_abattage, lien vers la page publique /lot/{id} sur drive +
 * lien staff vers /v2/lots/{id}.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  ExternalLink,
  Factory,
  Loader2,
  QrCode,
  RotateCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { DataTable } from "@/components/v2/DataTable";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { EmptyState } from "@/components/shared/EmptyState";
import { supabase } from "@/lib/supabase";

interface LotRow {
  id: string;
  produit_id: string;
  abattoir_nom: string | null;
  abattoir_pays: string | null;
  certifier_id: string | null;
  certifier_name: string | null;
  certifier_valid_until: string | null;
  date_abattage: string | null;
  date_reception: string;
  dlc: string | null;
  quantite_recue: number | null;
  unite: string | null;
  created_at: string;
  produits: { id: string; nom: string; marque: string | null } | null;
  fournisseurs: { id: string; nom: string } | null;
}

const DRIVE_BASE_URL = "https://salamarket-drive.vercel.app";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function certifState(
  validUntil: string | null,
): "ok" | "expire_soon" | "expired" | "unknown" {
  if (!validUntil) return "unknown";
  // Comparaison date-à-date en Europe/Paris (le certif est valide jusqu'à la
  // fin du jour `valid_until`), pas une soustraction de timestamps qui dérive
  // de quelques heures selon le fuseau du navigateur.
  const validDay = validUntil.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validDay)) return "unknown";
  const todayParis = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Paris",
  });
  if (validDay < todayParis) return "expired";
  const days = Math.round(
    (new Date(validDay + "T00:00:00Z").getTime() -
      new Date(todayParis + "T00:00:00Z").getTime()) /
      86_400_000,
  );
  if (days < 30) return "expire_soon";
  return "ok";
}

/** Ordre d'urgence pour le tri du tableau : le plus urgent d'abord. */
const RANG_CERTIF: Record<ReturnType<typeof certifState>, number> = {
  expired: 0,
  expire_soon: 1,
  unknown: 2,
  ok: 3,
};

/** Compare deux dates ISO nullables. Les dates absentes finissent la liste. */
function cmpDate(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
}

export default function V2LotsListPage() {
  const router = useRouter();
  const [list, setList] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const sb = supabase();
    if (!sb) {
      setError(true);
      setLoading(false);
      toast.error("Connexion Supabase indisponible");
      return;
    }
    const { data, error: err } = await sb
      .from("produits_lots")
      .select(
        `
          id, produit_id, abattoir_nom, abattoir_pays,
          certifier_id, certifier_name, certifier_valid_until,
          date_abattage, date_reception, dlc, quantite_recue, unite, created_at,
          produits ( id, nom, marque ),
          fournisseurs ( id, nom )
        `,
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (err) {
      console.error("[v2/lots] load", err);
      toast.error("Impossible de charger les lots");
      setError(true);
      setLoading(false);
      return;
    }
    setList((data ?? []) as unknown as LotRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const acc = { ok: 0, expire_soon: 0, expired: 0, unknown: 0 };
    for (const l of list) {
      acc[certifState(l.certifier_valid_until)] += 1;
    }
    return acc;
  }, [list]);

  return (
    <V2Shell layout="full">
      <PageAccentStripe accent="or-sapin" />
      <div className="px-5 pt-4 pb-nav-stack">
        <BackButton />

        <header className="mt-4 mb-5">
          <EditorialEyebrow num="01" label="Traçabilité halal" />
          <h1 className="h1-display mt-2">
            <em className="gold">Lots</em> reçus
          </h1>
          <p
            className="body-md mt-2 lg:max-w-[54ch]"
            style={{ color: "var(--text-secondary)" }}
          >
            Les 50 derniers lots enregistrés. Chaque lot a un QR code public
            scannable par le client en magasin.
          </p>
        </header>

        {/* Strip stats — vision d'ensemble certifs */}
        <div className="grid grid-cols-4 gap-2 mb-5 lg:max-w-[620px]">
          <StatPill value={counts.ok} label="Certif OK" tone="success" />
          <StatPill value={counts.expire_soon} label="< 30 j" tone="warning" />
          <StatPill value={counts.expired} label="Expirés" tone="danger" />
          <StatPill value={counts.unknown} label="Inconnu" tone="neutral" />
        </div>

        {/* Liste */}
        {loading ? (
          <div
            className="flex items-center gap-2 text-[14px]"
            style={{ color: "var(--text-secondary)" }}
          >
            <Loader2 size={16} className="animate-spin" /> Chargement…
          </div>
        ) : error ? (
          <div className="lg rise-in" style={{ padding: 8 }}>
            <EmptyState
              icon={ShieldAlert}
              title="Chargement impossible"
              description="Les lots n'ont pas pu être récupérés. Vérifie ta connexion puis réessaie."
              compact
              action={
                <button
                  type="button"
                  onClick={() => void load()}
                  className="btn-primary tap"
                  style={{ minHeight: 44 }}
                >
                  <RotateCw size={16} /> Réessayer
                </button>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <div className="lg rise-in" style={{ padding: 8 }}>
            <EmptyState
              icon={QrCode}
              title="Aucun lot enregistré"
              description="Chaque livraison réceptionnée crée un lot tracé avec QR public. Commence par une réception."
              compact
              action={
                <Link
                  href="/v2/reception"
                  className="btn-primary"
                  style={{ minHeight: 44 }}
                >
                  <ArrowRight size={16} /> Réceptionner une livraison
                </Link>
              }
            />
          </div>
        ) : (
          <>
            {/* ── POSTE DE TRAVAIL (≥ lg) : tableau de traçabilité ──────────
              Le gestionnaire arbitre sur l'échéance des certificats AVS : le
              tableau est trié par urgence, et un filet rouge (expiré) ou
              orange (moins de 30 jours) marque la ligne en tête. Les cartes
              restent la vue du terrain, sous 1024 px. */}
            <section className="hidden lg:block 2xl:max-w-[1400px]">
              <DataTable
                rows={list}
                getKey={(l) => l.id}
                caption={`Lots halal reçus — ${list.length} lignes, triées par urgence du certificat`}
                defaultSort={{ key: "certificat", dir: "asc" }}
                onRowClick={(l) => router.push(`/v2/lots/${l.id}`)}
                rowAccent={(l) => {
                  const etat = certifState(l.certifier_valid_until);
                  if (etat === "expired") return "var(--danger)";
                  if (etat === "expire_soon") return "var(--warning)";
                  return null;
                }}
                emptyLabel="Aucun lot enregistré."
                columns={[
                  {
                    key: "lot",
                    label: "Lot",
                    width: "118px",
                    sort: (a, b) => a.id.localeCompare(b.id, "fr"),
                    render: (l) => (
                      <span
                        className="mono text-[12.5px] font-semibold whitespace-nowrap"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {l.id}
                      </span>
                    ),
                  },
                  {
                    key: "produit",
                    label: "Produit",
                    sort: (a, b) =>
                      (a.produits?.nom ?? "").localeCompare(
                        b.produits?.nom ?? "",
                        "fr",
                      ),
                    render: (l) => (
                      <span className="block min-w-0">
                        <span
                          className="block font-semibold truncate"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {l.produits?.nom ?? "Produit inconnu"}
                        </span>
                        {l.produits?.marque && (
                          <span
                            className="block text-[12px] truncate"
                            style={{ color: "var(--text-tertiary)" }}
                          >
                            {l.produits.marque}
                          </span>
                        )}
                      </span>
                    ),
                  },
                  {
                    key: "fournisseur",
                    label: "Fournisseur",
                    width: "140px",
                    sort: (a, b) =>
                      (a.fournisseurs?.nom ?? "").localeCompare(
                        b.fournisseurs?.nom ?? "",
                        "fr",
                      ),
                    render: (l) => (
                      <span
                        className="block truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {l.fournisseurs?.nom || "—"}
                      </span>
                    ),
                  },
                  {
                    key: "reception",
                    label: "Reçu le",
                    width: "114px",
                    sort: (a, b) => cmpDate(a.date_reception, b.date_reception),
                    render: (l) => (
                      <span
                        className="whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatDate(l.date_reception)}
                      </span>
                    ),
                  },
                  {
                    key: "dlc",
                    label: "DLC",
                    width: "118px",
                    xlOnly: true,
                    sort: (a, b) => cmpDate(a.dlc, b.dlc),
                    render: (l) => (
                      <span
                        className="whitespace-nowrap"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {formatDate(l.dlc)}
                      </span>
                    ),
                  },
                  {
                    key: "certificat",
                    label: "Certificat",
                    width: "228px",
                    // Tri d'urgence : expiré, puis « moins de 30 jours », puis
                    // inconnu, puis valide ; à égalité, l'échéance la plus proche.
                    sort: (a, b) =>
                      RANG_CERTIF[certifState(a.certifier_valid_until)] -
                        RANG_CERTIF[certifState(b.certifier_valid_until)] ||
                      cmpDate(a.certifier_valid_until, b.certifier_valid_until),
                    render: (l) => (
                      <span className="flex items-center gap-2 min-w-0">
                        <CertifBadge
                          state={certifState(l.certifier_valid_until)}
                        />
                        <span
                          className="truncate text-[12px]"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          {l.certifier_id ?? l.certifier_name ?? "—"}
                          {l.certifier_valid_until &&
                            ` · ${formatDate(l.certifier_valid_until)}`}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: "quantite",
                    label: "Quantité",
                    width: "102px",
                    align: "right",
                    sort: (a, b) =>
                      (a.quantite_recue ?? -1) - (b.quantite_recue ?? -1),
                    render: (l) =>
                      l.quantite_recue == null ? (
                        <span style={{ color: "var(--text-tertiary)" }}>—</span>
                      ) : (
                        <span
                          className="font-bold"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {l.quantite_recue}
                          {l.unite && (
                            <span
                              className="font-medium"
                              style={{ color: "var(--text-tertiary)" }}
                            >
                              {" "}
                              {l.unite}
                            </span>
                          )}
                        </span>
                      ),
                  },
                  {
                    key: "public",
                    label: "",
                    width: "50px",
                    align: "center",
                    render: (l) => (
                      <a
                        href={`${DRIVE_BASE_URL}/lot/${l.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Page publique scannée par le client"
                        aria-label={`Ouvrir la page publique du lot ${l.id}`}
                        className="w-9 h-9 rounded-full inline-flex items-center justify-center"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </a>
                    ),
                  },
                ]}
              />
            </section>

            {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ─────────── */}
            <ul className="lg:hidden grid grid-cols-1 gap-3">
              {list.map((lot, i) => {
                const state = certifState(lot.certifier_valid_until);
                return (
                  <li
                    key={lot.id}
                    className="rise-in"
                    style={{ ["--i" as string]: Math.min(i, 8) }}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => router.push(`/v2/lots/${lot.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") router.push(`/v2/lots/${lot.id}`);
                      }}
                      className="block lg lg-hover tap cursor-pointer"
                      style={{ padding: 16 }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p
                            className="font-bold tabular-nums tracking-tight"
                            style={{
                              fontSize: 16,
                              color: "var(--text-primary)",
                            }}
                          >
                            {lot.id}
                          </p>
                          <p
                            className="body-sm mt-0.5 truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {lot.produits?.nom ?? "Produit inconnu"}
                            {lot.produits?.marque && (
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {" · "}
                                {lot.produits.marque}
                              </span>
                            )}
                          </p>
                        </div>
                        <CertifBadge state={state} />
                      </div>

                      <div
                        className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <Factory size={12} className="shrink-0" />
                          <span className="truncate">
                            {lot.abattoir_nom ?? "—"}
                            {lot.abattoir_pays && lot.abattoir_pays !== "FR" && (
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {" · "}
                                {lot.abattoir_pays}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <ShieldCheck size={12} className="shrink-0" />
                          <span className="truncate">
                            {lot.certifier_id ?? "—"}
                            {lot.certifier_valid_until && (
                              <span style={{ color: "var(--text-tertiary)" }}>
                                {" · jusqu'au "}
                                {formatDate(lot.certifier_valid_until)}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="shrink-0" />
                          <span>Abattage {formatDate(lot.date_abattage)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Calendar size={12} className="shrink-0" />
                          <span>Reçu {formatDate(lot.date_reception)}</span>
                        </div>
                      </div>

                      {/* Public link footer */}
                      <div
                        className="mt-3 pt-3 flex items-center justify-between gap-2"
                        style={{ borderTop: "1px solid var(--border-light)" }}
                      >
                        <a
                          href={`${DRIVE_BASE_URL}/lot/${lot.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                          style={{ color: "var(--primary-green)" }}
                        >
                          <QrCode size={12} />
                          Page publique
                          <ExternalLink size={11} />
                        </a>
                        <span
                          className="text-[11px] tracking-widest uppercase font-semibold"
                          style={{ color: "var(--text-tertiary)" }}
                        >
                          Détail staff →
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </V2Shell>
  );
}

function CertifBadge({
  state,
}: {
  state: "ok" | "expire_soon" | "expired" | "unknown";
}) {
  if (state === "expired") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold shrink-0"
        style={{ background: "var(--danger-soft)", color: "var(--danger-ink)" }}
      >
        <ShieldAlert size={11} />
        Expiré
      </span>
    );
  }
  if (state === "expire_soon") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold shrink-0"
        style={{ background: "var(--warning-soft)", color: "var(--warning-ink)" }}
      >
        <ShieldAlert size={11} />
        Bientôt
      </span>
    );
  }
  if (state === "ok") {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold shrink-0"
        style={{ background: "var(--success-soft)", color: "var(--success)" }}
      >
        <ShieldCheck size={11} />
        Valide
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold shrink-0"
      style={{ background: "var(--bg-cream)", color: "var(--text-secondary)" }}
    >
      —
    </span>
  );
}

function StatPill({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const tones = {
    // 31/08/2026 — les *-ink sont l'encre de texte : en thème jour, l'ambre
    // et le rouge d'alerte posés sur leur propre voile tombaient à 2,90 et
    // 3,60:1. Les fonds, eux, ne changent pas.
    success: { bg: "var(--success-soft)", color: "var(--success)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning-ink)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger-ink)" },
    neutral: { bg: "var(--bg-cream)", color: "var(--text-secondary)" },
  } as const;
  const t = tones[tone];
  return (
    <div
      className="rounded-[20px] px-3 py-3 text-center"
      style={{ background: t.bg }}
    >
      <p
        className="font-extrabold tabular-nums leading-none"
        style={{ fontSize: 22, color: t.color }}
      >
        {value}
      </p>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mt-1"
        style={{ color: t.color }}
      >
        {label}
      </p>
    </div>
  );
}
