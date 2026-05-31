export const BRAND = {
  name: "Salamarket Drive",
  tagline: "Votre supermarché halal en click & collect",
  store: {
    name: "Salamarket Toulouse",
    city: "Toulouse",
    address: "8 avenue Larrieu-Thibaud",
    postalCode: "31100",
    pickupOnly: true,
    hours: [
      { days: "Lun – Sam", time: "10h00 – 19h30" },
      { days: "Dimanche", time: "10h00 – 18h00" },
    ],
  },
  // Palette unifiée Salam Market (alignée Salam Stock V2)
  colors: {
    primary: "#0E3B2E",     // Sapin profond
    primaryDark: "#082A20", // Sapin nuit (gradients, hover)
    accent: "#C9A227",      // Or principal — réserver aux fonds sapin & déco non-texte
    accentText: "#8B6F0E",  // Or AA-safe pour TEXTE sur cream/blanc (DSN-07)
    accentBright: "#DDB31C",
    accentSoft: "#F4E9C4",
    bg: "#FAF7EE",          // Cream chaud
    surface: "#FFFFFF",
    text: "#0F1A14",        // Quasi-noir tinté sapin
    textSecondary: "#5A6470", // contrast 7.3:1 sur cream
    textTertiary: "#7B8693",  // contrast 4.6:1 sur cream — AA
    muted: "#6B7280",
    border: "#E8E4D8",
    borderMedium: "#D1CCB8",
    success: "#2D7A4F",
    warning: "#D97706",
    destructive: "#E5483D",
  },
  font: "Plus Jakarta Sans",
  categories: [
    { slug: "boucherie", name: "Boucherie", emoji: "🥩" },
    { slug: "charcuterie", name: "Charcuterie", emoji: "🌭" },
    { slug: "epicerie", name: "Épicerie", emoji: "🫙" },
    { slug: "frais", name: "Frais", emoji: "🧀" },
    { slug: "surgele", name: "Surgelé", emoji: "🧊" },
    { slug: "fruits-legumes", name: "Fruits & Légumes", emoji: "🥬" },
    { slug: "boissons", name: "Boissons", emoji: "🥤" },
    { slug: "bazar", name: "Bazar", emoji: "🧴" },
  ],
} as const;

export type Category = (typeof BRAND.categories)[number];

/**
 * Canonical status palette — identical hues in Drive & Stock (DSN-02).
 * Use these for inline styles / charts instead of Tailwind rainbow classes
 * (emerald/amber/indigo/blue/orange) so success/warning/danger read the
 * same in both apps.
 */
export const STATUS = {
  success: "#2D7A4F",
  successBg: "#E8F5EE",
  successText: "#1C5536",
  warning: "#D97706",
  warningBg: "#FEF3E2",
  warningText: "#92570A",
  danger: "#E5483D",
  dangerBg: "#FEF2F1",
  dangerText: "#A4271F",
  neutralBg: "#F1ECDD",
  neutralText: "#5A6470",
  /** AA-safe gold for text on light surfaces */
  goldText: "#8B6F0E",
} as const;

// Affiche "Salamarket Toulouse" plutôt que "Salamarket Toulouse · Toulouse"
// quand le nom du magasin contient déjà la ville.
export const formatStoreLocation = (store: {
  name: string;
  city: string;
}): string => {
  const nameContainsCity = store.name
    .toLowerCase()
    .includes(store.city.toLowerCase());
  return nameContainsCity ? store.name : `${store.name} · ${store.city}`;
};
