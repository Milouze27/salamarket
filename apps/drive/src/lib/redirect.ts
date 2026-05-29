const FALLBACK = "/";

export function isSafeRedirect(path: string | null | undefined): path is string {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  // Bloque les protocol-relative URLs (//evil.com) qui sortent du domaine.
  if (path.startsWith("//")) return false;
  return true;
}

export function buildLoginUrl(currentPathWithSearch: string): string {
  return `/connexion?redirect=${encodeURIComponent(currentPathWithSearch)}`;
}

export function getRedirectFromSearch(search: string): string {
  const params = new URLSearchParams(search);
  const redirect = params.get("redirect");
  return isSafeRedirect(redirect) ? redirect : FALLBACK;
}
