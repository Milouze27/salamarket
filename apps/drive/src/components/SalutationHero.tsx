import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { greetingForHour } from "@/lib/greeting";

// ─────────────────────────────────────────────────────────────────
// SalutationHero — salutation contextuelle en tête de vitrine.
//
// « Bonjour » / « Bon après-midi » / « Bonsoir » dérivé de l'heure
// locale (logique date pure, côté client), suivi du prénom si le
// client est connecté. Additif au-dessus d'EditorialIntro : grande
// typographie sapin, hiérarchie par la taille/graisse (pas d'eyebrow,
// pas de picto décoratif). Bornée à max-w-7xl pour s'aligner sur le
// hero qui suit.
// ─────────────────────────────────────────────────────────────────

// Premier mot du nom complet, capitalisé proprement. Renvoie null si on
// n'a pas de nom exploitable (on affiche alors la salutation seule).
const firstName = (fullName: string | null | undefined): string | null => {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
};

export const SalutationHero = () => {
  const { profile, user } = useAuth();

  // Recalcule à chaque rendu de la home (mount) — suffisant pour un
  // affichage éditorial : pas de timer, on ne veut pas re-render au tic.
  const salutation = useMemo(() => greetingForHour(new Date().getHours()), []);

  // Prénom : profil chargé en priorité, sinon les métadonnées d'auth
  // (full_name posé à l'inscription) avant que le profil ne soit résolu.
  const metaName =
    (user?.user_metadata?.full_name as string | undefined) ?? null;
  const prenom = firstName(profile?.full_name ?? metaName);

  return (
    <section
      aria-label="Bienvenue"
      className="max-w-7xl mx-auto px-6 md:px-8 pt-8 md:pt-12 pb-1 md:pb-2"
    >
      <p className="text-sapin font-extrabold tracking-[-0.03em] leading-[1.05] text-[28px] sm:text-[34px] md:text-[40px]">
        {salutation}
        {prenom && (
          <>
            {" "}
            <span className="text-gold-text">{prenom}</span>
          </>
        )}
        <span className="text-sapin">.</span>
      </p>
    </section>
  );
};

export default SalutationHero;
