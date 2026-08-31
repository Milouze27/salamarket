"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Delete, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { listEmployes, loginByPin } from "@/lib/db";
import { useV2 } from "@/lib/v2-store";
import type { Employe } from "@/lib/types/db";
import { V2Logo } from "@/components/v2/V2Logo";
import { roleLabel } from "@/lib/role-label";


function haptic(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate(pattern);
    } catch {
      /* certains navigateurs bloquent vibrate hors interaction */
    }
  }
}

export default function V2LoginPage() {
  const router = useRouter();
  const hydrated = useV2((s) => s.hydrated);
  const employe = useV2((s) => s.currentEmploye);
  const setEmploye = useV2((s) => s.setCurrentEmploye);
  const setDepot = useV2((s) => s.setCurrentDepot);
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [employes, setEmployesList] = useState<Employe[]>([]);
  const [shake, setShake] = useState(false);
  const [errored, setErrored] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const submittedRef = useRef<string | null>(null);

  // Anti brute-force côté client : après MAX_ESSAIS PIN faux, on verrouille
  // le keypad LOCKOUT_MS. Le PIN n'a que 4 chiffres (10 000 combinaisons) :
  // sans frein, un essai toutes les ~400ms les épuise en <1h. Le lockout
  // casse cette cadence (le rate-limit serveur reste la barrière dure ;
  // ici c'est la défense UX visible + premier rempart). Compteur en mémoire
  // de page : suffisant contre un essai manuel au comptoir.
  const MAX_ESSAIS = 5;
  const LOCKOUT_MS = 30_000;
  const [echecs, setEchecs] = useState(0);
  const [lockUntil, setLockUntil] = useState(0);
  const [lockRemaining, setLockRemaining] = useState(0);
  const locked = lockRemaining > 0;

  // Tick du compte à rebours de lockout (affiche les secondes restantes).
  useEffect(() => {
    if (lockUntil === 0) return;
    const tick = () => {
      const rem = Math.max(0, Math.ceil((lockUntil - Date.now()) / 1000));
      setLockRemaining(rem);
      if (rem === 0) {
        setLockUntil(0);
        setEchecs(0);
        setErrorMsg(null);
        setErrored(false);
      }
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [lockUntil]);

  useEffect(() => {
    void listEmployes().then(setEmployesList);
  }, []);

  useEffect(() => {
    if (hydrated && employe) router.replace("/v2");
  }, [hydrated, employe, router]);

  const press = useCallback(
    (d: string) => {
      if (pin.length >= 4 || loading || locked) return;
      // Première frappe après une erreur : on efface le message d'alerte.
      setErrorMsg(null);
      setErrored(false);
      haptic(10);
      setPin((p) => (p.length >= 4 ? p : p + d));
    },
    [pin.length, loading, locked],
  );

  const back = useCallback(() => {
    if (loading || locked) return;
    setPin((p) => {
      if (p.length === 0) return p;
      haptic(8);
      return p.slice(0, -1);
    });
  }, [loading, locked]);

  // Saisie clavier physique (démo desktop / bornes avec pavé).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key >= "0" && e.key <= "9") press(e.key);
      else if (e.key === "Backspace") back();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, back]);

  useEffect(() => {
    if (pin.length === 4 && !loading && submittedRef.current !== pin) {
      submittedRef.current = pin;
      setLoading(true);
      void (async () => {
        try {
          const e = await loginByPin(pin);
          if (!e) {
            const n = echecs + 1;
            setEchecs(n);
            const restants = MAX_ESSAIS - n;
            if (restants <= 0) {
              // Lockout : on verrouille le keypad LOCKOUT_MS.
              setLockUntil(Date.now() + LOCKOUT_MS);
              setErrorMsg(
                `Trop d'essais. Saisie bloquée ${Math.round(LOCKOUT_MS / 1000)} s — appelle le manager.`,
              );
            } else {
              setErrorMsg(
                `Code PIN incorrect — ${restants} essai${restants > 1 ? "s" : ""} restant${restants > 1 ? "s" : ""}.`,
              );
            }
            setShake(true);
            setErrored(true);
            haptic([12, 60, 12]);
            setTimeout(() => {
              setPin("");
              setShake(false);
              submittedRef.current = null;
            }, 420);
          } else {
            setEmploye(e);
            if (e.depot_principal_id) {
              const { listDepots } = await import("@/lib/db");
              const depots = await listDepots();
              const d = depots.find((x) => x.id === e.depot_principal_id);
              if (d) setDepot(d);
            }
            toast.success(`Bonjour ${e.prenom ?? e.nom}`, {
              id: `welcome-${e.id}`,
            });
            router.replace("/v2");
          }
        } catch (err) {
          console.error(err);
          toast.error(
            "Connexion impossible. Vérifie le Wi-Fi boutique et réessaie.",
            { id: "pin-network-error" },
          );
          setPin("");
          submittedRef.current = null;
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [pin, loading, echecs, setEmploye, setDepot, router]);

  // Démo PINs visible uniquement quand le flag est explicitement "true".
  // En prod (sans le flag), on cache pour pas exposer les codes des employés
  // à n'importe qui qui ouvre /v2/login. En preview / dev, on garde affiché
  // pour faciliter les démos clients sans avoir à mémoriser un PIN.
  const showDemoPins = process.env.NEXT_PUBLIC_SHOW_DEMO_PINS === "true";

  return (
    <div
      className="min-h-screen flex flex-col lg:flex-row relative overflow-hidden"
      style={{ background: "var(--bg-abyss)" }}
    >
      {/* Profondeur : double radial sapin derrière, jamais plat. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% -8%, rgba(27,106,74,0.30), transparent 62%), radial-gradient(90% 50% at 50% 108%, rgba(14,42,32,0.55), transparent 70%)",
        }}
      />

      {/* ── VOLET DE MARQUE (≥lg) ──────────────────────────────────────
        Mesuré le 31/08/2026 : la page de code occupait 440 px au milieu de
        1920, soit 19 % de l'écran, le reste noir. Sur ordinateur, la moitié
        gauche porte l'identité et le pavé prend la moitié droite. Sous
        1024 px, ce volet n'existe pas : le téléphone garde sa colonne. */}
      <aside
        className="hidden lg:flex lg:flex-col lg:justify-between shrink-0 relative px-14 py-12"
        style={{
          width: "42%",
          maxWidth: 720,
          borderRight: "1px solid var(--border-medium)",
        }}
      >
        <div className="relative flex items-center gap-4">
          <span className="relative inline-flex">
            <span
              aria-hidden
              className="absolute inset-0 rounded-[16px] blur-md"
              style={{
                background: "var(--accent-gold-bright)",
                opacity: 0.28,
                transform: "scale(1.25)",
              }}
            />
            <V2Logo size={52} variant="dark" className="relative" />
          </span>
          <div>
            <p
              className="text-[13px] font-bold"
              style={{ color: "var(--accent-gold-dim)" }}
            >
              Salam Stock
            </p>
            <p
              className="text-[14px] font-medium mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              Multi-dépôts · Toulouse
            </p>
          </div>
        </div>

        <div className="relative max-w-[26ch]">
          <p
            className="text-[40px] font-bold leading-[1.08] tracking-[-0.02em]"
            style={{ color: "var(--text-primary)" }}
          >
            Réception, sorties,
            <br />
            transferts et{" "}
            <span style={{ color: "var(--accent-gold-bright)" }}>
              inventaire
            </span>
            .
          </p>
          <p
            className="text-[15px] mt-4 leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            Les trois dépôts au même endroit. Chaque mouvement de marchandise
            est daté, compté et signé.
          </p>
        </div>

        <p
          className="relative text-[12.5px]"
          style={{ color: "var(--text-tertiary)" }}
        >
          8 av. Larrieu-Thibaud, Toulouse · Particulier · Professionnel ·
          Sodrune
        </p>
      </aside>

      <div className="mx-auto w-full max-w-[440px] flex-1 flex flex-col relative lg:justify-center lg:max-w-[520px]">
        <header className="safe-top-hero pb-8 px-7 relative lg:pt-0 lg:pb-10 lg:text-center">
          {/* Logo + halo or — déplacé dans le volet de marque sur ordinateur */}
          <div className="flex lg:hidden items-center gap-3.5 mb-9 relative">
            <span className="relative inline-flex">
              <span
                aria-hidden
                className="absolute inset-0 rounded-[14px] blur-md"
                style={{
                  background: "var(--accent-gold-bright)",
                  opacity: 0.32,
                  transform: "scale(1.25)",
                }}
              />
              <V2Logo size={44} variant="dark" className="relative" />
            </span>
            <div>
              <p
                className="text-[11px] font-bold uppercase tracking-[0.22em]"
                style={{ color: "var(--accent-gold-dim)" }}
              >
                Salam Stock
              </p>
              <p
                className="text-[13.5px] font-medium mt-0.5"
                style={{ color: "var(--text-secondary)" }}
              >
                Multi-dépôts · Toulouse
              </p>
            </div>
          </div>

          <h1
            className="text-[32px] font-bold leading-[1.05] tracking-[-0.02em]"
            style={{ color: "var(--text-primary)" }}
          >
            Code PIN
          </h1>
          <p
            className="text-[14.5px] mt-2"
            style={{ color: "var(--text-tertiary)" }}
          >
            Saisis les 4 chiffres de ta carte employé pour ouvrir ta session.
          </p>
        </header>

        <div className="flex-1 lg:flex-none px-6 pt-2 flex flex-col">
          {/* Dots PIN */}
          <motion.div
            animate={shake ? { x: [-9, 9, -7, 7, -3, 3, 0] } : { x: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
            role="group"
            aria-label={`Code PIN, ${pin.length} chiffre${pin.length > 1 ? "s" : ""} sur 4`}
            className="flex justify-center gap-4 mb-10"
          >
            {[0, 1, 2, 3].map((i) => {
              const filled = pin.length > i;
              const danger = errored;
              return (
                <motion.div
                  key={i}
                  animate={{ scale: filled ? [1, 1.16, 1] : 1 }}
                  transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  className="w-[15px] h-[15px] rounded-full"
                  style={{
                    background: filled
                      ? danger
                        ? "var(--danger)"
                        : "var(--accent-gold-bright)"
                      : "transparent",
                    boxShadow: filled
                      ? danger
                        ? "0 0 12px rgba(255,112,98,0.45)"
                        : "var(--accent-gold-glow)"
                      : "inset 0 0 0 1.5px var(--border-card)",
                    transition:
                      "background 180ms var(--ease-out-quart), box-shadow 220ms var(--ease-out-quart)",
                  }}
                />
              );
            })}
          </motion.div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-3.5 max-w-[300px] lg:max-w-[348px] lg:gap-4 mx-auto w-full">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
              <KeyButton
                key={d}
                onPress={() => press(String(d))}
                disabled={loading || locked || pin.length >= 4}
                label={`Chiffre ${d}`}
              >
                {d}
              </KeyButton>
            ))}
            <div />
            <KeyButton
              onPress={() => press("0")}
              disabled={loading || locked || pin.length >= 4}
              label="Chiffre 0"
            >
              0
            </KeyButton>
            <button
              type="button"
              onClick={back}
              disabled={pin.length === 0 || loading || locked}
              className="aspect-square rounded-[20px] flex items-center justify-center active:scale-[0.94] transition-transform duration-150 ease-out disabled:opacity-30"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-hairline)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                color: "var(--text-secondary)",
              }}
              aria-label="Effacer"
            >
              <Delete className="w-[22px] h-[22px]" strokeWidth={2} />
            </button>
          </div>

          <div className="min-h-9 mt-6 flex items-center justify-center px-4 text-center">
            <AnimatePresence mode="popLayout">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  role="status"
                  className="flex items-center gap-2 text-[13.5px] font-semibold"
                  style={{ color: "var(--text-gold)" }}
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full animate-spin"
                    style={{
                      border: "2px solid rgba(242,212,105,0.25)",
                      borderTopColor: "var(--accent-gold-bright)",
                    }}
                  />
                  Authentification…
                </motion.div>
              ) : errorMsg ? (
                // Erreur PIN : message en couleur d'alerte (danger), persistant
                // jusqu'à la frappe suivante. aria-live assertif pour les lecteurs
                // d'écran (avant : seul un toast crème transitoire, illisible).
                <motion.p
                  key="error"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  role="alert"
                  aria-live="assertive"
                  className="text-[13.5px] font-bold"
                  style={{ color: "var(--danger)" }}
                >
                  {locked && lockRemaining > 0
                    ? `Saisie bloquée — réessaie dans ${lockRemaining} s.`
                    : errorMsg}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>

          {showDemoPins && employes.length > 0 && (
            <div className="lg rise-in mt-6 mb-7 mx-auto w-full max-w-[300px] px-4 py-3.5">
              <p
                className="text-[10.5px] font-bold uppercase tracking-[0.18em] mb-2.5 inline-flex items-center gap-1.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Fingerprint className="w-3 h-3" />
                Comptes démo
              </p>
              <ul className="space-y-2">
                {employes.map((e, i) => (
                  <li
                    key={e.id}
                    className="rise-in flex items-center justify-between gap-3 text-[13px]"
                    style={{ ["--i" as string]: i + 1 }}
                  >
                    <span className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="font-bold tabular-nums tracking-wide"
                        style={{ color: "var(--text-gold)" }}
                      >
                        {e.pin_code}
                      </span>
                      <span
                        className="truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {e.prenom} {e.nom}
                      </span>
                    </span>
                    <span
                      className="text-[10.5px] font-semibold uppercase tracking-wide shrink-0"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {roleLabel(e.role)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * KeyButton — touche du keypad premium.
 * Surface sapin avec inset highlight top ; au tap, flash sapin + glow léger.
 */
function KeyButton({
  children,
  onPress,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  label: string;
}) {
  const [flash, setFlash] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        setFlash(true);
        setTimeout(() => setFlash(false), 200);
        onPress();
      }}
      disabled={disabled}
      aria-label={label}
      className="relative aspect-square rounded-[20px] flex items-center justify-center select-none active:scale-[0.94] transition-transform duration-150 ease-out disabled:opacity-35 disabled:active:scale-100"
      style={{
        background: flash ? "var(--primary-green-soft)" : "var(--surface-1)",
        border: `1px solid ${flash ? "var(--primary-green-hover)" : "var(--border-hairline)"}`,
        boxShadow: flash
          ? "0 0 0 3px var(--primary-green-soft), inset 0 1px 0 rgba(255,255,255,0.05)"
          : "var(--shadow-card)",
        color: "var(--text-primary)",
        fontSize: 27,
        fontWeight: 600,
        fontVariantNumeric: "tabular-nums",
        transition:
          "transform 150ms var(--ease-out-quart), background 200ms var(--ease-out-quart), box-shadow 200ms var(--ease-out-quart), border-color 200ms var(--ease-out-quart)",
      }}
    >
      {children}
    </button>
  );
}
