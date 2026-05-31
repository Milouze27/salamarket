# Seed démo unifié — `scripts/seed-demo.mjs`

Démo Otmane prévue : **10 juin 2026** (Toulouse).

Ce script seed la prod avec des **data réalistes du jour** pour rendre la
démo crédible. Sans lui, les pages V2 montrent des données du 12 mai 2026
("RETARD 468H59" sur le kanban) et des tableaux vides (DEMO-001 à 004).

---

## Re-run J-1 démo (9 juin 2026 ~23h)

```bash
cd /Users/mac/salamarket
node scripts/seed-demo.mjs
```

Le script est **idempotent** :
- les commandes seed précédentes (`DEMO-YYYYMMDD-XXX`) sont supprimées avant ré-insertion
- les sorties seed (motif contient `[SEED-DEMO]`) et réceptions seed (`SEED-BL-*`) sont supprimées
- le PO Bigard `brouillon` du jour est supprimé puis recréé
- les zombies `Mohamed BELHAMITI` en `pret` sans `bay_label` sont passés à `retire`

Mode dry-run (n'écrit pas en base) :

```bash
node scripts/seed-demo.mjs --dry
```

---

## Pré-requis

### Fichier env

`/tmp/.env.stock-prod` doit contenir :

```
NEXT_PUBLIC_SUPABASE_URL=https://tltmermqodelorthtbre.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT>
CRON_SECRET=<optional — pour appeler /api/forecast/recompute>
```

### Dépendances

`@supabase/supabase-js` (déjà dans `node_modules` à la racine du monorepo).

---

## Ce que le script fait (par bug fix)

| Bug | Action | Tables |
|---|---|---|
| **DEMO-001** /v2/po vide | INSERT 1 PO Bigard brouillon (3 lignes ~1046€ HT) | `purchase_orders`, `purchase_order_lignes`, `fournisseurs` (patch certif AVS) |
| **DEMO-002** /v2/forecast vide | POST `/api/forecast/recompute` puis fallback INSERT 5 scenarios Aïd/Ramadan | `stockout_forecast` |
| **DEMO-003** preparation old | INSERT 7 commandes_drive aujourd'hui (3 prêtes + 3 à préparer + 1 retirée) | `commandes_drive`, `commandes_drive_lignes` |
| **DEMO-004** activité old | INSERT 10 sorties + 5 réceptions + 3 transferts sur 24-72h | `sorties_stock`, `receptions`, `transferts_inter_depots` |
| **BUG-014** "Mohamed" partout | Clients FR diversifiés (Fatima, Yacine, Karim, Aïcha, Hamza, Yasmina, Mehdi) + bay_label A1/A2/A3 + cleanup zombies | `commandes_drive` |

---

## Vérifications après run

Le script imprime un bloc `VERIFY` en fin d'exécution avec les counts attendus :

```
✓  PO Bigard draft today: count=1
✓  commandes_drive today: count=7
✓  commandes prêtes avec bay: count=3
✓  stockout_forecast critiques: count=5
✓  sorties 72h: count=10
✓  réceptions 72h: count=5
```

### Vérifs UI manuelles (après login PIN `0000` Otmane)

- `/v2/po` → "PO Bigard 3 lignes 1046€" en tab "À valider"
- `/v2/forecast` → 5 rows critiques (1 out / 1 blocker / 1 crit / 2 warn), top = Brochettes Poulet "Pic Aïd, rupture imminente"
- `/v2/admin/activite` → mouvements 24h avec employés réels (Otmane, Ilyes, Ahmed) et IA confidence 62-95%
- `/v2/preparation` → 3 cards "À préparer" (Aïcha, Hamza, Yasmina) + 3 cards "Prêt" (Fatima A1, Yacine A2, Karim A3)
- `/v2/counter` → 3 commandes prêtes avec bornes A1/A2/A3 (NB: nécessite que la RLS commandes_drive accepte l'anon — voir caveat ci-dessous)

---

## Caveats connus

### 1. `/v2/counter` RLS (anon)

La migration `20260531000002_lockdown_rls.sql` restreint `commandes_drive`
à `authenticated`. La page `/v2/counter` (écran TV public au comptoir)
utilise le client supabase **anon** → 0 row visible.

Fix futur : créer une policy `commandes_drive_anon_pickup_screen` qui
autorise `SELECT (numero_commande, client_nom_anonymized, bay_label, pret_at)`
WHERE `statut='pret' AND retired_at IS NULL`. Hors scope seed.

### 2. Bigard absent du DB

Le nom "Bigard Castres" n'existe pas dans la table `fournisseurs`. Le
script utilise **BARAKAT HALAL LYON** (équivalent narratif, vraie
boucherie halal) et lui injecte un certif AVS valide 8 mois si absent.

Pour le démo, libre à Otmane d'éditer le nom du fournisseur dans
l'UI ou directement en SQL :
```sql
UPDATE fournisseurs SET nom = 'Bigard Castres' WHERE id = 'f56bcaf2-…';
```

### 3. Tables `weekly_picks` et `casse` n'existent pas

Le prompt initial mentionnait ces deux tables. Elles n'ont jamais été
créées dans le schema :

- `WeeklyPicksRail` (composant Stock V2) lit dynamiquement les top 8
  produits halal du dépôt courant depuis `produits` triés par catégorie
  prioritaire (Boucherie, Traiteur, Charcuterie). Pas de DB seed
  nécessaire — il suffit que les produits halal existent (ils sont 16+
  en prod).
- "Casse" est un `type` de `sorties_stock` (`casse_manipulation`,
  `casse_client`, `perime_dlc`, `perime_ddm`, `defaut_fournisseur`).
  Le script seed 10 sorties dont plusieurs de ces types. Aucune table
  `casse` séparée.

### 4. Recompute forecast peut renvoyer 0

L'endpoint `/api/forecast/recompute` calcule via `velocity_state` +
`ventes_cashmag_import`. Si la table `ventes_cashmag_import` est vide,
**aucun couple (produit, dépôt) ne passe en tier `warn+`** → 0 rows
dans `v_stockout_critiques`.

Le script détecte ce cas et bascule sur un **fallback INSERT manuel**
de 5 scenarios démo (Agneau Aïd, Brochettes Aïd out, Merguez crit,
Poulet Ramadan, Couscous). Ces rows ont `phase_courante='pre_aid_adha_j7'`
pour cohérence narrative avec le pitch Otmane.

---

## Tables touchées (recap)

```
fournisseurs              ← UPDATE certif halal (si manquant) sur Bigard substitut
purchase_orders           ← INSERT 1 brouillon
purchase_order_lignes     ← INSERT 3
commandes_drive           ← DELETE old DEMO-* + UPDATE zombies pret→retire + INSERT 7
commandes_drive_lignes    ← INSERT ~11-13
stockout_forecast         ← UPSERT 5 (fallback) ou tout ce que recompute calcule
sorties_stock             ← DELETE [SEED-DEMO]* + INSERT 10
receptions                ← DELETE SEED-BL-* + INSERT 5
transferts_inter_depots   ← INSERT 3
```

Aucune `DELETE FROM` brutale sans clause WHERE ciblée. Sûr en prod.
