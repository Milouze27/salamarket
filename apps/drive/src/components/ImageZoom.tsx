import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useState } from "react";
import { X, ZoomIn } from "lucide-react";
import { cdnImage } from "@/lib/imageUrl";

// ─────────────────────────────────────────────────────────────────
// ImageZoom — lightbox plein écran pour la photo produit (PDP).
//
// Un bouton loupe FONCTIONNEL posé en coin du hero (autorisé : action, pas
// ornement) ouvre un overlay plein écran via Radix Dialog. Radix fournit
// nativement : focus-trap, fermeture Escape, scroll-lock du body
// (react-remove-scroll) et le rôle dialog modal accessible. On ajoute le
// pinch-to-zoom natif (touch-action) + pan par scroll, la fermeture au tap
// sur le fond, et le respect des safe-areas (mémoire overlays).
//
// IMPORTANT : composant SÉPARÉ. Il n'enveloppe pas l'<img> du hero et ne
// touche pas son view-transition-name → le morph PDP (View Transitions API)
// reste intact. Le lightbox affiche sa propre image en pleine résolution.
// ─────────────────────────────────────────────────────────────────

interface Props {
  /** URL source (déjà résolue côté PDP, peut être un placeholder). */
  src: string;
  alt: string;
  /** Classe du bouton déclencheur (positionnement sur le hero). */
  className?: string;
}

export const ImageZoom = ({ src, alt, className }: Props) => {
  const [open, setOpen] = useState(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Agrandir la photo de ${alt}`}
          className={[
            "inline-flex h-11 w-11 items-center justify-center rounded-full",
            "bg-white/90 backdrop-blur text-sapin shadow-md ring-1 ring-black/5",
            "active:scale-90 transition-transform hover:bg-white",
            className ?? "",
          ].join(" ")}
        >
          <ZoomIn size={18} strokeWidth={2.2} aria-hidden />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-ink/90 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none" />
        <DialogPrimitive.Content
          // Plein écran. Le titre est requis pour l'accessibilité du
          // dialog Radix (sr-only). Le contenu scrolle/zoome ; le tap sur
          // le fond (le Content lui-même, hors image) ferme.
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-auto overscroll-contain focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          onClick={(e) => {
            // Fermeture au tap sur le fond uniquement (pas sur l'image).
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {alt}
          </DialogPrimitive.Title>
          {/* Requis par Radix (sinon warning "Missing Description or
              aria-describedby for DialogContent"). sr-only : invisible mais
              annoncé aux lecteurs d'écran. */}
          <DialogPrimitive.Description className="sr-only">
            Photo agrandie. Pincez pour zoomer, touchez le fond pour fermer.
          </DialogPrimitive.Description>

          <img
            src={cdnImage(src, { width: 1600 })}
            alt={alt}
            decoding="async"
            // touch-action pinch-zoom : laisse iOS/Android gérer le zoom
            // natif à deux doigts. max dimensions = on garde l'image dans
            // le viewport tout en autorisant le pan au scroll une fois zoomée.
            className="max-h-[92vh] max-w-[92vw] select-none rounded-2xl object-contain shadow-2xl [touch-action:pinch-zoom]"
            style={{
              marginTop: "max(env(safe-area-inset-top), 16px)",
              marginBottom: "max(env(safe-area-inset-bottom), 16px)",
            }}
            draggable={false}
          />

          <DialogPrimitive.Close
            aria-label="Fermer"
            className="fixed right-4 z-[71] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink shadow-lg ring-1 ring-black/5 active:scale-90 transition-transform hover:bg-white"
            style={{ top: "max(env(safe-area-inset-top), 16px)" }}
          >
            <X size={20} strokeWidth={2.2} aria-hidden />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

export default ImageZoom;
