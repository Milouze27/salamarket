import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND } from "@/config/brand";

// ─────────────────────────────────────────────────────────────────
// CreneauTeaser — teaser éditorial « Retrait possible dès demain ».
//
// Message dérivé en logique DATE PURE des horaires du magasin (fermé le
// dimanche, cf. BRAND.store). AUCUNE lecture de la table slots : c'est un
// teaser incitatif pour finaliser la commande, pas l'affichage réel des
// créneaux (qui vit sur /creneaux). Le lien y mène.
//
// Règle d'ouverture (Lun–Sam, fermé dimanche) :
//   - on calcule le prochain jour de RETRAIT possible (demain, en sautant
//     le dimanche), et on l'exprime en français (« dès demain », « dès
//     lundi »…). Déterministe, recalculé au mount.
// ─────────────────────────────────────────────────────────────────

const JOURS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

// 0 = dimanche (jour de fermeture, cf. BRAND.store.hours "Lun – Sam").
const FERME = 0;

// Prochain jour de retrait à partir d'aujourd'hui : on part de demain et
// on saute le dimanche fermé. Renvoie l'index getDay() (0-6) du jour.
const prochainJourRetrait = (today: number): number => {
  let d = (today + 1) % 7;
  if (d === FERME) d = (d + 1) % 7; // demain = dimanche → lundi
  return d;
};

// Libellé naturel : « demain » si c'est le lendemain calendaire, sinon le
// nom du jour. (Quand demain tombe un dimanche fermé, le prochain retrait
// est lundi → on nomme le jour plutôt que de dire « demain ».)
const labelJour = (today: number, target: number): string => {
  const lendemain = (today + 1) % 7;
  if (target === lendemain) return "demain";
  return JOURS[target];
};

export const CreneauTeaser = () => {
  const { message } = useMemo(() => {
    const today = new Date().getDay();
    const target = prochainJourRetrait(today);
    const quand = labelJour(today, target);
    return { message: `Retrait possible dès ${quand}` };
  }, []);

  const horaire = BRAND.store.hours[0]?.time ?? "";

  return (
    <section
      aria-labelledby="creneau-teaser-title"
      className="max-w-7xl mx-auto px-6 md:px-8 mt-10 md:mt-14"
    >
      <Link
        to="/creneaux"
        className="group flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl border border-sapin/15 bg-cream px-6 py-6 md:px-8 md:py-7 transition-colors hover:border-sapin/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
      >
        <div className="min-w-0">
          <h2
            id="creneau-teaser-title"
            className="text-[22px] md:text-[28px] leading-[1.05] text-sapin font-extrabold tracking-[-0.03em]"
          >
            {message}.
          </h2>
          <p className="mt-2 text-[14px] leading-[1.5] text-ink/70 max-w-[52ch]">
            Vous commandez maintenant, vous choisissez votre créneau de retrait
            {horaire ? ` (${horaire})` : ""}. Aucune file, aucune surprise.
          </p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-sapin text-cream text-[14px] font-semibold shadow-md shadow-sapin/25 transition-transform group-hover:translate-x-0.5 group-active:scale-[0.98]">
          Choisir un créneau
          <ArrowRight size={15} aria-hidden />
        </span>
      </Link>
    </section>
  );
};

export default CreneauTeaser;
