import { useId } from "react";
import { SHOPPING_MEMO_MAX, useShoppingMemo } from "@/hooks/useShoppingMemo";

/**
 * Mémo "liste de courses" — champ texte libre sauvegardé automatiquement en
 * local (zustand+persist), avec compteur de caractères. N'est JAMAIS transmis
 * au serveur : purement client, pour que le client note ce qu'il ne veut pas
 * oublier (ex. "demander du persil au rayon") d'une visite à l'autre.
 *
 * Le store persiste à chaque frappe — aucun bouton "enregistrer" nécessaire.
 * font-size 16px sur le textarea pour éviter le zoom auto iOS Safari au focus.
 */
export const ShoppingMemo = () => {
  const id = useId();
  const note = useShoppingMemo((s) => s.note);
  const setNote = useShoppingMemo((s) => s.setNote);

  return (
    <section className="rounded-2xl border border-line bg-white px-4 py-4">
      <label
        htmlFor={id}
        className="block text-[10px] uppercase tracking-[0.28em] font-bold text-gold-text"
      >
        Note pour ma commande
      </label>
      <p className="mt-1 text-[12px] text-ink-faint">
        Liste à ne pas oublier — gardée sur cet appareil uniquement.
      </p>
      <textarea
        id={id}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={SHOPPING_MEMO_MAX}
        rows={3}
        placeholder="Ex. penser au persil, demander une coupe fine…"
        className="mt-2.5 w-full min-h-[44px] resize-y rounded-xl border border-sapin/15 bg-cream px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-gold/40"
      />
      <p
        className="mt-1.5 text-right text-[11px] text-ink-faint tabular-nums"
        aria-live="polite"
      >
        {note.length} / {SHOPPING_MEMO_MAX}
      </p>
    </section>
  );
};
