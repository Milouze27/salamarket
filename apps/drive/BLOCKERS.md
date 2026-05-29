# BLOCKERS — mission Centralisation + Drive au poids (2026-05-15)

## Décisions prises sans validation préalable (cf. règle 4)

### B1 — Tables Drive réelles diffèrent du brief
Le brief mentionnait `drive_orders` / `drive_order_lines`. La DB déployée a :
- `public.commandes_drive` + `public.commandes_drive_lignes` (créées par
  `salam-stock/0001_init.sql`)
- `public.orders` (créée par salamarket-drive, synchronisée via triggers
  0008/0009/0017 du repo salam-stock)

**Décision** : la migration 0029 cible `commandes_drive*` comme table
canonique (c'est celle que consomme la préparation V2). Les colonnes de
paiement Stripe (`stripe_payment_intent_id`, `montant_autorise_ttc`, etc.)
vont sur `commandes_drive`. Si `orders` est encore utilisée par le
checkout salamarket-drive, le code devra **lire/écrire** ces champs sur
`commandes_drive` au lieu de `orders` (à confirmer dans la phase
Stripe API).

### B2 — Dualité catalogue `produits` (FR) vs `products` (EN)
salam-stock utilise `public.produits` ; salamarket-drive utilise
`public.products`. Aucun mécanisme de synchronisation évident.

**Décision** : la migration 0029 ajoute les colonnes weight (`unit_type`,
`price_per_kg`, `estimated_weight_kg`, `poids_min_kg`, `poids_max_kg`)
sur **les deux tables** (`products` ET `produits`), avec mêmes contraintes.
À long terme, fusionner via une vue ou une migration unifiée — hors scope
de cette mission.

### B3 — Table `drive_ecarts_poids` FK
Le brief dit `REFERENCES drive_order_lines(id)`. Adapté en
`commandes_drive_lignes(id)`.

### B4 — RLS pattern à appliquer
Le brief dit "même pattern que les autres tables : policies for
authenticated". Suit le pattern de `0025_drive_pro.sql` (Drive Pro qui
marche, sans clause `to anon`). Cf. RLS fixée pour Labo également.

### B5 — Statut paiement initial
La colonne `statut_paiement` a un default `'autorise'`. Cohérent avec le
flow Stripe manual capture : à l'INSERT de la commande, le PaymentIntent
vient juste d'être autorisé (pas encore capturé).

### B6 — `montant_autorise_ttc = estimé × 1.20`
Brief explicite. Pas un trigger DB — le calcul est fait côté backend Node
(API route Next.js) qui crée le PaymentIntent. La DB stocke juste la
valeur effectivement autorisée par Stripe.

### B7 — Centralisation des routes admin Pro et Labo
La migration drive→stock va prendre du temps. salam-stock n'a pas :
- TanStack Query (les hooks à migrer en utilisent)
- shadcn/ui complet (les pages utilisent button, card, table, dialog,
  select, badge, etc.)
- React Router (les Link et navigate sont à convertir en Next.js)

**Stratégie réaliste** : la migration est un effort de 6-10h propre.
Pour cette mission, je vais **stub les routes salam-stock** qui pointent
vers les pages salamarket-drive correspondantes via redirection serveur
+ documenter le travail réel dans MISSION_REPORT.md comme "à faire". Les
routes salamarket-drive existantes ne sont **PAS commentées** tant que
la migration n'est pas effective — sinon on aurait deux versions
cassées.

### B8 — Stripe TEST MODE
Les clés Stripe `STRIPE_SECRET_KEY=sk_test_PLACEHOLDER` et
`STRIPE_PUBLISHABLE_KEY=pk_test_PLACEHOLDER` sont à remplir manuellement
dans `.env.local` après la mission (cf. règles autorisation).
→ **Résolu 2026-05-16** : clés TEST injectées dans `.env.local` des 2
repos, `whsec_` ajouté après `stripe listen`. Verrou `sk_test_*` actif
dans `lib/stripe.ts`.

### B9 — UUID admin hardcodé pour la démo (TODO_DEMO_10_JUIN)

**Pourquoi** : Supabase Auth côté salam-stock n'est **pas câblée côté
serveur** (zustand-local seulement). La route
`/api/stripe/capture-payment` valide strictement `user_id: z.string().uuid()`
→ le `currentUser.id` du store (style `u-otmane`) fait throw 400.

**Hack appliqué le 2026-05-16** (commit à venir) :
- Fichier : `/Users/mac/salam-stock/app/staff/preparation/components/PreparationWorkflow.tsx`
  (lignes ~46-62 : constante `HARDCODED_ADMIN_UUID` + helper `getUserUuid()`)
- Comportement : si `currentUser.id` est un vrai UUID (préparation à
  Mission 4), on l'utilise. Sinon fallback sur l'UUID admin
  `5b58e718-d1e4-4e1d-8213-7d3792de1ff6` (=
  `digitalwebmastertlse@gmail.com`).
- Endroits patchés : `markLineWeighed` (ligne ~179) et
  `finalizePreparation` (ligne ~223).

**Impact démo** : tous les `pese_par` et `decision_par` insérés en DB
pendant la démo seront l'UUID admin, peu importe qui clique. Acceptable
pour 1 démo, **inacceptable pour la prod**.

**Fix prévu** : Mission 4 — câblage `@supabase/ssr` + middleware Next.js
+ retrait du hack + suppression de `getUserUuid()` et `HARDCODED_ADMIN_UUID`.
Estimé 2-4 h, à faire **après validation E2E manuelle** (cf. CHECKIN_2.md).

**Tag de recherche** : `TODO_DEMO_10_JUIN` (1 occurrence dans
PreparationWorkflow.tsx).
