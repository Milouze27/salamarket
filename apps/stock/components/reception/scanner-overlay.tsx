"use client";

/**
 * ScannerOverlay — overlay full-screen "scanner-first" pour la réception
 * Sodrune (60-120 cartons/jour). Pensé pour rester ouvert pendant tout
 * le déchargement : bip vert / orange / rouge à chaque scan, compteur
 * progression en haut, scroll des derniers bips en bas.
 *
 * Diffère du `BarcodeScanner` legacy (tap-to-snap mono-shot) :
 *   - Auto-loop : décode en continu via BarcodeDetector ou ZXing
 *   - Dé-dupe : ignore le même EAN scanné < 600 ms après
 *   - Reste ouvert tant que l'utilisateur ne ferme pas (cohérent avec
 *     un workflow palette de 24-60 cartons à enchaîner)
 *   - Surface visuelle : bandeau de feedback couleur + 5 derniers bips
 *     en pile pour que le réceptionneur voit l'historique sans
 *     décrocher l'œil de la palette
 *
 * Aucune dépendance npm ajoutée : utilise BarcodeDetector natif (Safari
 * iOS 17+, Chrome Android, Vision Apple sous le capot) et tombe sur
 * ZXing (déjà dans `apps/stock/package.json`) en fallback.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Flashlight,
  PackagePlus,
  ScanBarcode,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

export interface ScanFeedback {
  kind: "ok" | "warn" | "miss";
  code: string;
  /** Texte court affiché sur le bandeau de feedback. */
  label: string;
  /** Sub-label optionnel (ex: "12/24 cartons"). */
  sub?: string;
  ts: number;
}

interface ScannerOverlayProps {
  open: boolean;
  onClose: () => void;
  /** Async pour que la parente puisse résoudre EAN→ligne BDL avant de
   *  donner un feedback visuel. Doit RETOURNER le feedback à afficher. */
  onScan: (code: string) => Promise<ScanFeedback>;
  /** Compteur progression — affiché en haut pour garder le focus terrain. */
  progression: { scanned: number; total: number };
  /** Titre du contexte BDL pour aider à reconnecter l'œil au papier. */
  contextLabel?: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<Array<{ rawValue: string }>>;
}
interface BarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): BarcodeDetectorLike;
}
function getNativeDetector(): BarcodeDetectorCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
}

interface CamCaps {
  focusMode?: string[];
  zoom?: { min: number; max: number; step: number };
  torch?: boolean;
}

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];
const DEDUPE_MS = 600;
const SCAN_INTERVAL_MS = 320;

export function ScannerOverlay({
  open,
  onClose,
  onScan,
  progression,
  contextLabel,
}: ScannerOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastCodeRef = useRef<{ code: string; ts: number } | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const zxingReaderRef = useRef<unknown | null>(null);
  const loopRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const onScanRef = useRef(onScan);

  const [phase, setPhase] = useState<"starting" | "ready" | "error">("starting");
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(2.5);
  const [zoomCaps, setZoomCaps] = useState<{ min: number; max: number } | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [history, setHistory] = useState<ScanFeedback[]>([]);
  const [latestFlash, setLatestFlash] = useState<ScanFeedback | null>(null);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // ─── Lifecycle camera ───────────────────────────────────────────
  useEffect(() => {
    if (open) {
      stoppedRef.current = false;
      setError(null);
      setHistory([]);
      setLatestFlash(null);
      setPhase("starting");
      void startCamera();
    } else {
      void stopAll();
    }
    return () => void stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function stopAll() {
    stoppedRef.current = true;
    if (loopRef.current !== null) {
      window.clearInterval(loopRef.current);
      loopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    trackRef.current = null;
    detectorRef.current = null;
    zxingReaderRef.current = null;
    setHasTorch(false);
    setTorchOn(false);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;

      const caps = (track.getCapabilities ? track.getCapabilities() : {}) as CamCaps;
      const advanced: MediaTrackConstraintSet[] = [];
      if (caps.focusMode?.includes("continuous")) {
        advanced.push({ focusMode: "continuous" } as unknown as MediaTrackConstraintSet);
      }
      if (caps.zoom) {
        const z = Math.min(zoom, caps.zoom.max);
        advanced.push({ zoom: z } as unknown as MediaTrackConstraintSet);
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max });
        setZoom(z);
      }
      if (advanced.length > 0) {
        try {
          await track.applyConstraints({ advanced } as MediaTrackConstraints);
        } catch (e) {
          console.warn("[ScannerOverlay] applyConstraints partial:", e);
        }
      }
      if (caps.torch) setHasTorch(true);

      if (!videoRef.current) throw new Error("video element manquant");
      videoRef.current.srcObject = stream;
      videoRef.current.setAttribute("playsinline", "true");
      videoRef.current.setAttribute("muted", "true");
      videoRef.current.setAttribute("autoplay", "true");
      await videoRef.current.play();

      // Prépare le détecteur (préfère natif Vision Apple)
      const Detector = getNativeDetector();
      if (Detector) {
        detectorRef.current = new Detector({ formats: FORMATS });
      } else {
        try {
          const { BrowserMultiFormatReader } = await import("@zxing/browser");
          zxingReaderRef.current = new BrowserMultiFormatReader();
        } catch (e) {
          console.warn("[ScannerOverlay] ZXing import fail:", e);
        }
      }

      setPhase("ready");
      startLoop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[ScannerOverlay] start error:", e);
      setError(humanError(msg));
      setPhase("error");
      void stopAll();
    }
  }

  function startLoop() {
    if (loopRef.current !== null) return;
    loopRef.current = window.setInterval(() => {
      void tickDecode();
    }, SCAN_INTERVAL_MS);
  }

  async function tickDecode() {
    if (stoppedRef.current) return;
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    let code: string | null = null;

    // 1. Détecteur natif (Vision Apple) — direct depuis le <video>
    if (detectorRef.current) {
      try {
        const codes = await detectorRef.current.detect(video);
        if (codes && codes.length > 0 && codes[0].rawValue) {
          code = String(codes[0].rawValue);
        }
      } catch {
        /* recule sur ZXing en bas */
      }
    }

    // 2. Fallback ZXing — passe par canvas
    if (!code && zxingReaderRef.current) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const blob = await new Promise<Blob | null>((r) =>
            canvas.toBlob(r, "image/jpeg", 0.85)
          );
          if (blob) {
            const url = URL.createObjectURL(blob);
            try {
              const reader = zxingReaderRef.current as {
                decodeFromImageUrl: (u: string) => Promise<{ getText: () => string } | null>;
              };
              const result = await reader.decodeFromImageUrl(url);
              code = result?.getText() ?? null;
            } finally {
              URL.revokeObjectURL(url);
            }
          }
        }
      } catch {
        /* silencieux : prochain tick */
      }
    }

    if (!code) return;

    // Dé-dupe : même code dans la fenêtre de 600 ms = ignore
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last && last.code === code && now - last.ts < DEDUPE_MS) return;
    lastCodeRef.current = { code, ts: now };

    // Vibration courte (40 ms = bip OK / 80 ms = warn / 160 ms = miss
    // ajustés après réponse async parente).
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(40);
    }

    try {
      const fb = await onScanRef.current(code);
      pushFeedback(fb);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        if (fb.kind === "warn") navigator.vibrate?.(80);
        if (fb.kind === "miss") navigator.vibrate?.([60, 40, 60]);
      }
    } catch (e) {
      console.error("[ScannerOverlay] onScan threw:", e);
      pushFeedback({
        kind: "miss",
        code,
        label: "Erreur de traitement",
        sub: e instanceof Error ? e.message : "Réessaie ce carton",
        ts: now,
      });
    }
  }

  function pushFeedback(fb: ScanFeedback) {
    setLatestFlash(fb);
    setHistory((h) => [fb, ...h].slice(0, 5));
    // Le flash disparaît après 1.6 s pour préparer le scan suivant
    window.setTimeout(() => {
      setLatestFlash((cur) => (cur && cur.ts === fb.ts ? null : cur));
    }, 1600);
  }

  // ─── Camera helpers ────────────────────────────────────────────
  async function applyZoom(target: number) {
    const t = trackRef.current;
    if (!t || !zoomCaps) return;
    const z = Math.min(zoomCaps.max, Math.max(zoomCaps.min, target));
    setZoom(z);
    try {
      await t.applyConstraints({
        advanced: [{ zoom: z } as unknown as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
    } catch {
      /* ignore */
    }
  }

  async function toggleTorch() {
    const t = trackRef.current;
    if (!t) return;
    const next = !torchOn;
    try {
      await t.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      } as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      /* ignore */
    }
  }

  const pct = useMemo(() => {
    if (progression.total <= 0) return 0;
    return Math.min(100, (progression.scanned / progression.total) * 100);
  }, [progression.scanned, progression.total]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col">
      {/* HEADER STICKY — progression + close */}
      <div className="safe-top px-4 pt-3 pb-2 bg-gradient-to-b from-black/90 to-black/40 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10.5px] uppercase tracking-[0.14em] font-bold text-gold">
              Scan continu
            </p>
            <p className="text-[14px] font-bold truncate">
              {contextLabel ?? "Réception BDL"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center active:scale-95"
            aria-label="Fermer le scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-2.5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[10.5px] uppercase tracking-wide font-bold text-white/70">
              Progression palette
            </span>
            <span className="text-[14px] font-extrabold tabular">
              {progression.scanned} / {progression.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-white/15 overflow-hidden">
            <motion.div
              className="h-full bg-gold-bright"
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
            />
          </div>
        </div>
      </div>

      {/* VIEWFINDER */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {phase === "starting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
            <div className="animate-spin w-10 h-10 border-2 border-gold border-t-transparent rounded-full mb-3" />
            <p className="text-white text-sm">Démarrage caméra…</p>
          </div>
        )}

        {phase === "error" && error && (
          <div className="absolute inset-x-0 top-1/4 mx-auto max-w-sm px-6 text-center text-white z-10">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-danger/20 flex items-center justify-center mb-3">
              <AlertTriangle className="w-7 h-7 text-danger" />
            </div>
            <p className="font-bold text-lg">Caméra indisponible</p>
            <p className="text-sm text-white/80 mt-2 whitespace-pre-line">{error}</p>
            <button
              onClick={() => void startCamera()}
              className="mt-4 bg-white/15 text-white font-semibold rounded-full px-5 py-2 inline-flex items-center gap-2 text-sm"
            >
              <ScanBarcode className="w-4 h-4" />
              Réessayer
            </button>
          </div>
        )}

        {phase === "ready" && (
          <>
            {/* Viseur */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
              <div className="relative w-[78%] max-w-[340px] aspect-[2/1] border-2 border-gold rounded-2xl">
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-2xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-2xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-2xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-2xl" />
                {/* Bandeau "ligne de scan" légère */}
                <motion.div
                  initial={{ opacity: 0.4 }}
                  animate={{ opacity: [0.3, 0.9, 0.3] }}
                  transition={{ duration: 1.4, repeat: Infinity }}
                  className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-px bg-gold"
                />
              </div>
            </div>

            {/* Bandeau feedback (le bip qui rassure) */}
            <AnimatePresence>
              {latestFlash && (
                <motion.div
                  key={latestFlash.ts}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ type: "spring", damping: 22, stiffness: 320 }}
                  className="absolute top-3 inset-x-0 z-20 px-4 pointer-events-none"
                >
                  <div
                    className={`mx-auto max-w-[420px] rounded-2xl px-4 py-3 shadow-card-lg flex items-center gap-3 ${
                      latestFlash.kind === "ok"
                        ? "bg-success text-white"
                        : latestFlash.kind === "warn"
                          ? "bg-warning text-white"
                          : "bg-danger text-white"
                    }`}
                  >
                    {latestFlash.kind === "ok" ? (
                      <CheckCircle2 className="w-7 h-7 shrink-0" />
                    ) : latestFlash.kind === "warn" ? (
                      <PackagePlus className="w-7 h-7 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-7 h-7 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold text-[15px] leading-tight truncate">
                        {latestFlash.label}
                      </p>
                      {latestFlash.sub && (
                        <p className="text-[12px] opacity-90 truncate mt-0.5">
                          {latestFlash.sub}
                        </p>
                      )}
                    </div>
                    <span className="text-[10px] font-mono opacity-80 tabular shrink-0">
                      {latestFlash.code.slice(-6)}
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pile historique 5 derniers bips */}
            {history.length > 0 && (
              <div className="absolute bottom-28 inset-x-0 z-10 px-4 pointer-events-none">
                <div className="mx-auto max-w-[420px] space-y-1.5">
                  {history.slice(0, 4).map((h, i) => (
                    <div
                      key={`${h.ts}-${i}`}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 backdrop-blur-md bg-black/40 text-white text-[11.5px] font-semibold border ${
                        h.kind === "ok"
                          ? "border-success/60"
                          : h.kind === "warn"
                            ? "border-warning/60"
                            : "border-danger/60"
                      }`}
                      style={{ opacity: 1 - i * 0.18 }}
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          h.kind === "ok"
                            ? "bg-success"
                            : h.kind === "warn"
                              ? "bg-warning"
                              : "bg-danger"
                        }`}
                      />
                      <span className="truncate flex-1">{h.label}</span>
                      <span className="font-mono opacity-70">{h.code.slice(-6)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Contrôles caméra */}
            <div className="absolute bottom-4 inset-x-0 z-10 px-4 pb-safe">
              <div className="mx-auto max-w-[420px] flex items-center justify-center gap-2">
                {zoomCaps && (
                  <>
                    <button
                      onClick={() => void applyZoom(zoom - 1)}
                      className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center active:scale-95"
                      aria-label="Zoom −"
                    >
                      <ZoomOut className="w-5 h-5" />
                    </button>
                    <span className="px-3 py-2 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs font-mono tabular">
                      {zoom.toFixed(1)}×
                    </span>
                    <button
                      onClick={() => void applyZoom(zoom + 1)}
                      className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm text-white flex items-center justify-center active:scale-95"
                      aria-label="Zoom +"
                    >
                      <ZoomIn className="w-5 h-5" />
                    </button>
                  </>
                )}
                {hasTorch && (
                  <button
                    onClick={() => void toggleTorch()}
                    className={`w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center active:scale-95 ${
                      torchOn ? "bg-gold-bright text-primary-dark" : "bg-black/70 text-white"
                    }`}
                    aria-label="Torche"
                  >
                    <Flashlight className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function humanError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("permission") || m.includes("notallowed")) {
    return "Caméra refusée. Réglages iPhone → Salam Stock → Caméra → Autoriser, puis recharge.";
  }
  if (m.includes("notreadable") || m.includes("trackstart")) {
    return "Caméra utilisée par une autre app. Ferme l'app Caméra puis réessaie.";
  }
  if (m.includes("notfound")) {
    return "Caméra introuvable. Vérifie l'app Caméra iOS d'abord.";
  }
  return "Caméra indisponible : " + raw;
}
