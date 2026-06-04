"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Boxes,
  ClipboardList,
  Clock,
  Compass,
  FileSpreadsheet,
  Gauge,
  Home,
  LayoutDashboard,
  LineChart,
  LogOut,
  Menu,
  MonitorPlay,
  Moon,
  PackageSearch,
  Repeat2,
  Rows3,
  Rows4,
  ScanLine,
  Settings,
  ShoppingBag,
  Sparkles,
  Sun,
  Tag,
  Truck,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { useDensity } from "@/lib/hooks/useDensity";
import { filterItemsForRole } from "@/lib/nav-roles";

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
 * ARCH-02 / L99 — répertoire groupé par plan mental, intitulés / ordre / hrefs
 * STRICTEMENT alignés sur le Plus-sheet (V2Shell) et la palette ⌘K
 * (CommandPalette). Modèle mental unifié sur les 3 surfaces :
 *   OPÉRER      — gestes terrain (sortie, réception, transfert, étiq, stock, prépa)
 *   PILOTER     — décider / surveiller (accueil, cockpit, forecast, DLC, comptoir)
 *   ADMINISTRER — back-office (admin hub, fournisseurs, PO, lots, inventaire,
 *                 alertes, activité, fiscal, rapports, import, assistant IA)
 *
 * Le drawer montre le PÉRIMÈTRE ACCESSIBLE DU RÔLE : on applique le MÊME
 * `filterItemsForRole` (source unique `@/lib/nav-roles`) qu'ailleurs, au lieu
 * de masquer les groupes en bloc pour les non-admins. Un manager voit donc son
 * pilotage, un préparateur ses tâches, un caisse/réception leur périmètre.
 * Les groupes vides après filtre sont masqués. « Compte & réglages » reste
 * visible pour tous (déconnexion + toggles y vivent).
 */
const ADMIN_GROUPS: MenuGroup[] = [
  {
    heading: "Opérer",
    entries: [
      {
        href: "/v2/sortie",
        label: "Sortie de stock",
        desc: "Casse, périmé, défaut",
        icon: ArrowUpRight,
      },
      {
        href: "/v2/reception",
        label: "Réception",
        desc: "Scan + photo + valid BDL",
        icon: ArrowDownToLine,
      },
      {
        href: "/v2/transfert",
        label: "Transfert inter-dépôt",
        desc: "Bouger du stock",
        icon: Repeat2,
      },
      {
        href: "/v2/etiquettes",
        label: "Étiquettes EAN-13",
        desc: "Imprimer codes-barres",
        icon: Tag,
      },
      {
        href: "/v2/stock",
        label: "Stock du dépôt",
        desc: "Catalogue produits",
        icon: PackageSearch,
      },
      {
        href: "/v2/stock/sans-ean",
        label: "Produits sans EAN",
        desc: "À étiqueter en interne",
        icon: ScanLine,
      },
      {
        href: "/v2/preparation",
        label: "Préparation drive",
        desc: "Commandes à préparer",
        icon: ShoppingBag,
      },
    ],
  },
  {
    heading: "Piloter",
    entries: [
      {
        href: "/v2",
        label: "Accueil",
        desc: "Vue d'ensemble",
        icon: Home,
      },
      {
        href: "/v2/cockpit",
        label: "Cockpit",
        desc: "Vue 30 sec : ventes, alertes, staff",
        icon: Gauge,
        accent: "primary",
      },
      {
        href: "/v2/forecast",
        label: "Prévisions ruptures",
        desc: "Stockouts prévus (hijri-aware)",
        icon: LineChart,
      },
      {
        href: "/v2/admin/alertes-dlc",
        label: "Alertes DLC",
        desc: "Lots courte date + remises auto",
        icon: Compass,
        accent: "danger",
      },
      {
        href: "/v2/counter",
        label: "Écran comptoir",
        desc: "TV/iPad - commandes prêtes",
        icon: MonitorPlay,
      },
    ],
  },
  {
    heading: "Administrer",
    entries: [
      {
        href: "/v2/admin",
        label: "Dashboard admin",
        desc: "Vue 3 dépôts + alertes IA",
        icon: LayoutDashboard,
        accent: "primary",
      },
      {
        href: "/v2/fournisseurs",
        label: "Fournisseurs",
        desc: "Fiches + certif halal",
        icon: Truck,
      },
      {
        href: "/v2/po",
        label: "Commandes fournisseurs",
        desc: "PO auto-générés + suivi",
        icon: ClipboardList,
      },
      {
        href: "/v2/lots",
        label: "Lots & DLC",
        desc: "Traçabilité lots halal",
        icon: Boxes,
      },
      {
        href: "/v2/inventaire",
        label: "Inventaire tournant",
        desc: "5-10 produits du jour",
        icon: ClipboardList,
      },
      {
        href: "/v2/inventaire/historique",
        label: "Historique inventaires",
        desc: "Comptages passés + écarts",
        icon: Clock,
      },
      {
        href: "/v2/admin/recap-fiscal",
        label: "Récap fiscal du jour",
        desc: "TVA, ventes, ticket Z",
        icon: FileSpreadsheet,
        accent: "gold",
      },
      {
        href: "/v2/admin/rapport-mensuel",
        label: "Rapport mensuel",
        desc: "Synthèse du mois",
        icon: BarChart3,
      },
      {
        href: "/v2/admin/activite",
        label: "Journal d'activité",
        desc: "Flux des mouvements staff",
        icon: Activity,
      },
      {
        href: "/v2/admin/alertes",
        label: "Centre d'alertes",
        desc: "Toutes les alertes stock + IA",
        icon: AlertTriangle,
        accent: "danger",
      },
      {
        href: "/v2/admin/alertes-surplus",
        label: "Alertes surplus",
        desc: "Surstock à écouler",
        icon: Boxes,
      },
      {
        href: "/v2/admin/bons-reception",
        label: "Bons de réception",
        desc: "Archives BDL validés",
        icon: ArrowDownToLine,
      },
      {
        href: "/v2/admin/import-cashmag",
        label: "Import Cashmag",
        desc: "Sync caisse / ventes",
        icon: FileSpreadsheet,
      },
      {
        href: "/v2/admin/assistant-ia",
        label: "Assistant IA",
        desc: "Copilote analyse stock",
        icon: Sparkles,
        accent: "gold",
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

  // P0 nav/rôles — le drawer montre le PÉRIMÈTRE ACCESSIBLE du rôle, pas un
  // masquage en bloc admin-only. On applique le MÊME `filterItemsForRole`
  // (source unique `@/lib/nav-roles`) qu'au Plus-sheet et à ⌘K, puis on retire
  // les groupes devenus vides. Un manager voit son pilotage, un préparateur ses
  // tâches, etc. — au lieu de ne voir que « Compte & réglages ».
  const groups = ADMIN_GROUPS.map((group) => ({
    ...group,
    entries: filterItemsForRole(role, group.entries),
  })).filter((group) => group.entries.length > 0);
  const hasNavGroups = groups.length > 0;

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
                    {isAdmin
                      ? "Outils complets"
                      : hasNavGroups
                        ? "Outils & réglages"
                        : "Compte & réglages"}
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

            {/* LISTE — périmètre du rôle (filterItemsForRole), groupes vides masqués */}
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {groups.map((group) => (
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

            {hasNavGroups && (
              <div
                className="px-5 pb-[calc(var(--safe-bottom)+12px)] pt-3"
                style={{ borderTop: "1px solid var(--border-hairline)" }}
              >
                <p className="text-[10.5px] text-text-tertiary inline-flex items-center gap-1.5">
                  <Sparkles
                    className="w-3 h-3"
                    style={{ color: "var(--accent-gold-bright)" }}
                  />
                  {isAdmin
                    ? "Outils admin visibles uniquement pour les admins"
                    : "Menu adapté à votre rôle"}
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
