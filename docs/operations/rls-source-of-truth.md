# RLS — Source de vérité

> Statut : pré-démo (10 juin 2026). Document de référence pour l'état des
> Row-Level Security policies sur Supabase (`tltmermqodelorthtbre`) et le plan
> de durcissement post-démo. Ferme le gap `sec-rls-source-of-truth`.

## Principe directeur

Deux familles d'accès cohabitent, par contrainte d'architecture actuelle :

1. **Drive (PWA publique, React/Vite)** — utilise la **clé anon** publiée dans
   le bundle. Catalogue en lecture seule, checkout en INSERT.
2. **Stock (PWA staff, Next.js)** — interroge Supabase **aussi en anon**
   (pas de session Supabase Auth côté serveur Stock à ce stade). Le kanban a
   donc besoin d'un `SELECT anon` sur les commandes.
3. **Routes serveur `/api/**` (Stock & Drive)** — utilisent `supabaseServer()`
   avec la **`service_role`**, qui **bypasse toute la RLS**. C'est le chemin
   privilégié pour toute opération sensible (exports, écritures PII, audit).

Le compromis SAFE pré-démo : on **ne casse pas Stock** (qui lit en anon) tout
en **réduisant la surface PII** via des vues anon-safe et en réservant les
journaux sensibles au `service_role`.

## Tableau de référence

| Table / Vue | Policy actuelle (anon) | Policy actuelle (service_role) | Cible post-démo | Raison |
|---|---|---|---|---|
| `commandes_drive` | `SELECT + ALL using(true)` (hotfix vague 7) | `ALL` | **revoke `SELECT` anon** ; Stock lit `commandes_drive_safe` ou passe en service_role | PII clients (email, tél, nom, adresse) ne doivent pas fuiter via la clé anon |
| `commandes_drive_lignes` | `SELECT + ALL using(true)` (hotfix vague 7) | `ALL` | revoke writes anon ; SELECT via jointure service_role | lignes liées aux commandes ; pas de PII directe mais cohérence d'accès |
| `commandes_drive_safe` (vue) | `SELECT` (anon) | n/a (vue) | rester la surface kanban publique | colonnes non-PII uniquement (statut, dépôt, créneau, montants, n°, dates) |
| `consent_log` | `INSERT` only (signup public) ; **pas de SELECT** | `ALL` | inchangé | preuve RGPD art. 7 ; PII (email, IP, UA) ⇒ lecture manager via route serveur uniquement |
| `audit_log` | **aucun accès** | `ALL` (INSERT + SELECT) | inchangé | piste d'audit ⇒ jamais exposée au client ; lecture manager via route serveur |
| `employes` | revoke SELECT anon (vague 7) | `ALL` | inchangé | PII staff + `pin_hash` ; anon lit `employes_public` |
| `employes_public` (vue) | `SELECT` (anon) | n/a | inchangé | colonnes sûres (id, nom, prénom, role, dépôt, is_active) pour `/v2/login` |
| `pin_attempts` | **aucun accès** | `ALL` | inchangé | rate-limit login ; data sensible (employe_id + IP) |
| `produits` / `products` | `SELECT` (catalogue) ; writes staff (`current_user_role()`) | bypass | inchangé | catalogue public, pas de PII |
| `produits_lots` | `SELECT + ALL` (hotfix) | bypass | restreindre writes au staff | page `/lot/:id` publique a besoin du SELECT |
| `recettes*` (labo) | `SELECT` only ; writes service_role | `ALL` | inchangé | catalogue recettes lisible, écritures serveur uniquement |
| `profiles` | owner read/write ; `role` protégé (anti-escalation) | bypass | inchangé | déjà durci (vague 0502) |

> Les autres tables Stock ré-ouvertes par le hotfix vague 7 (`anon SELECT + ALL
> using(true)`) suivent la même cible générique : **post-démo, basculer Stock
> sur `service_role` server-side puis remplacer `anon ALL` par staff-only via
> `current_user_role() in ('admin','employee','manager')`.** Liste exhaustive
> des tables concernées dans `20260531000020_hotfix_rls_reopen_stock.sql`.

## Helper de rôle

`public.current_user_role()` (SECURITY DEFINER) renvoie
`coalesce((select role from profiles where id = auth.uid()), 'customer')`.
Accordé à `anon, authenticated`. Utilisé par toutes les policies staff. Robuste
au profil manquant (renvoie `'customer'`, donc aucun privilège).

## Plan de bascule post-démo (Stock → service_role)

Objectif : retirer toute lecture PII en anon. Étapes, dans l'ordre :

1. **Câbler `supabaseServer()` (service_role) dans Stock** pour toutes les
   lectures de `commandes_drive` (kanban, préparation, compteur). Les routes
   `/api/**` l'utilisent déjà ; il reste les Server Components / actions qui
   lisent en anon côté `apps/stock/lib/db` et `apps/stock/app/v2/**`.
2. **Pointer les composants kanban qui n'ont pas besoin de PII** vers la vue
   `commandes_drive_safe` (déjà créée par `20260601000011`).
3. Une fois (1) et (2) déployés et fumés en prod :
   ```sql
   revoke select, insert, update, delete on public.commandes_drive       from anon;
   revoke select, insert, update, delete on public.commandes_drive_lignes from anon;
   drop policy if exists "anon_temporary_read"  on public.commandes_drive;
   drop policy if exists "anon_temporary_write" on public.commandes_drive;
   -- idem commandes_drive_lignes
   create policy "staff_read_orders" on public.commandes_drive
     for select to authenticated
     using (current_user_role() in ('admin','employee','manager'));
   ```
4. Répéter le pattern pour les autres tables Stock listées dans le hotfix.
5. Mettre à jour ce tableau (colonne « Policy actuelle » ← « Cible »).

## Tables de conformité (cette vague)

- `consent_log` et `audit_log` créées par `20260601000010_consent_audit_log.sql`.
- `consent_log` : **INSERT anon** (le consentement est recueilli avant la
  création de session) ; **SELECT service_role only**.
- `audit_log` : **service_role only** pour tout (écrit par le serveur, lu par
  les managers via route serveur).
- Droit à l'effacement RGPD : purge d'un `consent_log` par email se fait via une
  route serveur dédiée (`service_role`), jamais côté client.

## Smoke tests de référence

```bash
# consent_log : INSERT anon OK (201)
curl -X POST "$URL/rest/v1/consent_log" \
  -H "apikey:$ANON" -H "Content-Type:application/json" \
  -d '{"email":"t@t.fr","consent_cgv":true,"consent_privacy":true}'

# consent_log : SELECT anon refusé (401 / permission denied)
curl "$URL/rest/v1/consent_log?select=id" -H "apikey:$ANON"

# audit_log : SELECT anon refusé (401 / permission denied)
curl "$URL/rest/v1/audit_log?select=id" -H "apikey:$ANON"

# commandes_drive_safe : SELECT anon OK, SANS colonnes PII
curl "$URL/rest/v1/commandes_drive_safe?select=*&limit=1" -H "apikey:$ANON"
```

---
_Maintenu par l'agent DB migrations. Dernière mise à jour : 2026-06-01._
