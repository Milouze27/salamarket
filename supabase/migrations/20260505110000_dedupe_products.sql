-- ─────────────────────────────────────────────────────────────────────
-- Nettoyage des doublons produits (suite à exécution multiple de la
-- migration 20260505100000_add_test_products.sql)
-- ─────────────────────────────────────────────────────────────────────
--
-- Garde le PLUS ANCIEN par nom (ROW_NUMBER ordered by created_at ASC),
-- supprime les autres. Idempotent : un re-run ne supprime rien si plus
-- de doublons.
--
-- Bonus : ajoute une CONSTRAINT UNIQUE sur (name) pour empêcher tout
-- doublon futur (ON CONFLICT DO NOTHING utilisable dans les imports).

with ranked as (
  select id,
         name,
         row_number() over (partition by name order by created_at asc, id asc) as rn
  from public.products
)
delete from public.products
where id in (
  select id from ranked where rn > 1
);

-- Empêche les doublons futurs au niveau base (defense in depth)
alter table public.products
  drop constraint if exists products_name_unique;

alter table public.products
  add constraint products_name_unique unique (name);

-- Vérification post-migration
-- select name, count(*) as count from public.products
-- group by name having count(*) > 1;
-- → doit retourner 0 ligne
