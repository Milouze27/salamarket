import { BadgeCheck, Lock, Truck } from "lucide-react";

/**
 * TrustBar — bar de réassurance discrète à insérer dans les pages
 * conversion-sensibles (Cart, Slots, Checkout). 3 chips compacts :
 * halal certifié, retrait gratuit, paiement sécurisé. Pas sticky (pour
 * pas concurrencer le CTA bottom existant), inline dans le flow.
 *
 * Rationale CRO : sur le checkout, l'absence de signaux de confiance
 * (sceau halal, badge sécurité) augmente le drop-off — surtout pour les
 * nouveaux clients drive halal qui ne nous connaissent pas. Mieux ici
 * qu'un bandeau intrusif full-width.
 */
export const TrustBar = () => {
  return (
    <ul
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 py-3 px-4 rounded-2xl bg-white/60 border border-[#0E3B2E]/10 text-[12px] text-[#0E3B2E]"
      aria-label="Garanties Salamarket"
    >
      <li className="inline-flex items-center gap-1.5 font-semibold">
        <BadgeCheck size={13} className="text-[#C9A227]" aria-hidden />
        Halal certifié
      </li>
      <span aria-hidden className="w-px h-3.5 bg-[#0E3B2E]/15" />
      <li className="inline-flex items-center gap-1.5 font-semibold">
        <Truck size={13} className="text-[#C9A227]" aria-hidden />
        Retrait gratuit
      </li>
      <span aria-hidden className="w-px h-3.5 bg-[#0E3B2E]/15" />
      <li className="inline-flex items-center gap-1.5 font-semibold">
        <Lock size={13} className="text-[#C9A227]" aria-hidden />
        Paiement sécurisé
      </li>
    </ul>
  );
};

export default TrustBar;
