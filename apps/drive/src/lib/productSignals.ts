/**
 * productSignals — signaux de confiance dérivés DÉTERMINISTES (zéro backend).
 *
 * But : afficher des micro-preuves sociales/qualité (« souvent commandé »,
 * note étoiles indicative) calmes et STABLES entre les renders. La clé est le
 * déterminisme : un hash de product.id, jamais de Math.random — sinon le
 * signal clignoterait d'un render à l'autre (effet « criard » proscrit par la
 * charte). Le même id donne toujours le même résultat.
 *
 * Aucune donnée serveur, aucune table : pur dérivé client à usage démo/confiance.
 */

/**
 * Hash FNV-1a 32-bit d'une chaîne → entier non signé stable.
 * Petit, sans dépendance, suffisant pour répartir uniformément des ids.
 */
function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    // multiplication FNV en arithmétique 32-bit (>>> 0 reste non signé)
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Réel pseudo-aléatoire stable dans [0, 1) dérivé de l'id (+ un sel optionnel
 * pour décorréler deux signaux distincts tirés du même id).
 */
function unitFromId(id: string, salt = ""): number {
  return hashId(`${salt}:${id}`) / 0xffffffff;
}

/**
 * « Souvent commandé cette semaine » — vrai pour ~20 % des produits, choisi
 * de façon déterministe par l'id (pas de clignotement entre renders).
 */
export function isPopulaire(id: string): boolean {
  return unitFromId(id, "pop") < 0.2;
}

/**
 * Score de popularité déterministe dans [0, 1) — pour classer des produits
 * de façon STABLE entre les renders (sans backend ni Math.random) et en
 * mettre quelques-uns en avant. Sel distinct de isPopulaire pour ne pas
 * corréler les deux signaux.
 */
export function popularityScore(id: string): number {
  return unitFromId(id, "popscore");
}

/**
 * Note indicative déterministe dans [4,4 ; 4,9] par pas de 0,1.
 * Borne basse volontairement haute (≥ 4,4) : signal « confiance » de démo,
 * jamais présenté comme un vrai avis temps réel (cf. libellé « note indicative »
 * et aria-label côté composant RatingStatic).
 */
export function ratingFor(id: string): number {
  const steps = 6; // 4.4, 4.5, 4.6, 4.7, 4.8, 4.9
  const idx = Math.floor(unitFromId(id, "rating") * steps);
  return 4.4 + Math.min(idx, steps - 1) * 0.1;
}
