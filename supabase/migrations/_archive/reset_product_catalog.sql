-- ⚠️ MIGRATION DESTRUCTIVE — à exécuter dans Lovable Cloud → SQL Editor
--
-- Contexte
-- ────────
-- Le seed initial (migration 20260428024903_*.sql) contenait 12 produits
-- placeholder qui ne correspondent pas aux 12 vraies photos déposées dans
-- public/products/. Conséquence : 4 produits seulement ont reçu la bonne
-- photo via update_product_images.sql, 1 a reçu une photo erronée
-- (Huile d'olive → olives-noires.jpg), 7 sont restés sur leur placeholder
-- distant, et 7 photos sont orphelines.
--
-- Cette migration RESET le catalogue et le ré-aligne exactement sur les
-- 12 photos disponibles dans /products/.
--
-- Effet de bord
-- ─────────────
-- DELETE FROM public.products supprime tous les produits existants. Les
-- commandes (`orders`) ne sont pas affectées : leurs `items` (jsonb) sont
-- dénormalisés (name + prix copiés à la création de la commande), pas de
-- foreign key vers products.id. Si une commande référence un product_id
-- supprimé, l'historique reste intact mais un éventuel re-add au panier
-- échouera (le produit n'existe plus). Acceptable pour un reset catalogue
-- pré-pitch.
--
-- Si tu veux conserver les anciens produits ET ajouter les nouveaux,
-- commente le DELETE ci-dessous et lance uniquement les INSERT (les noms
-- sont uniques pour cette session, mais sans contrainte unique en DB tu
-- pourrais avoir des doublons à terme).

begin;

delete from public.products;

insert into public.products (name, description, price_cents, unit, category, image_url, in_stock) values
('Entrecôte de bœuf',         'Entrecôte tendre, certifiée halal, élevage français.',                 1890, 'kg',    'boucherie',   '/products/entrecote-boeuf.jpg',     true),
('Escalope de poulet',        'Filet de poulet fermier label rouge, halal.',                          1290, 'kg',    'boucherie',   '/products/escalope-poulet.jpg',     true),
('Côtelettes d''agneau',      'Côtelettes d''agneau halal, viande tendre.',                           2490, 'kg',    'boucherie',   '/products/cotelettes-agneau.jpg',   true),
('Merguez maison',            'Merguez artisanales préparées en magasin, épicées, halal.',            1450, 'kg',    'charcuterie', '/products/merguez-maison.jpg',      true),
('Merguez douce',             'Variante douce de nos merguez maison, idéale pour les enfants.',       1450, 'kg',    'charcuterie', '/products/merguez-douce.jpg',       true),
('Boulettes de bœuf',         'Boulettes de bœuf maison, prêtes à cuire.',                            1290, 'kg',    'charcuterie', '/products/boulettes-boeuf.jpg',     true),
('Pavé de saumon',            'Saumon frais, pêche durable.',                                         2490, 'kg',    'frais',       '/products/saumon.jpg',              true),
('Houmous traditionnel',      'Houmous frais préparé chaque jour.',                                    399, 'piece', 'frais',       '/products/houmous.jpg',             true),
('Olives noires',             'Olives noires marinées, origine Méditerranée.',                         549, 'piece', 'epicerie',    '/products/olives-noires.jpg',       true),
('Dattes Medjool',            'Dattes Medjool premium, douces et charnues.',                           990, 'pack',  'epicerie',    '/products/dattes-medjool.jpg',      true),
('Jus de pomme artisanal 1L', 'Jus de pomme pressé, sans sucre ajouté.',                               349, 'piece', 'boissons',    '/products/jus-pomme.jpg',           true),
('Liquide vaisselle',         'Liquide vaisselle écolabel, 750ml.',                                    399, 'piece', 'bazar',       '/products/liquide-vaisselle.jpg',   true);

commit;

-- Vérification : les 12 lignes doivent toutes avoir une image_url qui
-- commence par "/products/".
select name, category, price_cents, image_url
from public.products
order by category, name;
