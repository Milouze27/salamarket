# Migrations en attente — NE PAS `supabase db push` tel quel

## 20260611000030_secfix_close_anon_rh_sorties.sql
Referme l'écriture `anon` sur `pointages` / `shifts` (RH) et `sorties_stock`
(faille sécu #3 P0 + #14). **BLOQUANT** : l'app Stock écrit ces tables via le
client anon (`lib/db/pointage.ts` clockIn/clockOut/updatePointage,
`v2/admin/alertes` accept/reject). Appliquer cette migration SANS d'abord
router ces écritures via une route server-side service_role (« Mission 4 »)
CASSERAIT le pointage staff et la modération des alertes.

Ordre correct :
1. Créer les routes server-side (auth PIN → token de session vérifiable).
2. Basculer pointage.ts + alertes vers ces routes.
3. Déplacer ce fichier dans migrations/ et `supabase db push`.
4. Vérifier EN LIVE clock-in/out + modération avant de valider.
