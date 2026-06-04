"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  BarChart3,
  Calculator,
  ClipboardCheck,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  PackageX,
  Rows3,
  Rows4,
  Settings,
  Sparkles,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { useDensity } from "@/lib/hooks/useDensity";

interface AdminMenuProps {
  /** Le rôle de l'employé. Les entrées admin ne s'affichent que pour "admin". */
  role: string | undefined;
  /** Déconnexion — migrée du header (ARCH-11) dans le répertoire unique. */
  onLogout?: () => void;
}

interface MenuEntry {
  href: string;
  label: string;
  desc: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
  accent?: "danger" | "gold" | "primary";
}

interface MenuGroup {
  heading: string;
  entries: MenuEntry[];
}

/**
 * ARCH-02 — répertoire admin groupé par plan mental.
 *   PILOTER     — décider / surveiller (dashboard, alertes, activité)
 *   ADMINISTRER — back-office (fiscal, rapports, import, IA, historiques)
 * Réservé au rôle admin (gaté à l'affichage).
 */
const ADMIN_GROUPS: MenuGroup[] = [
  {
    heading: "Piloter",
    entries: [
      {
        href: "/v2/admin",
        label: "Dashboard global",
        desc: "Vue 3 dépôts + KPIs + alertes",
        icon: LayoutDashboard,
        accent: "primary",
      },
      {
        href: "/v2/admin/alertes",
        label: "Alertes IA",
        desc: "Sorties suspectes, démarque, surplus",
        icon: AlertOctagon,
        accent: "danger",
      },
      {
        href: "/v2/admin/alertes-surplus",
        label: "Surplus fournisseurs",
        desc: "À accepter ou refuser",
        icon: AlertTriangle,
      },
      {
        href: "/v2/admin/activite",
        label: "Activité complète",
        desc: "Réceptions, sorties, transferts horodatés",
        icon: BarChart3,
      },
    ],
  },
  {
    heading: "Administrer",
    entries: [
      {
        href: "/v2/admin/recap-fiscal",
        label: "Récap fiscal du jour",
        desc: "TVA, ventes, ticket Z",
        icon: Calculator,
        accent: "gold",
      },
      {
        href: "/v2/admin/rapport-mensuel",
        label: "Rapport mensuel",
        desc: "CA, top produits, comparatifs",
        icon: BarChart3,
      },
      {
        href: "/v2/admin/import-cashmag",
        label: "Import Cashmag",
        desc: "Charger les ventes caisse",
        icon: FileSpreadsheet,
      },
      {
        href: "/v2/admin/assistant-ia",
        label: "Assistant IA business",
        desc: "Chat avec ton stock",
        icon: MessageSquare,
        accent: "gold",
      },
      {
        href: "/v2/inventaire/historique",
        label: "Historique inventaire",
        desc: "Tournants validés",
        icon: ClipboardCheck,
      },
      {
        href: "/v2/stock/sans-ean",
        label: "Articles sans code-barre",
        desc: "Produits sans EAN ou EAN illisible",
        icon: PackageX,
      },
    ],
  },
];

export function AdminMenu({ role, onLogout }: AdminMenuProps) {
  const [open, setOpen] = useState(false);
  const isAdmin = role === "admin";
  const { resolved, toggle: toggleTheme } = useTheme();
  const { density, toggle: toggleDensity } = useDensity();
  const isNight = resolved === "nuit";
  const isCompact = density === "compact";

  // Ferme avec Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Le drawer est portalé sur <body> pour échapper au stacking-context
  // du parent relative de V2Shell. Sans ça, sur certains rendus iOS le
  // drawer se rendait derrière le contenu malgré z-[80].
  // DARK-08 — backdrop verre teinté (glass-overlay), drawer sur surface-3.
  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="admin-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200]"
            style={{
              background: "var(--glass-overlay)",
              backdropFilter: "var(--glass-overlay-blur)",
              WebkitBackdropFilter: "var(--glass-overlay-blur)",
            }}
          />
          <motion.aside
            key="admin-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Menu — répertoire complet"
            className="fixed inset-y-0 right-0 z-[201] w-[88%] max-w-[380px] flex flex-col"
            style={{
              background: "var(--surface-3)",
              borderLeft: "1px solid var(--border-card)",
              boxShadow: "var(--shadow-elevated)",
            }}
          >
              {/* HEADER */}
              <div
                className="safe-top px-5 pb-3 flex items-center justify-between"
                style={{ borderBottom: "1px solid var(--border-hairline)" }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                      background: "var(--accent-gold-soft)",
                      color: "var(--accent-gold-bright)",
                    }}
                  >
                    <Settings className="w-4 h-4" />
                  </span>
                  <div>
                    <p
                      className="text-[10px] font-bold uppercase tracking-[0.14em]"
                      style={{ color: "var(--accent-gold-dim)" }}
                    >
                      Répertoire
                    </p>
                    <p className="text-sm font-bold text-text-primary leading-tight">
                      {isAdmin ? "Outils complets" : "Compte & réglages"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Fermer"
                  className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary"
                  style={{ background: "var(--surface-1)" }}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* LISTE — entrées admin groupées (admin only) */}
              <nav className="flex-1 overflow-y-auto px-3 py-3">
                {isAdmin &&
                  ADMIN_GROUPS.map((group) => (
                    <div key={group.heading} className="mb-1.5">
                      <p
                        className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                        style={{ color: "var(--accent-gold-dim)" }}
                      >
                        {group.heading}
                      </p>
                      {group.entries.map((e) => {
                        const Icon = e.icon;
                        return (
                          <Link
                            key={e.href}
                            href={e.href}
                            onClick={() => setOpen(false)}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
                          >
                            <span
                              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                              style={
                                e.accent === "danger"
                                  ? {
                                      background: "var(--danger-soft)",
                                      color: "var(--danger)",
                                    }
                                  : e.accent === "gold"
                                    ? {
                                        background: "var(--accent-gold-soft)",
                                        color: "var(--accent-gold-bright)",
                                      }
                                    : {
                                        background: "var(--surface-1)",
                                        color: "var(--primary-green)",
                                      }
                              }
                            >
                              <Icon className="w-5 h-5" strokeWidth={2.1} />
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-text-primary truncate">
                                {e.label}
                              </p>
                              <p className="text-[11px] text-text-secondary truncate">
                                {e.desc}
                              </p>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  ))}

                {/* COMPTE & RÉGLAGES — toggles migrés du header (ARCH-11) */}
                <div className="mb-1.5">
                  <p
                    className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--accent-gold-dim)" }}
                  >
                    Compte &amp; réglages
                  </p>

                  <button
                    type="button"
                    onClick={toggleTheme}
                    aria-pressed={isNight}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
                  >
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {isNight ? (
                        <Moon className="w-5 h-5" strokeWidth={2.1} />
                      ) : (
                        <Sun className="w-5 h-5" strokeWidth={2.1} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-text-primary truncate">
                        Mode atelier
                      </p>
                      <p className="text-[11px] text-text-secondary truncate">
                        {isNight ? "Nuit (sombre)" : "Jour (cream)"}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {isNight ? "Passer jour" : "Passer nuit"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={toggleDensity}
                    aria-pressed={isCompact}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
                  >
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {isCompact ? (
                        <Rows4 className="w-5 h-5" strokeWidth={2.1} />
                      ) : (
                        <Rows3 className="w-5 h-5" strokeWidth={2.1} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-text-primary truncate">
                        Densité
                      </p>
                      <p className="text-[11px] text-text-secondary truncate">
                        {isCompact ? "Compact" : "Confort"}
                      </p>
                    </div>
                    <span
                      className="text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full"
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {isCompact ? "Confort" : "Compact"}
                    </span>
                  </button>

                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onLogout();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
                    >
                      <span
                        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                        style={{
                          background: "var(--danger-soft)",
                          color: "var(--danger)",
                        }}
                      >
                        <LogOut className="w-5 h-5" strokeWidth={2.1} />
                      </span>
                      <div className="flex-1 min-w-0 text-left">
                        <p
                          className="text-sm font-bold truncate"
                          style={{ color: "var(--danger)" }}
                        >
                          Déconnexion
                        </p>
                        <p className="text-[11px] text-text-secondary truncate">
                          Verrouiller la session
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </nav>

              {isAdmin && (
                <div
                  className="px-5 pb-[calc(var(--safe-bottom)+12px)] pt-3"
                  style={{ borderTop: "1px solid var(--border-hairline)" }}
                >
                  <p className="text-[10.5px] text-text-tertiary inline-flex items-center gap-1.5">
                    <Sparkles
                      className="w-3 h-3"
                      style={{ color: "var(--accent-gold-bright)" }}
                    />
                    Outils admin visibles uniquement pour les admins
                  </p>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-9 h-9 rounded-full bg-primary text-white border border-primary flex items-center justify-center active:scale-95 transition-transform"
        aria-label={isAdmin ? "Menu admin" : "Menu"}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={isAdmin ? "Menu admin" : "Menu"}
      >
        <Menu className="w-4 h-4" />
      </button>
      {typeof document !== "undefined" && createPortal(drawer, document.body)}
    </>
  );
}
