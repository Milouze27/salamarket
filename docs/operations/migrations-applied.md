# Migrations appliquées en prod — Vague 4 Security Lockdown

Date d'application : **2026-05-31** (UTC)
Cible : Supabase projet `tltmermqodelorthtbre` (live)
Opérateur : Agent APPLY MIGRATIONS SUPABASE PROD

## Contexte

Audit adversarial-security a démontré que la clé `anon` publique du Drive pouvait `GET /employes` en clair et lire les PIN staff (Otmane=1234, Mehdi=5678, Ahmed=9999). Plus généralement, l'anon avait `ALL using true` sur 25+ tables sensibles (BDL fournisseur, sorties stock, pointages, factures…).

## Migrations appliquées

| Timestamp        | Fichier                                              | Status     | Notes                                                                 |
|------------------|------------------------------------------------------|------------|-----------------------------------------------------------------------|
| 20260531000001   | fix_sync_stock_drive_status_mapping.sql              | APPLIED    | Fix trigger CHECK violation `retire→completed` → `retire→picked_up`   |
| 20260531000002   | lockdown_rls.sql                                     | APPLIED    | Lockdown SELECT anon sur 25 tables, public_read sur catalog uniquement |
| 20260531000003   | hash_pin_codes.sql                                   | APPLIED*   | bcrypt PIN + verify_pin RPC. \*Patch local : qualifié `extensions.crypt` / `extensions.gen_salt` (search_path public empêchait résolution) |
| 20260531000004   | sync_by_uuid_not_name.sql                            | APPLIED    | Trigger match items.JSONB → produits via UUID → ean → nom (fallback)  |
| 20260531000005   | realtime_role_coalesce.sql                           | APPLIED    | COALESCE explicite sur current_user_role() pour policy realtime.messages |

## Smoke tests post-déploiement

### Vercel HTTP (les 2 apps doivent rester 200)

- `https://salamarket-drive.vercel.app/` → **HTTP 200** OK
- `https://salam-stock.vercel.app/` → **HTTP 200** OK

### Catalogue public (anon DOIT pouvoir lire)

- `GET /rest/v1/products` → 2 rows (Pavé de saumon, Escalope de poulet) OK
- `GET /rest/v1/produits` → 2 rows (Huile d'olive, etc.) OK
- `GET /rest/v1/pickup_slots` → 2 créneaux OK
- `GET /rest/v1/depots` → Particulier + Professionnel OK

### Tables sensibles (anon DOIT être bloqué — 42501 permission denied)

| Table               | AVANT migration         | APRES migration                           |
|---------------------|-------------------------|-------------------------------------------|
| `sorties_stock`     | LEAK : rows complets    | `42501 permission denied for table`       |
| `bons_de_livraison` | LEAK : BDL fournisseur  | `42501 permission denied for table`       |
| `commandes_drive`   | LEAK : commandes Kanban | `42501 permission denied for table`       |
| `pointages`         | LEAK : RH staff         | `42501 permission denied for table`       |
| `fournisseurs`      | LEAK : prix achat       | `42501 permission denied for table`       |

### PIN staff (verify_pin RPC)

| Test                       | Résultat                       |
|----------------------------|--------------------------------|
| `verify_pin('1234')` Otmane | UUID `93274b0c…` OK            |
| `verify_pin('5678')` Mehdi  | UUID `c44d758b…` OK            |
| `verify_pin('9999')` Ahmed  | UUID `b16789c3…` OK            |
| `verify_pin('0000')`       | `null` (valeur neutralisée OK) |
| `verify_pin('abc')`        | `null` (format invalide OK)    |

Tous les 3 employés actifs ont `pin_hash` non-null (bcrypt cost 10).
Colonne `pin_code` neutralisée à `'0000'` (lisible mais inutile).

## Incident résolu en cours d'application

**Migration 3 a échoué à la première tentative** :
```
ERROR: function gen_salt(unknown, integer) does not exist (SQLSTATE 42883)
```

**Cause** : `pgcrypto` est installé dans le schema `extensions` sur Supabase managed, et la migration définit `set search_path = public` ce qui exclut `extensions`.

**Fix** : Patch local de la migration 3 pour qualifier explicitement :
- `extensions.crypt(...)` au lieu de `crypt(...)`
- `extensions.gen_salt('bf', 10)` au lieu de `gen_salt('bf', 10)`
- `create extension if not exists pgcrypto with schema extensions`

Push retenté → succès.

## Risques résiduels / actions humaines

1. **Rotation clé anon Supabase** — la clé actuelle est compromise (publiée depuis le début du projet sur le bundle Vite du Drive). NON FAIT par cet agent (risque opérationnel trop élevé pour démo). À planifier en fenêtre de maintenance avec re-deploy coordonné des 2 apps Vercel.

2. **PIN staff** — les PIN clairs `1234`, `5678`, `9999` sont déjà en circulation (équipe les utilise). bcrypt hash ne les protège pas si fuite déjà ancienne. À planifier : reset PIN coordonné avec l'équipe via Otmane.

3. **Bascule client Stock vers verify_pin RPC** — code `apps/stock/lib/db/index.ts` `loginByPin()` utilise encore `.eq("pin_code", pin)` qui matchera désormais `'0000'` pour tout le monde → login cassé. Le commentaire dans la migration 3 indique que la PR doit faire les deux ensembles. **À VÉRIFIER que apps/stock a bien été redéployé avec la nouvelle implémentation `.rpc('verify_pin', ...)`.**

4. **Drive insertion items.produit_id** — migration 4 attend que `apps/drive` insère `produit_id` (uuid) dans `orders.items`. Fallback `ean` puis `nom` puis placeholder reste fonctionnel pour rétro-compat, mais à patcher dans la prochaine PR Drive.

5. **Policy `anon_read_employes_no_pin`** — la migration 2 garde SELECT anon sur `employes` (sans `pin_code` clair désormais). À resserrer après bascule complète Stock → verify_pin RPC.
