-- =====================================================================
-- 0030_seed_drive_au_poids.sql
-- Seeds catalogue : 3 produits weight + 1 weight_bracket pour la démo.
--
-- Date : 2026-05-16
-- Démo client : 2026-06-10
-- Prérequis : migration 0029 appliquée (colonnes unit_type/price_per_kg/
-- poids_min_kg/poids_max_kg sur products ET produits, table depots
-- créée par 0001_init.sql côté salam-stock).
-- =====================================================================
--
-- ⚠ SANITY CHECKS — à lancer manuellement dans le SQL Editor AVANT
-- d'exécuter ce script :
--
-- 1) Vérifier la nature de products (view vs table) :
--    select
--      (select count(*) from products) as products_count,
--      (select count(*) from produits) as produits_count,
--      (select count(*) from information_schema.views
--        where table_schema='public' and table_name='products') as products_is_view;
--
--    → products_is_view = 1 attendu (commit salam-stock 779656f).
--      Si 0, products est une table physique séparée — il faudra alors
--      DUPLIQUER les seeds dans products (cf. bloc B en fin de fichier
--      qui est commenté par défaut).
--
-- 2) Vérifier qu'il y a au moins 1 dépôt :
--    select id, nom, type, is_active from public.depots order by created_at limit 5;
--
--    → Si vide, le bloc Section 1 ci-dessous insère un dépôt par défaut.
--
-- 3) Identifier la FK commandes_drive_lignes.produit_id :
--    select tc.constraint_name, kcu.column_name,
--           ccu.table_name as foreign_table, ccu.column_name as foreign_column
--      from information_schema.table_constraints tc
--      join information_schema.key_column_usage kcu
--        on tc.constraint_name = kcu.constraint_name
--      join information_schema.constraint_column_usage ccu
--        on ccu.constraint_name = tc.constraint_name
--     where tc.table_schema='public'
--       and tc.table_name='commandes_drive_lignes'
--       and tc.constraint_type='FOREIGN KEY';
--
--    → produit_id doit pointer vers produits(id), pas products(id).
--      Si ce n'est pas le cas, NE PAS exécuter ce seed sans adaptation.
--
-- Si les 3 checks renvoient les valeurs attendues : exécuter ce script
-- d'un seul coup (BEGIN/COMMIT). Idempotent : peut être rejoué sans
-- effet de bord (ON CONFLICT DO UPDATE partout).
-- =====================================================================

begin;

-- ════════════════════════════════════════════════════════════════════
-- SECTION 1 — Dépôt par défaut "Salam Toulouse" (si la table est vide)
-- ════════════════════════════════════════════════════════════════════
-- Le frontend ET l'Edge Function create-checkout-session prennent le
-- premier depot par created_at ASC. On garantit ici qu'au moins un
-- depot existe en DB pour ne pas faire throw l'Edge Function avec
-- "Aucun dépôt configuré".

insert into public.depots (nom, type, adresse, is_active)
select 'Salam Toulouse', 'point_vente', '8 av. Larrieu-Thibaud, 31100 Toulouse', true
where not exists (select 1 from public.depots);


-- ════════════════════════════════════════════════════════════════════
-- SECTION 2 — Produits weight (kg) sur produits (FR canonical)
-- ════════════════════════════════════════════════════════════════════
-- On seed exclusivement dans `produits` car la FK
-- commandes_drive_lignes.produit_id → produits(id) (check sanity #3).
-- La table/view `products` côté salamarket-drive sera mise à jour
-- automatiquement si c'est une view (check sanity #1).
--
-- Clé naturelle pour ON CONFLICT : on suppose `nom` unique-ish pour
-- ces 4 produits seed. Si `produits` a une contrainte unique sur
-- (ean) on pourrait l'utiliser, mais nos seeds n'ont pas d'EAN.
-- Donc on utilise un UUID déterministe pour éviter les doublons sur
-- re-run, avec ON CONFLICT (id) DO UPDATE.

insert into public.produits
  (id, ean, nom, marque, categorie, sous_categorie, image_url, description,
   unit_type, price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg)
values
  (
    '00000000-0030-0000-0000-000000000001'::uuid,
    null,
    'Merguez Salam Maison',
    'Salam Maison',
    'boucherie',
    'merguez',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Merguez',
    'Merguez artisanale agneau-bœuf, épices traditionnelles, vente au poids',
    'weight', 22, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000002'::uuid,
    null,
    'Kefta Agneau',
    'Salam Maison',
    'boucherie',
    'kefta',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Kefta',
    'Boulettes d''agneau aux herbes et épices, format 30g pièce, vente au poids',
    'weight', 18, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000003'::uuid,
    null,
    'Brochettes Poulet Marinées',
    'Salam Maison',
    'volaille',
    'brochettes',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Brochettes',
    'Brochettes poulet halal marinées yaourt-citron-épices, 6 dés par pique, vente au poids',
    'weight', 16, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000004'::uuid,
    null,
    'Poulet fermier entier',
    'Salam Maison',
    'volaille',
    'poulet entier',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Poulet',
    'Poulet fermier halal, élevé en plein air, 1,2 à 1,5 kg — prix forfait',
    -- weight_bracket : prix forfait (price_cents ne s'applique pas
    -- côté UI weight_bracket, mais price_cents existe quand même sur
    -- produits ? Non, produits n'a pas price_cents. Le prix est géré
    -- côté products (view). Le bracket V1 lit price_cents depuis la
    -- view products → produits. On note ici : si products est une
    -- view simple, il faudra peut-être que la view expose un
    -- price_cents par défaut. À voir au sanity check #1.
    'weight_bracket', null, null, 1.2, 1.5
  )
on conflict (id) do update set
  nom                   = excluded.nom,
  marque                = excluded.marque,
  categorie             = excluded.categorie,
  sous_categorie        = excluded.sous_categorie,
  image_url             = excluded.image_url,
  description           = excluded.description,
  unit_type             = excluded.unit_type,
  price_per_kg          = excluded.price_per_kg,
  estimated_weight_kg   = excluded.estimated_weight_kg,
  poids_min_kg          = excluded.poids_min_kg,
  poids_max_kg          = excluded.poids_max_kg,
  updated_at            = now();


-- ════════════════════════════════════════════════════════════════════
-- SECTION 3 — Stock initial des seeds (sur le dépôt par défaut)
-- ════════════════════════════════════════════════════════════════════
-- commandes_drive_lignes.depot_id → depots(id) NOT NULL.
-- Pour que le préparateur puisse "trouver" le produit en stock, on
-- crée des lignes de stock (50 kg par produit weight, 5 unités pour
-- le bracket). Quantités confortables pour les tests démo.
--
-- Idempotent : ON CONFLICT (produit_id, depot_id) DO UPDATE.

insert into public.stock_par_depot (produit_id, depot_id, quantite, prix_vente)
select
  p.id,
  d.id,
  case
    when p.unit_type = 'weight'         then 50    -- 50 kg
    when p.unit_type = 'weight_bracket' then 5     -- 5 pièces
    else 10
  end as quantite,
  case
    when p.unit_type = 'weight'         then p.price_per_kg
    when p.unit_type = 'weight_bracket' then 15      -- prix forfait
    else null
  end as prix_vente
from public.produits p
cross join lateral (
  select id from public.depots order by created_at asc limit 1
) d
where p.id in (
  '00000000-0030-0000-0000-000000000001'::uuid,
  '00000000-0030-0000-0000-000000000002'::uuid,
  '00000000-0030-0000-0000-000000000003'::uuid,
  '00000000-0030-0000-0000-000000000004'::uuid
)
on conflict (produit_id, depot_id) do update set
  quantite   = excluded.quantite,
  prix_vente = excluded.prix_vente;


-- ════════════════════════════════════════════════════════════════════
-- SECTION 4 — Bloc B — seed direct dans `products` (table EN)
-- ════════════════════════════════════════════════════════════════════
-- ACTIVÉ : sanity check #1 a confirmé que `products` est une TABLE
-- physique distincte de `produits` (les deux sont des BASE TABLE, pas
-- de view). Il faut donc dupliquer les seeds pour que les hooks
-- salamarket-drive (qui lisent products EN) trouvent les 4 produits.
--
-- UUIDs IDENTIQUES à ceux du Bloc A : indispensable pour que :
--   - le frontend (lit products EN) et la FK
--     commandes_drive_lignes.produit_id (→ produits FR) référencent
--     le MÊME id côté backend
--   - l'Edge Function passe `product_id` directement dans
--     commandes_drive_lignes.produit_id sans mapping
--
-- price_cents :
--   - weight (Merguez/Kefta/Brochettes) : 0 — non lu en pratique
--     (ProductCard lit pricePerKg, Edge Function utilise pricePerKg ×
--     qtyKg). Le 0 satisfait juste la NOT NULL + CHECK >= 0.
--   - weight_bracket (Poulet) : 1500 — c'est le prix forfait, lu par
--     getBrackets() côté frontend ET par l'Edge Function pour le
--     calcul `lineCents = p.price_cents × quantity`.

insert into public.products
  (id, name, description, price_cents, unit, category, image_url, in_stock,
   unit_type, price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg)
values
  (
    '00000000-0030-0000-0000-000000000001'::uuid,
    'Merguez Salam Maison',
    'Merguez artisanale agneau-bœuf, épices traditionnelles, vente au poids',
    0,            -- price_cents : non lu pour weight, satisfait CHECK >= 0
    'kg',
    'boucherie',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Merguez',
    true,
    'weight', 22, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000002'::uuid,
    'Kefta Agneau',
    'Boulettes d''agneau aux herbes et épices, format 30g pièce, vente au poids',
    0,
    'kg',
    'boucherie',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Kefta',
    true,
    'weight', 18, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000003'::uuid,
    'Brochettes Poulet Marinées',
    'Brochettes poulet halal marinées yaourt-citron-épices, 6 dés par pique, vente au poids',
    0,
    'kg',
    'boucherie',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Brochettes',
    true,
    'weight', 16, 1, null, null
  ),
  (
    '00000000-0030-0000-0000-000000000004'::uuid,
    'Poulet fermier entier',
    'Poulet fermier halal, élevé en plein air, 1,2 à 1,5 kg — prix forfait',
    1500,         -- price_cents = 15 € : prix forfait du bracket
    'piece',
    'boucherie',
    'https://placehold.co/400x400/0F4C3A/D4A574/png?text=Poulet',
    true,
    'weight_bracket', null, null, 1.2, 1.5
  )
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  price_cents         = excluded.price_cents,
  unit                = excluded.unit,
  category            = excluded.category,
  image_url           = excluded.image_url,
  in_stock            = excluded.in_stock,
  unit_type           = excluded.unit_type,
  price_per_kg        = excluded.price_per_kg,
  estimated_weight_kg = excluded.estimated_weight_kg,
  poids_min_kg        = excluded.poids_min_kg,
  poids_max_kg        = excluded.poids_max_kg,
  updated_at          = now();


-- ════════════════════════════════════════════════════════════════════
-- SECTION 5 — Vérification post-application
-- ════════════════════════════════════════════════════════════════════

-- 5a — Compte les seeds dans produits (FR canonical)
select
  'produits' as source,
  count(*) filter (where unit_type = 'weight')          as nb_weight,
  count(*) filter (where unit_type = 'weight_bracket')  as nb_bracket,
  count(*) filter (where unit_type = 'unit')            as nb_unit_legacy,
  count(*)                                              as nb_total
from public.produits
where id in (
  '00000000-0030-0000-0000-000000000001'::uuid,
  '00000000-0030-0000-0000-000000000002'::uuid,
  '00000000-0030-0000-0000-000000000003'::uuid,
  '00000000-0030-0000-0000-000000000004'::uuid
);
-- Attendu : nb_weight=3, nb_bracket=1, nb_unit_legacy=0, nb_total=4.

-- 5b — Compte les seeds dans products (EN, lu par salamarket-drive)
select
  'products' as source,
  count(*) filter (where unit_type = 'weight')          as nb_weight,
  count(*) filter (where unit_type = 'weight_bracket')  as nb_bracket,
  count(*) filter (where unit_type = 'unit')            as nb_unit_legacy,
  count(*)                                              as nb_total
from public.products
where id in (
  '00000000-0030-0000-0000-000000000001'::uuid,
  '00000000-0030-0000-0000-000000000002'::uuid,
  '00000000-0030-0000-0000-000000000003'::uuid,
  '00000000-0030-0000-0000-000000000004'::uuid
);
-- Attendu : nb_weight=3, nb_bracket=1, nb_unit_legacy=0, nb_total=4.

-- 5c — Confirme que les UUIDs matchent entre les 2 tables
-- (critique pour la FK commandes_drive_lignes.produit_id → produits)
select
  count(*) as uuids_alignes
from public.products pr
join public.produits p on p.id = pr.id
where pr.id in (
  '00000000-0030-0000-0000-000000000001'::uuid,
  '00000000-0030-0000-0000-000000000002'::uuid,
  '00000000-0030-0000-0000-000000000003'::uuid,
  '00000000-0030-0000-0000-000000000004'::uuid
);
-- Attendu : uuids_alignes = 4.

-- 5d — Vérifie le dépôt par défaut
select id, nom, type, is_active
  from public.depots
 order by created_at asc
 limit 1;

-- 5e — Vérifie le stock initial
select p.nom, d.nom as depot, s.quantite, s.prix_vente
  from public.stock_par_depot s
  join public.produits p on p.id = s.produit_id
  join public.depots d on d.id = s.depot_id
 where p.id in (
   '00000000-0030-0000-0000-000000000001'::uuid,
   '00000000-0030-0000-0000-000000000002'::uuid,
   '00000000-0030-0000-0000-000000000003'::uuid,
   '00000000-0030-0000-0000-000000000004'::uuid
 )
 order by p.nom;
-- Attendu : 4 lignes, quantités 50/50/50/5.

commit;
