/**
 * nav-roles — source unique de vérité du filtrage de navigation par rôle.
 *
 * ARCH / L99 : la palette ⌘K, le Plus-sheet (V2Shell) et tout futur menu
 * doivent appliquer EXACTEMENT le même périmètre par rôle. On centralise donc
 * `ROLE_ALLOWED` + `filterItemsForRole` ici pour éviter toute dérive entre les
 * surfaces (un `caisse` ne doit jamais voir `/v2/reception` ni le pilotage,
 * peu importe la surface qui l'affiche).
 *
 * Principe : pour les rôles restreints (caisse, reception, preparation) on
 * liste l'ensemble AUTORISÉ par href. Tout href absent de l'ensemble est
 * masqué. Les rôles manager / admin n'ont pas d'entrée → ils voient tout.
 */

export const ROLE_ALLOWED: Partial<Record<string, Set<string>>> = {
  // Caisse : stock, retrait au comptoir, suivi prépa, étiquettes de dépannage.
  caisse: new Set([
    "/v2",
    "/v2/stock",
    "/v2/stock/sans-ean",
    "/v2/preparation",
    "/v2/counter",
    "/v2/etiquettes",
  ]),
  // Réception : gestes d'entrée + stock + tâches de dépannage, pas le pilotage.
  reception: new Set([
    "/v2",
    "/v2/reception",
    "/v2/sortie",
    "/v2/transfert",
    "/v2/etiquettes",
    "/v2/stock",
    "/v2/stock/sans-ean",
    "/v2/inventaire",
    "/v2/inventaire/historique",
    "/v2/lots",
    "/v2/admin/bons-reception",
  ]),
  // Préparation : gestes terrain (prépa, sortie, réception, transfert, stock,
  // étiquettes, comptoir, inventaire, lots) + alertes DLC pour agir sur les
  // lots courte date (le badge DLC lui est affiché). Pas le pilotage
  // (/v2/admin, /v2/po, /v2/fournisseurs, rapport-mensuel, assistant-ia…).
  preparation: new Set([
    "/v2",
    "/v2/preparation",
    "/v2/sortie",
    "/v2/reception",
    "/v2/transfert",
    "/v2/stock",
    "/v2/stock/sans-ean",
    "/v2/etiquettes",
    "/v2/counter",
    "/v2/inventaire",
    "/v2/inventaire/historique",
    "/v2/lots",
    "/v2/admin/alertes-dlc",
  ]),
};

/**
 * Filtre une liste d'items (nav, action, route) selon le périmètre du rôle.
 * Les rôles non listés dans ROLE_ALLOWED (manager / admin) voient tout.
 * La recherche fuzzy reste intacte sur le reste.
 */
export function filterItemsForRole<T extends { href: string }>(
  role: string | undefined,
  items: T[],
): T[] {
  if (!role) return items;
  const allowed = ROLE_ALLOWED[role];
  if (!allowed) return items; // manager / admin : tout
  return items.filter((it) => allowed.has(it.href));
}

/**
 * Vrai si le rôle a le droit d'atteindre cet href (même périmètre que
 * `filterItemsForRole`, version cible unique). Utile pour filtrer une cible
 * dynamique — typiquement un item « Récent » de la palette ⌘K, dont le href
 * a pu être poussé dans le localStorage partagé du poste par un manager/admin
 * puis rester cliquable pour un employé caisse/reception/preparation.
 */
export function isHrefAllowed(
  role: string | undefined,
  href: string,
): boolean {
  if (!role) return true;
  const allowed = ROLE_ALLOWED[role];
  if (!allowed) return true; // manager / admin : tout
  return allowed.has(href);
}
