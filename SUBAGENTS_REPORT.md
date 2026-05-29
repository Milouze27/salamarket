# SUBAGENTS_REPORT — 2026-05-15

Consolidation des 3 sous-agents lancés en parallèle pour préparer la démo.

---

## Statut des sous-agents

| # | Mission | Statut | Livrable | Commit |
|---|---|---|---|---|
| 1 | Audit code vs DB | ✅ success | `AUDIT_REPORT.md` (30 Ko) | `f9a26ea` |
| 2 | Seed Recettes + Productions | ✅ success | `supabase/seeds/seed_labo.sql` (28 Ko, 516 lignes) | `ccd34f1` |
| 3 | Seed Comptes Pro + Commandes | ✅ success | `supabase/seeds/seed_drive_pro.sql` (27 Ko, 680 lignes) | `3664f03` |

Tous les commits sont locaux sur `main`. **Aucun push.**

---

## 🚨 Découverte structurelle majeure (à lire en premier)

**Le DDL réel des tables `recettes*` / `productions*` sur l'instance `tltmermqodelorthtbre` est INCONNU.**

Deux versions concurrentes existent dans le code :

| Hypothèse | Source | Colonnes typiques |
|---|---|---|
| **A — types.ts hand-written** (utilisée par tout mon code et par le seed Agent 2) | `salamarket-drive/src/integrations/supabase/types.ts` (rédigé à la main pendant la nuit) | `products`, `product_id`, `quantite`, `prix_unitaire`, `libelle`, `photo_url`, statuts FR `brouillon/archivee` |
| **B — migration salam-stock 0024** | `salam-stock/supabase/migrations/0024_production_recettes.sql` | `produits` (FR), `produit_id`, `ingredient_libre`, `quantite_reelle_consommee`, `cout_unitaire_ht`, `cout_total_calcule`, statuts EN `draft/archived` |

**salam-stock cible une ancienne instance Supabase abandonnée** (`rvdelylmyyyelgfatewy` dans son `supabase/config.toml`), pas l'instance vivante `tltmermqodelorthtbre`. Donc sa migration n'a probablement **pas été appliquée fidèlement** sur la prod actuelle — mais on ne sait pas quelles adaptations ont été faites.

**Action n°1 obligatoire avant tout fix ou tout seed Labo** : exécuter dans le SQL Editor Supabase :

```sql
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and table_name in (
     'recettes','recettes_ingredients','recettes_etapes','recettes_main_oeuvre',
     'productions','productions_inputs','productions_outputs','productions_couts_indirects',
     'v_productions_kpi'
   )
 order by table_name, ordinal_position;
```

Le résultat **fige** le schéma réel et convertit les mismatches conditionnels en certitudes.

---

## Synthèse mismatches (Agent 1)

| Sévérité | Nombre | Notes |
|---|---|---|
| 🔴 Bloquant | **12** | 1 certain, 11 conditionnels (à confirmer par DDL inspection) |
| 🟡 Warning | 7 | |
| ⚪ Cosmétique | 3 | |
| **Total** | **22** | |

### Top 10 mismatches consolidés

1. **#1 — CERTAIN bloquant** : `Panier.tsx:209` envoie `type_recuperation: 'drive'` mais la CHECK constraint accepte uniquement `'livraison'` ou `'retrait_pro'`. **Toute commande Pro échoue à l'INSERT.** Fix 5 min.

2. **#16 — bloquant** : vue `v_productions_kpi` peut-être inexistante en DB si la 0024 a été appliquée différemment. Si absente : `/labo/marges` + cards KPI cassés. À vérifier avec `select count(*) from v_productions_kpi`.

3. **#9 / #11 / #13 / #14 / #15 — bloquants conditionnels** : colonnes `productions_*` potentiellement mal nommées (`quantite` vs `quantite_reelle_consommee`, `prix_unitaire` vs `cout_unitaire_ht`, `libelle` vs `description`+`type`, `photo_url` peut-être absente). Tout le workflow `/v2/labo/productions/nouvelle` peut être cassé.

4. **#4 + #12 — bloquants conditionnels** : statuts désalignés `brouillon/archivee/annulee` (front) vs `draft/archived` (DB hypothèse B).

5. **#5 + #7 + #8 — bloquants conditionnels** : `recettes_ingredients.product_id` (front) vs `produit_id` (hypothèse B) ; `recettes_etapes` aurait `ordre`+`description` au lieu de `numero_etape`+`libelle` ; `recettes_main_oeuvre` aurait `poste`+`taux_horaire_charge`.

(Liste exhaustive et formats détaillés dans `AUDIT_REPORT.md`)

### Health checks (Agent 1)

| Commande | Résultat |
|---|---|
| `npm run build` | ✅ OK en 4,1 s |
| `npm run test` | ✅ 52/52 verts |
| `npm run lint` | 🟡 7 erreurs + 8 warnings (**toutes pré-existantes**, rien introduit cette nuit) |
| `npx tsc --noEmit` | 🟡 1 erreur pré-existante (`useEmployeeOrders.ts:72`) |

---

## Stats des seeds

### Agent 2 — `seed_labo.sql`

| Table | Lignes |
|---|---|
| recettes | 3 |
| recettes_ingredients | 4 (limité car FK NOT NULL — épices/yaourt non insérables) |
| recettes_etapes | 14 |
| recettes_main_oeuvre | 5 |
| productions | 5 (3 Merguez + 1 Kefta + 1 Brochettes, dates J-25 à J-3) |
| productions_inputs | 30 |
| productions_outputs | 5 |
| productions_couts_indirects | 15 |
| **Total** | **81 lignes** |

⚠️ **Le seed Labo suit l'hypothèse A (types hand-written)** — si la DDL réelle est l'hypothèse B, le seed **échouera intégralement**. À adapter après la DDL inspection.

### Agent 3 — `seed_drive_pro.sql`

| Table | Lignes |
|---|---|
| comptes_pro | 5 (4 actifs + 1 en_validation pour démo validation) |
| produits_pro_prix | ~4 (auto-générées via `INSERT…SELECT` sur `category IN ('boucherie','charcuterie')`) |
| commandes_pro | 6 (1 payée, 2 en_preparation, 1 livrée non payée, 1 facturée en retard pour relance, 1 a_valider > 500€) |
| commandes_pro_lignes | 24 |
| **Total** | **~39 lignes** |

✅ **Schéma EXACT certain** (depuis 0025_drive_pro.sql) — ce seed est sûr à appliquer dès la DB réelle confirmée.

⚠️ Pour les 5 délégués, `delegue_user_id = NULL` (les `auth.users` ne se créent pas en SQL). Voir étape 5 de l'ordre d'application.

---

## Ordre d'application recommandé

### Étape 0 — DDL inspection (5 min, bloquant)

Lancer la requête `information_schema.columns` ci-dessus dans le SQL Editor. **Sans ce step, on ne sait pas si on doit fixer le code ou le SQL — risque élevé de casser plus que ce qu'on répare.**

### Étape 1 — Fix Mismatch #1 (5 min)

Dans `src/pages/pro/Panier.tsx`, remplacer `type_recuperation: 'drive'` par `'retrait_pro'`. Commit + build local.

### Étape 2 — Appliquer `seed_drive_pro.sql` (5 min)

Schéma 100% certain. SQL Editor → coller le fichier → Run. Vérifier avec :
```sql
select numero_commande, statut, montant_ttc from commandes_pro order by created_at desc;
-- attendu : 6 lignes, CP-2026-XXXX numéros auto-générés
```

### Étape 3 — Réconciliation schéma Labo (15-30 min)

Au choix selon le résultat de l'étape 0 :
- **Si la DDL réelle = hypothèse A** (types.ts) : rien à faire, seed Labo s'applique tel quel
- **Si la DDL réelle = hypothèse B** (salam-stock 0024) : adapter le code (hooks + pages + types.ts) **OU** adapter le seed_labo.sql pour matcher
- **Si mix des deux** : trancher colonne par colonne

### Étape 4 — Appliquer `seed_labo.sql` (5 min, après réconciliation)

```sql
-- vérif
select count(*) from recettes; -- 3
select count(*) from productions where lot_numero like 'L2026-%'; -- 5
select * from v_productions_kpi limit 5;
```

### Étape 5 — Créer les 5 comptes Auth pour les délégués Pro (15-20 min)

Dashboard Supabase → Authentication → Users → Add user × 5 :
- `contact@lebosphore31.fr`
- `k.benali@traiteurhalal.fr`
- `gestion@mosquee-empalot.fr`
- `intendance@ecole-mansour.fr`
- `lecarthage@gmail.com`

Mot de passe temporaire pour chacun. Puis dans le SQL Editor :
```sql
update public.comptes_pro
   set delegue_user_id = (select id from auth.users where email = 'contact@lebosphore31.fr')
 where siret = '79347 821 600 015';
-- répéter pour les 4 autres
```

Sans ça, les RLS `*_select_delegue` bloqueront la connexion Pro côté délégué (mais l'admin/manager y aura accès).

### Étape 6 — Fixes audit prioritaires (1-3 h selon résultat étape 0)

Appliquer les mismatches bloquants restants identifiés dans `AUDIT_REPORT.md`, par ordre du Top 5.

---

## Estimation temps total côté humain

| Étape | Temps |
|---|---|
| 0 — DDL inspection | 5 min |
| 1 — Fix Mismatch #1 | 5 min |
| 2 — Apply seed_drive_pro | 5 min |
| 3 — Réconciliation schéma Labo | 15-30 min |
| 4 — Apply seed_labo | 5 min |
| 5 — Créer 5 auth users + link | 15-20 min |
| 6 — Fixes audit prioritaires | 1-3 h |
| **Total** | **~2 à 4 h** |

Pour une démo client, le **chemin minimal viable** est : étapes 0 → 1 → 2 → 5 (60 min). Le module Pro sera entièrement fonctionnel ; le module Labo sera vide mais l'interface tournera (cards à 0). Le seed Labo et les fixes audit peuvent attendre la session suivante.

---

## Fichiers livrés ce round (4)

- `AUDIT_REPORT.md` — 30 Ko — `f9a26ea`
- `supabase/seeds/seed_labo.sql` — 28 Ko, 516 lignes — `ccd34f1`
- `supabase/seeds/seed_drive_pro.sql` — 27 Ko, 680 lignes — `3664f03`
- `SUBAGENTS_REPORT.md` — ce document — (à commiter)
