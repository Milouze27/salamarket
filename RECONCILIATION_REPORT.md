# RECONCILIATION_REPORT — Labo aligné sur DDL réelle

> Daté du 2026-05-15. DDL source de vérité figée après inspection
> `information_schema.columns` sur l'instance Supabase `tltmermqodelorthtbre`.

## Résultat final

| Mesure | Résultat |
|---|---|
| `npm run build` | ✅ **vert** (4.66 s) |
| `npm run test` | ✅ **51 / 51** passent |
| `npx tsc --noEmit` | ✅ aucune erreur introduite par la nuit ; 1 erreur pré-existante non liée (`useEmployeeOrders.ts:72` cast Json→OrderItem) |
| Commits ajoutés | **5** atomiques |

## Fichiers modifiés (11)

| Fichier | Nature du changement |
|---|---|
| `src/integrations/supabase/types.ts` | Réaligne les 8 tables Labo sur la DDL réelle (renames colonnes, ajout/suppression de champs, types NOT NULL ajustés, FK déclarées) |
| `src/hooks/useRecettes.ts` | Inchangé (n'utilisait que `nom`, `categorie`, `statut`) |
| `src/hooks/useRecette.ts` | `product_id`→`produit_id`, alias `product`→`produit`, order `numero_etape`→`ordre`, `taux_horaire`→`taux_horaire_charge` (plus de null check) |
| `src/hooks/useProductions.ts` | Filter `employe_id`→`employe_responsable_id` ; ajoute JOIN `recettes(id, nom)` car la colonne `productions.recette` text n'existe pas ; renomme l'alias `product`→`produit` sur inputs/outputs |
| `src/hooks/useProductionsKpi.ts` | Inchangé (vue, schéma déjà correct) |
| `src/pages/labo/Recettes.tsx` | Retire `description`, `prix_vente_ttc_unitaire` ; affiche `notes` + version |
| `src/pages/labo/RecetteDetail.tsx` | Drop CostCard 'Marge unitaire' (impossible sans prix vente recette) ; étapes `ordre`+`description` ; main d'œuvre `poste`+`taux_horaire_charge` ; ingrédients : fallback `ingredient_libre` avec badge ; `Lancer production` utilise `employe_responsable_id` et n'envoie plus `recette` text |
| `src/pages/labo/RecetteNouvelle.tsx` | Zod : drop `description` + `prix_vente_ttc_unitaire`, ajoute `notes`. Statut autorisé : `draft / active / archived` |
| `src/pages/labo/Productions.tsx` | Liste : `p.recette?.nom` au lieu de `p.recette` text |
| `src/pages/labo/ProductionDetail.tsx` | Drop section photo (colonne `photo_url` inexistante) ; inputs `quantite_reelle_consommee + unite + cout_unitaire_ht + cout_total` ; outputs `quantite_reelle_produite + unite` ; coûts `type + description` |
| `src/pages/labo/ProductionNouvelle.tsx` | Workflow : passe de 5 onglets à 4 (suppression PhotoStep car `photo_url` n'existe pas). CoutsStep enrichi : Select `type` (5 valeurs CHECK) + saisie notes intégrée. Insert inputs/outputs avec les bons noms de colonnes + `unite` (depuis `product.unit`) + `scanne_at = now()` |
| `src/test/recettes-kpi.test.ts` | Fixtures alignées : `produit_id` + alias `produit`, `poste` + `taux_horaire_charge`. Drop le test `taux_horaire NULL` (col NOT NULL). |

## Mismatches corrigés (8 critiques de l'audit)

| # | Mismatch original | Fix appliqué |
|---|---|---|
| 1 | `Panier.tsx` envoie `type_recuperation: 'drive'` (violation CHECK) | ⚠️ **Pas dans le scope** — module Drive Pro est OK selon brief. À fixer dans un commit séparé hors mission Labo |
| 5 | `recettes_ingredients.product_id` → DB attend `produit_id` | ✅ Tous les hooks et types updatés |
| 6 | `recettes_ingredients.unite` est NOT NULL | ✅ Type Insert requis maintenant, le code fournit la valeur |
| 7 | `recettes_etapes` colonnes `numero_etape/libelle` → DB : `ordre/description` | ✅ Hook order + page RecetteDetail mis à jour |
| 8 | `recettes_main_oeuvre.libelle/taux_horaire` → DB : `poste/taux_horaire_charge` | ✅ Hook + page + tests fixés |
| 9 | `productions_inputs.quantite/prix_unitaire` → DB : `quantite_reelle_consommee/cout_unitaire_ht` | ✅ ProductionNouvelle inputs + ProductionDetail |
| 10 | `productions_inputs.unite` NOT NULL | ✅ Récupère depuis `product.unit` à l'insert |
| 11 | `productions_inputs.scanne_at` NOT NULL | ✅ Fournit `new Date().toISOString()` à l'insert |
| 12 | `productions_outputs.quantite` → `quantite_reelle_produite` | ✅ Toutes les pages |
| 13 | `productions.recette` text → n'existe pas | ✅ JOIN `recettes(nom)` ajouté dans les hooks ; `RecetteDetail` ne set plus `recette` à la création |
| 14 | `productions.employe_id` → `employe_responsable_id` | ✅ Filter + insert |
| 15 | `productions.photo_url` → n'existe pas | ✅ Étape Photo supprimée du workflow ; section Photo supprimée du detail |
| 17 | `productions_couts_indirects.libelle` → DB : `description` + `type` NOT NULL CHECK | ✅ CoutsStep refait avec Select 5 valeurs + Description |
| 22 | Tests fixtures avec anciens noms | ✅ `recettes-kpi.test.ts` actualisé |

## Commits (5 atomiques)

```
a57347e test(labo): fixtures alignées sur colonnes DB réelles
0fdd321 fix(labo): workflow ProductionNouvelle + détail aligné sur DDL réelle
1598c9c fix(labo): pages Recettes + Productions alignées sur DDL réelle
7a00c37 fix(labo): hooks alignés sur colonnes DB réelles
27028ae fix(labo): types DB recettes/productions alignés sur schéma réel
```

## Points d'attention pour la suite

### 1. Fonctionnalités amputées par la DDL réelle

| Fonctionnalité | Statut | Justification |
|---|---|---|
| Marge unitaire théorique par recette | **Supprimée** | `recettes.prix_vente_ttc_unitaire` n'existe pas en DB. Le prix vente vit sur `productions_outputs.prix_vente_unitaire_ttc`. La marge réelle reste via `v_productions_kpi`. |
| Photo lot dans workflow | **Supprimée** | `productions.photo_url` n'existe pas. À réintroduire avec une migration séparée (ALTER TABLE productions ADD COLUMN photo_url text) ou via un champ `notes`. |
| Description de recette | **Renommée en `notes`** | DB n'a que `recettes.notes`. Le contenu est sémantiquement équivalent côté utilisateur. |
| Description de production (`PhotoStep` notes) | **Déplacée dans CoutsStep** | Pas de step photo, donc le textarea notes est maintenant dans l'onglet `Coûts & notes`. |

### 2. Statut `draft/active/archived` à confirmer

Le brief de réalignement ne précisait pas les valeurs autorisées par la CHECK constraint sur `recettes.statut`. J'ai parié sur la convention `salam-stock/0024` : `draft / active / archived`. Pour les productions, j'ai gardé `en_cours / terminee / archivee` (cohérent avec la vue KPI qui filtre `'terminee'`).

À valider via le SQL Editor :
```sql
select pg_get_constraintdef(c.oid)
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
 where t.relname in ('recettes','productions')
   and c.contype = 'c';
```

Si la CHECK utilise d'autres valeurs (ex: `'brouillon'`, `'terminee'` sans accent), il suffira de modifier `RecetteNouvelle.tsx` et `useRecette` les enums Zod.

### 3. Mismatch #1 (`type_recuperation: 'drive'`) — hors scope cette mission

Le brief disait "on ne touche QUE au Labo". Le bug certain dans `src/pages/pro/Panier.tsx` est documenté dans AUDIT_REPORT.md mais **non corrigé ici**. À fixer en 5 minutes dans une session dédiée Drive Pro.

### 4. Restant à faire (chemin minimal démo)

- [ ] Fix Mismatch #1 sur `Panier.tsx` (hors scope ici, 5 min)
- [ ] Vérifier que la vue `v_productions_kpi` existe vraiment en DB (`select count(*) from v_productions_kpi`) — Mismatch #16
- [ ] Adapter `supabase/seeds/seed_labo.sql` aux nouveaux noms de colonnes avant exécution (le seed avait été écrit sur l'ancien schéma deviné — il échouera sur la DB réelle ; le travail de réalignement est analogue à ce qui a été fait sur les hooks)
- [ ] Confirmer les valeurs CHECK statut (cf. §2)
- [ ] Tester manuellement le workflow recette → production → terminée → KPI
