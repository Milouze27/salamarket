/**
 * lib/role-label.ts — libellé FR unique pour les rôles employés (EMP-01).
 *
 * Source de vérité unique pour transformer l'enum `EmployeRole` (brut, anglais
 * minuscule type 'preparation') en libellé métier FR affiché à l'écran.
 * À utiliser partout (header, drawer compte, bandeaux de page) pour bannir
 * l'affichage de l'enum brut et les trois orthographes incohérentes du même
 * rôle relevées en audit.
 */

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  preparation: "Préparateur",
  reception: "Réception",
  caisse: "Caisse",
};

/**
 * Renvoie le libellé FR du rôle. Si l'enum est inconnu/undefined, on renvoie
 * le rôle tel quel (ou une chaîne vide) plutôt que de planter.
 */
export function roleLabel(role: string | undefined | null): string {
  if (!role) return "";
  return ROLE_LABELS[role] ?? role;
}
