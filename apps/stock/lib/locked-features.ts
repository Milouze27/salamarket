// locked-features — source unique des fonctionnalités "cadenassées" (vendues
// mais pas encore activées pour ce client). On NE masque PAS ces entrées : on
// les montre verrouillées avec un léger glow (teaser commercial) et un clic
// déclenche un message d'upsell au lieu de naviguer. Partagé entre la nav
// (V2Shell) et la palette ⌘K (CommandPalette) pour rester cohérent.
//
// Pour ACTIVER une fonctionnalité une fois payée : retirer son href d'ici.

export const LOCKED_FEATURES: Record<string, string> = {
  "/v2/labo": "Marges & recettes",
  "/v2/admin/comptes-pro": "Espace Pro (B2B)",
  "/v2/admin/commandes-pro": "Espace Pro (B2B)",
  "/v2/admin/factures-pro": "Espace Pro (B2B)",
};

export function isLockedFeature(href: string): boolean {
  return Object.prototype.hasOwnProperty.call(LOCKED_FEATURES, href);
}

export const LOCKED_UPSELL_MESSAGE =
  "Option non incluse dans votre offre — contactez Salamarket pour l'activer.";
