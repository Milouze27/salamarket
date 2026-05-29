// Rôles utilisateurs — source de vérité côté front, alignée avec la
// contrainte CHECK posée par la migration 0027 sur profiles.role.
//
// admin    : accès complet (backoffice + Drive Pro)
// manager  : accès complet B2B (Drive Pro), pas le backoffice général
// employee : accès limité backoffice (préparation commandes, labo)
// customer : client final Drive Particulier (rôle par défaut au signup)
//
// Note historique : avant la migration 0027, certains composants
// utilisaient "client" au lieu de "customer" (typo). 0027 a tranché
// pour "customer" et le frontend a été aligné.

export type Role = "admin" | "manager" | "employee" | "customer";

export const ALL_ROLES: readonly Role[] = ["admin", "manager", "employee", "customer"] as const;

export const isRole = (value: unknown): value is Role =>
  typeof value === "string" && (ALL_ROLES as readonly string[]).includes(value);
