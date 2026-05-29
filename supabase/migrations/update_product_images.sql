-- Migration manuelle : mise à jour des URLs d'images produits.
-- À exécuter dans Lovable Cloud → SQL Editor.
-- Source des fichiers : public/products/*.jpg (commités dans cette PR).
--
-- Convention de matching :
--   - ilike '%motif%' (case-insensitive)
--   - patterns spécifiques d'abord (ex. merguez douce avant merguez générique)
--   - patterns AND quand pertinent pour désambiguïser

-- ── BOUCHERIE ────────────────────────────────────────────────────────────
update public.products
set image_url = '/products/entrecote-boeuf.jpg'
where name ilike '%entrecôte%' or name ilike '%entrecote%';

update public.products
set image_url = '/products/escalope-poulet.jpg'
where name ilike '%escalope%';

update public.products
set image_url = '/products/cotelettes-agneau.jpg'
where (name ilike '%côtelette%' or name ilike '%cotelette%')
  and name ilike '%agneau%';

-- merguez : variantes douce / maison — la plus spécifique d'abord
update public.products
set image_url = '/products/merguez-douce.jpg'
where name ilike '%merguez%' and (name ilike '%douce%' or name ilike '%doux%');

update public.products
set image_url = '/products/merguez-maison.jpg'
where name ilike '%merguez%' and not (name ilike '%douce%' or name ilike '%doux%');

update public.products
set image_url = '/products/boulettes-boeuf.jpg'
where name ilike '%boulette%';

update public.products
set image_url = '/products/saumon.jpg'
where name ilike '%saumon%';

-- ── BAZAR / HYGIÈNE ──────────────────────────────────────────────────────
update public.products
set image_url = '/products/liquide-vaisselle.jpg'
where name ilike '%vaisselle%';

-- ── BOISSONS ─────────────────────────────────────────────────────────────
update public.products
set image_url = '/products/jus-pomme.jpg'
where (name ilike '%jus%' and name ilike '%pomme%')
   or (name ilike '%pomme%' and category ilike '%boisson%');

-- ── ÉPICERIE ─────────────────────────────────────────────────────────────
update public.products
set image_url = '/products/olives-noires.jpg'
where name ilike '%olive%' and (name ilike '%noir%' or name not ilike '%vert%');

update public.products
set image_url = '/products/houmous.jpg'
where name ilike '%houmous%' or name ilike '%hummus%';

update public.products
set image_url = '/products/dattes-medjool.jpg'
where name ilike '%datte%';

-- ── VÉRIFICATION ─────────────────────────────────────────────────────────
-- Run cette requête pour vérifier le résultat — chaque produit doit avoir
-- une image_url qui commence par "/products/".
select name, category, image_url
from public.products
order by category, name;
