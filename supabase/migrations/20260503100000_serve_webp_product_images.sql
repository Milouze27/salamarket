-- ─────────────────────────────────────────────────────────────────────
-- PERF FIX — Servir les versions WebP des images produits
-- ─────────────────────────────────────────────────────────────────────
--
-- Avant : image_url pointait sur .jpg de 2-3 MB chacune. Sur mobile
-- 4G ce sont ~400ms par image perçues par l'utilisateur (signalé par
-- l'utilisateur 2026-05-03).
--
-- Les versions .webp existent déjà dans public/products/ (générées
-- précédemment, taille 60-270 KB chacune, soit ~17× plus petit que
-- les JPG sources).
--
-- Cette migration bascule simplement le suffixe d'extension. iOS
-- Safari supporte WebP depuis iOS 14 (sept. 2020), tous les browsers
-- modernes le supportent → pas besoin de <picture> fallback.
--
-- Idempotent : un re-run ne réagit que sur les .jpg restants.

update public.products
set image_url = regexp_replace(image_url, '\.jpg$', '.webp'),
    updated_at = now()
where image_url like '/products/%.jpg';

-- Vérification : doit retourner 0 ligne après la migration
select count(*) as remaining_jpg_count
from public.products
where image_url like '%.jpg';

-- Aperçu des URLs après migration
select name, image_url
from public.products
order by name;
