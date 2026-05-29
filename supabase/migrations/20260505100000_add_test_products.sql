-- ─────────────────────────────────────────────────────────────────────
-- Ajout des 8 produits "test" fournis par l'utilisateur 2026-05-05
-- ─────────────────────────────────────────────────────────────────────
--
-- Photos sources : public/products/*.png (mises à jour dans le même PR).
-- Catégories valides : boucherie, charcuterie, epicerie, frais, surgele,
--                      fruits-legumes, boissons, bazar
--
-- Prix calibrés sur le marché halal Toulouse (2025-2026) pour rester
-- crédibles : couscous Dari 500g ~2€, sucre 1kg ~1.50€, sodas 1.5L ~2.50€,
-- canettes 275ml ~1.60€, sauce gourmet 950g ~6€.

insert into public.products (name, description, price_cents, unit, category, image_url, in_stock) values
  (
    'Bananes Vrac',
    'Bananes mûres à point, vendues au kilo. Idéales pour vos en-cas et smoothies.',
    219,
    'kg',
    'fruits-legumes',
    '/products/bananes-vrac.png',
    true
  ),
  (
    'Couscous fin Dari 500g',
    'Semoule de blé dur extra-fine, qualité supérieure marque Dari. Cuisson rapide.',
    199,
    'pack',
    'epicerie',
    '/products/dari-couscous-fin-500g.png',
    true
  ),
  (
    'Sucre en poudre Didon 1kg',
    'Sucre blanc cristallisé en poudre fine, marque Didon. Pour pâtisseries et boissons.',
    149,
    'pack',
    'epicerie',
    '/products/didon-sucre-poudre-1kg.png',
    true
  ),
  (
    'Lait fermenté Elben 1L',
    'Lait fermenté traditionnel maghrébin, rafraîchissant et riche en probiotiques.',
    199,
    'piece',
    'frais',
    '/products/elben-lait-fermente-1l.png',
    true
  ),
  (
    'Fanta Orange 1.5L',
    'Boisson gazeuse à l''orange, format familial 1.5L. À servir bien fraîche.',
    249,
    'piece',
    'boissons',
    '/products/fanta-orange-1-5l.png',
    true
  ),
  (
    'Freez Grenadine 275ml',
    'Boisson gazeuse Freez parfum grenadine, canette 275ml. Sans alcool.',
    159,
    'piece',
    'boissons',
    '/products/freez-grenadine-275ml.png',
    true
  ),
  (
    'Freez Litchi 275ml',
    'Boisson gazeuse Freez parfum litchi exotique, canette 275ml. Sans alcool.',
    159,
    'piece',
    'boissons',
    '/products/freez-litchi-275ml.png',
    true
  ),
  (
    'Sauce algérienne Nawhal''s 950g',
    'Sauce algérienne onctueuse marque Nawhal''s, recette traditionnelle. Parfaite pour grillades, sandwichs et tacos.',
    599,
    'piece',
    'epicerie',
    '/products/nawhals-sauce-algerienne-950g.png',
    true
  );

-- Vérification (à lancer manuellement post-migration)
-- select name, category, price_cents, image_url from public.products
-- where image_url like '/products/%' order by created_at desc limit 12;
