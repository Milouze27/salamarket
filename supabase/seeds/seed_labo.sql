-- ════════════════════════════════════════════════════════════════════════════
--  seed_labo.sql — Démo Labo Salam Market (Agent 2)
--  -------------------------------------------------------------------
--  Génère 3 recettes (Merguez, Kefta, Brochettes Poulet) + 5 productions
--  terminées sur les 30 derniers jours, avec inputs / outputs / coûts
--  indirects réalistes.
--
--  ─── HYPOTHÈSES DE SCHÉMA ──────────────────────────────────────────────────
--  Schéma reconstruit depuis src/integrations/supabase/types.ts (la migration
--  0024 du repo salam-stock ne reflète PAS le schéma déployé sur
--  tltmermqodelorthtbre — version Drive divergente). Colonnes utilisées :
--
--   • recettes(id, nom, categorie, description, statut, prix_vente_ttc_unitaire)
--   • recettes_ingredients(id, recette_id, product_id NOT NULL, quantite,
--                          unite, ordre)
--   • recettes_etapes(id, recette_id, numero_etape, libelle, duree_minutes)
--   • recettes_main_oeuvre(id, recette_id, libelle, duree_minutes,
--                          taux_horaire)
--   • productions(id, recette_id, recette, lot_numero UNIQUE, date_production,
--                 statut, employe_id, notes, photo_url)
--   • productions_inputs(id, production_id, product_id NULLABLE,
--                        libelle NULLABLE, quantite, prix_unitaire)
--   • productions_outputs(id, production_id, product_id NOT NULL, quantite,
--                         prix_vente_unitaire_ttc)
--   • productions_couts_indirects(id, production_id, libelle, montant)
--
--  Conséquence : `recettes_ingredients.product_id` étant NOT NULL, on ne peut
--  pas y mettre des épices/boyaux/yaourt sans matching de produit. On adopte
--  donc la stratégie suivante :
--    – `recettes_ingredients` reçoit UNIQUEMENT les ingrédients principaux qui
--       matchent un produit existant dans `products` (viande, volaille).
--    – Les 5/6 ingrédients complets (épices, sel, ail, yaourt…) figurent dans
--       `productions_inputs` qui accepte `libelle` (texte libre) +
--       `product_id NULL`. C'est la couche "réalisée" de toute façon.
--    – Idem pour `productions_outputs.product_id` (NOT NULL) : on attache
--       l'output à un produit "voisin" du catalogue (Merguez maison, Boulettes
--       de bœuf, Escalope de poulet) faute d'avoir un produit fini dédié.
--
--  ─── ORDRE D'APPLICATION ───────────────────────────────────────────────────
--    1. Suppression idempotente (filtre lot_numero LIKE 'L2026-%' + recettes
--       par nom). Cascade SQL sur les sous-tables.
--    2. INSERT recettes (3 lignes)
--    3. INSERT recettes_ingredients (ingrédients principaux)
--    4. INSERT recettes_etapes (étapes opératoires)
--    5. INSERT recettes_main_oeuvre (lignes de main d'œuvre)
--    6. INSERT productions (5 lignes)
--    7. INSERT productions_inputs (variance ±5% par lot)
--    8. INSERT productions_outputs (rendement appliqué)
--    9. INSERT productions_couts_indirects (énergie/conso/MO)
--   10. SELECT de vérification (compteurs)
--
--  ─── ID DES RECETTES & PRODUCTIONS ─────────────────────────────────────────
--  On utilise des UUIDs déterministes pour pouvoir rejouer le seed sans
--  surprise. Si conflit, l'idempotence par lot_numero / nom les nettoie.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────────
-- 0. CLEANUP IDEMPOTENT
-- ─────────────────────────────────────────────────────────────────────────
-- Les sous-tables ont ON DELETE CASCADE depuis recettes / productions.
delete from public.productions
 where lot_numero like 'L2026-%-MER-%'
    or lot_numero like 'L2026-%-KEF-%'
    or lot_numero like 'L2026-%-BRO-%';

delete from public.recettes
 where nom in ('Merguez Salam Maison', 'Kefta Agneau',
               'Brochettes Poulet Marinées');


-- ─────────────────────────────────────────────────────────────────────────
-- 1. RECETTES
-- ─────────────────────────────────────────────────────────────────────────
-- UUIDs fixes pour pouvoir y référer dans les inserts suivants.
insert into public.recettes (id, nom, categorie, description, statut,
                             prix_vente_ttc_unitaire)
values
  ('11111111-1111-1111-1111-111111111101',
   'Merguez Salam Maison',
   'viande',
   'Merguez maison agneau-bœuf épices traditionnelles',
   'active',
   22.00),
  ('11111111-1111-1111-1111-111111111102',
   'Kefta Agneau',
   'viande',
   'Boulettes d''agneau aux herbes et épices, format 30g pièce',
   'active',
   18.00),
  ('11111111-1111-1111-1111-111111111103',
   'Brochettes Poulet Marinées',
   'volaille',
   'Brochettes poulet halal mariné yaourt-citron-épices, 6 dés par pique',
   'active',
   16.00);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. INGRÉDIENTS (uniquement ceux qui matchent un produit existant)
-- ─────────────────────────────────────────────────────────────────────────
-- Matching exécuté à runtime via sous-requête ILIKE sur products.name.
-- Les ingrédients secondaires (épices, boyaux, yaourt, citron, oignon,
-- ail, herbes) n'ont pas de match dans le catalogue Drive et sont donc
-- listés au niveau productions_inputs (libelle texte libre).

-- ── Recette 1 : Merguez ─────────────────────────────────────────
insert into public.recettes_ingredients
       (recette_id, product_id, quantite, unite, ordre)
select '11111111-1111-1111-1111-111111111101',
       p.id, 4.0, 'kg', 1
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name
 limit 1;

insert into public.recettes_ingredients
       (recette_id, product_id, quantite, unite, ordre)
select '11111111-1111-1111-1111-111111111101',
       p.id, 3.0, 'kg', 2
  from public.products p
 where p.name ilike '%bœuf%' or p.name ilike '%boeuf%'
 order by p.name
 limit 1;

-- ── Recette 2 : Kefta ───────────────────────────────────────────
insert into public.recettes_ingredients
       (recette_id, product_id, quantite, unite, ordre)
select '11111111-1111-1111-1111-111111111102',
       p.id, 5.0, 'kg', 1
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name
 limit 1;

-- ── Recette 3 : Brochettes Poulet ───────────────────────────────
insert into public.recettes_ingredients
       (recette_id, product_id, quantite, unite, ordre)
select '11111111-1111-1111-1111-111111111103',
       p.id, 6.0, 'kg', 1
  from public.products p
 where p.name ilike '%poulet%'
 order by p.name
 limit 1;


-- ─────────────────────────────────────────────────────────────────────────
-- 3. ÉTAPES
-- ─────────────────────────────────────────────────────────────────────────

-- ── Recette 1 : Merguez (6 étapes) ──────────────────────────────
insert into public.recettes_etapes
       (recette_id, numero_etape, libelle, duree_minutes)
values
  ('11111111-1111-1111-1111-111111111101', 1, 'Dégraisser et désosser les viandes', 30),
  ('11111111-1111-1111-1111-111111111101', 2, 'Hacher gros (grille 8mm)', 15),
  ('11111111-1111-1111-1111-111111111101', 3, 'Mélanger viande + épices + sel + ail', 10),
  ('11111111-1111-1111-1111-111111111101', 4, 'Repos en chambre froide (maturation arômes)', 120),
  ('11111111-1111-1111-1111-111111111101', 5, 'Embossage dans boyaux mouton', 45),
  ('11111111-1111-1111-1111-111111111101', 6, 'Tortillonnage et portionnage', 20);

-- ── Recette 2 : Kefta (4 étapes) ────────────────────────────────
insert into public.recettes_etapes
       (recette_id, numero_etape, libelle, duree_minutes)
values
  ('11111111-1111-1111-1111-111111111102', 1, 'Hachage fin (grille 4mm)', 20),
  ('11111111-1111-1111-1111-111111111102', 2, 'Mélange épices, oignon, herbes', 10),
  ('11111111-1111-1111-1111-111111111102', 3, 'Façonnage boulettes 30g pièce', 40),
  ('11111111-1111-1111-1111-111111111102', 4, 'Repos en chambre froide', 60);

-- ── Recette 3 : Brochettes Poulet (4 étapes) ────────────────────
insert into public.recettes_etapes
       (recette_id, numero_etape, libelle, duree_minutes)
values
  ('11111111-1111-1111-1111-111111111103', 1, 'Découpe dés de 25g', 30),
  ('11111111-1111-1111-1111-111111111103', 2, 'Préparation marinade yaourt-citron-épices', 15),
  ('11111111-1111-1111-1111-111111111103', 3, 'Marinage en chambre froide', 720),
  ('11111111-1111-1111-1111-111111111103', 4, 'Embrochage 6 dés par pique', 45);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. MAIN D'ŒUVRE (recette = standard / théorique)
-- ─────────────────────────────────────────────────────────────────────────

-- ── Recette 1 : Merguez ─────────────────────────────────────────
insert into public.recettes_main_oeuvre
       (recette_id, libelle, duree_minutes, taux_horaire)
values
  ('11111111-1111-1111-1111-111111111101', 'Boucher', 120, 28.00),
  ('11111111-1111-1111-1111-111111111101', 'Préparateur', 30, 22.00);

-- ── Recette 2 : Kefta ───────────────────────────────────────────
insert into public.recettes_main_oeuvre
       (recette_id, libelle, duree_minutes, taux_horaire)
values
  ('11111111-1111-1111-1111-111111111102', 'Boucher', 90, 28.00),
  ('11111111-1111-1111-1111-111111111102', 'Préparateur', 60, 22.00);

-- ── Recette 3 : Brochettes Poulet ───────────────────────────────
insert into public.recettes_main_oeuvre
       (recette_id, libelle, duree_minutes, taux_horaire)
values
  ('11111111-1111-1111-1111-111111111103', 'Préparateur', 120, 22.00);


-- ─────────────────────────────────────────────────────────────────────────
-- 5. PRODUCTIONS (5 lots terminés sur 30 derniers jours)
-- ─────────────────────────────────────────────────────────────────────────
-- Aujourd'hui = 2026-05-15. Dates générées via current_date - interval.
-- lot_numero format : L2026-MMDD-XXX-NNN
insert into public.productions
       (id, recette_id, recette, lot_numero, date_production, statut,
        notes, photo_url)
values
  -- 1. Merguez J-25 → 2026-04-20 (MMDD=0420) — rendement 88%
  ('22222222-2222-2222-2222-222222222201',
   '11111111-1111-1111-1111-111111111101',
   'Merguez Salam Maison',
   'L2026-0420-MER-001',
   (current_date - interval '25 days')::date,
   'terminee',
   'Rendement 88% — petite perte au boyautage (lot inaugural équipe).',
   null),
  -- 2. Merguez J-12 → 2026-05-03 (MMDD=0503) — rendement 92%
  ('22222222-2222-2222-2222-222222222202',
   '11111111-1111-1111-1111-111111111101',
   'Merguez Salam Maison',
   'L2026-0503-MER-002',
   (current_date - interval '12 days')::date,
   'terminee',
   'Rendement 92% — bonne tenue boyautage.',
   null),
  -- 3. Merguez J-3 → 2026-05-12 (MMDD=0512) — rendement 95%
  ('22222222-2222-2222-2222-222222222203',
   '11111111-1111-1111-1111-111111111101',
   'Merguez Salam Maison',
   'L2026-0512-MER-003',
   (current_date - interval '3 days')::date,
   'terminee',
   'Rendement 95% — process maîtrisé, aucune perte significative.',
   null),
  -- 4. Kefta J-18 → 2026-04-27 (MMDD=0427) — rendement 91%
  ('22222222-2222-2222-2222-222222222204',
   '11111111-1111-1111-1111-111111111102',
   'Kefta Agneau',
   'L2026-0427-KEF-001',
   (current_date - interval '18 days')::date,
   'terminee',
   'Rendement 91% — façonnage boulettes 30g respecté.',
   null),
  -- 5. Brochettes J-7 → 2026-05-08 (MMDD=0508) — rendement 89%
  ('22222222-2222-2222-2222-222222222205',
   '11111111-1111-1111-1111-111111111103',
   'Brochettes Poulet Marinées',
   'L2026-0508-BRO-001',
   (current_date - interval '7 days')::date,
   'terminee',
   'Rendement 89% — marinage 12h, 6 dés/pique respecté.',
   null);


-- ─────────────────────────────────────────────────────────────────────────
-- 6. INPUTS (matières consommées par lot, variance ±5%)
-- ─────────────────────────────────────────────────────────────────────────
-- Pour les ingrédients sans match dans products → libelle texte +
-- product_id NULL. Pour la viande, on resolve via ILIKE sur products.name.

-- ===== Production 1 : Merguez L2026-0420-MER-001 (variance basse) =====
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222201',
       p.id, null, 3.85, 12.00
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222201',
       p.id, null, 2.90, 9.00
  from public.products p
 where p.name ilike '%bœuf%' or p.name ilike '%boeuf%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
values
  ('22222222-2222-2222-2222-222222222201', null, 'Boyaux mouton 24/26', 48.0, 0.40),
  ('22222222-2222-2222-2222-222222222201', null, 'Épices merguez mix maison', 0.195, 35.00),
  ('22222222-2222-2222-2222-222222222201', null, 'Sel fin de cuisine', 0.052, 0.50),
  ('22222222-2222-2222-2222-222222222201', null, 'Ail frais épluché', 0.098, 6.00);

-- ===== Production 2 : Merguez L2026-0503-MER-002 (variance moyenne) =====
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222202',
       p.id, null, 4.05, 12.00
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222202',
       p.id, null, 3.10, 9.00
  from public.products p
 where p.name ilike '%bœuf%' or p.name ilike '%boeuf%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
values
  ('22222222-2222-2222-2222-222222222202', null, 'Boyaux mouton 24/26', 51.0, 0.40),
  ('22222222-2222-2222-2222-222222222202', null, 'Épices merguez mix maison', 0.205, 35.00),
  ('22222222-2222-2222-2222-222222222202', null, 'Sel fin de cuisine', 0.050, 0.50),
  ('22222222-2222-2222-2222-222222222202', null, 'Ail frais épluché', 0.102, 6.00);

-- ===== Production 3 : Merguez L2026-0512-MER-003 (variance haute) =====
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222203',
       p.id, null, 4.15, 12.00
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222203',
       p.id, null, 3.08, 9.00
  from public.products p
 where p.name ilike '%bœuf%' or p.name ilike '%boeuf%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
values
  ('22222222-2222-2222-2222-222222222203', null, 'Boyaux mouton 24/26', 52.0, 0.40),
  ('22222222-2222-2222-2222-222222222203', null, 'Épices merguez mix maison', 0.200, 35.00),
  ('22222222-2222-2222-2222-222222222203', null, 'Sel fin de cuisine', 0.051, 0.50),
  ('22222222-2222-2222-2222-222222222203', null, 'Ail frais épluché', 0.105, 6.00);

-- ===== Production 4 : Kefta L2026-0427-KEF-001 =====
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222204',
       p.id, null, 5.10, 12.00
  from public.products p
 where p.name ilike '%agneau%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
values
  ('22222222-2222-2222-2222-222222222204', null, 'Oignon jaune épluché', 1.020, 1.50),
  ('22222222-2222-2222-2222-222222222204', null, 'Persil frais plat', 0.195, 8.00),
  ('22222222-2222-2222-2222-222222222204', null, 'Coriandre fraîche', 0.205, 8.00),
  ('22222222-2222-2222-2222-222222222204', null, 'Cumin moulu', 0.051, 40.00),
  ('22222222-2222-2222-2222-222222222204', null, 'Paprika doux', 0.049, 25.00);

-- ===== Production 5 : Brochettes Poulet L2026-0508-BRO-001 =====
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
select '22222222-2222-2222-2222-222222222205',
       p.id, null, 6.15, 9.00
  from public.products p
 where p.name ilike '%poulet%'
 order by p.name limit 1;
insert into public.productions_inputs
       (production_id, product_id, libelle, quantite, prix_unitaire)
values
  ('22222222-2222-2222-2222-222222222205', null, 'Yaourt nature entier', 0.510, 3.00),
  ('22222222-2222-2222-2222-222222222205', null, 'Citron jaune (5 unités)', 5.0, 0.50),
  ('22222222-2222-2222-2222-222222222205', null, 'Ail frais épluché', 0.152, 6.00),
  ('22222222-2222-2222-2222-222222222205', null, 'Curcuma moulu', 0.031, 30.00),
  ('22222222-2222-2222-2222-222222222205', null, 'Paprika doux', 0.029, 25.00);


-- ─────────────────────────────────────────────────────────────────────────
-- 7. OUTPUTS (1 ligne / production, quantité = inputs viande × rendement)
-- ─────────────────────────────────────────────────────────────────────────
-- product_id étant NOT NULL, on rattache l'output au produit "voisin" du
-- catalogue (faute de produit fini dédié) :
--   • Merguez   → "Merguez maison"
--   • Kefta     → "Boulettes de bœuf"  (analogue conceptuel)
--   • Brochettes→ "Escalope de poulet" (analogue conceptuel)
-- Quantités :
--   • Merguez 1 : (3.85+2.90) × 0.88 = 5.94 kg
--   • Merguez 2 : (4.05+3.10) × 0.92 = 6.578 kg
--   • Merguez 3 : (4.15+3.08) × 0.95 = 6.8685 kg
--   • Kefta     : 5.10 × 0.91         = 4.641 kg
--   • Brochettes: 6.15 × 0.89         = 5.4735 kg
insert into public.productions_outputs
       (production_id, product_id, quantite, prix_vente_unitaire_ttc)
select '22222222-2222-2222-2222-222222222201',
       p.id, 5.94, 22.00
  from public.products p
 where p.name ilike '%merguez maison%' order by p.name limit 1;

insert into public.productions_outputs
       (production_id, product_id, quantite, prix_vente_unitaire_ttc)
select '22222222-2222-2222-2222-222222222202',
       p.id, 6.578, 22.00
  from public.products p
 where p.name ilike '%merguez maison%' order by p.name limit 1;

insert into public.productions_outputs
       (production_id, product_id, quantite, prix_vente_unitaire_ttc)
select '22222222-2222-2222-2222-222222222203',
       p.id, 6.8685, 22.00
  from public.products p
 where p.name ilike '%merguez maison%' order by p.name limit 1;

insert into public.productions_outputs
       (production_id, product_id, quantite, prix_vente_unitaire_ttc)
select '22222222-2222-2222-2222-222222222204',
       p.id, 4.641, 18.00
  from public.products p
 where p.name ilike '%boulettes%' order by p.name limit 1;

insert into public.productions_outputs
       (production_id, product_id, quantite, prix_vente_unitaire_ttc)
select '22222222-2222-2222-2222-222222222205',
       p.id, 5.4735, 16.00
  from public.products p
 where p.name ilike '%escalope%poulet%' order by p.name limit 1;


-- ─────────────────────────────────────────────────────────────────────────
-- 8. COÛTS INDIRECTS (3 lignes par production : énergie / conso / MO réelle)
-- ─────────────────────────────────────────────────────────────────────────
-- MO théorique (recette) :
--   • Merguez   : 2 h × 28 + 0.5 h × 22 = 56 + 11 = 67 €
--   • Kefta     : 1.5 h × 28 + 1 h × 22 = 42 + 22 = 64 €
--   • Brochettes: 2 h × 22                       = 44 €
-- MO réelle (+10 à +20% selon lot) :
insert into public.productions_couts_indirects
       (production_id, libelle, montant)
values
  -- Production 1 : Merguez J-25 (rendement bas, MO +20%)
  ('22222222-2222-2222-2222-222222222201', 'Énergie (électricité hachoir + chambre froide)', 6.50),
  ('22222222-2222-2222-2222-222222222201', 'Consommables (films, étiquettes, gants)', 3.20),
  ('22222222-2222-2222-2222-222222222201', 'Main d''œuvre réelle (boucher 2h25 + prépa 35min)', 80.85),

  -- Production 2 : Merguez J-12 (MO +12%)
  ('22222222-2222-2222-2222-222222222202', 'Énergie (électricité hachoir + chambre froide)', 5.20),
  ('22222222-2222-2222-2222-222222222202', 'Consommables (films, étiquettes, gants)', 2.90),
  ('22222222-2222-2222-2222-222222222202', 'Main d''œuvre réelle (boucher 2h10 + prépa 35min)', 73.55),

  -- Production 3 : Merguez J-3 (MO conforme +5%)
  ('22222222-2222-2222-2222-222222222203', 'Énergie (électricité hachoir + chambre froide)', 4.80),
  ('22222222-2222-2222-2222-222222222203', 'Consommables (films, étiquettes, gants)', 3.05),
  ('22222222-2222-2222-2222-222222222203', 'Main d''œuvre réelle (boucher 2h05 + prépa 30min)', 69.30),

  -- Production 4 : Kefta J-18 (MO +15%)
  ('22222222-2222-2222-2222-222222222204', 'Énergie (four + chambre froide)', 4.20),
  ('22222222-2222-2222-2222-222222222204', 'Consommables (films, barquettes, étiquettes)', 3.40),
  ('22222222-2222-2222-2222-222222222204', 'Main d''œuvre réelle (boucher 1h45 + prépa 1h05)', 72.85),

  -- Production 5 : Brochettes J-7 (MO +18%)
  ('22222222-2222-2222-2222-222222222205', 'Énergie (chambre froide marinage 12h)', 7.10),
  ('22222222-2222-2222-2222-222222222205', 'Consommables (piques bois, films, barquettes)', 4.10),
  ('22222222-2222-2222-2222-222222222205', 'Main d''œuvre réelle (préparateur 2h20)', 51.85);


commit;


-- ─────────────────────────────────────────────────────────────────────────
-- 9. VÉRIFICATION
-- ─────────────────────────────────────────────────────────────────────────
-- Compteurs attendus :
--   • recettes                       : 3
--   • recettes_ingredients           : 4   (2 + 1 + 1)
--   • recettes_etapes                : 14  (6 + 4 + 4)
--   • recettes_main_oeuvre           : 5   (2 + 2 + 1)
--   • productions                    : 5
--   • productions_inputs             : 30  (6 par production × 5)
--     (chaque production : 1-2 lignes viande via SELECT products
--      + 4-5 lignes texte libre épices/condiments)
--   • productions_outputs            : 5   (1 par production)
--   • productions_couts_indirects    : 15  (3 par production)

select 'recettes' as table_name, count(*) as n
  from public.recettes
 where nom in ('Merguez Salam Maison','Kefta Agneau','Brochettes Poulet Marinées')
union all
select 'recettes_ingredients', count(*)
  from public.recettes_ingredients ri
  join public.recettes r on r.id = ri.recette_id
 where r.nom in ('Merguez Salam Maison','Kefta Agneau','Brochettes Poulet Marinées')
union all
select 'recettes_etapes', count(*)
  from public.recettes_etapes re
  join public.recettes r on r.id = re.recette_id
 where r.nom in ('Merguez Salam Maison','Kefta Agneau','Brochettes Poulet Marinées')
union all
select 'recettes_main_oeuvre', count(*)
  from public.recettes_main_oeuvre rmo
  join public.recettes r on r.id = rmo.recette_id
 where r.nom in ('Merguez Salam Maison','Kefta Agneau','Brochettes Poulet Marinées')
union all
select 'productions', count(*)
  from public.productions
 where lot_numero like 'L2026-%-MER-%'
    or lot_numero like 'L2026-%-KEF-%'
    or lot_numero like 'L2026-%-BRO-%'
union all
select 'productions_inputs', count(*)
  from public.productions_inputs pi
  join public.productions p on p.id = pi.production_id
 where p.lot_numero like 'L2026-%'
union all
select 'productions_outputs', count(*)
  from public.productions_outputs po
  join public.productions p on p.id = po.production_id
 where p.lot_numero like 'L2026-%'
union all
select 'productions_couts_indirects', count(*)
  from public.productions_couts_indirects pci
  join public.productions p on p.id = pci.production_id
 where p.lot_numero like 'L2026-%';
