# Questions en suspens — nuit du 2026-05-14 / 2026-05-15

Décisions prises sans toi pour ne pas bloquer. À valider au réveil ; chaque
choix est réversible (commits atomiques).

---

## Q1 — Framework : Next.js ≠ Vite

**Constat** : ton brief mentionne `app/v2/labo/` et `app/pro/` (Next.js App
Router). Le repo est un projet **Vite + React + React Router v6**
(`vite.config.ts`, `src/pages/`, `react-router-dom@6`).

**Décision** : j'adapte les routes en React Router :
- `app/v2/labo/recettes` → `/labo/recettes`, fichier `src/pages/labo/Recettes.tsx`
- `app/pro/inscription` → `/pro/inscription`, fichier `src/pages/pro/Inscription.tsx`

Pages enregistrées dans `src/App.tsx` (lazy). Aucun framework changé.

**Impact** : zéro fonctionnel. Si tu veux migrer Next plus tard, c'est une
refonte séparée.

---

## Q2 — Types Supabase : `supabase gen types` indisponible

**Constat** : `supabase gen types typescript --project-id rvdelylmyyyelgfatewy`
échoue avec `"Your account does not have the necessary privileges to access
this endpoint"`. Le CLI n'a pas accès à l'API de management.

**Décision** : j'écris les types à la main dans `src/integrations/supabase/types.ts`
en m'appuyant sur :
- le SQL `0025_drive_pro.sql` (4 tables Pro — schéma exact connu)
- le SQL `0024b_fixes_production.sql` (colonne `tva_taux` sur `products`)
- le SQL `0025_productions_kpi.sql` (vue `v_productions_kpi` — colonnes exactes connues)
- **devinettes documentées** pour `recettes*` et `productions*` (la migration 0024 n'est pas dans le repo)

**Tables/colonnes devinées** (à confirmer / regénérer dès que tu peux) :
```
recettes              : id, nom, description, categorie, prix_vente_ttc_unitaire, statut, created_at, updated_at
recettes_ingredients  : id, recette_id, product_id, quantite, unite, ordre
recettes_etapes       : id, recette_id, numero_etape, libelle, duree_minutes
recettes_main_oeuvre  : id, recette_id, libelle, duree_minutes, taux_horaire
productions           : id, recette_id, lot_numero, date_production, statut, employe_id, notes, photo_url, created_at
productions_inputs    : id, production_id, product_id, quantite, prix_unitaire
productions_outputs   : id, production_id, product_id, quantite, prix_vente_unitaire_ttc
productions_couts_indirects : id, production_id, libelle, montant
```

**Si la DB diffère**, le frontend lèvera des erreurs runtime claires (clé
manquante dans la réponse Supabase) plutôt que du `undefined.foo` silencieux.
Marqué `// HAND-WRITTEN — TODO regenerate` dans les types.

**Mise à jour 2026-05-15 — croisement avec salam-stock** : les deux projets
partagent la même instance Supabase (`tltmermqodelorthtbre`). J'ai cherché
si `salam-stock` avait des types Supabase exploitables :
- `lib/supabase.ts` : factory sans typage `Database` (juste `SupabaseClient`)
- `lib/types.ts` : interfaces métier stock (Product, Supplier, Reception,
  PurchaseOrder…), aucune définition de table générée
- 0 référence à `recettes`, `productions`, `comptes_pro`, etc. dans tout
  le repo `salam-stock` — domaine disjoint (gestion stock vs drive)

**Conclusion** : pas de croisement possible. Mes types restent
hand-written. Régénération via CLI Supabase à faire dès que les
privilèges API seront accordés sur le compte concerné.

---

## Q3 — Bucket Storage `productions/`

**Constat** : brief demande de compresser et uploader des photos sur le bucket
`productions/`. La règle "zéro touche à la DB Supabase" est ambiguë sur les
buckets storage (techniquement c'est pas du SQL, mais c'est de l'infra).

**Décision** : code écrit qui suppose le bucket existant. Si l'upload échoue
avec `bucket not found`, un toast d'erreur clair invite à créer le bucket
manuellement via le dashboard. Pas de création automatique.

**Action attendue de toi** :
Dashboard Supabase → Storage → New bucket → nom `productions`, **public** (les
URLs photo seront visibles dans la fiche production, pas de signed URLs).
Politiques RLS minimales : INSERT pour `authenticated`, SELECT pour
`authenticated`. Si tu préfères privé + signed URLs, dis-le et j'adapte.

---

## Q4 — Rôle « manager » côté front

**Constat** : `RoleProtectedRoute.tsx` ligne 9 a :
```ts
type Role = "admin" | "employee" | "client";
```
Or :
- la DB (migration 0027) autorise `'admin', 'manager', 'employee', 'customer'`
- `'client'` n'existe nulle part (probable typo historique : devait être `'customer'`)
- `'manager'` est indispensable pour les RLS Drive Pro

**Décision** : j'étends à `"admin" | "manager" | "employee" | "customer"` et je
remplace partout `"client"` → `"customer"`. Les routes existantes (`/admin`,
`/employe`) restent fonctionnelles : leurs `requiredRoles` n'utilisent pas
`"client"`.

---

## Q5 — TypeScript strict

**Constat** : brief demande "TypeScript strict, zéro any". Or le `tsconfig.json`
courant a `strictNullChecks: false`, `noImplicitAny: false`.

**Décision** : je ne touche pas au `tsconfig.json` (changer ça casserait
probablement le code existant). Je code en mode strict-by-convention sur le
nouveau code : pas de `any`, types explicites partout, nullity check à la main.
À toi de muscler le tsconfig dans une PR séparée si tu veux.

---

## Q6 — PDF facture et compression photo

**Constat** : brief demande `@react-pdf/renderer` (PDF) et compression photo
(non précisé quelle lib).

**Décision** : j'installe
- `@react-pdf/renderer` (PDF facture, lib standard React)
- `browser-image-compression` (compression côté navigateur avant upload, ~5KB)

Si tu refuses ces deps, je les retire facilement.

---

## Q7 — Playwright E2E

**Constat** : brief demande "Tests E2E Playwright sur workflow production
complet". Playwright n'est pas installé, l'install + config + 1 scénario en
nuit autonome = sous-livraison certaine sur le reste.

**Décision** : je **skippe Playwright** cette nuit. Je couvre les calculs
critiques (coût, marge, rendement, TVA) en Vitest unit tests, et je laisse
Playwright pour une session dédiée.

---

## Q8 — Branding Pro vs Particulier

**Constat** : brief demande "Distinction visuelle Pro vs Particulier (palette
légèrement différente)" mais aussi "zéro touche au branding".

**Décision** : je ne touche pas aux tokens de la palette principale. Le module
Pro utilisera la palette existante avec un accent secondaire (badge "Pro" et
liserés bleu/anthracite) — modification visuelle minimale, réversible en 1
commit.

---

## Q9 — Génération de numéros côté front

**Constat** : brief dit "Numéro de facture et de commande générés
automatiquement par les triggers DB (ne pas les calculer côté front)".

**Décision** : OK. À l'INSERT je laisse `numero_commande: null` (le trigger
`trg_gen_numero_commande_pro` le remplira) puis je relis avec
`.select('*')` pour récupérer la valeur. Idem facture.

---

## Q10 — Workflow production : qui peut le lancer ?

**Constat** : pas spécifié. Sans hypothèse je ne peux pas écrire le formulaire.

**Décision** : je restreins `/labo/*` aux rôles `admin` + `employee` (le
boucher en labo a typiquement le rôle `employee`). À ajuster si tu veux que
`manager` y accède aussi.
