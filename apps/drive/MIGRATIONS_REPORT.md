# Rapport de migrations — 2026-05-14

Fichiers SQL créés, **non exécutés**, **non pushés**. Commit local
uniquement (signature `dadibelhamiti7@gmail.com`).

> ⚠️ **0026 obsolète** — `0026_promote_zabiri_manager.sql` ciblait le
> nom de famille `'zabiri'` (avec **ab**), or la donnée réelle en prod
> est `'zbairi'` (avec **ba**). Le fichier a été renommé en
> `0026_promote_zabiri_manager.sql.OBSOLETE` pour qu'aucun outil de
> migration ne le picke. **C'est `0027_setup_comptes_equipe.sql` qui fait
> le job correctement** (et plus encore).

---

## Fichiers livrés

### 1. `supabase/migrations/0024b_fixes_production.sql`
Idempotent — sans risque si rejoué.

- Ajoute 3 index FK manquants sur `productions_inputs`, `productions_outputs`,
  `productions_couts_indirects` (colonne `production_id`).
- Ajoute la colonne `products.tva_taux numeric not null default 5.5`
  (lignes existantes héritent du default ; à ajuster pour boissons/bazar à 20%).

### 2. `supabase/migrations/0025_productions_kpi.sql`
- Crée la vue `public.v_productions_kpi` avec `security_invoker = true`
  (respecte les RLS de l'appelant).
- 3 CTEs (`inputs`, `couts`, `outputs`) pour pré-agréger et éviter le N+1 ;
  join sur `products.tva_taux` pour calculer le HT depuis le TTC.
- Colonnes exposées : `id`, `lot_numero`, `date_production`, `recette`,
  `cout_matieres`, `cout_indirects`, `cout_total`, `ca_potentiel_ttc`,
  `ca_potentiel_ht`, `input_total_qty`, `output_total_qty`, `rendement_pct`,
  `marge_eur_ht`, `marge_pct_ht`. Filtre `statut = 'terminee'`.
- Guards `NULLIF` sur tous les dénominateurs → renvoie `NULL` au lieu de
  `division_by_zero`.

> ⚠️ La migration **0024 n'est pas commitée dans ce repo** (appliquée
> directement sur Supabase). Les noms de colonnes des tables `productions_*`
> sont supposés (`prix_unitaire`, `prix_vente_unitaire_ttc`, `montant`,
> `quantite`, `recette`, `lot_numero`, `date_production`, `statut`). Vérifier
> dans le SQL Editor avant exécution et ajuster les 3 CTEs si nécessaire.

### 3. `supabase/migrations/0027_setup_comptes_equipe.sql`
Prérequis indispensable au module Drive Pro : aligne les rôles existants
et fournit l'outil de promotion pour les futurs comptes.

- **Section 1** : `UPDATE` des 2 ZBAIRI (`zbairi.mohamed@…` et
  `mohamed.zbairi@…`) de `admin` → `manager`.
- **Section 2** : `CHECK` sur `profiles.role IN ('admin','manager','employee','customer')`.
- **Section 3** : fonction `public.set_user_role(p_email text, p_role text)`
  `SECURITY DEFINER`, `search_path = public`. Valide le rôle, vérifie que
  l'appelant est admin (via `auth.uid()`), update et lève une exception
  claire si aucun email ne matche. `EXECUTE` révoqué de PUBLIC, accordé
  à `authenticated`.
- **Section 4** : bloc commenté listant les 3 comptes à créer
  manuellement (Mohamed Belhamiti, Otmane, Ahmed).

### 4. `supabase/migrations/0025_drive_pro.sql`
Module B2B complet, 4 tables. Sections numérotées 1→12 dans le fichier.

- **Schéma corrigé** : FK vers `products(id)` et `profiles(id)` ;
  `delegue_user_id uuid references profiles(id)` (clé pour les RLS) ;
  IBAN supprimé, remplacé par `mandat_sepa_id text`.
- **`produits_pro_prix.actif`** + index unique partiel
  `where actif = true` sur `produit_id` → un seul tarif Pro actif par produit.
- **`commandes_pro_lignes`** : `quantite_par_conditionnement` dénormalisée,
  `quantite_unitaire_totale` et `prix_ht_total` en `generated always as … stored`.
- **Séquences** `seq_commande_pro_2026` / `seq_facture_2026` + triggers
  `BEFORE INSERT` (CP-2026-XXXX) et `BEFORE UPDATE` à la transition
  `→ facturee` (F-2026-XXXX). Atomique via `nextval`.
- **CHECK** sur tous les statuts/enums (`comptes_pro.statut`,
  `comptes_pro.conditions_paiement`, `commandes_pro.statut`,
  `commandes_pro.type_recuperation`, `commandes_pro.mode_paiement`).
- **TVA ligne** : trigger `BEFORE INSERT` qui copie `products.tva_taux` si
  `new.tva_taux IS NULL` (lève si introuvable). Pas de default hardcodé.
- **Encours auto** : trigger `AFTER INSERT/UPDATE/DELETE` sur `commandes_pro`
  qui recalcule `comptes_pro.encours_actuel = Σ TTC` des commandes
  `statut NOT IN ('payee','annulee')`. Gère le cas UPDATE qui change
  `compte_pro_id` (les deux comptes sont recalculés).
- **`updated_at`** sur `comptes_pro` et `commandes_pro` via la fonction
  `update_updated_at_column()` déjà créée par la migration profiles.
- **Indexes** : `comptes_pro(delegue_user_id)`, `comptes_pro(statut)`,
  `commandes_pro(compte_pro_id, statut)`, `commandes_pro(date_echeance)
  where statut not in ('payee','annulee')`,
  `commandes_pro_lignes(commande_pro_id)`,
  `produits_pro_prix(produit_id) where actif = true` (unique).
- **RLS activée sur les 4 tables** :
  - `comptes_pro` — SELECT pour `auth.uid() = delegue_user_id`, ALL pour
    `profiles.role IN ('admin','manager')`.
  - `commandes_pro` + `commandes_pro_lignes` — SELECT via EXISTS join
    `comptes_pro` filtré sur délégué, ALL pour admin/manager.
  - `produits_pro_prix` — SELECT pour tout user ayant un `comptes_pro` actif
    dont il est délégué, ALL pour admin/manager.

---

## Étapes manuelles d'application

URL SQL Editor Supabase :
`https://supabase.com/dashboard/project/<PROJECT_REF>/sql/new`

**Ordre impératif** (chaque étape attend la précédente) :

1. **`0024b_fixes_production.sql`**
   - Copier le contenu dans le SQL Editor → Run.
   - Préalable : la migration 0024 (productions_*) doit déjà être appliquée.
   - Idempotent : aucun risque à rejouer.

2. **`0025_productions_kpi.sql`**
   - Avant Run : ouvrir l'onglet Database → Tables → `productions_inputs`,
     `productions_outputs`, `productions_couts_indirects` et vérifier que les
     colonnes attendues existent avec les bons noms (cf. bloc d'hypothèses en
     tête du fichier).
   - Ajuster les noms dans les 3 CTEs si nécessaire, puis Run.
   - Test rapide : `select * from v_productions_kpi limit 5;`

3. **`0027_setup_comptes_equipe.sql`** — **PRÉREQUIS DRIVE PRO**
   - Copier dans le SQL Editor → Run.
   - Vérifier après Run :
     ```sql
     select email, role from public.profiles
     where email like '%zbairi%' or email like '%salamarket31%';
     -- attendu : les 2 ZBAIRI en role='manager'
     ```
   - **Post-application** — créer les 3 comptes équipe manquants :
     1. Dashboard Supabase → Authentication → Users → **Add user** (× 3) :
        - Mohamed Belhamiti : email à confirmer avec lui
        - Otmane : email à confirmer avec lui
        - Ahmed : email à confirmer avec lui
        Le trigger `handle_new_user` crée automatiquement la ligne
        `profiles` avec `role='customer'`.
     2. Promouvoir chaque compte avec la fonction utilitaire :
        ```sql
        select public.set_user_role('mohamed.belhamiti@xxx.fr', 'admin');
        select public.set_user_role('otmane@xxx.fr',            'admin');
        select public.set_user_role('ahmed@xxx.fr',             'admin');
        ```
        ⚠️ `set_user_role` exige que l'appelant soit déjà `admin` dans
        `profiles`. Si exécuté depuis le SQL Editor du dashboard (qui
        bypass auth via service_role), la vérif `auth.uid()` retournera
        NULL et l'exception sera levée. Dans ce cas, faire le UPDATE
        direct via SQL Editor en service_role :
        ```sql
        update public.profiles set role='admin', updated_at=now()
        where email='otmane@xxx.fr';
        ```

4. **`0025_drive_pro.sql`** — DERNIER, dépend de 0027 (rôle `manager`
   valide + 2 ZBAIRI déjà en `manager`).
   - Copier dans le SQL Editor → Run.
   - Smoke test :
     ```sql
     -- doit retourner 0 lignes pour un user anon
     select count(*) from comptes_pro;
     -- vérifier les séquences
     select nextval('seq_commande_pro_2026');  -- → 1
     -- vérifier les triggers
     select trigger_name, event_object_table
     from information_schema.triggers
     where trigger_schema='public'
       and event_object_table in ('comptes_pro','commandes_pro','commandes_pro_lignes');
     ```

---

## Hors scope (à faire après ces 4 migrations)

- Rollback files : pas demandés mais utile pour la prod. À générer si besoin.
- Tests d'intégration : un fichier `supabase/tests/drive_pro.sql` avec pgTAP
  pour valider RLS + numérotation + recalc encours.
- Seed Pro : `produits_pro_prix` initiaux + 1 compte de démo.
- Frontend : le module B2B n'a aucun code applicatif (routes, hooks,
  composants) pour l'instant. La DB seule ne suffit pas.

---

## Push

Pas tenté (auth GitHub cassée, connu). Les commits sont locaux sur `main`.
À pusher manuellement quand l'auth sera rétablie :
```
git push origin main
```
