/**
 * Recettes Drive — petit catalogue éditorial de recettes halal proposées
 * au client depuis le panier. PAS lié à la table `recettes` (côté Stock /
 * labo, qui sert au calcul de coût de production) : ici on veut juste
 * inspirer le client et l'aider à compléter son panier.
 *
 * Le matching panier ↔ recette se fait par mots-clés (`keywords`) cherchés
 * dans le nom du produit (insensible casse/accents). Volontairement simple :
 * pas de FK produit (le catalogue évolue), des mots-clés robustes suffisent.
 */

export interface RecetteIngredientDrive {
  /** Libellé affiché de l'ingrédient. */
  label: string;
  /** Mots-clés (sans accent, minuscule) cherchés dans product.name. */
  keywords: string[];
}

export interface RecetteDrive {
  id: string;
  nom: string;
  /** Accroche courte (1 ligne, anti-overflow). */
  accroche: string;
  /** Temps indicatif, ex "30 min". */
  duree: string;
  /** Nombre de personnes. */
  portions: number;
  /** Emoji d'illustration (léger, pas d'asset image à charger). */
  emoji: string;
  ingredients: RecetteIngredientDrive[];
}

export const RECETTES_DRIVE: RecetteDrive[] = [
  {
    id: "tajine-poulet-olives",
    nom: "Tajine de poulet aux olives",
    accroche: "Le classique du vendredi, fondant et parfumé.",
    duree: "1 h",
    portions: 4,
    emoji: "🍗",
    ingredients: [
      { label: "Poulet", keywords: ["poulet", "cuisse", "blanc de poulet"] },
      { label: "Olives vertes", keywords: ["olive"] },
      { label: "Citron confit", keywords: ["citron"] },
      { label: "Oignons", keywords: ["oignon"] },
      { label: "Coriandre", keywords: ["coriandre"] },
    ],
  },
  {
    id: "couscous-agneau",
    nom: "Couscous à l'agneau",
    accroche: "Semoule roulée et légumes mijotés, comme à la maison.",
    duree: "1 h 30",
    portions: 6,
    emoji: "🥘",
    ingredients: [
      { label: "Agneau", keywords: ["agneau", "epaule", "souris"] },
      { label: "Semoule", keywords: ["semoule", "couscous"] },
      { label: "Carottes", keywords: ["carotte"] },
      { label: "Courgettes", keywords: ["courgette"] },
      { label: "Pois chiches", keywords: ["pois chiche", "pois-chiche"] },
    ],
  },
  {
    id: "chorba-frik",
    nom: "Chorba frik",
    accroche: "La soupe du Ramadan, riche et réconfortante.",
    duree: "45 min",
    portions: 5,
    emoji: "🍲",
    ingredients: [
      { label: "Viande hachée", keywords: ["hache", "viande hachee"] },
      { label: "Frik (blé concassé)", keywords: ["frik", "ble"] },
      { label: "Tomates", keywords: ["tomate"] },
      { label: "Pois chiches", keywords: ["pois chiche", "pois-chiche"] },
      { label: "Coriandre", keywords: ["coriandre"] },
    ],
  },
  {
    id: "msemen-miel",
    nom: "Msemen au miel",
    accroche: "Crêpes feuilletées du petit-déjeuner, dorées et moelleuses.",
    duree: "40 min",
    portions: 4,
    emoji: "🥞",
    ingredients: [
      { label: "Semoule fine", keywords: ["semoule"] },
      { label: "Farine", keywords: ["farine"] },
      { label: "Miel", keywords: ["miel"] },
      { label: "Beurre", keywords: ["beurre", "smen"] },
    ],
  },
  {
    id: "brochettes-merguez",
    nom: "Brochettes & merguez grillées",
    accroche: "Le plateau mixte du barbecue, prêt en un éclair.",
    duree: "25 min",
    portions: 4,
    emoji: "🍢",
    ingredients: [
      { label: "Merguez", keywords: ["merguez"] },
      { label: "Brochettes de bœuf", keywords: ["brochette", "boeuf"] },
      { label: "Poivrons", keywords: ["poivron"] },
      { label: "Oignons", keywords: ["oignon"] },
      { label: "Pain", keywords: ["pain", "galette"] },
    ],
  },
];
