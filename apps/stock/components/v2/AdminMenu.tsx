"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { LogOut, Moon, Rows3, Rows4, Settings, Sun, X } from "lucide-react";
import { useTheme } from "@/lib/hooks/useTheme";
import { useDensity } from "@/lib/hooks/useDensity";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

interface AdminMenuProps {
  /** Le rôle de l'employé (affiché en sous-titre). */
  role: string | undefined;
  /** Prénom de l'employé connecté — repris du header pour cohérence. */
  name?: string;
  /** Déconnexion — migrée du header (ARCH-11). */
  onLogout?: () => void;
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
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrateur",
  manager: "Manager",
  preparation: "Préparation",
  reception: "Réception",
  caisse: "Caisse",
};

export function AdminMenu({ role, name, onLogout }: AdminMenuProps) {
  const [open, setOpen] = useState(false);
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
            key="account-drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            role="dialog"
            aria-modal="true"
            aria-label="Compte et réglages"
            className="fixed inset-y-0 right-0 z-[201] w-[86%] max-w-[340px] flex flex-col"
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
                    {role ? (ROLE_LABEL[role] ?? role) : "Compte"}
                  </p>
                  <p className="text-sm font-bold text-text-primary leading-tight">
                    {name ?? "Réglages"}
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

            {/* RÉGLAGES */}
            <nav className="flex-1 overflow-y-auto px-3 py-3">
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
                  className="w-full flex items-center gap-3 px-3 py-2.5 mt-1 rounded-2xl transition-colors active:opacity-80"
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
