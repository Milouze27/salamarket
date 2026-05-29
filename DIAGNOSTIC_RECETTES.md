# DIAGNOSTIC_RECETTES — pages Labo affichent vides

> Daté 2026-05-15. Cause racine identifiée. Fix proposé (côté DB, à
> appliquer manuellement dans Supabase SQL Editor — interdit de modifier
> le schéma DB depuis le code).

## TL;DR

**Cause racine** : les policies RLS sur `recettes` / `productions` (et
leurs sous-tables) sont déclarées `to anon` uniquement. Un utilisateur
connecté (rôle Postgres `authenticated`) **ne matche aucune policy** →
RLS denial silencieuse → la réponse HTTP est `200 OK` avec body `[]`.

**Vérification recommandée avant fix** : lancer dans le SQL Editor :

```sql
select tablename, policyname, cmd, roles
  from pg_policies
 where tablename in (
   'recettes','recettes_ingredients','recettes_etapes','recettes_main_oeuvre',
   'productions','productions_inputs','productions_outputs','productions_couts_indirects'
 )
 order by tablename, policyname;
```

Si la colonne `roles` est `{anon}` (et pas `{anon,authenticated}` ou
`{public}`) → cause confirmée.

---

## Inspection des hooks (étape 1)

Tous les `.from()` et filtres trouvés dans les hooks Labo :

### `src/hooks/useRecettes.ts`
- `from('recettes').select('*').order('nom')` — aucun filtre par défaut
- `.eq('statut', filters.statut)` — **conditionnel** : appliqué uniquement si l'appelant passe `{ statut: ... }`. La page `Recettes.tsx` appelle `useRecettes()` sans argument → **aucun filtre statut**. Donc les 3 lignes `statut='active'` devraient remonter.
- Mutations : `insert`, `update`, `delete` — non concernées par le bug d'affichage.

### `src/hooks/useRecette.ts` (détail)
- `from('recettes').select('*').eq('id', recetteId).single()` — filtre par id, ok.
- `from('recettes_ingredients').select('*, produit:products(...)').eq('recette_id', …).order('ordre')`
- `from('recettes_etapes').select('*').eq('recette_id', …).order('ordre')`
- `from('recettes_main_oeuvre').select('*').eq('recette_id', …)`

Pas de filtre suspect.

### `src/hooks/useProductions.ts`
- `from('productions').select('*, recette:recettes(id,nom)').order('date_production')` — aucun filtre par défaut
- `.eq('statut', filters.statut)`, `.eq('recette_id', ...)`, `.eq('employe_responsable_id', ...)`, `.gte/lte('date_production', ...)` — **tous conditionnels**
- La page `Productions.tsx` envoie par défaut `period='30'` (donc `dateFrom = today - 30 days`), `statut='all'` (donc undefined), `recetteId='all'` (undefined). Les 5 productions seedées sur J-25 à J-3 sont dans la fenêtre.
- LaboHome appelle `useProductions({ statut: 'en_cours' })` — donc 0 résultat est attendu si les seeds sont toutes `terminee` (cohérent).

### `src/hooks/useProductionsKpi.ts`
- `from('v_productions_kpi').select('*').order('date_production')` — aucun filtre obligatoire. La vue est `security_invoker = true` donc elle hérite des RLS des tables sous-jacentes (`productions`, `productions_inputs`, etc.). **Si productions est bloquée par RLS, la vue retourne aussi `[]`**.

**Verdict étape 1** : aucun filtre côté JS ne peut expliquer le `[]` retourné pour Recettes et Productions. Les filtres sont tous conditionnels et inactifs sur les vues par défaut.

---

## Inspection auth et client Supabase (étape 4)

`src/integrations/supabase/client.ts` :
```ts
createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
});
```

- **Key utilisée** : `VITE_SUPABASE_PUBLISHABLE_KEY` = clé `anon` publique (correct côté front)
- **Session persistée** : oui (localStorage)
- **JWT attaché** : automatique sur chaque requête si l'user est connecté → la requête est effectuée en rôle PostgreSQL `authenticated`

Les pages `/v2/labo/*` sont wrappées par `<RoleProtectedRoute requiredRoles={["admin","employee"]}>` → l'utilisateur ATTEINT cette page uniquement s'il est authentifié + a un role valide en DB. Donc à l'instant où la requête `recettes?select=*` part, la session est active et le JWT est attaché.

---

## Inspection des RLS (étape 2)

Les policies déployées sur l'instance `tltmermqodelorthtbre` ne sont pas dans le repo `salamarket-drive`. La migration source (probable) est `salam-stock/supabase/migrations/0024_production_recettes.sql`. Extrait pertinent (lignes 137-156) :

```sql
do $$
declare t text;
begin
  for t in select unnest(array[
    'recettes', 'recettes_ingredients', 'recettes_etapes',
    'recettes_main_oeuvre', 'productions', 'productions_inputs',
    'productions_outputs', 'productions_couts_indirects'
  ])
  loop
    execute format(
      'drop policy if exists "anon all %1$s" on public.%1$s', t
    );
    execute format(
      'create policy "anon all %1$s" on public.%1$s
         for all to anon using (true) with check (true)', t
    );
  end loop;
end$$;
```

**Le `to anon` est le bug.**

### Mécanique Postgres RLS

| Configuration | Effet sur un user connecté (rôle `authenticated`) |
|---|---|
| `create policy ... for all to anon using (true)` | ❌ Ne s'applique pas — `authenticated` ≠ `anon`. Aucune autre policy = denial. |
| `create policy ... for all using (true)` (sans `to`) | ✅ S'applique à `public` (anon + authenticated + tout autre rôle) |
| `create policy ... for all to authenticated using (true)` | ✅ S'applique à `authenticated` (pas à `anon`) |
| `create policy ... to anon, authenticated using (true)` | ✅ S'applique aux deux |

Le pattern utilisé par `0025_drive_pro.sql` (Drive Pro, qui marche) est sans clause `to ...` → policies appliquées à tout le monde, ce qui explique pourquoi les comptes Pro et commandes Pro s'affichent correctement.

---

## Confirmation par log côté hook (étape 3)

J'ai ajouté un `console.log` temporaire dans `src/hooks/useRecettes.ts` qui sort :
```
[useRecettes] result: { rowCount, error, status, statusText, hasSession }
```

Au prochain refresh de `/v2/labo/recettes`, la console doit afficher :
```
[useRecettes] result: { rowCount: 0, error: null, status: 200, statusText: "OK", hasSession: true }
```

Si c'est le cas → confirmation absolue du diagnostic (RLS denial silencieuse).
Si `hasSession: false` → la session n'est pas attachée, problème différent.
Si `error: { code: 'PGRST...', message: '...' }` → autre cause.

---

## Cause racine

**Les policies RLS des 8 tables Labo (recettes*, productions*) ciblent uniquement le rôle `anon`. Tout utilisateur connecté est exclu et reçoit `[]`.**

---

## Fix proposé (à exécuter dans Supabase SQL Editor)

> "NE PAS modifier le schéma DB" → je n'exécute pas, je ne commit pas
> de migration SQL. À toi de valider et de coller le bloc ci-dessous
> dans le SQL Editor du dashboard.

### Option A — la plus simple, débridé total (cohérent avec l'intent originel "anon all")

```sql
do $$
declare t text;
begin
  for t in select unnest(array[
    'recettes', 'recettes_ingredients', 'recettes_etapes',
    'recettes_main_oeuvre', 'productions', 'productions_inputs',
    'productions_outputs', 'productions_couts_indirects'
  ])
  loop
    execute format('drop policy if exists "auth all %1$s" on public.%1$s', t);
    execute format(
      'create policy "auth all %1$s" on public.%1$s
         for all to authenticated using (true) with check (true)', t
    );
  end loop;
end$$;
```

Ajoute simplement la policy équivalente pour `authenticated`. L'`anon all` existante reste pour les éventuels accès publics côté Drive client.

### Option B — plus propre, fusionner anon+authenticated en un seul `public`

```sql
do $$
declare t text;
begin
  for t in select unnest(array[
    'recettes', 'recettes_ingredients', 'recettes_etapes',
    'recettes_main_oeuvre', 'productions', 'productions_inputs',
    'productions_outputs', 'productions_couts_indirects'
  ])
  loop
    execute format('drop policy if exists "anon all %1$s" on public.%1$s', t);
    execute format(
      'create policy "all %1$s" on public.%1$s
         for all using (true) with check (true)', t
    );
  end loop;
end$$;
```

### Option C — sécurité serrée (recommandée à terme, pas pour la démo)

Restreindre la lecture aux rôles `admin/manager/employee` pour les recettes/productions (sensibles : marges, coûts) :

```sql
do $$
declare t text;
begin
  for t in select unnest(array[
    'recettes', 'recettes_ingredients', 'recettes_etapes',
    'recettes_main_oeuvre', 'productions', 'productions_inputs',
    'productions_outputs', 'productions_couts_indirects'
  ])
  loop
    execute format('drop policy if exists "anon all %1$s" on public.%1$s', t);
    execute format('drop policy if exists "staff read %1$s" on public.%1$s', t);
    execute format(
      'create policy "staff read %1$s" on public.%1$s
         for select to authenticated
         using ((select role from public.profiles where id = auth.uid())
                in (''admin'',''manager'',''employee''))', t
    );
    -- Si l'app doit aussi INSERT/UPDATE/DELETE depuis le frontend
    execute format(
      'create policy "staff write %1$s" on public.%1$s
         for all to authenticated
         using ((select role from public.profiles where id = auth.uid())
                in (''admin'',''manager'',''employee''))
         with check ((select role from public.profiles where id = auth.uid())
                in (''admin'',''manager'',''employee''))', t
    );
  end loop;
end$$;
```

---

## Recommandation pour la démo

**Option A** (5 min) : fait fonctionner les pages immédiatement, garde la
back-compatibilité avec d'éventuels accès `anon`. Option C est la bonne
finalité mais elle peut attendre une session sécurité dédiée.

---

## Cleanup post-fix

Une fois le SQL appliqué et les pages affichant les données :

1. Retirer le `console.log` debug dans `useRecettes.ts` :
   ```bash
   # je peux le faire ; il suffit de me dire "le SQL est appliqué, retire le log"
   ```
2. Tester `/v2/labo/recettes` (liste), `/v2/labo/recettes/:id` (détail), `/v2/labo/productions` et `/v2/labo/marges`.
3. Si OK, considérer de durcir vers l'option C en post-démo.
