const FALLBACK = "/";

// Whitelist explicite des préfixes de routes acceptés comme cible de
// redirect post-login. On évite "n'importe quel /xxx commence par /" qui
// laissait passer des routes inexistantes (BUG-009 : /commandes valide,
// /random-route invalide → 404 après login).
// Source de vérité : routes déclarées dans App.tsx.
const ALLOWED_REDIRECT_PREFIXES = [
  "/",
  "/panier",
  "/creneaux",
  "/drive-au-poids",
  "/produit/",
  "/lot/",
  "/paiement",
  "/commande/",
  "/commandes",
  "/compte",
  "/connexion",
  "/inscription",
  "/admin",
  "/employe",
  "/v2/labo",
  "/pro/",
  "/a-propos",
  "/mentions-legales",
  "/cgv",
  "/confidentialite",
] as const;

export function isSafeRedirect(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  // Bloque les protocol-relative URLs (//evil.com) qui sortent du domaine.
  if (path.startsWith("//")) return false;
  // Whitelist : path doit matcher une route déclarée (préfixe).
  // Le check est volontairement permissif sur le suffixe pour autoriser
  // /commandes, /commandes?status=ok, /pro/catalogue, etc.
  const pathOnly = path.split("?")[0].split("#")[0];
  const matched = ALLOWED_REDIRECT_PREFIXES.some((prefix) => {
    if (prefix === "/") return pathOnly === "/";
    if (prefix.endsWith("/")) return pathOnly.startsWith(prefix);
    return pathOnly === prefix || pathOnly.startsWith(prefix + "/");
  });
  return matched;
}

export function buildLoginUrl(currentPathWithSearch: string): string {
  // Un deep-link Pro (/pro/*) non authentifié doit renvoyer vers le
  // formulaire Pro (/pro/login, DA sapin/or) et non vers la connexion
  // Particulier (/connexion). On préserve le redirect dans les deux cas.
  const pathOnly = currentPathWithSearch.split("?")[0].split("#")[0];
  const loginPath = pathOnly.startsWith("/pro/") ? "/pro/login" : "/connexion";
  return `${loginPath}?redirect=${encodeURIComponent(currentPathWithSearch)}`;
}

export function getRedirectFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  const redirect = params.get("redirect");
  return isSafeRedirect(redirect) ? redirect : FALLBACK;
}
