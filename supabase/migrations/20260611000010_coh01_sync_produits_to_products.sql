-- ─────────────────────────────────────────────────────────────────────
-- COH-01 — Catalogue cohérent : SYNC `produits` (Stock, vérité) → `products`
-- (table physique lue par le Drive). Décision documentée ci-dessous.
--
-- Contexte (finding P0 COH-01) :
--   - Le Drive lit la table `public.products` (16 lignes : useProducts.ts /
--     useProduct.ts / Orders.tsx). Aucune écriture applicative dessus.
--   - Le Stock pilote `public.produits` (61 lignes, colonnes nom /
--     prix_drive_cents / visible_drive / drive_category / image_drive_url…).
--   - Les 16 ids de `products` sont TOUS présents dans `produits` (mêmes
--     UUID), mais les 40 autres produits visibles Drive (visible_drive=true,
--     56 au total) n'existent pas dans `products` → invisibles au Drive.
--   - Conséquence : /produit/<id d'un produit Stock> => « Produit
--     introuvable » ; catalogue Drive amputé et catégories incohérentes.
--
-- Pourquoi PAS une fusion destructive / une VUE (choix SAFE, nuit) :
--   `public.products` est la cible de DEUX clés étrangères :
--     - commandes_pro_lignes.produit_id  -> products.id
--     - produits_pro_prix.produit_id     -> products.id
--   On ne peut pas remplacer une table référencée par une vue, et DROP est
--   destructif (interdit la nuit). On GARDE donc `products` comme table
--   cible des FK et comme source du Drive, et on la tient SYNCHRONISÉE
--   à partir de `produits` (source de vérité Stock).
--
-- Mécanique :
--   1. fonction sync_produit_to_products() : upsert d'une ligne `produits`
--      visible_drive=true vers `products` (mapping colonnes + dérivation
--      in_stock) ; si visible_drive bascule à false, on passe in_stock=false
--      dans `products` (le produit sort du catalogue sans casser ses FK).
--   2. trigger AFTER INSERT/UPDATE sur `produits` → garde les 2 tables
--      cohérentes en continu (prix, catégorie, image, dispo).
--   3. backfill one-shot : rejoue la sync sur toutes les lignes existantes.
--
-- Append-only, idempotent (create or replace + upsert).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.sync_produit_to_products()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.visible_drive, false) = true then
    -- Produit visible au Drive : upsert dans `products` avec le mapping
    -- des colonnes Drive de `produits`.
    insert into public.products as t (
      id, name, description, price_cents, unit, category, image_url,
      in_stock, tva_taux, unit_type,
      price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg,
      updated_at
    )
    values (
      new.id,
      new.nom,
      coalesce(new.description_drive, ''),
      coalesce(new.prix_drive_cents, 0),
      coalesce(new.drive_unit, 'piece'),
      coalesce(new.drive_category, 'epicerie'),
      coalesce(new.image_drive_url, ''),
      true,
      5.5,
      coalesce(new.unit_type, 'unit'),
      new.price_per_kg,
      new.estimated_weight_kg,
      new.poids_min_kg,
      new.poids_max_kg,
      now()
    )
    on conflict (id) do update set
      name                = excluded.name,
      description         = excluded.description,
      price_cents         = excluded.price_cents,
      unit                = excluded.unit,
      category            = excluded.category,
      image_url           = excluded.image_url,
      in_stock            = true,
      unit_type           = excluded.unit_type,
      price_per_kg        = excluded.price_per_kg,
      estimated_weight_kg = excluded.estimated_weight_kg,
      poids_min_kg        = excluded.poids_min_kg,
      poids_max_kg        = excluded.poids_max_kg,
      updated_at          = now();
  else
    -- Produit non visible au Drive : on NE supprime PAS (FK pro), on le
    -- masque du catalogue Drive en passant in_stock=false s'il existe déjà.
    update public.products
       set in_stock = false, updated_at = now()
     where id = new.id and in_stock is distinct from false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_produit_to_products on public.produits;
create trigger trg_sync_produit_to_products
  after insert or update on public.produits
  for each row
  execute function public.sync_produit_to_products();

-- ── Backfill one-shot : aligne `products` sur l'état courant de `produits`.
-- 1) upsert toutes les lignes visibles Drive.
insert into public.products as t (
  id, name, description, price_cents, unit, category, image_url,
  in_stock, tva_taux, unit_type,
  price_per_kg, estimated_weight_kg, poids_min_kg, poids_max_kg,
  updated_at
)
select
  p.id,
  p.nom,
  coalesce(p.description_drive, ''),
  coalesce(p.prix_drive_cents, 0),
  coalesce(p.drive_unit, 'piece'),
  coalesce(p.drive_category, 'epicerie'),
  coalesce(p.image_drive_url, ''),
  true,
  5.5,
  coalesce(p.unit_type, 'unit'),
  p.price_per_kg,
  p.estimated_weight_kg,
  p.poids_min_kg,
  p.poids_max_kg,
  now()
from public.produits p
where coalesce(p.visible_drive, false) = true
on conflict (id) do update set
  name                = excluded.name,
  description         = excluded.description,
  price_cents         = excluded.price_cents,
  unit                = excluded.unit,
  category            = excluded.category,
  image_url           = excluded.image_url,
  in_stock            = true,
  unit_type           = excluded.unit_type,
  price_per_kg        = excluded.price_per_kg,
  estimated_weight_kg = excluded.estimated_weight_kg,
  poids_min_kg        = excluded.poids_min_kg,
  poids_max_kg        = excluded.poids_max_kg,
  updated_at          = now();

-- 2) masque dans `products` toute ligne dont le produit n'est plus visible
--    Drive (ex. les 4 produits boucherie démo visible_drive=false) — sans
--    casser leurs éventuelles FK pro.
update public.products t
   set in_stock = false, updated_at = now()
  from public.produits p
 where p.id = t.id
   and coalesce(p.visible_drive, false) = false
   and t.in_stock is distinct from false;
