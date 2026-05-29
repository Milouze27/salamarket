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
    accent: "#C9A227",      // Or principal
    accentBright: "#DDB31C",
    accentSoft: "#F4E9C4",
    bg: "#FAF7EE",          // Cream chaud
    surface: "#FFFFFF",
    text: "#0F1A14",        // Quasi-noir tinté sapin
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
