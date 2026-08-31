"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * Bouton "Retour" canonique pour toutes les pages V2.
 *
 * Comportement de navigation :
 *  - Toujours `router.back()` quand il y a un historique → respecte
 *    l'attente "le bouton retour revient à la page précédente".
 *  - `href` n'est PAS un push direct, c'est un FALLBACK pour les
 *    deep-links (utilisateur qui arrive directement sur la page sans
 *    historique, ex : Share Sheet iOS qui ouvre une URL fraîche). Sans
 *    historique, on push vers href ; sinon on ignore href.
 *  - Cette logique évite l'effet "retour-retour fait des allers-retours"
 *    quand on utilise router.push à la place de back (qui empile au lieu
 *    de dépiler l'historique).
 *
 * Spec visuelle (tokens MYTHOS, dark par défaut) :
 *  - Pill 40px de haut → min tap-target 44pt PRODUCT.md avec touch-zone.
 *  - surface-1 + border-card + shadow-card → élévation Linear (inset highlight
 *    top en dark), visible sur tout background sans dépendre du filet bg-white.
 *  - Le disque interne monte d'un cran (surface-2) pour matérialiser la touche.
 *  - active:scale-[0.97] feedback tactile <100ms.
 */
export function BackButton({
  href,
  label = "Retour",
  className = "",
}: {
  href?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  function handleClick() {
    // Si on a un historique (au moins l'entrée actuelle + une autre),
    // on dépile. Sinon (deep-link entry directe), on push vers href ou
    // vers le hub par défaut.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(href ?? "/v2");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      /* DESKTOP 31/08/2026 — masqué à partir de 1024 px : la barre latérale
         est visible en permanence et surligne la page courante, un « Retour »
         en haut de contenu y est un vestige du téléphone (25 pages). */
      className={`inline-flex lg:hidden items-center gap-1.5 h-10 pl-2.5 pr-4 rounded-full border text-[13px] font-bold active:scale-[0.97] transition-transform ${className}`}
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-card)",
        boxShadow: "var(--shadow-card)",
        color: "var(--text-primary)",
      }}
    >
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full"
        style={{ background: "var(--surface-2)" }}
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.4} />
      </span>
      {label}
    </button>
  );
}
