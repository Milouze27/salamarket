# Gestion des PINs staff Salamarket Stock

## Statut

| Phase | PINs actifs | Migration | Front login |
|-------|-------------|-----------|-------------|
| **Démo 10 juin 2026** (actuelle) | 1234 / 5678 / 9999 (4 chiffres, lisibles) | `20260531000003_hash_pin_codes.sql` + `20260531000023_verify_pin_rate_limit.sql` | `NEXT_PUBLIC_SHOW_DEMO_PINS=true` → comptes visibles sur /v2/login |
| **Prod réelle post-démo** | 6 chiffres non triviaux | `20260531000024_rotate_pins.sql` (NON appliquée) | `NEXT_PUBLIC_SHOW_DEMO_PINS` à OFF + UI keypad 6 dots |

## ⚠️ Sécurité actuelle (démo)

Les PINs 4 chiffres sont **volontairement faibles** et **affichés** sur la page de login pour permettre des démos clients sans mémoriser un code. Cette posture est acceptable UNIQUEMENT :
- Sur l'env preview / démo (jamais sur la prod réelle business)
- Avec rate-limit verify_pin actif (5 fails/5min IP + employé) → bloque le brute force 4 chiffres en ~ 4h au lieu de 12min

Le rate-limit est dans `20260531000023_verify_pin_rate_limit.sql`.

## Rotation post-démo (Plan)

À exécuter **après** la démo du 10 juin 2026, en coordination avec un déploiement front qui passe le keypad à 6 chiffres :

### 1. Front /v2/login

Patch à appliquer dans `apps/stock/app/v2/login/page.tsx` :

```diff
-  if (pin.length >= 4 || loading) return;
+  if (pin.length >= 6 || loading) return;
-  setPin((p) => (p.length >= 4 ? p : p + d));
+  setPin((p) => (p.length >= 6 ? p : p + d));
-  if (pin.length === 4 && !loading && submittedRef.current !== pin) {
+  if (pin.length === 6 && !loading && submittedRef.current !== pin) {
-  disabled={loading || pin.length >= 4}
+  disabled={loading || pin.length >= 6}
-            {[0, 1, 2, 3].map((i) => {
+            {[0, 1, 2, 3, 4, 5].map((i) => {
```

Et désactiver `NEXT_PUBLIC_SHOW_DEMO_PINS` côté Vercel (env var).

### 2. Apply migration

```bash
# Depuis /Users/mac/salamarket avec env stock-prod chargé
cd /Users/mac/salamarket
# La migration est gated : il faut explicitement set la variable
psql "$DATABASE_URL" -c "
  begin;
  set local app.rotate_pins_acknowledged = true;
  \i supabase/migrations/20260531000024_rotate_pins.sql
  commit;
"
```

OU via Supabase studio SQL editor — coller le contenu de la migration avec en préambule `set local app.rotate_pins_acknowledged = true;`.

### 3. Communiquer nouveaux PINs (hors-bande)

Nouveaux PINs après rotation (à transmettre par Signal / papier sealed, JAMAIS par mail / Slack) :

| Employé | UUID | PIN 6-digit |
|---------|------|-------------|
| Otmane Jamal (admin) | `93274b0c-9c91-44c3-ae9a-e08f58ee6a41` | `728341` |
| Ilyes Mehdi (préparation) | `c44d758b-7cb3-486d-bc52-a1bacc628555` | `519604` |
| Ahmed Nasri (admin) | `b16789c3-daf6-41fe-916d-83bfa395ac3f` | `836275` |

⚠️ Une fois communiqués, supprimer ce tableau de ce fichier — laisser uniquement les UUIDs. Idéalement déplacer ce mapping dans un vault 1Password partagé K&A FOOD.

### 4. Vérif post-rotation

```sql
-- Aucun PIN 4-chiffres ne doit fonctionner
select verify_pin('1234');  -- doit NULL
select verify_pin('5678');  -- doit NULL
select verify_pin('9999');  -- doit NULL

-- Nouveaux 6-chiffres OK
select verify_pin('728341'); -- doit retourner UUID Otmane
```

## Rate-limit (vague 7)

Migration `20260531000023_verify_pin_rate_limit.sql` :
- Table `public.pin_attempts (employe_id, ip, success, attempted_at)`
- 5 fails/5min côté IP → lockout silencieux (return NULL)
- 5 fails/5min côté employé candidat → lockout silencieux
- 20 fails/5min global si IP indispo (header xff manquant) → lockout

Logs `pin_attempts` sont service_role only (RLS).

### Monitoring post-déploy

```sql
-- Activité suspecte (>10 fails dans 1h depuis même IP)
select ip, count(*) as fails, max(attempted_at) as last
  from pin_attempts
 where success = false and attempted_at > now() - interval '1 hour'
 group by ip
having count(*) > 10
 order by fails desc;

-- Pics horaires de tentatives ratées
select date_trunc('hour', attempted_at) as hour, count(*) as fails
  from pin_attempts
 where success = false and attempted_at > now() - interval '24 hours'
 group by 1 order by 1 desc;
```

## ROLLBACK migration rotation

Voir le bloc `PLAN ROLLBACK` à la fin de `supabase/migrations/20260531000024_rotate_pins.sql`.
