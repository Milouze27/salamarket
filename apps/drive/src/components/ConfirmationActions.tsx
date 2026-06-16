import { useState } from "react";
import { toast } from "sonner";

import { BRAND } from "@/config/brand";
import { useHaptic } from "@/hooks/useHaptic";

// Partage / nouvelle commande en un geste, sur la page de confirmation.
// « Refaire mes courses » (retour accueil, via callback fourni par la page
// qui garde la main sur le vidage panier/créneau) et « Partager … »
// (navigator.share, repli sur copie du lien). Actions purement client,
// aucune donnée serveur. Tap targets 44px, dégrade proprement.

interface ConfirmationActionsProps {
  /** Appelé pour relancer des courses — la page gère le clear + navigation. */
  onRefaire: () => void;
}

export function ConfirmationActions({ onRefaire }: ConfirmationActionsProps) {
  const haptic = useHaptic();
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleShare = async () => {
    haptic();
    const shareData = {
      title: BRAND.name,
      text: `${BRAND.name} — ${BRAND.tagline}`,
      url: shareUrl,
    };

    // navigator.share : iOS/Android natif. Absent (desktop, navigateurs
    // anciens) → repli sur la copie du lien dans le presse-papier.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(shareData);
      } catch {
        // L'utilisateur a annulé la feuille de partage : on ne fait rien.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("Lien copié");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Impossible de copier le lien");
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => {
          haptic();
          onRefaire();
        }}
        className="flex-1 min-h-[44px] h-12 rounded-full bg-sapin text-[15px] font-semibold text-white shadow-md shadow-sapin/20 hover:bg-sapin-deep hover:shadow-lg active:scale-[0.98] transition-all"
      >
        Refaire mes courses
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="flex-1 min-h-[44px] h-12 rounded-full border border-sapin/25 bg-white text-[15px] font-semibold text-sapin hover:border-sapin/40 active:scale-[0.98] transition-all"
      >
        {copied ? "Lien copié" : `Partager ${BRAND.name}`}
      </button>
    </div>
  );
}
