# AUDIT_REPORT — Mismatches code vs DB

> Audit non destructif daté du **2026-05-15**, agent 1 (audit only).
> Aucun code n'est corrigé ici — uniquement documenté.
> Le repo `salamarket-drive` pointe vers l'instance Supabase **`tltmermqodelorthtbre`** (cf. `UNIFICATION_GUIDE.md` et `.env.example` côté salam-stock).
> Le repo `salam-stock` a son `supabase/config.toml` qui contient `project_id = "rvdelylmyyyelgfatewy"` (ancienne instance abandonnée).
> **Conséquence** : la migration `0024_production_recettes.sql` qui existe dans `salam-stock/supabase/migrations/` cible logiquement `rvdelylmyyyelgfatewy`. Elle a **probablement été ré-appliquée à la main** sur `tltmermqodelorthtbre` (puisque `salamarket-drive/supabase/migrations/0024b_fixes_production.sql` la patche), mais nécessairement avec des **adaptations** (les FK `produits(id)` et `employes(id)` n'existent pas sur cette instance — seuls `products(id)` et `profiles(id)` existent).
> Le DDL exact appliqué en prod sur `tltmermqodelorthtbre` est donc **inconnu**.

---

## Schéma réel reconstruit (sources et limites)

### Tables Pro (schéma EXACT, certitude)

Source : `supabase/migrations/0025_drive_pro.sql` (commité dans `salamarket-drive`, écrit après vérif sur Supabase le 2026-05-14 — cf. en-tête du fichier).

- `public.comptes_pro` — RLS, triggers updated_at + recalc encours, FK `delegue_user_id → profiles(id)`, statut CHECK in (`en_validation`, `actif`, `suspendu`, `archive`), conditions_paiement CHECK in (`comptant`, `30_jours`, `45_jours_fin_mois`).
- `public.commandes_pro` — trigger `gen_numero_commande_pro` (`CP-2026-XXXX`), trigger `gen_facture_numero` (`F-2026-XXXX` sur passage en `facturee`), statut CHECK in (`a_valider`, `validee`, `en_preparation`, `expediee`, `livree`, `facturee`, `payee`, `annulee`), **type_recuperation CHECK in (`livraison`, `retrait_pro`)**, mode_paiement CHECK in (NULL, `stripe`, `virement_30j`, `prelevement_sepa`).
- `public.commandes_pro_lignes` — trigger `set_ligne_tva_taux` (copie `products.tva_taux` si NULL), colonnes générées `quantite_unitaire_totale` et `prix_ht_total`.
- `public.produits_pro_prix` — index unique partiel sur `produit_id WHERE actif = true`.

### Vue v_productions_kpi (schéma EXACT, certitude)

Source : `supabase/migrations/0025_productions_kpi.sql`. Les colonnes exposées sont : `id`, `lot_numero`, `date_production`, `recette`, `cout_matieres`, `cout_indirects`, `cout_total`, `ca_potentiel_ttc`, `ca_potentiel_ht`, `input_total_qty`, `output_total_qty`, `rendement_pct`, `marge_eur_ht`, `marge_pct_ht`. **MAIS** ces colonnes sont produites par 3 CTEs qui lisent `productions_inputs(quantite, prix_unitaire)`, `productions_outputs(quantite, prix_vente_unitaire_ttc, product_id)` et `productions_couts_indirects(montant)`. Si la migration 0024 réelle a posé d'AUTRES noms (cf. ci-dessous), la vue **n'a jamais pu être créée** OU elle a été créée mais ne ramène que des NULL.

### Tables Recettes/Productions (schéma INCONNU)

Deux candidats possibles :

| Hypothèse front (types hand-written `types.ts`) | Hypothèse SQL salam-stock `0024_production_recettes.sql` |
|---|---|
| `recettes.description` text | **absent** (`nom`, `categorie`, `version`, `statut`, `created_by`, `notes`, `created_at`) |
| `recettes.prix_vente_ttc_unitaire` numeric | **absent** |
| `recettes.statut` autorisé : `'active'`, `'brouillon'`, `'archivee'` | **`'draft'`, `'active'`, `'archived'`** (CHECK explicite) |
| `recettes_ingredients.product_id` uuid FK `products` | **`produit_id` FK `produits`**, + `unite text NOT NULL`, + `ingredient_libre text`, + check `(produit_id is not null or ingredient_libre is not null)` |
| `recettes_etapes.numero_etape` integer, `libelle text` | **`ordre` integer NOT NULL**, **`description text NOT NULL`**, + `temperature_celsius`, + `equipement` |
| `recettes_main_oeuvre.libelle text`, `taux_horaire numeric` | **`poste text NOT NULL`**, **`taux_horaire_charge numeric NOT NULL`** |
| `productions.recette text \| null`, `employe_id`, `photo_url` | **pas de `recette` text** (juste `recette_id`), **`employe_responsable_id`** (pas `employe_id`), **pas de `photo_url`**, + `cout_total_calcule`, + `marge_calculee`, + `terminee_at` ; statut autorisé `'en_cours','terminee','archivee'` (pas `annulee`) |
| `productions_inputs.quantite`, `prix_unitaire`, `product_id`, `libelle` | **`quantite_reelle_consommee` NOT NULL** (pas `quantite`), **`cout_unitaire_ht` NOT NULL** (pas `prix_unitaire`), **`produit_id`** (pas `product_id`), `unite text NOT NULL`, **pas de `libelle`** (mais `quantite_prevue`, `source_depot_id`, `scanne_par`, `scanne_at`) |
| `productions_outputs.quantite`, `product_id` | **`quantite_reelle_produite` NOT NULL** (pas `quantite`), **`produit_id`** (pas `product_id`), `unite text NOT NULL`, + `quantite_prevue`, `depot_destination_id`, `date_peremption`, `numero_lot` |
| `productions_couts_indirects.libelle text \| null`, `montant` | **`type text NOT NULL`** CHECK in (`main_oeuvre`, `energie`, `consommable`, `amortissement_equipement`, `autre`), **`description text`** (pas `libelle`), `montant` |

**Conclusion** : aucune des deux versions n'a été confirmée sur la DB réelle `tltmermqodelorthtbre`. La vue `v_productions_kpi` (qui suppose `quantite`, `prix_unitaire`, `prix_vente_unitaire_ttc`, etc.) n'a probablement pas pu être créée en l'état si la 0024 a été appliquée fidèle au SQL `salam-stock`. **Tous les mismatches `productions_*`/`recettes_*` ci-dessous sont conditionnels** — il faut vérifier la DDL réelle via le SQL Editor Supabase avant d'appliquer un fix.

---

## Hooks Supabase scannés (résumé colonnes)

### `src/hooks/useRecettes.ts`
- `from('recettes')` : `select('*')`, `.insert(input)`, `.update(patch)`, `.delete()`
- Insert/Update typés via `Database['public']['Tables']['recettes']['Insert' | 'Update']` (hand-written, schéma supposé).

### `src/hooks/useRecette.ts`
- `from('recettes')` : `select('*')`
- `from('recettes_ingredients')` : `select('*, product:products(id,name,price_cents,unit)')`, `.order('ordre', …)`, `.insert(input)`, `.delete()`
- `from('recettes_etapes')` : `select('*')`, `.order('numero_etape', …)`, `.insert(input)`, `.delete()`
- `from('recettes_main_oeuvre')` : `select('*')`, `.insert(input)`, `.delete()`

### `src/hooks/useProductions.ts`
- `from('productions')` : `select('*')`, filtres `.eq('statut')` / `.eq('recette_id')` / `.eq('employe_id')` / `.gte/.lte('date_production')`, `.insert(input)`, `.update(patch)`
- `from('productions_inputs')` : `select('*, product:products(id,name,unit)')`, `.eq('production_id')`, `.insert(input)`
- `from('productions_outputs')` : `select('*, product:products(id,name,unit,tva_taux)')`, `.eq('production_id')`, `.insert(input)`
- `from('productions_couts_indirects')` : `select('*')`, `.eq('production_id')`, `.insert(input)`

### `src/hooks/useProductionsKpi.ts`
- `from('v_productions_kpi')` : `select('*')`, `.order('date_production')`, `.gte/.lte('date_production')`, `.eq('recette')`, `.eq('id')`

### `src/hooks/useComptePro.ts`
- `from('comptes_pro')` : `select('*').eq('delegue_user_id', userId).maybeSingle()`

### `src/hooks/useCatalogPro.ts`
- `from('produits_pro_prix')` : `select(*, products:produit_id(id,name,image_url,description,tva_taux,unit,category))`, `.eq('actif', true)`, `.eq('disponible_drive_pro', true)`, `.lte('valide_a_partir_de', today)`

### `src/hooks/useCommandesPro.ts`
- `from('commandes_pro')` :
  - `select('*').eq('compte_pro_id').order('date_commande', desc)`
  - `select('*').eq('compte_pro_id').not('facture_numero', 'is', null).order('date_commande', desc)`
  - `select('*, comptes_pro:compte_pro_id(id,raison_sociale,siret,adresse_facturation,adresse_livraison)').eq('id').single()`
- `from('commandes_pro_lignes')` : `select('*, products:produit_id(id,name,image_url,unit)').eq('commande_pro_id').order('created_at')`

### `src/hooks/useProAdmin.ts`
- `from('comptes_pro')` : `select('*').order('created_at', desc)`
- `from('commandes_pro')` : `select('*, comptes_pro:compte_pro_id(id,raison_sociale,siret,adresse_facturation,adresse_livraison)').order('date_commande', desc)`, + variante `.not('facture_numero', 'is', null)`

### Autres lieux qui interrogent Supabase dans le nouveau code
- `src/pages/pro/Inscription.tsx:253` : `.from('comptes_pro').insert({…})`
- `src/pages/pro/Panier.tsx:204` : `.from('commandes_pro').insert({…statut:'a_valider', type_recuperation:'drive'…})` ⚠
- `src/pages/pro/Panier.tsx:224` : `.from('commandes_pro_lignes').insert(rows)`
- `src/pages/pro/Panier.tsx:230` : `.from('commandes_pro').update(montants)`
- `src/pages/pro/Compte.tsx:82` : `.from('comptes_pro').update({adresse_livraison, delegue_telephone, delegue_email, mandat_sepa_id})`
- `src/pages/pro/Factures.tsx:69` : `.from('commandes_pro_lignes').select('*, products:produit_id(...)').eq('commande_pro_id', facture.id)`
- `src/pages/admin/ComptesPro.tsx:118` : `.from('comptes_pro').update({statut, …})`
- `src/pages/admin/CommandesPro.tsx:94` : `.from('commandes_pro').update({statut, …})`
- `src/pages/admin/FacturesPro.tsx:74` : `.from('commandes_pro').update({statut: 'payee', date_paiement: …})`

---

## Mismatches

### Drive Pro (DDL CERTAINE — depuis `0025_drive_pro.sql`)

#### Mismatch #1 — `type_recuperation` envoyé par le panier n'est pas dans le CHECK

- **Fichier** : `src/pages/pro/Panier.tsx:209`
- **Type** : valeur enum invalide
- **Code écrit** : `.insert({ compte_pro_id: compte.id, statut: 'a_valider', type_recuperation: 'drive' })`
- **Réalité DB** : `constraint commandes_pro_type_recuperation_check check (type_recuperation in ('livraison', 'retrait_pro'))` (migration `0025_drive_pro.sql:115-116`).
- **Sévérité** : **BLOQUANT** — chaque validation de panier Pro va lever `new row for relation "commandes_pro" violates check constraint "commandes_pro_type_recuperation_check"`. La commande N'EST PAS créée.
- **Fix proposé** : utiliser `'retrait_pro'` (cas drive) ou `'livraison'` selon le contexte. Idéalement, ajouter un radio dans le UI panier pour laisser le délégué choisir, et envoyer la valeur correspondante.

---

### Recettes / Productions (DDL SUPPOSÉE — cf. tableau plus haut)

> Tous les mismatches ci-dessous sont **conditionnels** : ils déclenchent une erreur Postgres uniquement si la DB réelle suit le schéma du SQL salam-stock `0024_production_recettes.sql`. À vérifier dans le SQL Editor Supabase avant correction.

#### Mismatch #2 — `recettes.description` n'existe peut-être pas

- **Fichier** : `src/hooks/useRecettes.ts:6` (types Insert/Update) + `src/pages/labo/RecetteNouvelle.tsx:64` (`description: values.description || null`) + `src/pages/labo/Recettes.tsx:120` (`r.description`) + `src/pages/labo/RecetteDetail.tsx:110` (`recette.description`)
- **Type** : colonne hypothétique absente
- **Code écrit** : insert/update avec `description` ; types-DB `recettes.description text | null`
- **Réalité DB** (selon SQL salam-stock 0024) : pas de colonne `description`. Le placeholder de description correspond à `notes` text.
- **Sévérité** : **bloquant si la DB suit salam-stock 0024**. INSERT échouera avec `column "description" of relation "recettes" does not exist`.
- **Fix proposé** : soit ajouter `description text` côté DB, soit renommer dans le front en `notes`.

#### Mismatch #3 — `recettes.prix_vente_ttc_unitaire` n'existe peut-être pas

- **Fichier** : `src/hooks/useRecettes.ts` (types) + `src/pages/labo/RecetteNouvelle.tsx:65` (`prix_vente_ttc_unitaire: values.prix_vente_ttc_unitaire ?? null`) + `src/pages/labo/Recettes.tsx:131-134` + `src/pages/labo/RecetteDetail.tsx:40` (`data.recette.prix_vente_ttc_unitaire`)
- **Type** : colonne hypothétique absente
- **Réalité DB** (selon SQL salam-stock 0024) : pas de prix de vente sur `recettes`.
- **Sévérité** : **bloquant si la DB suit salam-stock 0024** (INSERT échoue). Sinon, à confirmer.
- **Fix proposé** : ajouter la colonne ou retirer le champ du formulaire + calculs marge théorique.

#### Mismatch #4 — `recettes.statut` valeurs autorisées divergentes

- **Fichier** : `src/pages/labo/RecetteNouvelle.tsx:39` (`z.enum(['brouillon','active','archivee'])`) + `src/pages/labo/Recettes.tsx:18-22` (`STATUT_VARIANTS: active/brouillon/archivee`) + `src/pages/labo/LaboHome.tsx:44` (`statut === 'active'`)
- **Type** : valeurs enum désalignées
- **Code écrit** : `'brouillon' | 'active' | 'archivee'`
- **Réalité DB** (selon SQL salam-stock 0024) : `check (statut in ('draft', 'active', 'archived'))`
- **Sévérité** : **bloquant** pour `brouillon` et `archivee` (INSERT/UPDATE échoue avec violation CHECK). `active` continue de marcher.
- **Fix proposé** : aligner sur `'draft' | 'active' | 'archived'` OU faire CSAÉditer le CHECK côté DB pour accepter les versions FR.

#### Mismatch #5 — `recettes_ingredients.product_id` vs `produit_id`

- **Fichier** : `src/hooks/useRecette.ts:49` (`select('*, product:products(id,name,price_cents,unit)')` + reliance sur `product` join), types `Database['public']['Tables']['recettes_ingredients']` avec `product_id: string`
- **Type** : nom de colonne
- **Code écrit** : `product_id`
- **Réalité DB** (salam-stock 0024) : `produit_id uuid references public.produits(id)`. Sur tltmermqodelorthtbre il n'y a pas de `produits`, donc la migration a forcément été modifiée — la colonne pourrait être `produit_id` FK `products(id)` OU `product_id` FK `products(id)`.
- **Sévérité** : **inconnu, possiblement bloquant** (SELECT et JOIN PostgREST échoueront). Sans réponse DB, indétermbinable.
- **Fix proposé** : exécuter `select column_name from information_schema.columns where table_name='recettes_ingredients';` dans le SQL Editor Supabase et adapter front + types.

#### Mismatch #6 — `recettes_ingredients.unite` est-il NULL-able ?

- **Fichier** : `src/hooks/useRecette.ts` types : `unite: string | null` ; `recettes_ingredients` UI affiche `ing.unite ?? ing.product?.unit` dans `RecetteDetail.tsx:189`.
- **Réalité DB** (salam-stock 0024) : `unite text NOT NULL`. Tout INSERT sans `unite` échoue.
- **Sévérité** : warning — pas de INSERT direct depuis le front, mais le hook `useAddIngredient` reçoit `RecetteIngredientInsert` typé avec `unite?` (optionnel) ; un INSERT sans `unite` casserait.
- **Fix proposé** : marquer `unite` requis dans les types Insert et dans tout futur formulaire d'ajout d'ingrédient.

#### Mismatch #7 — `recettes_etapes`: `numero_etape` vs `ordre`, `libelle` vs `description`

- **Fichier** : `src/hooks/useRecette.ts:54-56` (`.order('numero_etape', { ascending: true })`) + `src/pages/labo/RecetteDetail.tsx:219` (`{e.numero_etape}`) + types Insert avec `numero_etape: number`, `libelle: string`
- **Réalité DB** (salam-stock 0024) : `ordre integer NOT NULL`, `description text NOT NULL`, + `duree_minutes`, `temperature_celsius`, `equipement`.
- **Sévérité** : **bloquant** — `.order('numero_etape')` lèvera `column "numero_etape" does not exist`. Le rendu UI `{e.numero_etape}` retournera undefined.
- **Fix proposé** : renommer `numero_etape` → `ordre`, `libelle` → `description` dans le front et les types.

#### Mismatch #8 — `recettes_main_oeuvre`: `libelle` vs `poste`, `taux_horaire` vs `taux_horaire_charge`

- **Fichier** : `src/hooks/useRecette.ts` types ; `src/pages/labo/RecetteDetail.tsx:267-273` (`{mo.libelle}`, `mo.taux_horaire`) ; `useRecette.ts:107` (`computeCoutMainOeuvreTheorique` lit `mo.taux_horaire`).
- **Réalité DB** (salam-stock 0024) : `poste text NOT NULL`, `taux_horaire_charge numeric NOT NULL CHECK > 0`, `duree_minutes integer NOT NULL CHECK > 0` (pas de NULL autorisé).
- **Sévérité** : **bloquant** — SELECT renverra des lignes sans `libelle`/`taux_horaire`, donc affichage `—` et calcul marge à 0.
- **Fix proposé** : renommer côté front + supprimer la branche `if (mo.taux_horaire == null) return sum` (la DB garantit NOT NULL).

#### Mismatch #9 — `productions.recette` text utilisé comme libellé recette

- **Fichier** : `src/hooks/useProductions.ts` types (`recette: string | null`) ; usage dans `src/pages/labo/Productions.tsx:69,176` (`p.recette`), `src/pages/labo/ProductionDetail.tsx:74` (`production.recette`), `src/pages/labo/ProductionNouvelle.tsx:100` (`production.recette ?? '—'`), `RecetteDetail.tsx:50-51` (INSERT `recette: data.recette.nom`).
- **Réalité DB** (salam-stock 0024) : pas de colonne `recette` text, seulement `recette_id uuid references recettes(id)`.
- **Sévérité** : **bloquant** — l'INSERT `recette: data.recette.nom` (`RecetteDetail.tsx:51`) échouera. Tous les `p.recette` côté affichage renverront undefined.
- **Fix proposé** : retirer la colonne `recette` du front. Pour afficher le nom de la recette, joindre `recettes(nom)` via `select('*, recette:recettes(nom)')` côté hook.

#### Mismatch #10 — `productions.employe_id` vs `employe_responsable_id`

- **Fichier** : `src/hooks/useProductions.ts:52` (filter `.eq('employe_id', filters.employeId)`) ; `src/pages/labo/RecetteDetail.tsx:54` (`employe_id: user?.id ?? null` à l'INSERT).
- **Réalité DB** (salam-stock 0024) : `employe_responsable_id uuid references employes(id)`. La FK vers `employes` n'existe pas sur tltmermqodelorthtbre — donc même le nom de la colonne peut avoir été modifié à la main lors de la ré-application.
- **Sévérité** : **inconnu, probablement bloquant**.
- **Fix proposé** : vérifier le nom réel dans `information_schema.columns` et corriger côté front. **Note importante** : `user?.id` est un `auth.users.id`, pas un `employes.id`. Si la DB pointe vraiment vers `employes(id)`, l'INSERT échouera de toute façon. Sur tltmermqodelorthtbre on a `profiles(id) = auth.users.id`, donc si la migration a été modifiée pour FK `profiles(id)` ça marcherait.

#### Mismatch #11 — `productions.photo_url` n'existe peut-être pas

- **Fichier** : `src/pages/labo/ProductionNouvelle.tsx:170` (UPDATE `patch: { photo_url: publicUrl }`) + `src/pages/labo/ProductionDetail.tsx:143-158` (affichage photo) + types Insert/Update `productions.photo_url: string | null`.
- **Réalité DB** (salam-stock 0024) : pas de colonne `photo_url` (juste `notes`, `cout_total_calcule`, `marge_calculee`, `terminee_at`).
- **Sévérité** : **bloquant** pour l'UPDATE — `column "photo_url" of relation "productions" does not exist`. Le upload bucket réussit, l'écriture en DB échoue.
- **Fix proposé** : ajouter une colonne `photo_url text` côté DB (migration 0024c). Ne pas retirer côté front (feature démo critique).

#### Mismatch #12 — `productions.statut` valeur `annulee` inexistante

- **Fichier** : `src/pages/labo/Productions.tsx:34` (`STATUT_LABEL: annulee: 'Annulée'`) + `src/pages/labo/ProductionDetail.tsx:19` (idem). Pas d'INSERT/UPDATE direct avec `'annulee'` mais le filter `Productions.tsx:106` propose `<SelectItem value='annulee'>`.
- **Réalité DB** (salam-stock 0024) : `check (statut in ('en_cours', 'terminee', 'archivee'))`.
- **Sévérité** : warning — filtrer sur `'annulee'` renvoie zéro résultat sans erreur. UPDATE vers `'annulee'` (s'il était introduit plus tard) violera le CHECK.
- **Fix proposé** : remplacer `annulee` par `archivee` côté front.

#### Mismatch #13 — `productions_inputs`: `quantite` vs `quantite_reelle_consommee`, `prix_unitaire` vs `cout_unitaire_ht`, `product_id` vs `produit_id`, `libelle` inexistant

- **Fichier** : `src/hooks/useProductions.ts:84-86` (`select('*, product:products(id,name,unit)').eq('production_id', …)`) ; `src/pages/labo/ProductionNouvelle.tsx:307-312` (INSERT `{ production_id, product_id, quantite, prix_unitaire }`) ; `ProductionDetail.tsx:189-196` (lecture `i.quantite`, `i.prix_unitaire`, `i.libelle`).
- **Réalité DB** (salam-stock 0024) : `quantite_reelle_consommee numeric NOT NULL CHECK >= 0`, `cout_unitaire_ht numeric NOT NULL CHECK >= 0`, `unite text NOT NULL`, `produit_id uuid references produits(id)`. **Pas de `libelle`**.
- **Sévérité** : **bloquant** — INSERT échoue (3 colonnes inexistantes + `unite` NOT NULL non fourni). SELECT renverra null sur `quantite`/`prix_unitaire`/`libelle`, donc la table dans `ProductionNouvelle/Detail` affichera NaN/—.
- **Fix proposé** : renommer dans le front + types et **fournir `unite`** à chaque INSERT (le UI doit demander l'unité ou la dériver du produit).

#### Mismatch #14 — `productions_outputs`: `quantite` vs `quantite_reelle_produite`, `product_id` vs `produit_id`, `unite` requis

- **Fichier** : `src/hooks/useProductions.ts:88-90` ; `src/pages/labo/ProductionNouvelle.tsx:437-442` (INSERT `{ production_id, product_id, quantite, prix_vente_unitaire_ttc }`).
- **Réalité DB** (salam-stock 0024) : `quantite_reelle_produite numeric NOT NULL`, `unite text NOT NULL`, `produit_id`.
- **Sévérité** : **bloquant** — INSERT échoue, SELECT renvoie NULL.
- **Fix proposé** : aligner les noms et fournir `unite`.

#### Mismatch #15 — `productions_couts_indirects`: `libelle` vs `type+description`, `type` requis

- **Fichier** : `src/hooks/useProductions.ts:91-94` (`select('*')`) ; `ProductionNouvelle.tsx:559-563` (INSERT `{ production_id, libelle, montant }`) ; `ProductionDetail.tsx:269-271` (affichage `c.libelle`).
- **Réalité DB** (salam-stock 0024) : `type text NOT NULL CHECK in ('main_oeuvre','energie','consommable','amortissement_equipement','autre')`, `description text` (nullable), `montant numeric NOT NULL CHECK >= 0`. **Pas de `libelle`**.
- **Sévérité** : **bloquant** — INSERT échoue (`type` NOT NULL absent), même si `libelle` existait, le CHECK sur `type` aurait fait planter.
- **Fix proposé** : ajouter un `<Select>` pour `type` dans le UI + renommer `libelle` → `description`.

---

### Vue v_productions_kpi (DDL CERTAINE, mais alimentation source incertaine)

#### Mismatch #16 — La vue suppose les anciens noms de colonnes `quantite`, `prix_unitaire`, `prix_vente_unitaire_ttc`

- **Fichier** : `supabase/migrations/0025_productions_kpi.sql:40-64` (lecture de `productions_inputs.quantite`, `prix_unitaire`, `productions_outputs.quantite`, `prix_vente_unitaire_ttc`, `productions_couts_indirects.montant`).
- **Réalité DB** : si la 0024 réelle suit le SQL salam-stock, ces noms n'existent pas. La création de la vue aurait échoué.
- **Sévérité** : **bloquant pour les KPI** — si la vue n'existe pas, tout `useProductionsKpi` retourne une erreur Supabase `relation "v_productions_kpi" does not exist`.
- **Fix proposé** : confirmer l'existence de la vue (`select * from v_productions_kpi limit 1` dans le SQL Editor) avant la démo. Si elle existe, parfait ; sinon créer une 0025b qui prend les bons noms.

#### Mismatch #17 — `productions_outputs.product_id` utilisé pour le join `products` dans la CTE `outputs`

- **Fichier** : `supabase/migrations/0025_productions_kpi.sql:62` (`left join public.products pr on pr.id = po.product_id`).
- **Réalité DB** : selon `produit_id` ou `product_id`. Si réel = `produit_id`, la vue cassait à la création.
- **Sévérité** : voir #16.

---

### Verification générale pages (imports, schémas Zod, handlers)

#### Mismatch #18 — `useProducts` ne sélectionne pas `tva_taux` alors que le code Pro l'utilise

- **Fichier** : `src/hooks/useProducts.ts:11` (`.select('id, name, description, price_cents, unit, category, image_url, in_stock')`). Le hook expose le type local `Product` (cf. `src/types/product.ts`) qui ne contient pas `tva_taux`.
- **Conséquence** : si du code ajoute des produits au panier Pro via `useProducts` (catalog particulier) sans passer par `produits_pro_prix`, `product_tva_taux` ne sera pas accessible. Heureusement, `useCatalogPro` joint le bon `tva_taux`. **Aucun appel actuel ne dépend de `useProducts().tva_taux`**, donc OK pour la démo.
- **Sévérité** : cosmétique. Mais à surveiller si quelqu'un branche le catalogue particulier sur le panier Pro.
- **Fix proposé** : étendre le hook avec `tva_taux` quand il sera utile.

#### Mismatch #19 — Type `Database['public']['Tables']['productions']['Insert']` autorise `recette: string` mais aucune colonne `recette` text n'existe (cf. #9)

- **Fichier** : `src/integrations/supabase/types.ts:374` (productions.Insert.recette?: string | null).
- **Sévérité** : warning — le typing-only ne casse rien à l'exécution mais propage une fausse impression de validité au compilateur.
- **Fix proposé** : retirer `recette` des types hand-written une fois le schéma réel confirmé.

#### Mismatch #20 — `numero_etape` dans le type Insert n'autorise pas null, alors que l'ORM sait que c'est NOT NULL (déduction OK), mais le front n'a aucun moyen de l'envoyer parce qu'il n'y a pas de UI ajout-étape

- **Fichier** : `src/hooks/useRecette.ts` (`useAddEtape`). UI : non implémenté (pas de page d'édition recette qui permet d'ajouter une étape).
- **Sévérité** : cosmétique pour la démo.

#### Mismatch #21 — Schéma Zod inscription Pro autorise `forme_juridique` ∈ `['SARL','SAS','EI','Association']`, OK avec DB (forme_juridique est text libre, pas de CHECK)

- **Fichier** : `src/pages/pro/Inscription.tsx:64`.
- **Sévérité** : cosmétique. Conforme.

#### Mismatch #22 — Sur les KPI, le hook lit `v_productions_kpi` puis le composant `Marges.tsx` lit `k.cout_total`, mais la vue déclare `cout_total` comme `coalesce(i.cout_matieres, 0) + coalesce(c.cout_indirects, 0)` (NOT NULL côté vue). Le type hand-written `v_productions_kpi.cout_total: number` est correct.

- **Sévérité** : OK.

---

## Health Checks

### `npm run build`
- **Statut** : OK. 4.11 s, ~700 KB main bundle, chunk InvoicePDF à 1.46 MB (recommandation : lazy-load PDF, hors scope démo).

### `npm run test` (Vitest)
- **Statut** : OK. 4 fichiers, **52 tests passent** (`tva.test.ts: 21`, `format.test.ts: 17`, `recettes-kpi.test.ts: 13`, `example.test.ts: 1`).

### `npm run lint` (ESLint)
- **Statut** : 7 erreurs / 8 warnings, dont **0 dans le code nouveau** :
  - Erreurs : `command.tsx` empty interface, `textarea.tsx` empty interface, `tailwind.config.ts` require import, `format.test.ts:12` irregular whitespace ×2, `supabase/functions/confirm-order/index.ts` 2 `@ts-ignore`.
  - Warnings : 6 `react-refresh/only-export-components` sur fichiers UI shadcn pré-existants.
- Aucune erreur lint introduite par les modules Labo / Pro cette nuit.

### `npx tsc --noEmit -p tsconfig.app.json`
- **Statut** : **1 erreur** dans le code pré-existant `src/hooks/useEmployeeOrders.ts:72` (cast `as EmployeeOrder[]` non sûr).
- Aucune erreur TS dans les nouveaux fichiers Labo/Pro (rappelons que `tsconfig.json` est en mode non-strict).

---

## Top 5 fixes prioritaires pour la démo

> Critère : ce qui empêche un workflow complet de démo (`/v2/labo/recettes` → créer recette → lancer production → cycle complet, ou `/pro/inscription` → catalogue → panier → commande → facture). Hiérarchie par criticité décroissante.

### 1. **Mismatch #1** — `type_recuperation: 'drive'` dans Panier Pro
- **Effort** : 5 min
- **Impact si non corrigé** : **toute commande Pro échoue au INSERT**. Le délégué clique « Valider la commande », rien ne se passe et un toast d'erreur Postgres apparaît. Démo cassée à l'étape la plus visible.

### 2. **Mismatch #16** — Vérifier l'existence de la vue `v_productions_kpi` sur la DB
- **Effort** : 5 min (SQL Editor : `select * from v_productions_kpi limit 1;`)
- **Impact si non corrigé** : la page `/v2/labo/marges` plante, le bloc KPI sur `/v2/labo/productions/:id` ne s'affiche jamais. Si la vue n'existe pas (parce que la migration 0024 réelle ne match pas les CTEs), il faut une 0025b correctifs.

### 3. **Mismatches #9 + #11 + #13 + #14 + #15** — Colonnes productions/inputs/outputs/couts inexistantes ou mal nommées
- **Effort** : 1 h
- **Impact si non corrigé** : tout le workflow `/v2/labo/productions/nouvelle` (ajout matières, sorties, coûts indirects, upload photo) est cassé. L'ensemble du module Labo n'a pas pu être testé fonctionnellement cette nuit faute de DDL connue. **Bloquant pour 50 % de la démo Labo.** Action concrète : exécuter `select column_name, data_type, is_nullable from information_schema.columns where table_name in ('productions','productions_inputs','productions_outputs','productions_couts_indirects','recettes_ingredients','recettes_etapes','recettes_main_oeuvre');` dans le SQL Editor pour avoir le schéma réel, puis aligner front + types.

### 4. **Mismatches #4 + #12** — Valeurs de statut désalignées (`brouillon`/`archivee`/`annulee` côté front vs `draft`/`archived`/[pas de annulee] côté DB)
- **Effort** : 15 min
- **Impact si non corrigé** : créer une recette en `brouillon` échoue (violation CHECK), filter productions par `annulee` est silencieux mais inutile.

### 5. **Mismatch #5 + #7 + #8** — `recettes_ingredients.product_id`, `recettes_etapes.numero_etape`/`libelle`, `recettes_main_oeuvre.libelle`/`taux_horaire`
- **Effort** : 1 h (renommer dans 4 fichiers de types + 3 pages)
- **Impact si non corrigé** : `RecetteDetail.tsx` affiche une liste vide (ingrédients, étapes, main d'œuvre) ; le calcul coût matières/main d'œuvre retourne 0. Le module Recettes est vide à l'écran malgré une DB potentiellement bien peuplée.

---

## Notes finales

- **Aucune correction effectuée** dans ce rapport — uniquement de la documentation.
- Tous les mismatches `recettes_*` / `productions_*` sont **conditionnels** : ils ne deviennent réels que si la DB suit le SQL salam-stock. La toute première chose à faire au réveil est un `select column_name from information_schema.columns where table_name = 'productions' …` pour figer le schéma réel.
- Le `npm run build` passe, donc le code TypeScript compile et bundle correctement — toutes les erreurs DB ne se manifestent qu'à l'exécution sur un compte authentifié.
- Aucun secret n'a été exposé pendant cet audit.
