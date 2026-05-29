-- =====================================================================
-- seed_drive_pro.sql
-- Seed de démonstration du module B2B "Drive Pro"
-- - 5 comptes_pro (4 actifs + 1 en_validation)
-- - prix_pro pour tous les produits viande (catégories 'boucherie' / 'charcuterie')
-- - 6 commandes_pro avec leurs lignes (états variés : a_valider, en_preparation,
--   livree, facturee/relance, payee)
--
-- Hypothèses :
--   * Migration 0025_drive_pro.sql appliquée
--   * Table products possède une colonne `tva_taux` (NOT NULL) et `category` text
--   * Catégories viande disponibles : 'boucherie' et 'charcuterie'
--   * Triggers actifs :
--       - gen_numero_commande_pro     → numero_commande auto sur INSERT
--       - gen_facture_numero          → facture_numero auto à la transition
--                                       statut → 'facturee'  (BEFORE UPDATE)
--       - set_ligne_tva_taux          → tva_taux copié depuis products
--       - recalc_encours_compte_pro   → encours_actuel recalculé
--   * Aucun compte auth.users n'est créé ici → delegue_user_id reste NULL.
--     Lier manuellement après création des comptes Auth via le Dashboard :
--       UPDATE comptes_pro SET delegue_user_id = '<uuid>' WHERE siret = '...';
--
-- Idempotence :
--   Le fichier supprime d'abord les enregistrements de démo identifiables par
--   SIRET avant de réinsérer. Peut être exécuté plusieurs fois sans erreur.
--
-- Ordre d'application :
--   1. Purge ciblée (lignes → commandes → prix_pro → comptes_pro)
--   2. Insert comptes_pro
--   3. Insert produits_pro_prix
--   4. Insert commandes_pro (initialement statut 'a_valider')
--   5. Insert commandes_pro_lignes
--   6. UPDATE montants HT/TVA/TTC sur commandes depuis les lignes
--   7. Workflow d'UPDATEs successifs pour déclencher les triggers de statut
--      (facture_numero, etc.)
--   8. SELECT de vérification finale
-- =====================================================================

begin;

-- =====================================================================
-- 0. PURGE (idempotence) : retire toutes traces des SIRETs de démo
-- =====================================================================

-- Lignes des commandes de ces comptes
delete from public.commandes_pro_lignes
where commande_pro_id in (
  select c.id
  from public.commandes_pro c
  join public.comptes_pro cp on cp.id = c.compte_pro_id
  where cp.siret in (
    '79347821600015',
    '88412657200028',
    '81234567800011',
    '75123456700034',
    '84567891200047'
  )
);

-- Commandes elles-mêmes
delete from public.commandes_pro
where compte_pro_id in (
  select id from public.comptes_pro
  where siret in (
    '79347821600015',
    '88412657200028',
    '81234567800011',
    '75123456700034',
    '84567891200047'
  )
);

-- Prix pro (purge complète des prix actifs sur produits viande pour rejouer proprement)
delete from public.produits_pro_prix
where produit_id in (
  select id from public.products where category in ('boucherie','charcuterie')
);

-- Comptes pro
delete from public.comptes_pro
where siret in (
  '79347821600015',
  '88412657200028',
  '81234567800011',
  '75123456700034',
  '84567891200047'
);

-- =====================================================================
-- 1. COMPTES PRO
-- 5 comptes : 4 'actif' (dont 1 association non assujettie) + 1 'en_validation'
-- delegue_user_id = NULL (cf. notes en tête de fichier)
-- valide_par_profile_id : subselect admin test, NULL si introuvable
-- =====================================================================

insert into public.comptes_pro (
  raison_sociale, siret, forme_juridique, tva_intracom,
  adresse_facturation, adresse_livraison,
  delegue_user_id, delegue_nom, delegue_telephone, delegue_email,
  conditions_paiement, encours_max, statut,
  valide_par_profile_id, valide_at
) values
-- 1 — Restaurant Le Bosphore (SARL, 30j, actif)
(
  'Restaurant Le Bosphore',
  '79347821600015',
  'SARL',
  'FR12793478216',
  '25 rue de Bayard, 31000 Toulouse',
  '25 rue de Bayard, 31000 Toulouse',
  null,
  'Hakan Yilmaz',
  '06 23 45 67 89',
  'contact@lebosphore31.fr',
  '30_jours',
  3000,
  'actif',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '60 days'
),
-- 2 — Traiteur Halal Toulouse (SAS, comptant, actif)
(
  'Traiteur Halal Toulouse',
  '88412657200028',
  'SAS',
  'FR45884126572',
  '12 chemin Lapujade, 31200 Toulouse',
  '12 chemin Lapujade, 31200 Toulouse',
  null,
  'Karim Benali',
  '06 78 12 34 56',
  'k.benali@traiteurhalal.fr',
  'comptant',
  1500,
  'actif',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '45 days'
),
-- 3 — Association Mosquée Empalot (Association, 30j, actif, non assujettie TVA)
(
  'Association Mosquée Empalot',
  '81234567800011',
  'Association',
  null,
  'Avenue Jean Moulin, 31400 Toulouse',
  'Avenue Jean Moulin, 31400 Toulouse',
  null,
  'Brahim Boudjelal',
  '06 45 67 89 12',
  'gestion@mosquee-empalot.fr',
  '30_jours',
  800,
  'actif',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '90 days'
),
-- 4 — École Mansour Hadj (SARL, 45j fin de mois, EN VALIDATION)
(
  'École Mansour Hadj',
  '75123456700034',
  'SARL',
  'FR99751234567',
  '8 rue des Tilleuls, 31100 Toulouse',
  '8 rue des Tilleuls, 31100 Toulouse',
  null,
  'Soraya Khalil',
  '06 11 22 33 44',
  'intendance@ecole-mansour.fr',
  '45_jours_fin_mois',
  2500,
  'en_validation',
  null,
  null
),
-- 5 — Pizzeria Le Carthage (EI, comptant, actif)
(
  'Pizzeria Le Carthage',
  '84567891200047',
  'EI',
  'FR12845678912',
  '156 avenue de Muret, 31300 Toulouse',
  '156 avenue de Muret, 31300 Toulouse',
  null,
  'Mounir Trabelsi',
  '06 98 76 54 32',
  'lecarthage@gmail.com',
  'comptant',
  1000,
  'actif',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '30 days'
);

-- =====================================================================
-- 2. PRIX PRO (catégorie viande : 'boucherie' + 'charcuterie')
-- Remise -15% sur le prix public TTC stocké (price_cents)
-- Conditionnement standardisé : carton de 5 (quantite = 5)
-- Paliers : 5% à 10 cartons, 10% à 30 cartons
-- =====================================================================

insert into public.produits_pro_prix (
  produit_id, prix_ht_unitaire,
  conditionnement_pro, quantite_par_conditionnement, prix_ht_par_conditionnement,
  remise_palier_1_pct, qty_palier_1,
  remise_palier_2_pct, qty_palier_2,
  actif, disponible_drive_pro
)
select
  p.id,
  round((p.price_cents::numeric / 100.0) * 0.85, 2)                 as prix_ht_unitaire,
  'Carton de 5'                                                     as conditionnement_pro,
  5                                                                 as quantite_par_conditionnement,
  round((p.price_cents::numeric / 100.0) * 0.85 * 5, 2)             as prix_ht_par_conditionnement,
  5                                                                 as remise_palier_1_pct,
  10                                                                as qty_palier_1,
  10                                                                as remise_palier_2_pct,
  30                                                                as qty_palier_2,
  true                                                              as actif,
  true                                                              as disponible_drive_pro
from public.products p
where p.category in ('boucherie', 'charcuterie');

-- =====================================================================
-- 3. COMMANDES PRO
-- 6 commandes — toutes insérées initialement en statut 'a_valider'
-- pour laisser le trigger générer numero_commande sereinement,
-- puis on fait progresser les statuts via UPDATEs successifs en fin de fichier.
-- =====================================================================

-- On utilise des CTE pour récupérer les IDs des comptes pro
-- en s'appuyant sur le SIRET (clé unique fonctionnelle).

-- Commande 1 — Bosphore — J-20 → finira en 'payee'
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  validee_par_profile_id, validee_at,
  mode_paiement, date_echeance,
  notes_client
) values (
  (select id from public.comptes_pro where siret = '79347821600015'),
  now() - interval '20 days',
  (now() - interval '18 days')::date,
  'livraison',
  'a_valider',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '20 days',
  'virement_30j',
  (now() + interval '10 days')::date,
  'Livraison habituelle matin'
);

-- Commande 2 — Traiteur Halal — J-5 → finira en 'en_preparation'
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  validee_par_profile_id, validee_at,
  mode_paiement, date_echeance,
  notes_client
) values (
  (select id from public.comptes_pro where siret = '88412657200028'),
  now() - interval '5 days',
  (now() + interval '1 days')::date,
  'livraison',
  'a_valider',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '5 days',
  'stripe',
  (now() - interval '5 days')::date,
  'Commande pour mariage samedi'
);

-- Commande 3 — Mosquée Empalot — J-15 → finira en 'livree' (sans paiement)
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  validee_par_profile_id, validee_at,
  mode_paiement, date_echeance,
  notes_client
) values (
  (select id from public.comptes_pro where siret = '81234567800011'),
  now() - interval '15 days',
  (now() - interval '12 days')::date,
  'retrait_pro',
  'a_valider',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '15 days',
  'virement_30j',
  (now() + interval '15 days')::date,
  'Retrait Brahim le mercredi 14h'
);

-- Commande 4 — École Mansour — J-35 → finira en 'facturee' avec date_echeance dépassée
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  validee_par_profile_id, validee_at,
  mode_paiement, date_echeance,
  notes_client, notes_interne
) values (
  (select id from public.comptes_pro where siret = '75123456700034'),
  now() - interval '35 days',
  (now() - interval '32 days')::date,
  'livraison',
  'a_valider',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '34 days',
  'virement_30j',
  (now() - interval '5 days')::date,
  'Cantine scolaire',
  'RELANCE — échéance dépassée'
);

-- Commande 5 — Pizzeria Carthage — J-1 → reste en 'a_valider' (> 500€ TTC)
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  mode_paiement,
  notes_client
) values (
  (select id from public.comptes_pro where siret = '84567891200047'),
  now() - interval '1 days',
  (now() + interval '2 days')::date,
  'livraison',
  'a_valider',
  'stripe',
  'Grosse commande exceptionnelle pour ouverture nouveau resto'
);

-- Commande 6 — Bosphore — J-2 → finira en 'en_preparation'
insert into public.commandes_pro (
  compte_pro_id, date_commande, date_livraison_souhaitee,
  type_recuperation, statut,
  validee_par_profile_id, validee_at,
  mode_paiement, date_echeance,
  notes_client
) values (
  (select id from public.comptes_pro where siret = '79347821600015'),
  now() - interval '2 days',
  (now() + interval '1 days')::date,
  'livraison',
  'a_valider',
  (select id from public.profiles where email = 'digitalwebmastertlse@gmail.com' limit 1),
  now() - interval '2 days',
  'virement_30j',
  (now() + interval '28 days')::date,
  'Réassort hebdomadaire'
);

-- =====================================================================
-- 4. LIGNES DE COMMANDES
-- 3 à 5 lignes par commande, prises sur les produits viande
-- prix_ht_unitaire = celui de produits_pro_prix (cohérent avec le catalogue)
-- Colonnes générées (quantite_unitaire_totale, prix_ht_total) NON fournies
-- tva_taux NON fournie (trigger set_ligne_tva_taux le copie depuis products)
-- =====================================================================

-- Helpers : on récupère un id de commande via la combinaison compte+date_commande
-- pour rester robuste sans connaître numero_commande à l'avance.

-- Lignes commande 1 — Bosphore J-20 (entrecôte + poulet + merguez)
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Entrecôte de bœuf halal','Escalope de poulet fermier','Merguez artisanales')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Entrecôte de bœuf halal'::text, 3),
  ('Escalope de poulet fermier',     4),
  ('Merguez artisanales',            2)
) as q(name, qty) on q.name = p.name
where cp.siret = '79347821600015'
  and c.date_commande between now() - interval '21 days' and now() - interval '19 days';

-- Lignes commande 2 — Traiteur Halal J-5 (poulet + merguez + dinde fumée + entrecôte)
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Escalope de poulet fermier','Merguez artisanales','Cacher dinde fumée','Entrecôte de bœuf halal')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Escalope de poulet fermier'::text, 5),
  ('Merguez artisanales',               3),
  ('Cacher dinde fumée',                4),
  ('Entrecôte de bœuf halal',           2)
) as q(name, qty) on q.name = p.name
where cp.siret = '88412657200028'
  and c.date_commande between now() - interval '6 days' and now() - interval '4 days';

-- Lignes commande 3 — Mosquée Empalot J-15 (poulet + merguez + dinde)
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Escalope de poulet fermier','Merguez artisanales','Cacher dinde fumée')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Escalope de poulet fermier'::text, 3),
  ('Merguez artisanales',               2),
  ('Cacher dinde fumée',                2)
) as q(name, qty) on q.name = p.name
where cp.siret = '81234567800011'
  and c.date_commande between now() - interval '16 days' and now() - interval '14 days';

-- Lignes commande 4 — École Mansour J-35 (poulet + dinde + merguez + entrecôte)
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Escalope de poulet fermier','Cacher dinde fumée','Merguez artisanales','Entrecôte de bœuf halal')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Escalope de poulet fermier'::text, 4),
  ('Cacher dinde fumée',                3),
  ('Merguez artisanales',               2),
  ('Entrecôte de bœuf halal',           1)
) as q(name, qty) on q.name = p.name
where cp.siret = '75123456700034'
  and c.date_commande between now() - interval '36 days' and now() - interval '34 days';

-- Lignes commande 5 — Pizzeria Carthage J-1
-- VOLUMES IMPORTANTS pour dépasser 500€ TTC (cas validation manager)
-- Entrecôte : 18,90€ public → 16,07€/kg HT → ~80,33€/carton 5kg
-- Poulet     : 12,90€ public → 10,97€/kg HT → ~54,83€/carton 5kg
-- Merguez    : 14,50€ public → 12,33€/kg HT → ~61,63€/carton 5kg
-- Dinde fumée pack 3,99€ public → 3,39€/pièce HT → ~16,96€/carton 5
--
-- Calcul ciblé : 8 cartons poulet + 4 cartons merguez + 3 cartons entrecôte
--   = 8×54.83 + 4×61.63 + 3×80.33 = 438.66 + 246.51 + 240.98 = 926.15 € HT
--   TTC (5.5% TVA sur viande crue, 20% sur charcuterie selon products.tva_taux)
--   → bien au-dessus de 500€ TTC
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Escalope de poulet fermier','Merguez artisanales','Entrecôte de bœuf halal')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Escalope de poulet fermier'::text, 8),
  ('Merguez artisanales',               4),
  ('Entrecôte de bœuf halal',           3)
) as q(name, qty) on q.name = p.name
where cp.siret = '84567891200047'
  and c.date_commande between now() - interval '2 days' and now();

-- Lignes commande 6 — Bosphore J-2 (réassort : poulet + merguez + entrecôte)
insert into public.commandes_pro_lignes (
  commande_pro_id, produit_id, quantite_conditionnements,
  quantite_par_conditionnement, prix_ht_unitaire
)
select
  c.id,
  ppp.produit_id,
  q.qty,
  ppp.quantite_par_conditionnement,
  ppp.prix_ht_unitaire
from public.commandes_pro c
join public.comptes_pro cp on cp.id = c.compte_pro_id
join public.products p on p.name in ('Escalope de poulet fermier','Merguez artisanales','Entrecôte de bœuf halal')
join public.produits_pro_prix ppp on ppp.produit_id = p.id and ppp.actif = true
join (values
  ('Escalope de poulet fermier'::text, 3),
  ('Merguez artisanales',               2),
  ('Entrecôte de bœuf halal',           2)
) as q(name, qty) on q.name = p.name
where cp.siret = '79347821600015'
  and c.date_commande between now() - interval '3 days' and now() - interval '1 days';

-- =====================================================================
-- 5. RECALCUL DES MONTANTS DES COMMANDES
-- montant_ht, montant_tva, montant_ttc à partir des lignes
-- (les commandes ont été insérées avec montants à 0 par défaut)
-- =====================================================================

update public.commandes_pro c
set
  montant_ht  = coalesce(agg.ht,  0),
  montant_tva = coalesce(agg.tva, 0),
  montant_ttc = coalesce(agg.ttc, 0)
from (
  select
    commande_pro_id,
    round(sum(prix_ht_total), 2)                                      as ht,
    round(sum(prix_ht_total * (tva_taux / 100.0)), 2)                 as tva,
    round(sum(prix_ht_total * (1 + tva_taux / 100.0)), 2)             as ttc
  from public.commandes_pro_lignes
  group by commande_pro_id
) agg
where agg.commande_pro_id = c.id;

-- =====================================================================
-- 6. WORKFLOW DES STATUTS (transitions pour déclencher les triggers)
-- Chaque UPDATE successif déclenche gen_facture_numero + recalc_encours
-- =====================================================================

-- Commande 1 : Bosphore J-20  → a_valider → validee → en_preparation → expediee → livree → facturee → payee
update public.commandes_pro
set statut = 'validee'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

update public.commandes_pro
set statut = 'en_preparation'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

update public.commandes_pro
set statut = 'expediee'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

update public.commandes_pro
set statut = 'livree'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

update public.commandes_pro
set statut = 'facturee'                       -- ← trigger génère facture_numero ici
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

update public.commandes_pro
set
  statut = 'payee',
  date_paiement = now() - interval '15 days'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '21 days' and now() - interval '19 days';

-- Commande 2 : Traiteur Halal J-5 → a_valider → validee → en_preparation
update public.commandes_pro
set statut = 'validee'
where compte_pro_id = (select id from public.comptes_pro where siret = '88412657200028')
  and date_commande between now() - interval '6 days' and now() - interval '4 days';

update public.commandes_pro
set statut = 'en_preparation'
where compte_pro_id = (select id from public.comptes_pro where siret = '88412657200028')
  and date_commande between now() - interval '6 days' and now() - interval '4 days';

-- Commande 3 : Mosquée Empalot J-15 → a_valider → validee → en_preparation → livree (pas de paiement)
update public.commandes_pro
set statut = 'validee'
where compte_pro_id = (select id from public.comptes_pro where siret = '81234567800011')
  and date_commande between now() - interval '16 days' and now() - interval '14 days';

update public.commandes_pro
set statut = 'en_preparation'
where compte_pro_id = (select id from public.comptes_pro where siret = '81234567800011')
  and date_commande between now() - interval '16 days' and now() - interval '14 days';

update public.commandes_pro
set statut = 'livree'
where compte_pro_id = (select id from public.comptes_pro where siret = '81234567800011')
  and date_commande between now() - interval '16 days' and now() - interval '14 days';

-- Commande 4 : École Mansour J-35 → a_valider → validee → en_preparation → livree → facturee
-- Reste en 'facturee' avec date_echeance dans le passé → cas RELANCE
update public.commandes_pro
set statut = 'validee'
where compte_pro_id = (select id from public.comptes_pro where siret = '75123456700034')
  and date_commande between now() - interval '36 days' and now() - interval '34 days';

update public.commandes_pro
set statut = 'en_preparation'
where compte_pro_id = (select id from public.comptes_pro where siret = '75123456700034')
  and date_commande between now() - interval '36 days' and now() - interval '34 days';

update public.commandes_pro
set statut = 'livree'
where compte_pro_id = (select id from public.comptes_pro where siret = '75123456700034')
  and date_commande between now() - interval '36 days' and now() - interval '34 days';

update public.commandes_pro
set statut = 'facturee'                       -- ← trigger génère facture_numero
where compte_pro_id = (select id from public.comptes_pro where siret = '75123456700034')
  and date_commande between now() - interval '36 days' and now() - interval '34 days';

-- Commande 5 : Pizzeria Carthage J-1 → reste en 'a_valider' (validation manager attendue)
-- Aucun update statut.

-- Commande 6 : Bosphore J-2 → a_valider → validee → en_preparation
update public.commandes_pro
set statut = 'validee'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '3 days' and now() - interval '1 days';

update public.commandes_pro
set statut = 'en_preparation'
where compte_pro_id = (select id from public.comptes_pro where siret = '79347821600015')
  and date_commande between now() - interval '3 days' and now() - interval '1 days';

commit;

-- =====================================================================
-- 7. VÉRIFICATION
-- Lance ces SELECTs après exécution pour valider le seed.
-- =====================================================================

-- Comptes pro et leurs encours recalculés par trigger
-- select raison_sociale, siret, statut, conditions_paiement, encours_max, encours_actuel
-- from public.comptes_pro
-- where siret in ('79347821600015','88412657200028','81234567800011','75123456700034','84567891200047')
-- order by raison_sociale;

-- Prix pro générés sur les viandes
-- select p.name, p.category, ppp.prix_ht_unitaire, ppp.prix_ht_par_conditionnement, ppp.actif
-- from public.produits_pro_prix ppp
-- join public.products p on p.id = ppp.produit_id
-- where ppp.actif = true and p.category in ('boucherie','charcuterie')
-- order by p.category, p.name;

-- Commandes pro avec numero_commande / facture_numero générés
-- select
--   cp.raison_sociale,
--   c.numero_commande,
--   c.statut,
--   c.facture_numero,
--   c.date_commande::date,
--   c.date_echeance,
--   c.date_paiement::date,
--   c.montant_ht,
--   c.montant_tva,
--   c.montant_ttc
-- from public.commandes_pro c
-- join public.comptes_pro cp on cp.id = c.compte_pro_id
-- where cp.siret in ('79347821600015','88412657200028','81234567800011','75123456700034','84567891200047')
-- order by c.date_commande;

-- Détail des lignes
-- select
--   c.numero_commande, p.name, l.quantite_conditionnements, l.quantite_par_conditionnement,
--   l.quantite_unitaire_totale, l.prix_ht_unitaire, l.prix_ht_total, l.tva_taux
-- from public.commandes_pro_lignes l
-- join public.commandes_pro c on c.id = l.commande_pro_id
-- join public.products p on p.id = l.produit_id
-- join public.comptes_pro cp on cp.id = c.compte_pro_id
-- where cp.siret in ('79347821600015','88412657200028','81234567800011','75123456700034','84567891200047')
-- order by c.numero_commande, p.name;
