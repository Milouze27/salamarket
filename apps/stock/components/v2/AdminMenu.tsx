"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  LogOut,
  Moon,
  Rows3,
  Rows4,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { useDensity } from "@/lib/hooks/useDensity";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { roleLabel } from "@/lib/role-label";
import type { EmployeRole } from "@/lib/types/db";

/** Rôles terrain prévisualisables (« Voir en tant que »). */
const PREVIEW_ROLES: EmployeRole[] = ["caisse", "reception", "preparation"];

interface AdminMenuProps {
  /** Le rôle de l'employé (affiché en sous-titre). */
  role: string | undefined;
  /** Prénom de l'employé connecté — repris du header pour cohérence. */
  name?: string;
  /** Déconnexion — migrée du header (ARCH-11). */
  onLogout?: () => void;
  /** L'employé réel peut-il prévisualiser un rôle (admin/manager) ? */
  canPreview?: boolean;
  /** Rôle de prévisualisation actif (null = vue réelle). */
  previewRole?: EmployeRole | null;
  /** Change le rôle de prévisualisation (null = revenir à la vue réelle). */
  onPreviewRole?: (r: EmployeRole | null) => void;
}

/**
 * AdminMenu — sheet « Compte & réglages ».
 *
 * AUDIT NAV (L99, 2026-06-06) : ce drawer dupliquait intégralement le
 * Plus-sheet (mêmes groupes Opérer/Piloter/Administrer, mêmes hrefs) et la
 * grille d'accueil. La navigation passe désormais UNIQUEMENT par la bottom-bar
 * + le Plus-sheet (V2Shell) + ⌘K. Ce composant ne garde que ce qui lui était
 * propre : le thème jour/nuit, la densité d'affichage et la déconnexion.
 */
export function AdminMenu({
  role,
  name,
  onLogout,
  canPreview = false,
  previewRole = null,
  onPreviewRole,
}: AdminMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolved, toggle: toggleTheme } = useTheme();
  const { density, toggle: toggleDensity } = useDensity();
  const isNight = resolved === "nuit";
  const isCompact = density === "compact";

  // Scroll-lock iOS pendant que le drawer est ouvert (anti scroll-leak :
  // le body défilait sous l'overlay sur iPhone/PWA).
  useBodyScrollLock(open);

  // Ferme avec Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Portalé sur <body> pour échapper au stacking-context du parent relative.
  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="account-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[200]"
            style={{
              background: "var(--glass-overlay)",
              backdropFilter: "var(--glass-overlay-blur)",
              WebkitBackdropFilter: "var(--glass-overlay-blur)",
            }}
          />
          <motion.aside
            key="account-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 38, stiffness: 360, mass: 0.9 }}
            role="dialog"
            aria-modal="true"
            aria-label="Compte et réglages"
            className="lg fixed inset-y-0 right-0 z-[201] w-[86%] max-w-[340px] flex flex-col"
            style={{
              borderRadius: "28px 0 0 28px",
              borderLeft: "1px solid var(--border-card)",
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
                    {role ? roleLabel(role) : "Compte"}
                  </p>
                  <p className="text-sm font-bold text-text-primary leading-tight">
                    {name ?? "Réglages"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="tap w-9 h-9 rounded-full flex items-center justify-center text-text-secondary"
                style={{ background: "var(--surface-1)" }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* VOIR EN TANT QUE — admin/manager : prévisualise l'interface
                d'un rôle terrain pour repérer ses bugs, sans perdre ses droits. */}
            <nav className="flex-1 overflow-y-auto px-3 py-3">
              {canPreview && onPreviewRole && (
                <div className="mb-2">
                  <p
                    className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--accent-gold-dim)" }}
                  >
                    Voir en tant que
                  </p>
                  <p className="px-3 pb-2 text-[11px] text-text-secondary leading-snug">
                    Affiche l'app comme la voit un rôle terrain (tes droits réels
                    restent inchangés).
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {([null, ...PREVIEW_ROLES] as (EmployeRole | null)[]).map(
                      (r) => {
                        const active = previewRole === r;
                        const label =
                          r === null ? `${roleLabel(role)} (réel)` : roleLabel(r);
                        return (
                          <button
                            key={r ?? "real"}
                            type="button"
                            onClick={() => {
                              onPreviewRole(r);
                              setOpen(false);
                            }}
                            aria-pressed={active}
                            className="tap inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[12.5px] font-bold transition-colors"
                            style={
                              active
                                ? {
                                    background: "var(--accent-gold)",
                                    color: "var(--primary-green-dark)",
                                  }
                                : {
                                    background: "var(--surface-1)",
                                    color: "var(--text-secondary)",
                                  }
                            }
                          >
                            {r !== null && <Eye className="w-3.5 h-3.5" />}
                            {label}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              )}

              {(role === "admin" || role === "manager") && (
                <>
                  <p
                    className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                    style={{ color: "var(--accent-gold-dim)" }}
                  >
                    Administration
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push("/v2/admin/equipe");
                    }}
                    className="tap w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
                  >
                    <span
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: "var(--surface-1)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <Users className="w-5 h-5" strokeWidth={2.1} />
                    </span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-sm font-bold text-text-primary truncate">
                        Gestion de l'équipe
                      </p>
                      <p className="text-[11px] text-text-secondary truncate">
                        Employés, rôles et codes PIN
                      </p>
                    </div>
                  </button>
                </>
              )}

              <p
                className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--accent-gold-dim)" }}
              >
                Réglages
              </p>

              <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={isNight}
                className="tap w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
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
                className="tap w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors active:opacity-80"
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
                  className="tap w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-2xl transition-colors active:opacity-80"
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
            </nav>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-11 h-11 rounded-full bg-primary text-white border border-primary flex items-center justify-center active:scale-95 transition-transform"
        aria-label="Compte et réglages"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Compte & réglages"
      >
        <Settings className="w-4 h-4" />
      </button>
      {typeof document !== "undefined" && createPortal(drawer, document.body)}
    </>
  );
}
