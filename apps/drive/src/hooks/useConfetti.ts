import { useCallback } from "react";

import { BRAND } from "@/config/brand";

// Respecte le réglage iOS/macOS "Réduire les animations". Lu à chaud à
// chaque appel (pas mis en cache) pour suivre un changement de préférence
// en cours de session — même pattern que useFlyingChip / useHaptic.
function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Palette sapin + or de la marque (jamais de hex en dur ici : on lit BRAND).
// Quelques nuances proches pour donner du relief sans sortir de la charte.
const CONFETTI_COLORS = [
  BRAND.colors.accent, // or principal
  BRAND.colors.accentBright,
  BRAND.colors.primary, // vert sapin
  BRAND.colors.accentSoft,
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

// Une seule salve, brève (~1,2 s), sobre : ~70 confettis qui retombent en
// douceur depuis le haut. Canvas créé en position fixed plein écran,
// pointer-events:none, retiré garanti (RAF + filet setTimeout +
// visibilitychange→hidden, comme useFlyingChip) pour ne jamais laisser un
// canvas orphelin par-dessus l'UI si l'onglet passe en arrière-plan.
const DURATION_MS = 1200;
const COUNT = 70;

export function useConfetti() {
  const fire = useCallback(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    // "Réduire les animations" : no-op strict.
    if (prefersReducedMotion()) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;

    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "60";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    document.body.appendChild(canvas);

    // Émission depuis le tiers supérieur, dispersion horizontale large.
    const particles: Particle[] = Array.from({ length: COUNT }, () => ({
      x: w * (0.15 + Math.random() * 0.7),
      y: -20 - Math.random() * h * 0.2,
      vx: (Math.random() - 0.5) * 2.2,
      vy: 2 + Math.random() * 3,
      size: 5 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0],
    }));

    const start = performance.now();
    let raf = 0;
    let cleaned = false;

    const onHide = () => {
      if (document.visibilityState === "hidden") cleanup();
    };

    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      document.removeEventListener("visibilitychange", onHide);
      canvas.remove();
    }

    const frame = (now: number) => {
      const elapsed = now - start;
      const progress = elapsed / DURATION_MS;
      if (progress >= 1) {
        cleanup();
        return;
      }
      // Fondu de sortie sur le dernier tiers pour une fin douce.
      const fade = progress > 0.66 ? 1 - (progress - 0.66) / 0.34 : 1;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravité légère
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    // Filet de sécurité : si RAF est gelé (onglet en arrière-plan), on
    // garantit la suppression du canvas peu après la durée nominale.
    // `cleanup` (déclaration de fonction, hoistée) ne s'exécute qu'après cette
    // ligne (RAF / timeout / visibilitychange), donc lire `safety` y est sûr.
    const safety = window.setTimeout(cleanup, DURATION_MS + 300);
    document.addEventListener("visibilitychange", onHide);
  }, []);

  return { fire };
}
