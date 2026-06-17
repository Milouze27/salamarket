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

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Calendar,
  ExternalLink,
  Factory,
  Loader2,
  QrCode,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
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

export default function V2LotsListPage() {
  const router = useRouter();
  const [list, setList] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      if (!sb) {
        if (!cancelled) {
          setLoading(false);
          toast.error("Connexion Supabase indisponible");
        }
        return;
      }
      const { data, error } = await sb
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
      if (cancelled) return;
      if (error) {
        console.error("[v2/lots] load", error);
        toast.error("Impossible de charger les lots");
        setLoading(false);
        return;
      }
      setList((data ?? []) as unknown as LotRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    const acc = { ok: 0, expire_soon: 0, expired: 0, unknown: 0 };
    for (const l of list) {
      acc[certifState(l.certifier_valid_until)] += 1;
    }
    return acc;
  }, [list]);

  return (
    <V2Shell>
      <PageAccentStripe accent="or-sapin" />
      <div className="px-5 pt-4 pb-nav-stack">
        <BackButton />

        <header className="mt-4 mb-5">
          <EditorialEyebrow num="01" label="Traçabilité halal" />
          <h1 className="h1-display mt-2">
            <em className="gold">Lots</em> reçus
          </h1>
          <p
            className="body-md mt-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Les 50 derniers lots enregistrés. Chaque lot a un QR code public
            scannable par le client en magasin.
          </p>
        </header>

        {/* Strip stats — vision d'ensemble certifs */}
        <div className="grid grid-cols-4 gap-2 mb-5">
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
        ) : list.length === 0 ? (
          <div className="card" style={{ padding: 8 }}>
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
          <ul className="space-y-3">
            {list.map((lot, i) => {
              const state = certifState(lot.certifier_valid_until);
              return (
                <motion.li
                  key={lot.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.015, 0.3) }}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/v2/lots/${lot.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/v2/lots/${lot.id}`);
                    }}
                    className="block card card-tappable hover:shadow-md cursor-pointer"
                    style={{ padding: 14 }}
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
                </motion.li>
              );
            })}
          </ul>
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
        style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
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
        style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
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
    success: { bg: "var(--success-soft)", color: "var(--success)" },
    warning: { bg: "var(--warning-soft)", color: "var(--warning)" },
    danger: { bg: "var(--danger-soft)", color: "var(--danger)" },
    neutral: { bg: "var(--bg-cream)", color: "var(--text-secondary)" },
  } as const;
  const t = tones[tone];
  return (
    <div
      className="rounded-xl px-3 py-2 text-center"
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
