# Audit bugs Salamarket — 170 bugs confirmés

> Chasse multi-agents (4 vagues, 80 chasseurs + vérification adversariale refus-par-défaut). Chaque bug a été **re-lu et confirmé** sur le code réel. Doublons et hallucinations éliminés.

**Répartition :** 7 P0 · 33 P1 · 68 P2 · 62 P3

Date : 2026-06-08 · Périmètre : apps/stock, apps/drive, supabase (functions + migrations)

## Top priorités (P0 + P1)

- **[P0]** Assistant API: CA magasin (cashmag) calculé sans multiplier par la quantité — `apps/stock/app/api/assistant/route.ts:226`
- **[P0]** Assistant API: CA Drive vs magasin — incohérence de calcul (quantité manquante côté magasin) — `apps/stock/app/api/assistant/route.ts:204-205`
- **[P0]** PDF Facture Pro (B2B) exposé sans auth via service_role (bypass RLS) — `apps/stock/app/api/factures-pro/[id]/pdf/route.ts:16-47`
- **[P0]** POST /api/po/send - Missing Authentication (CRITICAL SECURITY) — `apps/stock/app/api/po/send/route.ts:270`
- **[P0]** RLS anon_all : INSERT/UPDATE/DELETE non authentifié sur pointages et shifts — `supabase/migrations/20260530000007_staff_pointage.sql:218-226`
- **[P0]** Aucune policy RLS INSERT sur commandes_pro : la validation de commande Pro échoue toujours pour un délégué — `supabase/migrations/_archive/0025_drive_pro.sql:313-331`
- **[P0]** Aucune policy RLS INSERT sur commandes_pro_lignes : insertion des lignes refusée — `supabase/migrations/_archive/0025_drive_pro.sql:333-352`
- **[P1]** Le stepper +/- s'affiche sur les lignes au poids et double le prix — `apps/drive/src/pages/Cart.tsx:452-487`
- **[P1]** RLS bloque l'INSERT comptes_pro : pas de session après signUp si confirmation email activée (ou policy 0028 jamais appliquée) — `apps/drive/src/pages/pro/Inscription.tsx:230-282`
- **[P1]** Assistant query_ventes_periode — CA magasin (Cashmag) sans multiplication par la quantité — `apps/stock/app/api/assistant/route.ts:226`
- **[P1]** PDF Bon de réception accessible sans authentification (énumération UUID) — `apps/stock/app/api/bdl/bon-reception-pdf-v2/route.ts:120-131`
- **[P1]** POST /api/bdl/scan-carton - Missing Authentication — `apps/stock/app/api/bdl/scan-carton/route.ts:84`
- **[P1]** GET /api/cashbox/daily-z - No Auth / No Rate-Limit on Financial Report Endpoint — `apps/stock/app/api/cashbox/daily-z/route.ts:6-30`
- **[P1]** POST /api/cashbox/import-stock - Missing Authentication (Unprotected Data Mutation) — `apps/stock/app/api/cashbox/import-stock/route.ts:18`
- **[P1]** GET /api/commandes-drive/[id]/ticket - Missing Authentication (PII Exposure) — `apps/stock/app/api/commandes-drive/[id]/ticket/route.ts:16`
- **[P1]** Header x-vercel-cron spoofable — bypass de CRON_SECRET sur les 7 crons — `apps/stock/app/api/cron/casse-weekly-digest/route.ts:39`
- **[P1]** Cron Endpoints - x-vercel-cron Header Can Be Spoofed (AUTH BYPASS) — `apps/stock/app/api/cron/daily-z/route.ts:26`
- **[P1]** Ventilation TVA de la facture Pro retombe à 0% si tva_taux NULL (incohérence avec Total TVA) — `apps/stock/app/api/factures-pro/[id]/pdf/route.ts:124`
- **[P1]** POST /api/po/[id]/match-bdl - Missing Authentication — `apps/stock/app/api/po/[id]/match-bdl/route.ts:30`
- **[P1]** Échec du UPDATE DB après capture Stripe réussie renvoie quand même HTTP 200 'success' — `apps/stock/app/api/stripe/capture-payment/route.ts:206-234`
- **[P1]** POST/GET /api/sync/drive-pull sans authentification — écriture cross-projet via service-role — `apps/stock/app/api/sync/drive-pull/route.ts:84`
- **[P1]** Aucune vérification de rôle dans handleAccept/handleClarification/handleReject (centre d'alertes IA) — `apps/stock/app/v2/admin/alertes/page.tsx:116-214`
- **[P1]** Onglet Démarque alimenté par des données factices hardcodées + Math.random() présentées comme alertes réelles — `apps/stock/app/v2/admin/alertes/page.tsx:265-310`
- **[P1]** commandes-pro/page.tsx: UI-only role check for manager validation (validation bypass) — `apps/stock/app/v2/admin/commandes-pro/page.tsx:126-155 (garde 132-140), setCommandeStatut lib/db/pro.ts:219-237`
- **[P1]** Perte silencieuse de quantité reçue en apprentissage carton (update sans vérification d'erreur) — `apps/stock/app/v2/reception/[id]/page.tsx:462-470`
- **[P1]** Insertion de ligne BDL sans vérification d'erreur en apprentissage carton — `apps/stock/app/v2/reception/[id]/page.tsx:472-481`
- **[P1]** finalize() crée une fiche stock_par_depot sans prix_vente (article invendable) — `apps/stock/app/v2/reception/[id]/page.tsx:641-646`
- **[P1]** Maj stock_par_depot silencieuse a la validation BDL — BDL receptionne mais stock non incremente — `apps/stock/app/v2/reception/[id]/page.tsx:632-639`
- **[P1]** Insert stock_par_depot silencieux a la validation BDL — nouveau produit jamais en stock — `apps/stock/app/v2/reception/[id]/page.tsx:641-646`
- **[P1]** finalize() utilise bdl.depot_destination_id! sans garde null → stock orphelin / insert avalé — `apps/stock/app/v2/reception/[id]/page.tsx:629, 643`
- **[P1]** submitCreateProduct : insert stock_par_depot non vérifié → produit sans prix/stock initial (orphelin) — `apps/stock/app/v2/reception/[id]/page.tsx:363-372`
- **[P1]** completeInventaire n'applique jamais le comptage physique au stock réel (stock_par_depot non corrigé) — `apps/stock/lib/db/index.ts:832-858`
- **[P1]** Correction admin des horaires : aucun contrôle de rôle côté serveur (gate isAdmin client-only) — `apps/stock/lib/db/pointage.ts:209-229`
- **[P1]** Facture Pro : double source TVA (ventilation par taux ≠ montant_tva DB) sans réconciliation — `apps/stock/lib/pdf/facture-pro.ts:156-189`
- **[P1]** Depot persistence bug: orphaned depot after logout (employé suivant hérite du dépôt du précédent) — `apps/stock/lib/v2-store.ts:33`
- **[P1]** gdpr-delete-account : commandes Drive au poids jamais anonymisées (commandes_drive.id ≠ orders.id) — `supabase/functions/gdpr-delete-account/index.ts:109-131`
- **[P1]** Suppression RGPD incomplète : comptes_pro (PII du délégué) jamais anonymisés — `supabase/functions/gdpr-delete-account/index.ts:71-144`
- **[P1]** Anonymous write policy allows data forgery (security/trust critical) — `supabase/migrations/20260530000000_lots_traceability.sql:59-60`
- **[P1]** adjust_stock RPC ramène silencieusement le stock à 0 au lieu de bloquer un sur-décrément — `supabase/migrations/20260604000002_stock_ledger_atomic.sql:117, 121, 125`
- **[P1]** v_productions_kpi référence des colonnes inexistantes (quantite, prix_unitaire, p.recette) — `supabase/migrations/_archive/0025_productions_kpi.sql:43-44,69`

---

## P0 — Bloquant / Argent / Sécurité (7)

### 1. Assistant API: CA magasin (cashmag) calculé sans multiplier par la quantité

- **Fichier :** `apps/stock/app/api/assistant/route.ts:226`
- **Catégorie :** Logic Error / Data Calculation
- **Problème :** ventes_cashmag_import.prix_ttc est un prix unitaire (par article), pas un total ligne. La ligne 226 ajoute prix_ttc directement sans le multiplier par quantite, donc le CA magasin est massivement sous-évalué. La référence canonique (vue mv_ventes_quotidiennes et monthly-report.ts) multiplie bien prix_ttc * quantite.
- **Repro :** Demander à l'assistant 'CA magasin du Coca sur 7 jours'. Si 50 tickets vendent chacun 2 Coca à 1,50€ (quantite=2, prix_ttc=1,50), le vrai CA = 50*2*1,50 = 150€. L'assistant retourne 50*1,50 = 75€ (magasin_cashmag.ca_ttc divisé par la quantité moyenne). Comparer à la vue cockpit (correcte) confirme l'écart.
- **Correctif :** Ligne 226 : magasinCa += Number(v.quantite ?? 0) * Number(v.prix_ttc ?? 0); (aligner sur monthly-report.ts:197 et la vue mv_ventes_quotidiennes).

### 2. Assistant API: CA Drive vs magasin — incohérence de calcul (quantité manquante côté magasin)

- **Fichier :** `apps/stock/app/api/assistant/route.ts:204-205`
- **Catégorie :** Logic Error / Data Calculation
- **Problème :** Le CA Drive (204-205) multiplie bien quantite * prix_unitaire. Mais l'agrégat magasin (226) oublie la quantité, donc total_ca_ttc (241) mélange un Drive correct et un magasin sous-estimé. Le total remonté à l'assistant est faux.
- **Repro :** Demander 'ventes Coca 7j'. Si Drive = 50 unités à 2€ = 100€ (correct) et magasin = 30 lignes de 2 unités à 1,50€ = 90€ réel mais l'assistant compte 30*1,50 = 45€, total affiché = 145€ au lieu de 190€.
- **Correctif :** Corriger la ligne 226 : magasinCa += Number(v.quantite ?? 0) * Number(v.prix_ttc ?? 0). Le Drive (205) est déjà correct, ne pas y toucher. Doublon du bug #1 : un seul correctif.

### 3. PDF Facture Pro (B2B) exposé sans auth via service_role (bypass RLS)

- **Fichier :** `apps/stock/app/api/factures-pro/[id]/pdf/route.ts:16-47`
- **Catégorie :** Security/Authorization
- **Problème :** GET /api/factures-pro/[id]/pdf utilise supabaseServer() (clé SERVICE_ROLE qui bypasse toute RLS) et ne vérifie ni session, ni rôle, ni appartenance de la commande au compte Pro. N'importe qui connaissant/énumérant un commandes_pro.id télécharge la facture B2B complète : raison sociale, SIRET, TVA intracom, adresse de facturation, montants HT/TVA/TTC, conditions de paiement. Le middleware ne couvre pas /api/factures-pro/*. Fuite directe de PII/données financières clients Pro.
- **Repro :** 1. Obtenir/deviner un commandes_pro.id (UUID). 2. curl '<host>/api/factures-pro/<uuid>/pdf' sans authentification. 3. La facture PDF est renvoyée intégralement (service_role ignore la RLS) — aucun 401/403.
- **Correctif :** Vérifier la session (auth.getUser()) et autoriser uniquement un staff admin/manager OU le compte Pro propriétaire (cmd.compte_pro_id == compte du user). À défaut de besoin service_role, utiliser un client respectant la RLS.

### 4. POST /api/po/send - Missing Authentication (CRITICAL SECURITY)

- **Fichier :** `apps/stock/app/api/po/send/route.ts:270`
- **Catégorie :** Security - Missing Authentication
- **Problème :** La route mute le statut de purchase_order et envoie un email externe (Resend) au fournisseur sans aucune authentification. validateBody ne fait que parser/valider le JSON. Un attaquant peut énumérer des po_id et déclencher l'envoi d'emails aux fournisseurs sans autorisation.
- **Repro :** POST /api/po/send avec body {po_id: <uuid de PO au statut brouillon avec certif valide>} sans aucun header d'auth → email envoyé au fournisseur + statut passé à 'envoyee'.
- **Correctif :** Ajouter un contrôle d'auth en tête de POST (l.271) : vérifier la session via supabaseServer().auth.getUser() OU exiger x-internal-secret === INTERNAL_API_SECRET, comme dans /api/push/send.

### 5. RLS anon_all : INSERT/UPDATE/DELETE non authentifié sur pointages et shifts

- **Fichier :** `supabase/migrations/20260530000007_staff_pointage.sql:218-226`
- **Catégorie :** Security/Authorization
- **Problème :** La migration boucle sur ['shifts','pointages'] et crée une policy `anon_all` `for all using (true) with check (true)`. Avec RLS activé (lignes 215-216) mais une policy permissive ouverte au rôle anon, n'importe qui disposant de la clé anon Supabase (présente dans le bundle client) peut lire, insérer, modifier et supprimer le planning et les pointages de toute l'équipe — données RH/paie. Aucune restriction par rôle ni par employé. Non listé dans les bugs connus (les RLS connues concernent commandes_pro).
- **Repro :** Avec la clé anon publique : `supabase.from('pointages').delete().neq('id','00000000-0000-0000-0000-000000000000')` supprime tous les pointages, ou `.update({check_out:...})` falsifie les heures payées de n'importe quel employé. Aucune session requise.
- **Correctif :** Remplacer la policy `anon_all` par des policies role-based : lecture/écriture réservées à `authenticated` avec vérification du rôle admin/manager (via une fonction `is_staff_admin()`), et limiter l'employé courant à ses propres lignes. Supprimer entièrement l'accès `anon` en écriture.

### 6. Aucune policy RLS INSERT sur commandes_pro : la validation de commande Pro échoue toujours pour un délégué

- **Fichier :** `supabase/migrations/_archive/0025_drive_pro.sql:313-331`
- **Catégorie :** Security / Access Control
- **Problème :** La table commandes_pro a la RLS activée mais ne définit qu'une policy SELECT pour le délégué et ALL pour admin/manager — aucune policy INSERT pour un utilisateur authentifié lambda (le délégué). En mode deny-by-default, l'INSERT de Panier.tsx est rejeté, faisant systématiquement échouer la validation de commande Pro.
- **Repro :** 1. Se connecter en tant que délégué d'un compte Pro actif 2. Ajouter des articles au panier Pro 3. Cliquer 'Valider la commande' 4. Toast 'Échec : new row violates row-level security policy for table commandes_pro' 5. Aucune commande créée
- **Correctif :** Ajouter une policy INSERT (nouvelle migration horodatée) autorisant le délégué d'un compte_pro actif à insérer une commande sur son propre compte : with check (exists(select 1 from comptes_pro cp where cp.id = compte_pro_id and cp.delegue_user_id = auth.uid() and cp.statut='actif')).

### 7. Aucune policy RLS INSERT sur commandes_pro_lignes : insertion des lignes refusée

- **Fichier :** `supabase/migrations/_archive/0025_drive_pro.sql:333-352`
- **Catégorie :** Security / Access Control
- **Problème :** commandes_pro_lignes a la RLS activée mais ne définit que SELECT délégué et ALL admin/manager — pas d'INSERT pour le délégué. L'INSERT des lignes dans Panier.tsx est refusé par la RLS.
- **Repro :** 1. (Avec le fix INSERT commandes_pro en place) un délégué valide une commande 2. L'INSERT dans commandes_pro_lignes est refusé par la RLS 3. Toast 'Échec : new row violates row-level security policy for table commandes_pro_lignes' 4. Soit la commande reste sans lignes, soit l'opération échoue entièrement
- **Correctif :** Ajouter une policy INSERT autorisant le délégué dont le compte est actif et propriétaire de la commande parente : with check (exists(select 1 from commandes_pro cmd join comptes_pro cp on cp.id=cmd.compte_pro_id where cmd.id=commande_pro_id and cp.delegue_user_id=auth.uid() and cp.statut='actif')).

## P1 — Fonction cassée (33)

### 8. Le stepper +/- s'affiche sur les lignes au poids et double le prix

- **Fichier :** `apps/drive/src/pages/Cart.tsx:452-487`
- **Catégorie :** Logic Error
- **Problème :** Sur une ligne au poids (unit_type='weight'), le contrat est quantity=1 et le poids vit dans quantiteKg. Mais le stepper incrément/décrément est rendu pour TOUTES les lignes du panier sans exclure les lignes weight. Cliquer le bouton + passe quantity à 2 ; comme le calcul de prix multiplie quantiteKg * quantity, le prix de la ligne et le sous-total doublent. Le client est facturé le double d'un même morceau au poids.
- **Repro :** Ajouter au panier un produit au poids (unit_type='weight', ex viande au kg). Dans /panier, cliquer le bouton + de la ligne. quantity passe de 1 à 2 : la mention 'Estimation' double, le sous-total double et le total à pré-autoriser double — pour un seul morceau commandé.
- **Correctif :** Ne rendre le stepper que pour les lignes non-weight. Entourer le bloc <div className="flex items-center gap-1 bg-[#FAF7EE]..."> (l.452-487) d'une condition {!isWeight && (...)}. Les lignes weight ne s'ajustent que via l'input kg (déjà présent l.368-390). weight_bracket et unit conservent le stepper.

### 9. RLS bloque l'INSERT comptes_pro : pas de session après signUp si confirmation email activée (ou policy 0028 jamais appliquée)

- **Fichier :** `apps/drive/src/pages/pro/Inscription.tsx:230-282`
- **Catégorie :** Security/Auth/Data Loss
- **Problème :** À la ligne 231, signUp() est appelé avec emailRedirectTo vers /pro/login (ligne 235), indice fort que la confirmation email est ACTIVÉE sur le projet Supabase. Or, quand la confirmation est activée, signUp ne renvoie PAS de session : aucun JWT n'est établi, donc auth.uid() = NULL côté Postgres. L'INSERT dans comptes_pro (lignes 268-281) est soumis à la RLS de 0025 (qui n'expose AUCUNE policy INSERT pour un user lambda) et de 0028 (policy comptes_pro_insert_self qui exige auth.uid() = delegue_user_id). Avec auth.uid()=NULL, la policy 0028 échoue ; et 0028 vit dans supabase/migrations/_archive/ (statut d'application incertain) — si non appliquée, l'INSERT échoue TOUJOURS, même session valide. Résultat : l'utilisateur Auth est créé mais comptes_pro reste vide ; le catch (ligne 298-303) affiche le message 'compte connexion créé, on finalise sous 24-48h', et l'admin ne voit jamais la demande dans /admin/comptes-pro. Le commentaire en tête de 0028 documente exactement ce symptôme.
- **Repro :** 1. S'assurer que la confirmation email est activée sur le projet Supabase (cohérent avec emailRedirectTo ligne 235). 2. Remplir /pro/inscription (3 étapes valides). 3. Cliquer 'Envoyer ma demande'. 4. signUp réussit sans session → auth.uid()=NULL. 5. INSERT comptes_pro rejeté par RLS (policy 0028 absente ou auth.uid() NULL). 6. Toast 'Votre compte connexion est créé : notre équipe finalisera...'. 7. Vérifier table comptes_pro : aucune ligne créée → la demande Pro est perdue (admin ne la voit jamais).
- **Correctif :** Confirmer que la migration 0028 est bien appliquée (la sortir de _archive/ ou créer une migration horodatée équivalente). Surtout : ne pas dépendre d'une session côté client — gérer la création de comptes_pro côté serveur via une Edge Function (service_role) déclenchée à l'inscription, qui crée la demande même sans session confirmée. À défaut, après signUp sans session, afficher un message clair invitant à confirmer l'email puis finaliser, et persister la demande Pro de façon fiable.

### 10. Assistant query_ventes_periode — CA magasin (Cashmag) sans multiplication par la quantité

- **Fichier :** `apps/stock/app/api/assistant/route.ts:226`
- **Catégorie :** Data Integrity & Calculation Error
- **Problème :** Le CA magasin renvoyé par l'assistant sous-estime les ventes car il somme prix_ttc (unitaire) sans le multiplier par la quantité vendue, contrairement à la convention du reste du code (monthly-report, branche Drive).
- **Repro :** Demander à l'assistant 'Combien de CA Coca cette semaine ?' avec en base 5 unités à 10€ → magasin_cashmag.ca_ttc=10 au lieu de 50, total_ca_ttc sous-compté.
- **Correctif :** Ligne 226 : `magasinCa += Number(v.quantite ?? 0) * Number(v.prix_ttc ?? 0)`.

### 11. PDF Bon de réception accessible sans authentification (énumération UUID)

- **Fichier :** `apps/stock/app/api/bdl/bon-reception-pdf-v2/route.ts:120-131`
- **Catégorie :** Security/Authorization
- **Problème :** GET /api/bdl/bon-reception-pdf-v2?bdl_id=<uuid> ne fait aucune vérification d'authentification ni de rôle. Le handler lit directement bdl_id, instancie supabase() et renvoie le PDF complet du bon de réception (fournisseur, SIRET, prix d'achat HT, écarts valorisés, températures, photos, lots halal). Le middleware.ts ne couvre PAS /api/* (matcher = redirects legacy + /api/stripe/* uniquement). Toute personne connaissant/devinant un UUID télécharge des données fournisseur sensibles. Sévérité ramenée de P0 à P1 : supabase() utilise la clé anon (RLS éventuelle), pas le service_role — l'exfiltration dépend de la RLS sur bons_de_livraison, mais aucune barrière applicative.
- **Repro :** 1. Récupérer/deviner un id de bons_de_livraison. 2. curl '<host>/api/bdl/bon-reception-pdf-v2?bdl_id=<uuid>' sans cookie de session. 3. Le PDF du bon de réception est renvoyé (status 200) si la RLS anon le permet — aucun blocage côté route.
- **Correctif :** Ajouter en tête de GET une vérification de session staff (supabaseServer().auth.getUser() ou header staff vérifié) et un contrôle de rôle réception/compta avant la requête. Ne pas se reposer sur le middleware (qui ne matche pas /api/bdl/*).

### 12. POST /api/bdl/scan-carton - Missing Authentication

- **Fichier :** `apps/stock/app/api/bdl/scan-carton/route.ts:84`
- **Catégorie :** Security - Missing Authentication
- **Problème :** La route mute bons_de_livraison_lignes (quantite_recue, statut, nb_cartons_scannes) et déclenche des push admin sans authentification. Un utilisateur non authentifié peut incrémenter les quantités reçues sur n'importe quel BDL, fausser les comptes de stock et spammer les push.
- **Repro :** POST /api/bdl/scan-carton avec {bdl_id: <uuid existant>, ean: <ean d'un produit présent sur une ligne du BDL>} sans auth → quantite_recue incrémentée en base.
- **Correctif :** Ajouter un contrôle d'auth avant la l.85 : vérifier la session ou exiger x-internal-secret, comme dans /api/push/send et /api/bdl/finalize (callers internes).

### 13. GET /api/cashbox/daily-z - No Auth / No Rate-Limit on Financial Report Endpoint

- **Fichier :** `apps/stock/app/api/cashbox/daily-z/route.ts:6-30`
- **Catégorie :** Security - Missing Authentication / PII Exposure
- **Problème :** L'endpoint GET expose les rapports de caisse quotidiens (CA TTC, nb_commandes) sans authentification ni rate-limit. Un attaquant énumère ?date=YYYY-MM-DD et scrape tout l'historique de chiffre d'affaires.
- **Repro :** GET /api/cashbox/daily-z?date=2026-01-01 (puis boucle sur les dates) sans auth → CA quotidien retourné en JSON pour chaque date.
- **Correctif :** Exiger une session staff (supabase auth) ou x-internal-secret pour l'accès aux données financières, et ajouter un rate-limit comme défense secondaire.

### 14. POST /api/cashbox/import-stock - Missing Authentication (Unprotected Data Mutation)

- **Fichier :** `apps/stock/app/api/cashbox/import-stock/route.ts:18`
- **Catégorie :** Security - Missing Authentication
- **Problème :** La route accepte des imports CSV non authentifiés qui créent/modifient produits et stock_par_depot. Seul un rate-limit (5/h/IP) protège. Un attaquant peut créer de faux produits, modifier les quantités/prix de stock à n'importe quel dépôt et corrompre l'inventaire.
- **Repro :** POST /api/cashbox/import-stock avec {csv: '<lignes EAN;nom;...>', depot_id: <uuid>} sans auth → produits créés et stock_par_depot écrit (jusqu'à 5x/h/IP).
- **Correctif :** Ajouter un contrôle d'auth à la l.18 (avant le rate-limit) : exiger une session via supabase auth ou x-internal-secret. Le rate-limit doit rester une défense secondaire.

### 15. GET /api/commandes-drive/[id]/ticket - Missing Authentication (PII Exposure)

- **Fichier :** `apps/stock/app/api/commandes-drive/[id]/ticket/route.ts:16`
- **Catégorie :** Security - Missing Authentication / PII Exposure
- **Problème :** L'endpoint GET expose la PII client (client_nom, montant_capture_ttc) sans authentification. Tout attaquant disposant d'un commande_id peut récupérer le PDF du ticket contenant nom et montant payé.
- **Repro :** GET /api/commandes-drive/<uuid de commande>/ticket sans header d'auth → PDF avec nom client + montant téléchargé.
- **Correctif :** Ajouter un contrôle d'auth : exiger une session staff via supabaseServer().auth.getUser(), ou x-internal-secret pour la génération serveur-à-serveur.

### 16. Header x-vercel-cron spoofable — bypass de CRON_SECRET sur les 7 crons

- **Fichier :** `apps/stock/app/api/cron/casse-weekly-digest/route.ts:39`
- **Catégorie :** Authentification & Autorisation
- **Problème :** Tous les crons acceptent x-vercel-cron:'1' comme fallback d'authentification. Cet en-tête étant contrôlable par le client sur le réseau, un attaquant externe le fournit pour exécuter les jobs cron sans connaître CRON_SECRET (envoi de digests, recompute forecast/cockpit, génération inventaire tournant).
- **Repro :** curl 'https://<stock>/api/cron/casse-weekly-digest' -H 'x-vercel-cron: 1' → exécute le cron sans CRON_SECRET valide (à condition que CRON_SECRET soit défini, sinon 503 en amont).
- **Correctif :** Supprimer le fallback vercelCron : ne garder que `if (auth !== `Bearer ${cronSecret}`) return 401`. Vercel envoie déjà l'en-tête Authorization Bearer CRON_SECRET sur ses crons natifs.

### 17. Cron Endpoints - x-vercel-cron Header Can Be Spoofed (AUTH BYPASS)

- **Fichier :** `apps/stock/app/api/cron/daily-z/route.ts:26`
- **Catégorie :** Security - Header Spoofing
- **Problème :** Plusieurs endpoints cron valident l'accès avec une logique OR incluant le header 'x-vercel-cron: 1', qui est fourni par le client et peut être forgé. Un attaquant peut envoyer x-vercel-cron:1 pour contourner la validation CRON_SECRET et déclencher des crons (rapports financiers, distributions email, forecast).
- **Repro :** GET /api/cron/daily-z -H 'x-vercel-cron: 1' (sans Bearer CRON_SECRET) → la condition l.26 est fausse, le cron s'exécute.
- **Correctif :** Supprimer le fallback '&& vercelCron !== "1"'. Changer l.26 en 'if (auth !== `Bearer ${cronSecret}`)'. CRON_SECRET doit être l'unique voie d'authentification ; x-vercel-cron est informatif et non fiable. Appliquer aux 7 routes cron.

### 18. Ventilation TVA de la facture Pro retombe à 0% si tva_taux NULL (incohérence avec Total TVA)

- **Fichier :** `apps/stock/app/api/factures-pro/[id]/pdf/route.ts:124`
- **Catégorie :** Data Integrity/Calculation
- **Problème :** La route mappe tvaTaux: Number(r.tva_taux ?? 0) (ligne 124). Si commandes_pro_lignes.tva_taux est NULL, la ligne hérite de 0%. Vérifié : le trigger trg_set_ligne_tva_taux qui copierait products.tva_taux N'EXISTE QUE dans supabase/migrations/_archive/0025_drive_pro.sql (aucune migration active/non-archivée ne le définit) — la garantie de remplissage n'est donc pas certaine en prod. Conséquence dans facture-pro.ts : la ventilation par taux (calculée depuis les lignes) affiche 'TVA 0.0 %' alors que le Total TVA affiché plus bas vient de commandes_pro.montant_tva (non nul) → facture interne incohérente.
- **Repro :** 1. Une commandes_pro_lignes avec tva_taux NULL (trigger non appliqué) mais commandes_pro.montant_tva > 0. 2. GET /api/factures-pro/<id>/pdf. 3. Détail ligne affiche 'TVA 0.0 %', ventilation TVA = 0 €, mais 'Total TVA' affiche le montant DB non nul → divergence.
- **Correctif :** Joindre products.tva_taux et utiliser le taux produit si la ligne est NULL (ou lever une erreur si manquant). Ne jamais défaulter le taux TVA à 0 sur une facture.

### 19. POST /api/po/[id]/match-bdl - Missing Authentication

- **Fichier :** `apps/stock/app/api/po/[id]/match-bdl/route.ts:30`
- **Catégorie :** Security - Missing Authentication
- **Problème :** La route mute purchase_orders et purchase_order_lignes (statut, quantite_recue) sans authentification. Un attaquant peut lier des BDL arbitraires (même fournisseur) à des PO et faire transitionner leur statut, corrompant les enregistrements d'appro.
- **Repro :** POST /api/po/<po-id au statut 'envoyee'>/match-bdl avec {bdl_id: <uuid d'un BDL du même fournisseur>} sans auth → statut PO modifié + quantites reçues écrasées.
- **Correctif :** Ajouter un contrôle d'auth à la l.30 : vérifier la session via supabaseServer().auth.getUser() ou exiger x-internal-secret === INTERNAL_API_SECRET.

### 20. Échec du UPDATE DB après capture Stripe réussie renvoie quand même HTTP 200 'success'

- **Fichier :** `apps/stock/app/api/stripe/capture-payment/route.ts:206-234`
- **Catégorie :** Error Handling
- **Problème :** Après une capture Stripe réussie (ligne 171), l'UPDATE commandes_drive (ligne 198-204) peut échouer (panne DB, RLS, timeout). Lignes 206-214 : le code se contente de console.error et NE retourne PAS d'erreur ; il poursuit jusqu'au return ligne 229-233 avec status:'success'. Le commentaire suppose que le webhook payment_intent.succeeded rattrapera, mais ce webhook ne se déclenche QUE sur succeeded (capture déjà faite), peut arriver en retard et peut lui-même échouer. Résultat : le client est débité côté Stripe, mais en DB statut_paiement reste 'autorise' et montant_capture_ttc reste NULL, alors que le staff voit 'capture confirmée'. Comptabilité et réconciliation Stripe↔DB cassées, détectable seulement à l'audit. Note: Stripe ne retry pas un endpoint qui renvoie 200, donc rien ne déclenche de correction automatique.
- **Repro :** 1. POST /api/stripe/capture-payment pour une commande valide. 2. Simuler un échec du UPDATE Supabase (RLS / panne) juste après la capture Stripe. 3. La capture Stripe réussit (client débité). 4. errUpd non null → le code log mais renvoie HTTP 200 {status:'success'}. 5. Le staff croit la capture enregistrée ; en DB statut_paiement='autorise', montant_capture_ttc=NULL. État incohérent persistant.
- **Correctif :** Si errUpd, retourner NextResponse.json({error:'db_update_failed'},{status:500}) au lieu d'avaler l'erreur, et/ou tenter un rollback (refund) si l'UPDATE est définitivement impossible. Ne pas présumer que le webhook corrigera.

### 21. POST/GET /api/sync/drive-pull sans authentification — écriture cross-projet via service-role

- **Fichier :** `apps/stock/app/api/sync/drive-pull/route.ts:84`
- **Catégorie :** Authentification & Autorisation
- **Problème :** L'endpoint de synchronisation cross-projet Drive→Stock s'exécute sans authentification (GET et POST), avec la clé service-role en écriture. Un appel non authentifié déclenche la sync, supprime les lignes de préparation 'en_attente' et les recrée. (Contrairement au candidat, la réponse n'expose pas les PII clients.)
- **Repro :** curl -X POST https://<stock>/api/sync/drive-pull → déclenche la sync et le delete/recreate des lignes en_attente sans aucune auth.
- **Correctif :** Ajouter un garde x-internal-secret ou CRON_SECRET en tête de runSync() (ligne 85).

### 22. Aucune vérification de rôle dans handleAccept/handleClarification/handleReject (centre d'alertes IA)

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:116-214`
- **Catégorie :** Sécurité - Contrôle d'accès manquant
- **Problème :** handleAccept (l116), handleClarification (l138) et handleReject (l194) modifient sorties_stock.ia_coherence_score / ia_coherence_notes et déclenchent un push iPhone sans jamais lire employe?.role. La seule protection est le masquage de nav (lib/nav-roles ROLE_ALLOWED). J'ai vérifié middleware.ts : il ne couvre QUE les redirects legacy + CORS Stripe (matcher l152-174), il n'y a aucun layout.tsx sous app/v2/admin/, et V2Shell ne fait que filtrer l'affichage. Donc un rôle caisse/reception/preparation qui connaît/devine l'URL /v2/admin/alertes peut accepter/rejeter une sortie suspecte et altérer le score d'audit IA, ou spammer un collègue via push 'clarification'. P0 d'origine exagéré (pas de fuite PII ni d'argent capturé, RLS Supabase peut limiter l'UPDATE) → P1.
- **Repro :** Se connecter par PIN avec un employé role='reception'. Naviguer manuellement vers /v2/admin/alertes (non bloqué par middleware ni layout). Ouvrir une sortie suspecte, cliquer 'Accepter la sortie' → UPDATE sorties_stock ia_coherence_score=1.0 sans contrôle de rôle, la sortie disparaît du filtre lt(0.7).
- **Correctif :** Ajouter en tête de chaque handler : if (employe?.role !== 'admin' && employe?.role !== 'manager') { toast.error('Accès non autorisé'); return; } et idéalement durcir la RLS UPDATE sur sorties_stock. Aligner sur commandes-pro/page.tsx l93 (isManager) qui le fait déjà.

### 23. Onglet Démarque alimenté par des données factices hardcodées + Math.random() présentées comme alertes réelles

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:265-310`
- **Catégorie :** Intégrité des données - Fausses métriques
- **Problème :** loadAll() construit l'onglet Démarque (et le KPI 'DÉMARQUE 7J … à enquêter' en euros, l369) avec des valeurs inventées : Coca Zero EAN 5449000131836 codé en dur (entrees:96, ventes:78, ecart:-14, valeur:14*2.2, l274-284), puis pour 2 EAN fixes (l290) des lignes générées par Math.random() (l297-308 : ecart, entrees, ventes, valeur aléatoires). Ces chiffres changent à CHAQUE rechargement de page et ne reflètent aucun stock réel. La page est explicitement destinée à la décision Otmane/Ahmed (header l351-353) : ils voient une démarque chiffrée en € totalement fictive et non reproductible.
- **Repro :** Ouvrir /v2/admin/alertes onglet Démarque. Les écarts/valeurs affichés sont les mêmes produits inventés ; recharger la page → les colonnes Entrées/Ventes/Valeur changent (Math.random) sans qu'aucun stock n'ait bougé. Le KPI 'DÉMARQUE 7J' en € varie aléatoirement.
- **Correctif :** Remplacer par un vrai calcul : SUM(entrées réception) - SUM(ventes commandes_drive 7j) - SUM(sorties_stock) vs stock_par_depot.quantite, valeur via prix réel. Supprimer le bloc Coca hardcodé et tout Math.random() sur des métriques métier. À défaut, ne rien afficher (tab vide) plutôt que des chiffres faux.

### 24. commandes-pro/page.tsx: UI-only role check for manager validation (validation bypass)

- **Fichier :** `apps/stock/app/v2/admin/commandes-pro/page.tsx:126-155 (garde 132-140), setCommandeStatut lib/db/pro.ts:219-237`
- **Catégorie :** Security / Authorization
- **Problème :** Le garde-fou 'validation manager au-delà de 500€' n'existe que côté UI. La mutation backend setCommandeStatut n'a aucune vérification de rôle, donc le seuil est contournable par appel direct.
- **Repro :** Login rôle 'reception'. Sur /v2/admin/commandes-pro, ouvrir une commande montant_ttc>500€ en 'à valider'. Le bouton est désactivé (bloqueParManager). Mais via console : await setCommandeStatut(commandeId,'validee',employe.id) → commande validée, seuil manager contourné.
- **Correctif :** Faire respecter le seuil côté serveur : route API ou RLS/trigger sur commandes_pro refusant le passage a_valider→validee quand montant_ttc>SEUIL et que le rôle n'est pas manager/admin.

### 25. Perte silencieuse de quantité reçue en apprentissage carton (update sans vérification d'erreur)

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:462-470`
- **Catégorie :** Data Loss
- **Problème :** bindCartonToProduct met à jour quantite_recue d'une ligne BDL existante (l.462-470) sans vérifier l'erreur retournée par Supabase, puis affiche un toast de succès inconditionnel (l.483). Un échec DB est avalé → fausse confirmation + décompte erroné au finalize.
- **Repro :** 1. Apprendre un carton pour un produit déjà présent dans le BDL. 2. Simuler un échec de l'UPDATE (RLS/contrainte/réseau). 3. Toast 'Carton appris' affiché malgré l'échec. 4. fetchBdl recharge → la quantité revient à l'ancienne valeur. 5. Au finalize, le stock incrémenté est inférieur au réel.
- **Correctif :** Capturer l'erreur de l'update (const { error } = await sb...update(...)) et, si error, toast.error(error.message) + return avant le toast de succès, comme dans handleScan.

### 26. Insertion de ligne BDL sans vérification d'erreur en apprentissage carton

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:472-481`
- **Catégorie :** Data Loss
- **Problème :** bindCartonToProduct, branche produit-hors-BDL, insère une ligne bons_de_livraison_lignes (l.472-481) sans vérifier l'erreur, puis confirme par toast (l.483). Un échec d'insert est avalé → ligne absente → stock non incrémenté au finalize.
- **Repro :** 1. Apprendre un carton pour un produit absent du BDL. 2. Forcer un échec d'insert (contrainte/RLS). 3. Toast 'Carton appris' affiché. 4. fetchBdl recharge → la ligne n'apparaît pas. 5. finalize n'incrémente pas le stock de ce produit.
- **Correctif :** Capturer l'erreur de l'insert et, si error, toast.error + return avant le toast de succès et avant setLearnCartonModal(null).

### 27. finalize() crée une fiche stock_par_depot sans prix_vente (article invendable)

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:641-646`
- **Catégorie :** Business Logic
- **Problème :** La création de la fiche stock_par_depot au finalize (l.641-646) omet prix_vente, créant une ligne visible (is_visible:true) avec prix NULL pour tout produit reçu non encore stocké dans le dépôt destination.
- **Repro :** 1. Recevoir un BDL contenant un produit existant au catalogue mais sans ligne stock_par_depot pour le dépôt destination. 2. Finaliser la réception. 3. Vérifier stock_par_depot : nouvelle ligne avec prix_vente=NULL et is_visible=true. 4. Le produit apparaît en stock mais sans prix de vente exploitable.
- **Correctif :** Renseigner prix_vente à l'insert (récupéré depuis une autre ligne stock du produit ou un champ prix de référence), ou poser is_visible:false par défaut tant qu'aucun prix n'est défini, comme le fait submitCreateProduct.

### 28. Maj stock_par_depot silencieuse a la validation BDL — BDL receptionne mais stock non incremente

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:632-639`
- **Catégorie :** Data Loss
- **Problème :** A la validation BDL, l'increment de stock_par_depot n'inspecte pas .error et le BDL est marque receptionne ensuite ; un echec de maj laisse le stock fige tandis que la reception est declaree complete.
- **Repro :** Valider une reception (toutes lignes 'recu') alors qu'une maj stock_par_depot echoue (RLS/contrainte). Toast 'Reception validee', statut BDL=receptionnee, mais la quantite du depot n'a pas augmente.
- **Correctif :** Capturer chaque error de update/insert/select dans la boucle et throw avant de marquer le BDL receptionnee (deplacer la maj statut hors du chemin d'erreur, idealement une RPC transactionnelle).

### 29. Insert stock_par_depot silencieux a la validation BDL — nouveau produit jamais en stock

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:641-646`
- **Catégorie :** Data Loss
- **Problème :** A la validation BDL, l'insert de la ligne stock pour un produit absent du depot n'inspecte pas .error ; un echec (ou un conflit du au lookup existing non verifie) perd les quantites reçues alors que le BDL est marque complet.
- **Repro :** Valider une reception comportant un produit absent du depot destination alors que l'insert stock_par_depot echoue (conflit/RLS). BDL=receptionnee mais aucune ligne stock pour ce produit.
- **Correctif :** Verifier .error de l'insert (et du select existing) et throw avant la maj du statut BDL ; idealement encapsuler dans une RPC transactionnelle (upsert atomique).

### 30. finalize() utilise bdl.depot_destination_id! sans garde null → stock orphelin / insert avalé

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:629, 643`
- **Catégorie :** Data Integrity / Null Safety
- **Problème :** Dans finalize() (l.621-648), le SELECT stock_par_depot filtre .eq('depot_id', bdl.depot_destination_id!) (l.629). Si depot_destination_id est null, maybeSingle() ne matche rien → existing null → on tombe dans l'INSERT (l.641-646) avec depot_id: bdl.depot_destination_id (null). Cet INSERT n'est NI awaité-checké (aucun {error}) : soit violation NOT NULL avalée silencieusement (stock jamais incrémenté → marchandise reçue non comptée), soit ligne stock à depot_id null (orpheline, invisible dans /v2/stock par dépôt). Le BDL est ensuite marqué 'receptionnee' (l.650-657) malgré l'échec → perte de données silencieuse. La non-vérification générale des inserts stock_par_depot est connue, mais le cas spécifique 'depot_destination_id null non gardé en amont de finalize' ne l'est pas.
- **Repro :** 1. BDL dont depot_destination_id est null (créé sans dépôt) 2. Scanner produits → statut 'recu' 3. Valider la réception 4. stock_par_depot non incrémenté (ou ligne null) mais BDL passe 'receptionnee' → stock faux, aucun message.
- **Correctif :** Garde en tête de finalize(): if(!bdl.depot_destination_id){toast.error('Dépôt destination manquant sur le BDL'); return;} et vérifier {error} sur l'insert/update stock_par_depot avant de marquer receptionnee.

### 31. submitCreateProduct : insert stock_par_depot non vérifié → produit sans prix/stock initial (orphelin)

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:363-372`
- **Catégorie :** Error Handling / Data Integrity
- **Problème :** Dans submitCreateProduct, l'INSERT stock_par_depot (l.365-371) n'est pas error-checké : aucun {error} n'est destructuré, le résultat est ignoré. Si l'insert échoue (FK, contrainte unique produit_id+depot_id, RLS), l'erreur est avalée silencieusement et le code continue : produit créé (l.350) + ligne BDL ajoutée (l.376) + toast succès (l.398). Conséquence : le produit existe mais SANS ligne stock_par_depot pour le dépôt → pas de prix_vente initial ni de visibilité → invisible/non vendable dans /v2/stock pour ce dépôt jusqu'à correction manuelle. C'est l'enregistrement du prix de vente saisi par l'employé qui est perdu. Distinct du finding depot_destination_id null (ici l'insert peut échouer même avec un dépôt valide).
- **Repro :** 1. Scanner EAN inconnu → modal création 2. Remplir nom+prix+qté → Créer 3. Insert stock_par_depot échoue (ex. contrainte/RLS) 4. Toast 'Fiche créée', ligne BDL ajoutée, mais aucune ligne stock_par_depot → produit invisible dans /v2/stock, prix saisi perdu.
- **Correctif :** const {error:errStock}=await sb.from('stock_par_depot').insert({...}); if(errStock) throw new Error('Stock initial non créé : '+errStock.message); (le throw renvoie au catch existant qui garde le modal pour retry).

### 32. completeInventaire n'applique jamais le comptage physique au stock réel (stock_par_depot non corrigé)

- **Fichier :** `apps/stock/lib/db/index.ts:832-858`
- **Catégorie :** Business Logic / Data Loss
- **Problème :** La fonction inventaire tournant enregistre l'écart constaté (quantite_comptee, ecart) mais ne propage jamais ce comptage au stock réel : aucun adjustStock, aucun trigger DB, aucune validation admin ne corrige stock_par_depot. Le stock affiché reste faux jusqu'à la prochaine réception/sortie qui l'écrase. La promesse 'inventaire qui ne ment pas' est cassée.
- **Repro :** 1. Produit P : stock_par_depot.quantite=10. 2. Inventaire tournant assigné avec quantite_attendue=10. 3. Employé compte 3, valide (validateAll → completeInventaire). 4. inventaires_tournants : quantite_comptee=3, ecart=-7. 5. Vérifier stock_par_depot : toujours 10. /v2/inventaire/historique affiche l'écart mais le stock n'est jamais corrigé.
- **Correctif :** Après l'UPDATE de completeInventaire, appeler adjustStock(produit_id, depot_id, delta=(quantiteComptee - quantite_attendue), type='inventaire', {referenceId: inventaireId}) pour réconcilier stock_par_depot à la réalité physique. Idéalement au moment de la validation admin (statut 'valide') pour garder un contrôle.

### 33. Correction admin des horaires : aucun contrôle de rôle côté serveur (gate isAdmin client-only)

- **Fichier :** `apps/stock/lib/db/pointage.ts:209-229`
- **Catégorie :** Security/Authorization
- **Problème :** `updatePointage()` exécute un UPDATE direct sur `pointages` sans aucune vérification de rôle ; côté page (page.tsx ligne 402) le bouton 'Corriger' n'est gardé que par `isAdmin` calculé en client (`employe?.role`). Comme la RLS est `anon_all`, n'importe quel employé non-admin peut, depuis la console, appeler `updatePointage(idDunCollegue, {...})` et falsifier les heures d'autrui. Vecteur distinct du candidat RLS mais dépend de la même faille sous-jacente — réel mais redondant avec le finding P0 sur la migration.
- **Repro :** Connecté en employé simple (rôle non admin), ouvrir la console et appeler `updatePointage('<pointage-collegue>', {arrivee:'2026-06-08T06:00:00Z', depart:'2026-06-08T20:00:00Z'})`. L'UPDATE réussit, gonflant les heures payées.
- **Correctif :** Faire passer la correction par une RLS qui restreint l'UPDATE aux admins/managers (cf. fix du finding RLS), ou par une route API protégée qui valide le rôle serveur avant d'écrire. La gate `isAdmin` client ne suffit pas.

### 34. Facture Pro : double source TVA (ventilation par taux ≠ montant_tva DB) sans réconciliation

- **Fichier :** `apps/stock/lib/pdf/facture-pro.ts:156-189`
- **Catégorie :** Financial/Calculation
- **Problème :** Le builder calcule la ventilation TVA par taux à partir des lignes (ligne 160 : cur.tva += round(l.prixHtTotal * l.tvaTaux/100)) et affiche en bas data.montantTva (ligne 189), qui provient de commandes_pro.montant_tva. Aucun contrôle que la somme des parTaux == montantTva. Si les tva_taux des lignes sont à 0 (cf. bug précédent) ou si montant_tva DB a été calculé différemment (arrondi global vs ligne à ligne), la facture montre deux totaux TVA contradictoires. Distinct du bug d'arrondi de ventilation facture-pro déjà connu : celui-ci porte sur la double source de vérité.
- **Repro :** 1. Lignes avec tvaTaux=0 (ou somme des arrondis ligne ≠ montant_tva global). 2. Générer le PDF. 3. Bloc 'Ventilation TVA' et ligne 'Total TVA' affichent des montants différents.
- **Correctif :** Source unique de vérité : recalculer montantTva = somme des ventilations ligne, OU dériver la ventilation du même calcul que montant_tva. Ajouter une assertion sum(parTaux.tva) ≈ montantTva avant rendu.

### 35. Depot persistence bug: orphaned depot after logout (employé suivant hérite du dépôt du précédent)

- **Fichier :** `apps/stock/lib/v2-store.ts:33`
- **Catégorie :** State Management
- **Problème :** logoutEmploye ne vide pas currentDepot ; combiné au garde `if (!current)` de l'auto-sélection, le nouvel employé hérite du dépôt actif du précédent au lieu de son depot_principal_id.
- **Repro :** 1. Employé A se connecte, dépôt auto = Particulier. 2. A se déconnecte (Déconnexion dans AdminMenu). 3. Employé B (depot_principal_id = Professionnel) se connecte. 4. Le dépôt actif reste « Particulier » au lieu de basculer sur « Professionnel ».
- **Correctif :** Vider aussi le dépôt à la déconnexion : `logoutEmploye: () => set({ currentEmploye: null, currentDepot: null })` (ligne 33). L'auto-sélection de DepotSwitcher repositionnera alors sur depot_principal_id.

### 36. gdpr-delete-account : commandes Drive au poids jamais anonymisées (commandes_drive.id ≠ orders.id)

- **Fichier :** `supabase/functions/gdpr-delete-account/index.ts:109-131`
- **Catégorie :** Data Inconsistency: Incomplete Deletion
- **Problème :** La suppression RGPD anonymise commandes_drive en filtrant sur les ids issus de la table orders. Comme les commandes Drive au poids sont créées directement dans commandes_drive avec un UUID propre et sans entrée orders, leurs PII (nom, email, téléphone) ne sont jamais effacées.
- **Repro :** 1. Un client passe une commande Drive au poids (hasWeightLine=true) → ligne créée seulement dans commandes_drive. 2. Le client demande la suppression de compte. 3. gdpr-delete-account lit orders WHERE user_id → vide. 4. orderIds=[] → bloc L111 sauté → driveAnonymized=0. 5. commandes_drive.client_email/client_nom/client_telephone restent en clair.
- **Correctif :** Anonymiser commandes_drive par l'email du user (`.eq('client_email', user.email)`) en plus du filtre par orderIds, ou ajouter un FK user_id à commandes_drive et filtrer dessus. Effacer toutes les commandes Drive du user indépendamment de la table orders.

### 37. Suppression RGPD incomplète : comptes_pro (PII du délégué) jamais anonymisés

- **Fichier :** `supabase/functions/gdpr-delete-account/index.ts:71-144`
- **Catégorie :** Sécurité/RGPD
- **Problème :** La fonction gdpr-delete-account anonymise profiles (l.72-79), orders (l.100-103), commandes_drive (l.112-122) et supprime push_subscriptions (l.134-137). Elle n'effectue AUCUNE opération sur comptes_pro. Pour un utilisateur qui est délégué d'un compte Pro (comptes_pro.delegue_user_id = userId), les PII delegue_nom (NOT NULL), delegue_telephone (NOT NULL), delegue_email (NOT NULL) restent intactes après l'effacement RGPD. Le commentaire d'en-tête (l.17-37) ne mentionne que le flux B2C : le cas B2B Pro est un angle mort. Réel manquement à l'art. 17. Sévérité abaissée de P0 à P1 : pas de fuite/argent, périmètre Pro restreint (comptes validés manuellement), mais erasure incomplète bien réelle.
- **Repro :** 1. Compte Pro avec delegue_user_id = U, delegue_email='x@co.com', delegue_telephone, delegue_nom renseignés. 2. U se connecte et lance la suppression via Account.tsx → gdpr-delete-account. 3. La fonction retourne deleted:true. 4. SELECT delegue_email,delegue_telephone,delegue_nom FROM comptes_pro WHERE delegue_user_id=U → PII toujours présentes.
- **Correctif :** Ajouter dans la fonction (après l.131) un UPDATE comptes_pro SET delegue_nom='Anonyme', delegue_telephone='', delegue_email=maskedEmail WHERE delegue_user_id = userId (colonnes NOT NULL → poser des valeurs, pas null, comme pour profiles). Éventuellement aussi nuller delegue_user_id pour couper le lien.

### 38. Anonymous write policy allows data forgery (security/trust critical)

- **Fichier :** `supabase/migrations/20260530000000_lots_traceability.sql:59-60`
- **Catégorie :** Security - Data Integrity
- **Problème :** La policy 'anon_write_all' est bien 'for all using (true) with check (true)' sur produits_lots, table lue publiquement par /lot/:id qui EST la preuve halal (le moat). N'importe quel client anonyme peut INSERT/UPDATE/DELETE un lot : forger un faux lot certifie AVS, modifier le certifier_valid_until d'un lot existant, ou supprimer un lot legitime. C'est une atteinte directe a l'integrite de la traçabilite halal exposee aux clients. Reel et grave. Je nuance la severite a P1 plutot que P0 strict : c'est une faille d'integrite/confiance (pas de PII fuitee ici, pas de paiement), et le commentaire de migration la presente comme 'POC write policy ... for local dev/demo' — ce qui signale qu'elle ne devrait pas survivre en prod. L'enjeu reste critique car la fraude halal detruit la confiance. Note : non liste dans l'anti-doublon des vagues 1+2 (qui ne cite que 0025_drive_pro pour les migrations), donc nouveau vis-a-vis de cette liste.
- **Repro :** 1. Ouvrir la console DevTools sur le site Drive (cle anon). 2. supabase.from('produits_lots').insert({ id:'L2026-06-FAKE', produit_id:'<uuid produit existant>', certifier_id:'AVS', certifier_name:'AVS — A Votre Service', certifier_valid_until:'2027-12-31', abattoir_nom:'Faux', date_reception:'2026-06-08' }). 3. L'insert reussit sans auth. 4. Naviguer /lot/L2026-06-FAKE → badge 'Certifie & verifie' affiche sur un lot forge. Idem update/delete d'un lot reel.
- **Correctif :** Supprimer la policy 'anon_write_all'. Garder uniquement 'read_all' (select using true) pour la page publique. Toutes les ecritures (reception staff) passent en service-role via server action / Edge Function. Creer une NOUVELLE migration horodatee (append-only) qui drop la policy et la remplace par des policies d'ecriture restreintes a service_role / role staff.

### 39. adjust_stock RPC ramène silencieusement le stock à 0 au lieu de bloquer un sur-décrément

- **Fichier :** `supabase/migrations/20260604000002_stock_ledger_atomic.sql:117, 121, 125`
- **Catégorie :** Business Logic / Data Integrity
- **Problème :** adjust_stock clampe à zéro (greatest(0,...)) au lieu de refuser un mouvement qui rendrait le stock négatif. Sur le chemin sortie/casse, un sur-décrément réussit sans erreur : le stock tombe à 0, le ledger enregistre delta=-10 / quantite_apres=0, mais l'écart (5 unités sorties en trop) est perdu et la sortie est validée comme si tout était normal. transfer_stock bloque ce cas, mais createSortie ne le fait pas.
- **Repro :** 1. Stock produit P au dépôt D = 5. 2. /v2/sortie : produit P, quantité 10, photo, valider. 3. createSortie appelle adjust_stock(delta=-10,type='casse'). 4. RPC retourne 0 sans erreur, ledger inscrit delta=-10/quantite_apres=0. 5. Sortie validée (toast succès), stock=0, mais 5 unités fantômes ont 'disparu' sans alerte.
- **Correctif :** Aligner le chemin sortie sur transfer_stock : dans adjust_stock, si p_delta<0 et v_avant + p_delta < 0, raise exception 'Stock insuffisant' (au moins pour les types 'sortie'/'casse'/'transfert'), au lieu de greatest(0,...). Ou vérifier le stock dans createSortie avant l'appel.

### 40. v_productions_kpi référence des colonnes inexistantes (quantite, prix_unitaire, p.recette)

- **Fichier :** `supabase/migrations/_archive/0025_productions_kpi.sql:43-44,69`
- **Catégorie :** Schema Mismatch
- **Problème :** La vue v_productions_kpi (seule définition, dans 0025) référence productions_inputs.quantite et productions_inputs.prix_unitaire (lignes 43-44) et productions.recette (ligne 69), colonnes qui n'existent pas dans le schéma 0024 réel (quantite_reelle_consommee / cout_unitaire_ht ; recette_id). Tout SELECT sur la vue échoue. Le module labo Stock contourne via fallback table, mais le hook Drive useProductionsKpi throw l'erreur, cassant les pages labo Drive (ProductionDetail, RecetteDetail, useProductionKpi).
- **Repro :** 1. Ouvrir une page labo Drive qui appelle useProductionsKpi/useProductionKpi (ex /labo/production/<id>). 2. Le hook fait .from('v_productions_kpi').select('*'). 3. Postgres renvoie une erreur (colonne quantite/prix_unitaire inexistante, ou vue absente). 4. Ligne 32 : `if (error) throw error` → React Query passe en error, la page KPI marge ne s'affiche pas.
- **Correctif :** Recréer v_productions_kpi dans une NOUVELLE migration horodatée : sum(quantite_reelle_consommee) as input_total_qty, sum(quantite_reelle_consommee * cout_unitaire_ht) as cout_matieres (ou utiliser la colonne générée cout_total), et joindre recettes via productions.recette_id pour exposer r.nom. Ne pas éditer le fichier _archive.

## P2 — Dégradé (68)

### 41. DriveStripePayment affiche un montant de pré-autorisation calculé client (×1,20 sur total) divergent du backend (×1,20 sur poids seul)

- **Fichier :** `apps/drive/src/components/DriveStripePayment.tsx:70`
- **Catégorie :** Logic Error - Pricing/Authorization
- **Problème :** État initial authorizedCents = Math.round(estimatedCents * 1.2) applique la marge sur TOUT le panier, alors que le backend ne l'applique que sur les lignes au poids (drive-pesee.ts:278). Sur panier mixte poids+unité, le montant affiché avant réponse API est plus élevé que le vrai. La réponse API (ligne 100) corrige, mais l'affichage initial est faux.
- **Repro :** 1) Panier mixte : 85€ au poids + 15€ unité (bracket). 2) Affichage initial DriveStripePayment : Math.round(10000*1.2)=120€. 3) Backend réel : ceil(8500*1.2)+1500 = 10200+1500 = 117€. 4) Flash '120€' avant correction à '117€' à la réponse API.
- **Correctif :** Initialiser authorizedCents à estimatedCents (sans marge, ou null + skeleton) jusqu'à réception de data.montantAutoriseCents, OU n'afficher le bloc 'Montant autorisé' qu'après la réponse API. Ne pas reproduire une formule métier divergente côté client.

### 42. Export RGPD (portabilité art. 20) omet les commandes Pro du délégué

- **Fichier :** `apps/drive/src/pages/Account.tsx:69-88`
- **Catégorie :** RGPD/Complétude des données
- **Problème :** handleExport (l.69-88) ne lit que la table commandes_drive (filtre client_email = exportEmail) et construit payload.commandes à partir de ce seul résultat. Un utilisateur délégué d'un compte Pro qui a passé des commandes Pro (commandes_pro via comptes_pro.delegue_user_id) reçoit un export incomplet : aucune de ses commandes B2B n'y figure. L'export se déclare 'salamarket-drive/rgpd-export@1' mais n'est pas exhaustif pour les comptes Pro. Réel manquement à l'art. 20 (portabilité). Pas d'argent ni de fuite → P2.
- **Repro :** 1. Délégué Pro avec N commandes dans commandes_pro et M commandes dans commandes_drive. 2. Clic 'Télécharger mes données'. 3. Le JSON téléchargé contient payload.commandes = M lignes seulement ; les N commandes Pro manquent.
- **Correctif :** Si le user est délégué d'un compte Pro (récupérer comptes_pro.id via delegue_user_id), ajouter une requête commandes_pro (+ commandes_pro_lignes) et fusionner dans payload, sous une clé distincte (ex. commandes_pro) pour distinguer B2C/B2B.

### 43. Remise promo affichée mais jamais déduite du montant facturé (bouton créneau utilise subtotal pré-remise)

- **Fichier :** `apps/drive/src/pages/Cart.tsx:695`
- **Catégorie :** Logic Error - Business Logic
- **Problème :** Le bouton 'Choisir un créneau' (Cart.tsx:695) utilise subtotal AVANT remise comme garde du minimum 15€, et non le total remisé (ligne 87). Surtout, la remise n'est jamais transmise au serveur : ni le payload Checkout (ligne 179-194) ni l'edge function create-checkout-session ne portent de promo. Donc même si un code réduit l'affichage à 13€, le serveur facture le plein subtotal. Incohérence d'affichage, pas blocage paiement.
- **Repro :** Latent : nécessite que la RPC validate_promo_code soit déployée (absente en prod aujourd'hui). Une fois déployée : 1) panier 20€ subtotal. 2) appliquer code -7€ → affichage total 13€. 3) le bouton reste actif (disabled={2000<1500}=false). 4) au checkout, le serveur facture 20€ (remise ignorée) — le client a vu 13€ mais paie 20€.
- **Correctif :** À la source : transmettre le promo (code) au payload Checkout et l'appliquer côté edge function create-checkout-session pour facturer le montant remisé. Tant que ce n'est pas fait, ne pas afficher de remise trompeuse. Accessoirement aligner la garde du bouton sur `total` (ligne 87).

### 44. Cart stepper +/- increments quantity for weight lines, incorrectly doubling price

- **Fichier :** `apps/drive/src/pages/Cart.tsx:453-487`
- **Catégorie :** Business Logic
- **Problème :** Le stepper +/- est affiché et cliquable sur les lignes weight. Comme le prix/poids estimé est calculé `quantiteKg × quantity`, incrémenter quantity double l'estimation de poids et de montant, ainsi que le montant_autorise_ttc Stripe. Or le préparateur ne pèse qu'une seule fois la ligne : la capture se fait au poids réel pesé (< autorisé), donc pas de surfacturation client immédiate, mais une incohérence quantité (le client croit commander 2× et n'en reçoit qu'1×) et une sur-pré-autorisation Stripe. Sévérité ramenée à P2 (incohérence UX/quantité, pas de perte d'argent directe).
- **Repro :** 1. Ajouter un produit au poids (ex. merguez 18 €/kg) avec 1,5 kg au panier → estimation ~27 €. 2. Cliquer + pour passer quantity à 2. 3. L'estimation passe à ~54 € et l'affichage indique « pour 3 kg ». 4. Le montant_autorise_ttc Stripe est calculé sur 3 kg alors qu'une seule ligne sera pesée. Attendu : le stepper devrait être masqué pour les lignes weight/weight_bracket.
- **Correctif :** Masquer le stepper +/- pour les lignes weight et weight_bracket dans Cart.tsx (lignes 452-487) ; chaque variante au poids = une ligne distincte avec son propre quantiteKg.

### 45. Checkout doesn't clear slot on error after payment failure

- **Fichier :** `apps/drive/src/pages/Checkout.tsx:209-221`
- **Catégorie :** State Management
- **Problème :** Après un 409, selectedSlotId n'est pas effacé du store. L'utilisateur qui ne suit pas l'action du toast garde un slot invalide sélectionné et peut retenter en vain.
- **Repro :** 1. Sélectionner un slot. 2. Le slot se remplit entre-temps. 3. Soumettre → 409. 4. Fermer le toast sans cliquer l'action. 5. selectedSlotId est toujours présent ; un nouveau clic re-tente le même slot complet (re-rejeté serveur).
- **Correctif :** Appeler clearSlot() dans la branche 409 (Checkout.tsx ~L210-216) pour forcer l'utilisateur à re-choisir un créneau valide.

### 46. Panier non vidé sur échec/annulation de redirection Stripe (flow legacy unit) → commande pending dupliquée + place de créneau consommée

- **Fichier :** `apps/drive/src/pages/Checkout.tsx:234-249`
- **Catégorie :** Data Consistency
- **Problème :** En flow legacy (100% unit), create-checkout-session a deja cree la ligne `orders` status='pending' ET incremente pickup_slots.reserved_count (+1) AVANT de renvoyer checkout_url. Checkout.tsx fait window.location.href=checkout_url SANS vider le panier (commentaire explicite l.236-237 : clear delegue a OrderConfirmation, qui n'est atteint qu'en cas de succes). Si l'utilisateur annule le paiement (cancel_url=/paiement?cancelled=1) ou si la redirection echoue (timeout 3s l.244), il revient sur Checkout avec le panier intact et peut re-soumettre : une 2e commande `orders` pending est creee + un 2e reserved_count +1. La 1re commande pending reste orpheline et consomme une place du creneau jusqu'a expiration. Le bug vague-1 connu ne couvre que 'slot non libere'; ici s'ajoute la duplication de commande par panier non vide.
- **Repro :** 1. Panier d'items 'unit', aller a /paiement, choisir un creneau (capacity 2). 2. Soumettre → orders 'ord-001' pending, reserved_count=1, redirection Stripe. 3. Annuler le paiement sur la page Stripe → retour /paiement?cancelled=1, panier toujours plein. 4. Re-soumettre → orders 'ord-002' pending, reserved_count=2. Le creneau est marque complet alors qu'aucun paiement n'a abouti, ord-001 reste orpheline.
- **Correctif :** Avant window.location.href=checkout_url (l.248), persister une trace de l'order_id en cours et, au retour avec ?cancelled=1, proposer de reprendre l'order existant plutot que d'en recreer une ; OU cote serveur, reutiliser/annuler la commande pending existante du meme user/slot avant d'en creer une nouvelle. Liberer le reserved_count des commandes pending non payees via un cron/expiration.

### 47. Panier non vidé si le paiement Stripe Elements échoue (flow Drive au poids / manual capture) → commande_drive dupliquée

- **Fichier :** `apps/drive/src/pages/Checkout.tsx:225-232`
- **Catégorie :** Data Consistency
- **Problème :** En flow weight, create-checkout-session cree `commandes_drive` + `commandes_drive_lignes` et incremente reserved_count AVANT de renvoyer commande_id (l.246-311). Checkout.tsx fait alors setCommandeIdForElements(data.commande_id) (l.229) SANS vider le panier. Si la carte est refusee dans DriveStripePayment (result.error l.293), l'erreur s'affiche mais le panier reste plein. Si l'utilisateur revient via le bouton header '/creneaux' (l.285) puis re-soumet, une 2e `commandes_drive` est creee pour les memes items + un 2e reserved_count. clearCart() n'est appele que dans OrderConfirmation sur succes (l.219), jamais sur echec de paiement. Distinct du candidat 3 : table et flow differents.
- **Repro :** 1. Panier avec une ligne au poids, /paiement, choisir creneau, soumettre → commandes_drive 'cmd-001' creee, reserved_count+1, DriveStripePayment monte. 2. Saisir une carte refusee → erreur affichee, panier toujours plein. 3. Cliquer la fleche retour (header) → /creneaux, re-choisir, re-soumettre → commandes_drive 'cmd-002' pour les memes items, reserved_count+1. cmd-001 reste orpheline.
- **Correctif :** Sur echec de paiement (onError/result.error dans DriveStripePayment), ne pas vider le panier mais REUTILISER commandeIdForElements (re-appeler create-payment-intent sur la meme commande) au lieu d'autoriser une re-soumission qui recree une commande. Cote serveur, deduper sur (user, slot, items) avant d'inserer une nouvelle commandes_drive.

### 48. Promo code discount not transmitted to payment backend

- **Fichier :** `apps/drive/src/pages/Checkout.tsx:179-194`
- **Catégorie :** Logic Bug / Revenue Loss
- **Problème :** Le code promo appliqué dans Cart n'est jamais transmis au backend ; le backend refacture plein tarif depuis la DB. Bug d'architecture réel mais inerte tant que la RPC validate_promo_code est absente de prod.
- **Repro :** Futur (RPC déployée) : 1) panier 50€, 2) code promo -5€ valide → Cart affiche 45€, 3) Checkout → payload sans promo → backend crée la commande à 50€. Aujourd'hui non reproductible car la RPC renvoie toujours valid:false.
- **Correctif :** Quand la RPC promo sera livrée : (a) faire valider/appliquer la remise CÔTÉ SERVEUR dans create-checkout-session (ne jamais faire confiance au client), (b) à défaut, transmettre promo_code dans le payload Checkout pour que le backend re-vérifie et applique. Ne jamais appliquer une remise calculée uniquement côté client.

### 49. TVA des lignes recopiée depuis products (DB courant) alors que le total est figé sur le snapshot panier → facture incohérente

- **Fichier :** `apps/drive/src/pages/pro/Panier.tsx:239-248`
- **Catégorie :** Tax Calculation / Data Integrity
- **Problème :** Les lignes commandes_pro_lignes sont insérées sans tva_taux ; le trigger DB recopie le products.tva_taux actuel. Mais montant_ht/tva/ttc de l'en-tête sont calculés à partir du taux snapshot du panier. Si le taux TVA d'un produit change entre l'ajout au panier et la commande, la facture PDF (qui recalcule le détail TVA par taux depuis les lignes) ne correspond plus au montant TTC stocké/affiché au client.
- **Repro :** 1. Ajouter un produit (tva_taux=5,5%) au panier Pro (snapshot 5,5%) 2. Admin passe ce produit à tva_taux=20% en base 3. Le même délégué valide la commande 4. montant_ttc stocké = calcul à 5,5% (snapshot) ; lignes en base portent 20% 5. La facture PDF affiche un détail 'TVA 20%' incohérent avec le total TTC
- **Correctif :** Passer explicitement tva_taux: l.item.product_tva_taux dans le map des rows (Panier.tsx:239), pour que la ligne porte le taux snapshot affiché au client au lieu du taux DB courant.

### 50. Création commande Pro en 3 mutations non transactionnelles → commande orpheline

- **Fichier :** `apps/drive/src/pages/pro/Panier.tsx:224-272`
- **Catégorie :** Data Integrity
- **Problème :** onValider enchaîne 3 mutations Supabase séparées sans transaction : INSERT commandes_pro (L226-234), INSERT commandes_pro_lignes (L246-249), UPDATE montants ht/tva/ttc (L252-260). Si l'INSERT lignes ou l'UPDATE montants échoue après la création de la commande, la commande_pro reste en base au statut 'a_valider' avec montant_ht/tva/ttc NULL et/ou sans lignes. Aucun rollback dans le catch (L266-271) ne supprime la commande créée. Résultat : commandes incomplètes/cassées visibles côté admin et /pro/commande/:id.
- **Repro :** 1. User Pro clique 'Valider la commande'. 2. INSERT commandes_pro réussit (cmdId créé). 3. Erreur réseau / RLS sur l'INSERT lignes (L246) OU l'UPDATE montants (L252). 4. catch affiche un toast d'échec mais la commande_pro reste en base avec montants NULL et 0 ligne. 5. La commande apparaît cassée en admin (montants absents).
- **Correctif :** Faire un RPC Postgres transactionnel qui crée commande+lignes+montants atomiquement, ou calculer les montants AVANT l'INSERT initial (les inclure dans le premier insert), ou DELETE la commande/lignes dans le catch si une étape ultérieure échoue.

### 51. Plafond de crédit Pro validé uniquement côté client → contournable / désynchronisé

- **Fichier :** `apps/drive/src/pages/pro/Panier.tsx:188-235`
- **Catégorie :** Logique métier/Concurrence
- **Problème :** Le contrôle creditDepasse (l.195) repose sur compte.encours_actuel lu dans l'état du composant (potentiellement périmé) et n'est appliqué que côté client (toast l.218 + disabled bouton l.362). Aucune barrière serveur n'empêche l'INSERT de dépasser le plafond (confirmé : aucune contrainte/trigger BEFORE côté DB). Réel, mais c'est la facette client du même défaut autoritatif côté DB ; sévérité ramenée à P2 (le candidat indiquait P1). Le risque NaN évoqué par le candidat est neutralisé par les fallbacks `?? 0` (l.188-189).
- **Repro :** 1. Même délégué, deux onglets /pro/panier, encours_actuel affiché 950, max 1000. 2. Chaque onglet construit un panier ~40€ (creditDepasse=false des deux côtés). 3. Validation quasi simultanée : les deux passent, encours réel dépasse le plafond.
- **Correctif :** Déplacer l'enforcement côté serveur (trigger BEFORE sur l'UPDATE des montants de commandes_pro, ou RPC transactionnel verrouillant comptes_pro). Le contrôle client reste un confort UX, pas la source de vérité.

### 52. Le bouton CTA affiche le prix plein alors que le panier reçoit le prix remisé DLC (produit unit)

- **Fichier :** `apps/drive/src/pages/ProductDetail.tsx:241-247`
- **Catégorie :** Pricing Logic
- **Problème :** Pour un produit unit avec remise DLC active, le calcul de `totalCents` (lignes 241-247) utilise `product.priceCents * qty` (prix PLEIN) pour le label du bouton « Ajouter au panier · X € » (affiché ligne 473 via formatPrice(totalCents)). Or à l'ajout (lignes 169-171), `dlcUnitPriceCents = dlcDiscount.discountedCents` est propagé au store, qui calcule le total panier sur le prix REMISÉ. Le titre de la page (lignes 672-674) affiche bien le prix barré + remisé via DlcPriceTag, mais le bouton CTA ignore la remise. Résultat : le bouton montre p.ex. 15,00 € alors que la carte produit affiche 10,50 € et que le panier sera facturé 10,50 €. Trois prix incohérents sur le même écran. Le client est facturé MOINS que le bouton (pas de surfacturation), d'où P2 et non P1 — c'est une incohérence d'affichage qui sème la confusion, pas une perte d'argent ni un préjudice client.
- **Repro :** 1. Ouvrir la PDP d'un produit unit_type='unit' avec une ligne v_dlc_alerts active (niveau ≠ ok/forcé, remise_suggeree_pct=30). 2. Le titre affiche prix barré 15,00 € → remisé 10,50 € (DlcPriceTag). 3. Régler la quantité à 1. 4. Le bouton affiche « Ajouter au panier · 15,00 € » (totalCents = priceCents*qty, ligne 246, ignore la remise). 5. Cliquer Ajouter, ouvrir le panier : total ligne = 10,50 € (dlcUnitPriceCents capturé ligne 171). 6. Écart visible entre le prix du bouton et le prix facturé.
- **Correctif :** Aligner totalCents sur le prix réellement mis au panier pour le cas unit : `: (showDlcPrice && dlcDiscount ? dlcDiscount.discountedCents : product.priceCents) * qty`. showDlcPrice et dlcDiscount sont déjà calculés plus bas (lignes 256-262) ; déplacer leur déclaration au-dessus de totalCents ou recalculer inline.

### 53. POST /api/assistant - AI API Key Not Validated (Graceful Degradation Missing)

- **Fichier :** `apps/stock/app/api/assistant/route.ts:491-497`
- **Catégorie :** Data Integrity - Fabricated Mock Response
- **Problème :** Quand ANTHROPIC_API_KEY est absente, la route retourne une réponse mock hardcodée ('14 commandes Drive, 412 € CA, 3 alertes') au lieu d'une erreur. Un décideur peut prendre la réponse pour des données réelles. Le flag mock:true existe mais le contenu reste un chiffre fabriqué.
- **Repro :** Déployer/exécuter sans ANTHROPIC_API_KEY, poser 'combien de commandes cette semaine ?' → réponse '14 commandes Drive pour 412 €' fabriquée.
- **Correctif :** Retourner une erreur explicite au lieu du mock : NextResponse.json({error:'assistant_misconfigured'}, {status:503}). L'UI doit afficher l'indisponibilité, pas des chiffres inventés.

### 54. Assistant API: query_demarque utilise un prix de secours codé en dur à 3€

- **Fichier :** `apps/stock/app/api/assistant/route.ts:405`
- **Catégorie :** Data Quality / Fallback Logic
- **Problème :** Au calcul de la démarque, si stock_par_depot.prix_vente est NULL le code retombe sur 3€/unité codé en dur. Pour des articles à forte valeur (viande premium 15€/kg) la valeur de démarque est sous-estimée jusqu'à 80%. C'est une estimation indicative, pas un chiffre comptable, mais elle peut induire en erreur le pilotage.
- **Repro :** Si des produits sortis en type 'autre'/'vol_identifie' n'ont pas de prix_vente dans stock_par_depot, query_demarque renvoie valeur_demarque_eur calculée à 3€/unité pour ces lignes, indépendamment de leur valeur réelle.
- **Correctif :** Remonter un avertissement quand le fallback 3€ est utilisé (ou exclure ces lignes du total chiffré), ou récupérer un prix moyen depuis les ventes récentes plutôt qu'un 3€ arbitraire.

### 55. BDL finalize API missing error check on UPDATE operation

- **Fichier :** `apps/stock/app/api/bdl/finalize/route.ts:157-165`
- **Catégorie :** Data Integrity
- **Problème :** L'UPDATE qui marque le BDL 'receptionnee' (l.157-165) ne vérifie pas son erreur : pas de `const { error }`, pas de garde. Le handler enchaîne sur la relecture (l.167) puis renvoie ok:true (l.211) même si l'UPDATE a échoué. Le stock a déjà été ajusté atomiquement (RPC adjust_stock checkée l.145-151) mais le statut peut rester non-clos tout en répondant succès → BDL réincrémentable au prochain appel (l'idempotence l.90 repose sur statut='receptionnee'). Distinct du fichier page.tsx (route API serveur séparée, non listée vague 1). Sévérité P1→P2 : échec d'un UPDATE par PK est rare et l'ajustement stock, lui, est fail-closed.
- **Repro :** 1. POST /api/bdl/finalize. 2. L'UPDATE statut échoue (conflit/RLS). 3. La réponse est ok:true alors que le BDL n'est pas marqué receptionnee. 4. Un 2e POST réincrémente le stock (idempotence cassée car statut != 'receptionnee').
- **Correctif :** Récupérer `const { error: updErr }` sur l'UPDATE l.157 et renvoyer 500 si updErr avant de répondre ok:true.

### 56. POST /api/cashbox/import-cashmag n'a aucune authentification (rate-limit IP seul) — import CA magasin non protégé

- **Fichier :** `apps/stock/app/api/cashbox/import-cashmag/route.ts:47`
- **Catégorie :** Security - Missing Authentication
- **Problème :** Le POST (ligne 47) ne fait QUE checkRateLimit(getClientIp, 'import-cashmag', 5, 1h) puis traite le CSV : grep INTERNAL_API_SECRET / x-internal-secret / requireRole / getStaffSession / x-vercel-cron sur ce fichier ne retourne RIEN — aucune authentification. N'importe qui peut POSTer un CSV CashMag et injecter/falsifier les ventes magasin (raw_hash idempotent mais un attaquant peut forger de fausses lignes de CA, ce qui pollue le CA magasin agrégé et les KPI cockpit/Z). Le rate-limit IP n'est PAS de l'authentification (contournable en distribué). DISTINCT du finding import-stock connu en vague 1 : c'est un autre fichier (import-cashmag, route CashMag), non listé dans DÉJÀ CONNUS, avec impact financier propre (CA magasin/NF525). Couvert thématiquement par le gap d'auth /api/* connu mais le file:line est nouveau.
- **Repro :** curl -X POST http://localhost:3000/api/cashbox/import-cashmag -H 'Content-Type: application/json' -d '{"csv":"date;heure;ticket;ean;designation;qte;ttc;mode\n2026-06-08;10:00;FAKE1;0000000000000;FAUX;1;9999;CB"}' → ligne de CA falsifiée insérée sans aucune auth, gonfle le CA magasin.
- **Correctif :** Ajouter une validation x-internal-secret (comme push/send lignes 39-50) ou une session staff rôle comptable/admin avant le traitement, en plus du rate-limit. À traiter avec import-stock dans le même correctif d'auth des routes /api/cashbox/*.

### 57. POST /api/casse-weekly-digest/send-now sans authentification — envoi de digest à un destinataire arbitraire

- **Fichier :** `apps/stock/app/api/casse-weekly-digest/send-now/route.ts:29`
- **Catégorie :** Authentification & Autorisation
- **Problème :** L'endpoint d'envoi manuel du digest casse n'exige aucune authentification et accepte un destinataire `to` arbitraire ; il forge lui-même le token interne vers /api/email/send, donc l'email part vers l'adresse fournie sans contrôle.
- **Repro :** curl -X POST https://<stock>/api/casse-weekly-digest/send-now -H 'Content-Type: application/json' -d '{"to":"attaquant@evil.com"}' → le digest casse part à attaquant@evil.com (si Resend configuré).
- **Correctif :** Ajouter le garde x-internal-secret en tête du POST (ligne 29), comme dans /api/assistant.

### 58. Valeur de remise DLC estimée avec un prix unitaire codé en dur à 8€

- **Fichier :** `apps/stock/app/api/cockpit/snapshot/route.ts:337,353`
- **Catégorie :** Incorrect Calculation
- **Problème :** L'estimation de valeur de démarque DLC utilise un prix unitaire fixe de 8€ (qte * remise% * 8) au lieu du vrai prix produit. Pour les produits à forte valeur, la 'Valeur estimée de remise' affichée sur la card cockpit est très en dessous de la réalité, faussant la perception d'urgence.
- **Repro :** 1. Créer un lot DLC sur dattes Medjool (prix réel ~15€/u), quantite_recue 50, remise 50%. 2. Ouvrir /v2/cockpit. 3. La card DLC affiche valeur ≈ 50*0.5*8 = 200€ au lieu de 50*0.5*15 = 375€.
- **Correctif :** Exposer prix_vente_ttc dans v_dlc_alerts (ou JOIN produits) et remplacer la constante 8 par r.prix_vente_ttc dans les calculs lignes 337 et 353.

### 59. yesterdayIsoParis()/sameDayLastWeekIso() (cockpit/snapshot) — off-by-one near-midnight via toISOString()

- **Fichier :** `apps/stock/app/api/cockpit/snapshot/route.ts:115-127`
- **Catégorie :** date/time/timezone
- **Problème :** yesterdayIsoParis()/sameDayLastWeekIso() reconstruisent la date Paris via toLocaleString puis toISOString().slice(0,10) ; le toISOString final re-décale d'un jour aux frontières de minuit et lors des transitions DST, faussant les fenêtres J-1 et J-1/N-1 des KPI cockpit.
- **Repro :** Déclencher le rafraîchissement du cockpit autour de la bascule UTC/minuit Paris : jourHier/jourN1 peuvent pointer sur le mauvais jour → CA et comparatifs N-1 erronés ce cycle.
- **Correctif :** Remplacer par parisDateString()/yesterdayIsoParis() de lib/cashbox/daily-z.ts (Intl en-CA timeZone Paris) — pas de toISOString() de re-conversion.

### 60. Cron endpoints pass empty string for missing INTERNAL_API_SECRET header

- **Fichier :** `apps/stock/app/api/cron/daily-z/route.ts:43`
- **Catégorie :** Authentication
- **Problème :** daily-z (et autres crons appelant /api/notify) défaultent le secret à '' quand INTERNAL_API_SECRET n'est pas configuré côté cron. /api/notify rejette alors (503 si son propre secret manque, 401 si mismatch). La notif du Z quotidien échoue en silence : 200 OK renvoyé avec notify_status:'failed', sans erreur ni alerte → le proprio ne reçoit pas son Z.
- **Repro :** 1. Déployer sans INTERNAL_API_SECRET (ou avec une valeur différente côté notify). 2. Déclencher GET /api/cron/daily-z. 3. fetch vers /api/notify part avec x-internal-secret:'' → notify répond 503 (secret absent) ou 401 (mismatch). 4. daily-z renvoie 200 {ok:true, notify_status:'failed'} : le cron 'réussit' mais la notification du Z n'est jamais envoyée, silencieusement.
- **Correctif :** Faire échouer bruyamment si le secret manque côté cron : if (!process.env.INTERNAL_API_SECRET) throw/return 503 avant le fetch, et/ou propager notify_status:'failed' en non-200 / alerting. Garantir INTERNAL_API_SECRET identique sur tous les déploiements.

### 61. GET /api/factures-pro/[id]/pdf sans authentification — données B2B (SIRET/TVA) via service-role

- **Fichier :** `apps/stock/app/api/factures-pro/[id]/pdf/route.ts:16`
- **Catégorie :** Information Disclosure & Access Control
- **Problème :** La facture B2B PDF (SIRET, TVA intracom, adresse de facturation, montants) est servie sans authentification via la clé service-role. Quiconque connaît l'UUID de commande_pro accède aux données fiscales du client professionnel.
- **Repro :** GET https://<stock>/api/factures-pro/<uuid>/pdf renvoie la facture avec SIRET/TVA/adresse sans auth.
- **Correctif :** Exiger x-internal-secret (staff) ou un token signé remis au client B2B dans l'email de facture ; vérifier en tête du handler (ligne 22).

### 62. /api/po/auto-generate sans authentification — génération de brouillons de PO par un tiers

- **Fichier :** `apps/stock/app/api/po/auto-generate/route.ts:79`
- **Catégorie :** Security/Authentication
- **Problème :** POST /api/po/auto-generate s'exécute sans authentification. Un tiers peut lancer l'algo de réassort qui crée/upsert des brouillons de PO. Pas de garde x-internal-secret ni session ; middleware non couvrant.
- **Repro :** POST http://localhost:3000/api/po/auto-generate (sans body) → exécute l'algo proactif et upsert des brouillons par (fournisseur,dépôt). Restent en statut 'brouillon', non envoyés ; les lignes à certif halal expirée sont écartées (blocked_lines).
- **Correctif :** Ajouter une garde x-internal-secret (pattern app/api/notify/route.ts) et n'autoriser l'appel que depuis le cron (secret) ou une server action admin authentifiée.

### 63. POST /api/po/send - Email Not Sent in Demo Mode But Status Updated (Silent Failure)

- **Fichier :** `apps/stock/app/api/po/send/route.ts:376-397`
- **Catégorie :** Email Integration - Silent Failure Mode
- **Problème :** En mode démo (RESEND_API_KEY absente/PLACEHOLDER, l.331), aucun email n'est envoyé mais le statut du PO passe à 'envoyee' (l.390-397) et la réponse est ok:true. Si en prod la clé Resend est mal configurée, le fournisseur ne reçoit pas le bon de commande alors que le statut indique 'envoyée'. Un flag demo_mode:true est retourné mais le statut DB est trompeur.
- **Repro :** Sans RESEND_API_KEY (ou avec 'PLACEHOLDER'), POST /api/po/send → log '[po/send DEMO]', retour ok:true demo_mode:true, mais purchase_orders.statut = 'envoyee' sans email réel au fournisseur.
- **Correctif :** En mode démo, ne PAS passer le statut à 'envoyee' (laisser 'brouillon' ou un statut 'demo'), ou n'updater le statut que lorsque l'email est réellement envoyé (apiKey réelle).

### 64. Capture d'une pré-autorisation expirée non bloquée (autorisation_expire_at jamais relu)

- **Fichier :** `apps/stock/app/api/stripe/capture-payment/route.ts:84-124`
- **Catégorie :** Payment State Machine
- **Problème :** Le SELECT ligne 86-92 ne lit PAS autorisation_expire_at, et le code ne vérifie nulle part que la pré-autorisation Stripe (valable 7 jours, cf. create-payment-intent ligne 217) n'a pas expiré avant de tenter la capture. Si l'auto a expiré, paymentIntents.capture() (ligne 171) échoue côté Stripe. CONTRAIREMENT à ce qu'affirmait le candidat, le code ne renvoie PAS 200 : le catch (ligne 176-195) retourne bien status 500 'stripe_capture_failed'. Le défaut réel est donc l'absence de contrôle d'expiration en amont : le préparateur reçoit une erreur Stripe brute (500) au lieu d'un message clair 'autorisation expirée', et il n'existe aucun chemin de recréation de PI. La colonne autorisation_expire_at existe en DB (migration 0029) et est écrite à chaque autorisation, mais n'est jamais relue.
- **Repro :** 1. Créer une commande Drive, autoriser le paiement (statut_paiement='autorise', autorisation_expire_at=now+7j). 2. Attendre >7 jours. 3. POST /api/stripe/capture-payment avec le commande_id. 4. Stripe refuse la capture (PI expiré) → l'API renvoie 500 'stripe_capture_failed' avec un message Stripe brut, sans indiquer que c'est une expiration ni proposer de re-pré-autoriser.
- **Correctif :** Lire autorisation_expire_at dans le SELECT et, avant la capture, retourner 409 'autorisation_expiree' si new Date() > new Date(cmd.autorisation_expire_at), avec un message guidant vers une nouvelle pré-autorisation.

### 65. Cas réutilisation PI : l'API renvoie montantAutoriseTtc (euros) au lieu de montantAutoriseCents → le client garde la valeur estimée client

- **Fichier :** `apps/stock/app/api/stripe/create-payment-intent/route.ts:106`
- **Catégorie :** Logic Error - Pricing/Authorization
- **Problème :** La branche de réutilisation d'un PaymentIntent déjà autorisé (route.ts:103-108) renvoie le champ `montantAutoriseTtc` (en euros) tandis que la branche de création (ligne 253-257) renvoie `montantAutoriseCents`. Le client ne consomme que `montantAutoriseCents`, donc en cas de réutilisation il affiche la valeur estimée localement, pas le montant réellement autorisé.
- **Repro :** 1) Commande Drive au poids déjà pré-autorisée (statut_paiement='autorise', stripe_payment_intent_id présent). 2) L'utilisateur recharge la page paiement. 3) L'API entre dans la branche idempotence et renvoie montantAutoriseTtc. 4) Le client ne trouve pas montantAutoriseCents → affiche Math.round(estimatedCents*1.2) au lieu de pi.amount.
- **Correctif :** Uniformiser le contrat : la branche idempotence doit renvoyer `montantAutoriseCents: pi.amount ?? 0` (déjà en centimes), comme la branche de création. Ou faire lire au client les deux champs.

### 66. Sync Drive-Pull: hard-delete des lignes 'en_attente' avant recréation peut vider la commande si un insert échoue

- **Fichier :** `apps/stock/app/api/sync/drive-pull/route.ts:248-252`
- **Catégorie :** Data Loss/Race Condition
- **Problème :** DELETE des lignes en_attente puis re-INSERT sans transaction ni vérif d'erreur : un insert raté laisse la commande amputée de lignes jusqu'au prochain sync.
- **Repro :** 1. Order Drive avec lignes en_attente. 2. DELETE l.248 réussit. 3. Un insert l.295 échoue (FK produit absent / timeout). 4. La ligne n'est pas recréée, synced++ quand même. 5. Préparateur voit une commande incomplète/vide dans le Kanban jusqu'au prochain drive-pull.
- **Correctif :** Remplacer delete+insert par un upsert atomique sur (commande_id, produit_id), ou vérifier l'erreur de chaque insert et, en cas d'échec partiel, ne pas committer la suppression (ou re-tenter).

### 67. Sync Drive-Pull: insert de ligne sans gestion d'erreur → perte silencieuse d'items

- **Fichier :** `apps/stock/app/api/sync/drive-pull/route.ts:295-303`
- **Catégorie :** Error Handling / Observability
- **Problème :** L'insert des lignes ne vérifie jamais son erreur ; un échec d'insert est invisible et la sync se déclare réussie.
- **Repro :** 1. Sync d'un order de 3 items. 2. produit_id de l'item #2 absent de stock.produits → FK violation. 3. L'erreur n'est ni loggée ni propagée. 4. synced++ (l.307). 5. commandes_drive_lignes ne contient que les items #1 et #3.
- **Correctif :** Capturer l'erreur : const {error: errLine} = await stock.from(...).insert(...); if (errLine) { console.error('[drive-pull] insert ligne', o.id, item, errLine); } et remonter un compteur d'échecs dans la réponse (status 207 / champ failed).

### 68. drive-pull route mappe orders.status='paid' inexistant au lieu de 'confirmed' — commandes payées jamais synchronisées

- **Fichier :** `apps/stock/app/api/sync/drive-pull/route.ts:29 et 121`
- **Catégorie :** Status Mapping
- **Problème :** confirm-order/index.ts L104 met orders.status='confirmed' (et payment_status='paid') quand une commande est payée. Mais drive-pull/route.ts mapStatut (L29) attend 'paid' (case inexistant pour orders.status) et le filtre L121 .in('status',['paid','preparing','ready','completed']) ne récupère JAMAIS les commandes en statut 'confirmed'. Résultat : une commande Drive payée ne se synchronise pas via ce route (filtrée + mapStatut→null). Le route n'a aucun case 'confirmed'/'picked_up'/'cancelled' (statuts réels de orders cf 0022 et trigger 20260531000004 L52-59). NUANCE qui baisse la sévérité : la route n'est appelée que si NEXT_PUBLIC_HAS_DRIVE_SYNC==='1' (preparation/page.tsx L154), flag non configuré en prod (commentaire L149-153), et la sync réelle se fait par le trigger SQL sync_drive_order_to_stock (même projet post-0022, mapping correct 'confirmed'→'a_preparer'). C'est donc un bug latent : si on active le flag, la sync via route ne ferait rien d'utile.
- **Repro :** 1. Régler NEXT_PUBLIC_HAS_DRIVE_SYNC=1. 2. Client paie une commande Drive → confirm-order met orders.status='confirmed'. 3. Ouvrir /v2/preparation → POST /api/sync/drive-pull. 4. Attendu : commande au Kanban en 'a_preparer'. 5. Réel : filtre L121 exclut 'confirmed', synced=0, la commande n'apparaît jamais via cette route.
- **Correctif :** Aligner mapStatut et le filtre sur les vrais statuts de orders : remplacer 'paid'→'confirmed', 'completed'→'picked_up', 'canceled'/'refunded'→'cancelled'. mapStatut: case 'confirmed': return 'a_preparer'; case 'preparing': return 'en_preparation'; case 'ready': return 'pret'; case 'picked_up': return 'retire'; case 'cancelled': return 'annule'. Et .in('status',['confirmed','preparing','ready','picked_up']) ligne 121.

### 69. handleClarification : recherche de l'employé par nom formaté → mauvais destinataire (homonymes) ou push jamais envoyé après écriture de la note

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:142-188`
- **Catégorie :** Intégrité des données - Lookup fragile
- **Problème :** handleClarification identifie l'employé cible en comparant `${prenom??''} ${nom}`.trim() (nameOf, l99-102) à la liste employes_public (l144-154). SortieSuspecte n'a pas d'employe_id (interface l33-45 : seulement employes{prenom,nom}). Conséquences réelles : (1) deux employés homonymes → push envoyé au PREMIER trouvé par find(), donc potentiellement au MAUVAIS employé ; (2) si prenom est null côté sortie mais renseigné côté employes_public (ou nom modifié depuis), aucun match → 'Employé introuvable' (l156) ALORS QUE la note de clarification a déjà été écrite en base juste avant (l160-163), créant une incohérence : la sortie est marquée 'clarification demandée' mais personne n'est notifié.
- **Repro :** Avoir deux employés 'Mohamed' homonymes (ou un employé renommé après sa sortie). Ouvrir la sortie, cliquer 'Demander clarification employé' : le push part au premier homonyme, OU si aucun match la note est déjà persistée mais le toast affiche 'introuvable' sans push.
- **Correctif :** Exposer employe_id sur la sortie (select sorties_stock.employe_id) et l'utiliser directement comme employe_ids du push, au lieu d'un match texte. Ne pas écrire la note avant d'avoir résolu la cible.

### 70. alertes-surplus: decide() ne vérifie aucun rôle (accept/refuse surplus = engagement fournisseur)

- **Fichier :** `apps/stock/app/v2/admin/alertes-surplus/page.tsx:97-119`
- **Catégorie :** Authorization
- **Problème :** Vérifié: decide() (l.97-119) lit employe=useV2(currentEmploye) (l.64) mais ne teste JAMAIS employe.role avant d'UPDATE alertes_surplus (statut accepte/refuse + decideur). Aucun isManager nulle part (grep confirme: seule la ligne 64 mentionne employe). Accepter génère une facture fournisseur, refuser engage un retour — décisions financières. Contraste avec commandes-pro qui calcule isManager (l.93). Nuance majeure: l'auth staff V2 est par PIN dans Zustand (lib/v2-store.ts), le client supabase() est anon persistSession:false (lib/supabase.ts) — donc le vrai vecteur est l'absence d'auth serveur/RLS effective, pas seulement le rôle. Reste un trou d'autorisation applicatif réel. Pas un doublon exact des /api/* connus.
- **Repro :** Se connecter en staff non-manager (PIN), aller /v2/admin/alertes-surplus, ouvrir une alerte en_attente, cliquer ACCEPTER/REFUSER → UPDATE exécuté sans contrôle de rôle.
- **Correctif :** Garde-fou en tête de decide(): if(employe?.role!=='admin'&&employe?.role!=='manager'){toast.error('Permission manager requise');return;}. Idéalement durcir la RLS commandes/alertes côté DB.

### 71. Section anomalies masque l'erreur DB derrière un EmptyState trompeur

- **Fichier :** `apps/stock/app/v2/admin/casse-anomalies/page.tsx:137-143, 414-422`
- **Catégorie :** Error Handling
- **Problème :** Dans load() (l.137-143), le catch pose setLoadError(msg) mais ne touche pas anomalies/pic/recentes. Au premier chargement ces states valent [], donc hasData=false (l.208) et la section anomalies (l.414-422) rend l'EmptyState 'Pas encore de signal de casse' au lieu d'un état d'erreur. Seule la section 'Casses récentes' (l.455-458) exploite loadError. L'admin voit donc 'rien déclaré' alors que la DB est en panne — diagnostic faussé.
- **Repro :** 1. Ouvrir /v2/admin/casse-anomalies. 2. Provoquer une exception dans computeAnomalies/getPicHoraire (ex: réseau coupé). 3. La section principale affiche 'Pas encore de signal de casse' (EmptyState) au lieu d'un message d'erreur, alors que 'Casses récentes' affiche bien 'Liste indisponible : ...'.
- **Correctif :** Tester loadError avant !hasData dans le bloc l.409-443 et rendre un bloc d'erreur (réutiliser le style l.456) avant l'EmptyState.

### 72. Annuler commande pro sans confirmation (action irréversible)

- **Fichier :** `apps/stock/app/v2/admin/commandes-pro/page.tsx:410-418`
- **Catégorie :** UX/Operational
- **Problème :** Vérifié: le bouton 'Annuler la commande' (l.410-418) appelle onAnnuler()→annuler() (l.157-172) qui exécute setCommandeStatut(id,'annulee') immédiatement, sans aucune confirmation. L'annulation EST terminale: statutSuivant() (lib/db/pro.ts l.137) retourne null pour 'annulee', et le statut sort des états avançables (COMMANDE_WORKFLOW ne contient pas 'annulee'). Un clic accidentel rend la commande non-récupérable via l'UI (pas de bouton 'restaurer'). Le bouton n'apparaît que si statut a_valider/validee (annulable l.292-293), ce qui limite la portée, mais reste un risque opérationnel réel. P1 exagéré (action limitée à 2 statuts précoces, restaurable en DB directe) → P2.
- **Repro :** Ouvrir une commande 'a_valider' ou 'validee', cliquer 'Annuler la commande' en bas du détail → passe en 'annulee' immédiatement, aucune confirmation, aucun bouton de restauration dans l'UI.
- **Correctif :** Ajouter une confirmation avant annuler(): AlertDialog 'Annuler définitivement la commande {numero} ({montant}) ? Irréversible.' avec Annuler/Confirmer.

### 73. comptes-pro: changerStatut() ne vérifie aucun rôle (validation/suspension compte pro)

- **Fichier :** `apps/stock/app/v2/admin/comptes-pro/page.tsx:82-103`
- **Catégorie :** Authorization
- **Problème :** Vérifié: changerStatut() (l.82-103) lit employe=useV2(currentEmploye) (l.55) mais ne teste jamais employe.role avant setCompteStatut(). Aucun isManager (grep confirme: seule ligne 55). N'importe quel staff connecté peut valider (en_validation→actif), suspendre (actif→suspendu, bloque les futures commandes du client) ou réactiver. Contraste explicite avec commandes-pro/page.tsx l.93 qui calcule isManager. Même nuance que #3: l'auth réelle est PIN+anon, donc la racine est l'absence de RLS/auth serveur (mémoire 'Stock API auth gap'), mais le trou applicatif est réel et distinct des routes /api/* déjà connues.
- **Repro :** Se connecter en staff non-manager (PIN), /v2/admin/comptes-pro, ouvrir un compte actif, cliquer 'Suspendre' → UPDATE statut sans contrôle de rôle, client bloqué.
- **Correctif :** Ajouter const isManager=employe?.role==='manager'||employe?.role==='admin' et bloquer suspension/réactivation/validation si !isManager. Durcir la RLS comptes_pro côté DB.

### 74. Départ avant arrivée : 0h silencieux sans validation

- **Fichier :** `apps/stock/app/v2/admin/pointage/page.tsx:673-688`
- **Catégorie :** Data Validation
- **Problème :** `save()` n'effectue aucune validation arrivee<depart. La colonne générée `duree_travaillee_min` fait `greatest(0, ...)` (SQL ligne 83), donc une saisie inversée (arrivée 14:30, départ 10:00) est persistée et affichée 0h sans erreur. Le toast 'Horaires corrigés.' masque l'erreur de saisie. Sévérité P2 et non P1 : c'est une saisie admin manuelle, l'admin voit '0h' affiché, pas un flux automatique de paie.
- **Repro :** Ouvrir Corriger, Arrivée=14:30, Départ=10:00, Enregistrer → toast succès, pointage enregistré avec duree_travaillee_min=0, aucun avertissement.
- **Correctif :** Avant updatePointage : `if (arrivee && depart && arrivee >= depart) { toast.error('Le départ doit être après l’arrivée.'); return; }` et idéalement un CHECK contrainte SQL check_out > check_in.

### 75. Enregistrer avec les deux champs vides efface check_in/check_out et affiche un succès trompeur

- **Fichier :** `apps/stock/app/v2/admin/pointage/page.tsx:673-688`
- **Catégorie :** Data Validation
- **Problème :** Si l'admin vide les deux champs et clique Enregistrer, `save()` envoie `arrivee:null, depart:null` → updatePointage met `check_in=null` ET `check_out=null` (lib lignes 220-221), pas seulement updated_at comme le décrit le candidat. Le pointage est donc EFFACÉ (perte des heures réelles) tandis que le toast affiche 'Horaires corrigés.'. Impact réel : perte de données + message trompeur.
- **Repro :** Ouvrir Corriger sur un pointage complet, vider Arrivée et Départ, Enregistrer → toast succès, mais check_in et check_out passent à null en base : l'employé apparaît 'pas pointé' et ses heures sont perdues.
- **Correctif :** Valider avant l'écriture : `if (!arrivee && !depart) { toast.error('Renseigne au moins une heure.'); return; }`, et ne mettre dans le patch que les champs réellement modifiés.

### 76. `jour` mémoïsé avec deps vides : kiosk tablette bloqué sur la veille après minuit

- **Fichier :** `apps/stock/app/v2/admin/pointage/page.tsx:85`
- **Catégorie :** Time/Date Logic
- **Problème :** `const jour = useMemo(() => todayISO(), [])` fige la date à l'ouverture. Sur une tablette kiosk laissée allumée 24/7, après minuit `jour` reste sur la veille : `listPointagesDuJour(jour)` et `getPointageDuJour(employe.id, jour)` filtrent l'ancien jour. Contrairement au repro du candidat, l'INSERT n'est PAS faux (clockIn passe par le RPC qui utilise `current_date` serveur) : le défaut est l'AFFICHAGE — un employé qui pointe après minuit n'apparaît pas dans la liste et son gros bouton reste 'Pointer mon arrivée' (etat 'pas_pointe') alors qu'il a déjà pointé, risquant un double check-in (bloqué par l'index unique, donc erreur). P2.
- **Repro :** Ouvrir la page à 23:55 ; après minuit, un employé pointe via le RPC (jour serveur correct). La liste/KPI continuent d'afficher la veille et `mine` reste null → le bouton propose à nouveau 'Pointer mon arrivée'.
- **Correctif :** Ne pas mémoïser : `const jour = todayISO();` (recalculé à chaque render) ou ajouter un timer qui réinvalide à minuit. Recharger `load()` quand le jour change.

### 77. yesterdayIsoParis() (recap-fiscal) — off-by-one near-midnight via toISOString() final

- **Fichier :** `apps/stock/app/v2/admin/recap-fiscal/page.tsx:52-58`
- **Catégorie :** date/time/timezone
- **Problème :** yesterdayIsoParis() fait `new Date(now.toLocaleString('en-US',{timeZone:'Europe/Paris'}))`, setDate(-1), puis `.toISOString().slice(0,10)`. Le toISOString() final reconvertit la Date (dont les composants reflètent l'heure Paris mais sont interprétés dans le fuseau runtime) vers UTC, réintroduisant un décalage qui peut basculer d'un jour aux abords de minuit et lors des transitions DST. Sert à initialiser la date par défaut du récap fiscal Z (date-picker).
- **Repro :** Charger /v2/admin/recap-fiscal autour de minuit (heure de bascule UTC/Paris) ou pendant le changement d'heure : le date-picker peut s'initialiser sur l'avant-veille au lieu d'hier, chargeant le mauvais Z fiscal via /api/cashbox/daily-z?date=. Réf : exécution Node confirmant le décalage du toISOString final.
- **Correctif :** Réutiliser le helper robuste existant : importer parisDateString/yesterdayIsoParis depuis lib/cashbox/daily-z.ts (Intl en-CA timeZone Paris) au lieu de la reconstruction Date+toISOString locale.

### 78. La card 'Stockout prédictif' route vers /v2/admin au lieu de /v2/forecast

- **Fichier :** `apps/stock/app/v2/cockpit/page.tsx:340-343`
- **Catégorie :** Navigation Error
- **Problème :** Taper la card 'Stockout prédictif' envoie vers le tableau de bord admin générique plutôt que vers /v2/forecast, la page qui liste les produits avec leur days_cover. L'utilisateur doit re-naviguer manuellement.
- **Repro :** 1. Avoir des items stockout (count_total>0). 2. Ouvrir /v2/cockpit. 3. Taper la card 'Stockout prédictif'. 4. Arrivée sur /v2/admin (hub) au lieu de la liste forecast.
- **Correctif :** Remplacer onTap par () => router.push('/v2/forecast').

### 79. PO detail page TVA codée en dur à 5,5 %, ignore tva_pct de la DB

- **Fichier :** `apps/stock/app/v2/po/[id]/page.tsx:157, 323, 328`
- **Catégorie :** Data Integrity
- **Problème :** `purchase_order_lignes.tva_pct` est sélectionné (ligne 83) mais jamais utilisé. Le total TTC est calculé partout avec 1.055 / 0.055 codé en dur : affichage TVA (323), affichage TTC (328) et SURTOUT persistance `total_ttc: totalHt * 1.055` (157) écrite en base. Pour une épicerie halal la majorité des produits sont à 5,5 % mais certains (boissons, non-alimentaire, service) sont à 10 % ou 20 %. Un PO contenant une ligne tva_pct=20 enregistre et envoie un total_ttc faux. Note : la route po/send/route.ts:181 hardcode aussi 1.055 dans le PDF fournisseur — même défaut côté document envoyé.
- **Repro :** PO avec une ligne tva_pct=20 (saisie auto-generate met 5.5, mais le champ DB peut différer). La page affiche TVA 5,5 % et total_ttc = HT×1.055, sauvegardé en base et imprimé au fournisseur au lieu de HT×1.20.
- **Correctif :** Calculer la TVA par ligne via l.tva_pct (somme des ligne_total_ht × tva_pct/100) plutôt qu'un facteur global, et persister ce total_ttc. Aligner po/send buildPoPdf sur le même calcul.

### 80. Pesée corrigée puis non ré-enregistrée: capturée silencieusement à l'ancien poids

- **Fichier :** `apps/stock/app/v2/preparation/[id]/page.tsx:486-491 (prepCount), 396 (notDone), 411-415 (finalize montant), 995 (Corriger)`
- **Catégorie :** State Synchronization / Currency
- **Problème :** Après 'Corriger' une pesée, seul saved repasse à false ; quantite_reelle_pesee/montant_reel_ttc restent. prepCount et notDone se basent sur quantite_reelle_pesee!=null donc considèrent la ligne toujours prête. Si l'employé modifie le poids dans l'input sans re-cliquer 'Enregistrer', finalize() ne bloque pas et capture/décrémente sur l'ANCIENNE valeur — la correction est silencieusement perdue (erreur d'argent + de stock).
- **Repro :** 1. Peser 4 lignes weight (saved=true). prepCount=4/4, CTA activé. 2. Cliquer 'Corriger' ligne 1 (saved=false, input ré-ouvert). 3. Modifier le poids ex. 2,50→3,00 kg SANS recliquer 'Enregistrer'. 4. Cliquer 'Finaliser' : notDone vide (quantite_reelle_pesee!=null), finalize passe et capture montant_reel_ttc=ancien (2,50 kg). La correction 3,00 kg est ignorée.
- **Correctif :** Dans 'Corriger', remettre aussi quantite_reelle_pesee/montant_reel_ttc à null (ou un flag dirty), pour que prepCount/notDone bloquent le CTA tant que la ligne n'est pas ré-enregistrée. Et/ou désactiver le CTA si lignes.some(l => isWeightLine(l) && l.saved===false).

### 81. Uncaught Promise in Advance: Email Send Fires Without Error Logging

- **Fichier :** `apps/stock/app/v2/preparation/page.tsx:345-357`
- **Catégorie :** Error Handling
- **Problème :** VÉRIFIÉ RÉEL. sendOperationalEmail (lib/actions/email-send.ts) NE THROW JAMAIS : il retourne `{ok:false, error}` si INTERNAL_API_SECRET manque (L30-35) ou si le fetch/HTTP échoue (L64-72). Le caller L348-356 fire-and-forget avec `.catch(() => {})` : le `.catch` n'attrape que les rejets (jamais déclenchés), et la valeur résolue `{ok:false}` n'est JAMAIS inspectée. Résultat : le toast `${cmd.numero_commande} marquée prête` (L364) s'affiche TOUJOURS, même si l'email 'commande prête' n'est jamais parti. Le client n'est pas notifié et le préparateur croit que si. Double avalage (catch inutile + valeur ignorée).
- **Repro :** 1. INTERNAL_API_SECRET vide/absent (ou Resend down). 2. Action sheet → 'Marquer prête' sur une commande avec client_email. 3. Toast succès 'CMD-xxx marquée prête'. 4. Aucun email reçu, aucun log, aucun avertissement staff.
- **Correctif :** Awaiter et inspecter le résultat : `const r = await sendOperationalEmail({...}); if (!r.ok) { console.warn('[advance] email échec:', r.error); toast.warning('Statut OK mais notification client non envoyée'); }`. Le simple `.catch(console.warn)` ne suffit PAS car aucun rejet n'est émis.

### 82. Insertion stock_par_depot silencieuse a la creation produit — stock non initialise

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:365-371`
- **Catégorie :** Silent Database Error
- **Problème :** L'insert stock_par_depot (prix_vente initial) lors de la creation produit n'inspecte pas .error ; un echec passe inapercu et le flux se poursuit, laissant le produit sans ligne stock au depot.
- **Repro :** Creer une fiche produit pendant la reception alors que l'insert stock_par_depot echoue (ex: RLS). Le toast 'Fiche creee' s'affiche mais le produit n'a ni stock ni prix_vente au depot destination.
- **Correctif :** const { error } = await sb.from('stock_par_depot').insert({...}); if (error) throw new Error(error.message);

### 83. Insertion ligne BDL silencieuse a la creation produit — faux toast de succes

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:376-385`
- **Catégorie :** Silent Database Error
- **Problème :** L'insert de la ligne BDL lors de la creation produit n'inspecte pas .error ; sur echec, un toast de succes mensonger s'affiche et la reception de ces unites n'est pas enregistree.
- **Repro :** Creer un produit pendant la reception alors que l'insert bons_de_livraison_lignes echoue (contrainte). Toast 'Fiche creee · X unites reçues' alors que la ligne n'existe pas.
- **Correctif :** const { error } = await sb.from('bons_de_livraison_lignes').insert({...}); if (error) throw new Error(error.message);

### 84. Apprentissage carton : maj/insert ligne BDL silencieux — faux 'Carton appris'

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:462-481`
- **Catégorie :** Silent Database Error
- **Problème :** Apres avoir enregistre la liaison carton-produit, la maj/insert de la ligne BDL (quantite reçue) n'inspecte pas .error ; un echec passe inapercu sous un toast de succes, la qty du carton n'est pas comptee.
- **Repro :** Apprendre un carton (lier code carton a un produit) alors que l'update/insert bons_de_livraison_lignes echoue. Toast 'Carton appris' mais le compteur reçu du BDL n'a pas bouge.
- **Correctif :** const { error } = await sb.from('bons_de_livraison_lignes').update/insert({...}); if (error) { toast.error(error.message); return; }

### 85. Température : erreur de persistance avale, UI garde la valeur saisie jamais écrite → finalize bloqué

- **Fichier :** `apps/stock/app/v2/reception/[id]/scan-first/page.tsx:170-191`
- **Catégorie :** Data Integrity / UX
- **Problème :** Confirmé : setTemperature (l.170-178) met l'état local optimiste puis persistTemperature (l.180-191) POST en debounce 500ms. Si le POST échoue, on affiche un toast (l.189) mais l'input garde la valeur saisie — l'UI signale 'Chaîne du froid conforme' alors que temperature_reception_c reste null/ancien en DB. L'opérateur croit la T° enregistrée, le préambule paraît OK (tempOk basé sur l'état local l.231-234), il lance le scan. S'il quitte/recharge, la valeur est perdue ; et /api/bdl/finalize rejettera avec blocker 'Température palette manquante'. Réel : divergence UI/DB sur une donnée bloquante. Sévérité P2 (toast d'erreur affiché au moins, mais facilement raté en environnement atelier bruyant).
- **Repro :** 1. Réseau lent/offline. 2. Saisir 3°C → input affiche 3, état OK. 3. POST échoue, toast 'Erreur température'. 4. Input reste '3°C', préambule vert. 5. Recharger la page → T° vide, ou tenter de finaliser → blocker température manquante.
- **Correctif :** En cas d'erreur dans persistTemperature, restaurer l'état précédent (setBdl revert vers la valeur DB connue) ou marquer un flag 'temp non persistée' désactivant le préambule jusqu'au succès.

### 86. validatePhotoIa : courses concurrentes écrasent le statut photoIa (résultat périmé)

- **Fichier :** `apps/stock/app/v2/reception/page.tsx:288-331, 920-927`
- **Catégorie :** Race Condition
- **Problème :** onCapture (l.923-926) fait setPhotoCarton(d) puis void validatePhotoIa(d), sans annuler une vérification en cours ni vérifier que d est toujours la photo courante. Si l'utilisateur 'Reprend' une photo pendant que la première vérification IA est en vol (fetch jusqu'à 15s, l.297), les deux appels écrivent photoIa via setPhotoIa sans garde de staleness. La réponse la plus lente gagne : photo2 peut être validée 'ok' puis photo1 (plus lente) écrase en 'rejected', bloquant le bouton 'Démarrer la réception' (disabled si status==='rejected', l.781-785) alors que la photo affichée (photo2) est valide. Inverse possible : photo rejetée affichée mais statut 'ok'. Pas d'AbortController ni de ref de corrélation dataUrl↔photoCarton.
- **Repro :** 1. Prendre photo1 (carton flou/hors-sujet, IA lente) 2. Reprendre → photo2 valide, IA répond 'ok' vite 3. Réponse photo1 arrive après → photoIa='rejected' 4. Bouton 'Démarrer' bloqué malgré photo2 valide à l'écran.
- **Correctif :** Mémoriser la dernière dataUrl dans une ref ; dans validatePhotoIa, n'appliquer setPhotoIa que si dataUrl===refCourante. Ou AbortController annulant la requête précédente à chaque nouvelle capture.

### 87. Unhandled Supabase Error in Multi-Depot Stock Aggregation Silently Loses Data

- **Fichier :** `apps/stock/app/v2/stock/page.tsx:69-88`
- **Catégorie :** Error Handling
- **Problème :** En vue regroupée, l'échec de chargement d'un dépôt est avalé (return []) sans avertir l'utilisateur ; les totaux 'Tous dépôts' deviennent silencieusement faux.
- **Repro :** Forcer l'échec de listProduitsInDepot pour un dépôt (réseau coupé) puis ouvrir /v2/stock vue 'Tous dépôts' : les totaux excluent ce dépôt, aucun toast ni badge n'alerte.
- **Correctif :** Suivre les dépôts en échec : const [failedDepots,setFailedDepots]=useState<string[]>([]) ; dans le catch, accumuler d.nom ; après la boucle, si failedDepots.length>0 afficher un bandeau d'avertissement ('Dépôt X indisponible — totaux incomplets') et/ou toast.error.

### 88. Échec silencieux du chargement multi-dépôt masque les stocks manquants (vue regroupée)

- **Fichier :** `apps/stock/app/v2/stock/page.tsx:74-82`
- **Catégorie :** Error Handling / Data Integrity
- **Problème :** En vue regroupée, l'échec de chargement d'un dépôt est avalé en [] sans notification ; le total agrégé est sous-évalué silencieusement.
- **Repro :** 1. Vue regroupée du stock. 2. Faire échouer listProduitsInDepot d'un dépôt (réseau/RLS). 3. Total agrégé exclut ce dépôt sans avertissement → stock paraît plus bas que la réalité.
- **Correctif :** Tracker les dépôts en échec et afficher un bandeau 'Stock du dépôt X indisponible' (ou icône d'alerte sur le breakdown).

### 89. Double-submit EAN manuel — submitManual sans anti-double ni fermeture du scanner

- **Fichier :** `apps/stock/components/reception/BarcodeScanner.tsx:386-392`
- **Catégorie :** Data
- **Problème :** submitManual() (L386-392) appelle directement onScanRef.current(c) sans aucun flag anti-double ET, contrairement à fireScan(), SANS appeler stopAll(). Deux problèmes réels : (1) taper Entrée (onKeyDown L617-619) puis cliquer OK (L625) envoie 2x le même EAN au parent → double traitement/incrément côté réception ; (2) après saisie manuelle le scanner reste ouvert et la caméra continue de tourner (fireScan ferme, submitManual non), donc le viseur peut ensuite renvoyer un autre scan parasite. Le candidat ne mentionne que le double-envoi mais le défaut sous-jacent est réel.
- **Repro :** Ouvrir scanner → onglet Saisie manuelle → taper '3274080005003' → appuyer Entrée puis cliquer OK rapidement → onScan appelé deux fois avec le même EAN ; le scanner reste ouvert ensuite.
- **Correctif :** Faire passer submitManual par fireScan(c) (qui vérifie stoppedRef, vibre et appelle stopAll), ou désactiver l'input/bouton après le premier envoi et vider manualInput avant l'appel.

### 90. Photo non décodée bascule tout l'écran en phase 'error' et masque la caméra live

- **Fichier :** `apps/stock/components/reception/BarcodeScanner.tsx:371-376`
- **Catégorie :** UX
- **Problème :** Dans onPhotoPicked, quand decodeImageFile(file) retourne null (photo sans code lisible), le code fait setError(...) + setPhase('error') (L372-375). Cela remplace tout le viseur par l'overlay 'Caméra indisponible' (rendu conditionnel phase==='error', L541), alors que la caméra live tourne toujours en arrière-plan et était parfaitement fonctionnelle. L'utilisateur doit alors cliquer 'Réessayer la caméra' (L561) qui relance getUserMedia inutilement. Un simple échec de lecture de photo ne devrait pas tuer la session caméra. Comportement dégradé réel.
- **Repro :** Scanner ouvert et caméra OK → bouton 'Photo via Caméra iOS native' → prendre une photo floue/sans code → l'écran passe sur 'Caméra indisponible' au lieu de rester sur le live ; il faut relancer la caméra.
- **Correctif :** Pour un 'aucun code trouvé', ne pas changer la phase : afficher un toast/snapResult='miss' et rester en phase 'ready'. Réserver setPhase('error') aux échecs réels de caméra (catch getUserMedia).

### 91. startCamera() non attendue — race ouverture/fermeture réassigne le stream après stopAll (caméra reste allumée)

- **Fichier :** `apps/stock/components/reception/BarcodeScanner.tsx:124-159`
- **Catégorie :** Race
- **Problème :** L'effet fait void startCamera() (L124) sans l'attendre. Si open passe à false (ou unmount) pendant l'await getUserMedia, stopAll() s'exécute (L126/L128) et pose stoppedRef=true, MAIS startCamera ne re-vérifie pas stoppedRef après la résolution de getUserMedia : il assigne streamRef.current=stream (L159) et fait setPhase('ready') (L199) APRÈS le stopAll. Résultat : le stream tout juste obtenu n'est jamais arrêté → la LED/caméra iOS reste allumée jusqu'à ce que le navigateur libère, et un setState s'applique sur un composant en cours de fermeture. Le candidat invoque à tort un null drawImage (faux), mais la fuite de stream post-stopAll est réelle.
- **Repro :** Ouvrir puis fermer le scanner en <200ms (avant que getUserMedia résolve) : le stream est attribué après stopAll, la caméra reste active (indicateur iOS allumé) tant que la page vit.
- **Correctif :** Après l'await getUserMedia (et après play()), tester if (stoppedRef.current) { stream.getTracks().forEach(t=>t.stop()); return; } avant d'assigner streamRef et setPhase('ready').

### 92. DepotSwitcher : le dépôt par défaut ne se corrige pas vers depot_principal_id une fois current déjà fixé

- **Fichier :** `apps/stock/components/v2/DepotSwitcher.tsx:50-54`
- **Catégorie :** State Initialization
- **Problème :** La garde `if (!current ...)` empêche de remplacer un dépôt fallback (d[0]) déjà sélectionné par le depot_principal_id quand l'employé arrive après coup.
- **Repro :** 1. État où currentDepot est null et employe se charge APRÈS le 1er render de DepotSwitcher. 2. L'effect pose current=d[0]. 3. Au re-run (employe chargé), `!current` est faux → pas de correction. 4. Le dépôt affiché reste d[0] au lieu de employe.depot_principal_id.
- **Correctif :** Recalculer le dépôt cible quand l'employé arrive : si `current` est encore le fallback et que `employe.depot_principal_id` diffère, le réappliquer ; ou ne poser le fallback d[0] qu'une fois `employe` résolu (guard `if (employe === undefined) return` avant la sélection).

### 93. Realtime subscription recreated continuously due to liveStatus dependency

- **Fichier :** `apps/stock/components/v2/DriveDashboardSection.tsx:256`
- **Catégorie :** Logic Error
- **Problème :** Confirmé mais sévérité ramenée de P1 à P2 et catégorie corrigée (pas une vraie fuite mémoire). Le useEffect L221 inclut liveStatus dans ses deps (L256). À l'abonnement, le callback subscribe fait setLiveStatus('live') (L240), ce qui change liveStatus → l'effet se re-exécute → le cleanup (L250-255) fait removeChannel du channel qui vient juste de se connecter + clearInterval, puis recrée channel + setInterval. Churn de (dés)abonnement Realtime à chaque transition d'état (connecting→live→offline). Le cleanup NETTOIE correctement (clearInterval + removeChannel), donc PAS de fuite mémoire accumulative comme décrit — d'où P2 et non P1/Memory Leak. L'impact réel : re-souscriptions inutiles, possible ping-pong d'état, et reset du poll à chaque changement.
- **Repro :** 1. Ouvrir le dashboard admin v2. 2. Observer le réseau/WebSocket : à chaque SUBSCRIBED le channel v2-admin-drive est supprimé puis recréé (setLiveStatus('live') retrigger l'effet). 3. Sur connexion instable, l'état liveStatus oscille et le channel est recréé à répétition.
- **Correctif :** Retirer liveStatus du tableau de deps (L256). Lire liveStatus via un useRef (liveStatusRef.current) dans le poll au lieu de le mettre en dépendance, pour que l'effet de souscription ne se recrée qu'au montage.

### 94. SurplusModal : bouton submit sans état de chargement ni garde anti double-soumission

- **Fichier :** `apps/stock/components/v2/reception/SurplusModal.tsx:99-105`
- **Catégorie :** UX / Error Handling
- **Problème :** Le bouton de signalement surplus n'a pas d'état submitting ; un double-tap insère deux alertes_surplus et envoie deux push admin.
- **Repro :** 1. Réception détail, produit en surplus. 2. SurplusModal, saisir quantité. 3. Réseau lent, taper 2x 'Signaler' → 2 lignes alertes_surplus + 2 push Otmane/Ahmed.
- **Correctif :** Ajouter une prop submitting à SurplusModal (disabled + spinner) et un state surplusSubmitting dans le parent autour de submitSurplus pour bloquer le double-tap.

### 95. Rapport mensuel : CA magasin tronqué à ~1000 lignes cashmag (select * sans limit)

- **Fichier :** `apps/stock/lib/cashbox/monthly-report.ts:72-77`
- **Catégorie :** Data Truncation
- **Problème :** computeMonthlyReport lit ventes_cashmag_import via .select('*').gte/lt(date_vente) sans .limit() (lignes 72-77). Au-delà de ~1000 lignes/mois, PostgREST tronque silencieusement. Les boucles lignes 85-99 (magCaTtc) et 168-179 (TVA) somment alors un sous-ensemble -> CA magasin, panier moyen, top produits et répartition magasin/drive sous-évalués. La même troncature affecte aussi le calcul d'évolution (prevMag, lignes 192-194).
- **Repro :** 1. Importer 1500 lignes ventes_cashmag_import sur un mois. 2. Appeler computeMonthlyReport('2026-06'). 3. magasin.ca_ttc ne reflète qu'~1000 lignes -> CA magasin amputé d'1/3, idem TVA et répartition.
- **Correctif :** Ajouter une borne explicite haute (.limit(50000)) ou paginer par chunks de 1000 et accumuler, sur la query ventes_cashmag_import (et sur prevMag lignes 192-194).

### 96. `anomalie` jamais recalculée/réinitialisée à la correction admin

- **Fichier :** `apps/stock/lib/db/pointage.ts:217-221`
- **Catégorie :** Data Consistency
- **Problème :** `updatePointage` n'écrit que check_in/check_out/updated_at : la colonne `anomalie` (positionnée à 'retard', 'sans_planning', 'depart_anticipe'… au check-in/out) n'est jamais remise à 'aucune' ni recalculée. Si l'admin corrige une arrivée en retard vers une heure à l'heure, le badge 'Retard' (page.tsx lignes 357-367) et le compteur d'anomalies KPI (ligne 206) persistent, faussant rapport et paie.
- **Repro :** Employé arrivé en retard → anomalie='retard'. Admin corrige check_in à l'heure prévue, Enregistre. Le pointage garde anomalie='retard' : badge et KPI 'anomalie(s)' inchangés.
- **Correctif :** À la correction, réinitialiser explicitement `anomalie:'aucune'` (ou recalculer côté SQL via un trigger sur UPDATE de check_in/check_out).

### 97. Ventilation TVA par taux (lignes arrondies) peut diverger du Total TVA affiché sur la facture Pro

- **Fichier :** `apps/stock/lib/pdf/facture-pro.ts:160`
- **Catégorie :** Erreur TVA/argent
- **Problème :** La ventilation TVA par taux somme des montants arrondis ligne à ligne : cur.tva += Math.round(l.prixHtTotal * (l.tvaTaux/100) * 100)/100 (ligne 160), imprimée ligne 181. Le « Total TVA » imprimé (ligne 189) utilise data.montantTva (source commandes_pro), PAS la somme de la ventilation. Sur une facture multi-lignes/multi-taux, la somme des lignes ventilées arrondies peut différer du Total TVA de 0,01–0,03 €. Le document légal affiche alors une ventilation dont la somme ≠ Total TVA. Le Total TVA lui-même reste la valeur DB → pas une vraie erreur de montant final, d'où P2 et non P1.
- **Repro :** 1. Créer une commande_pro avec plusieurs lignes mêlant 5,5 % et 20 %, choisies pour que Math.round par ligne s'écarte de la TVA recalculée globalement. 2. GET la facture-pro PDF. 3. Additionner les lignes « TVA x % sur … » du bloc ventilation : la somme diffère du « Total TVA » imprimé juste en dessous.
- **Correctif :** Ne pas arrondir la TVA par ligne avant de sommer : cur.tva += l.prixHtTotal * (l.tvaTaux/100), n'arrondir qu'à l'affichage ; ou recalculer la ventilation pour qu'elle se réconcilie avec data.montantTva.

### 98. UUID admin/employé codés en dur — toute pesée/prépa attribuée à une seule personne (pas d'audit)

- **Fichier :** `apps/stock/lib/staff/auth-fallback.ts:22, 33, 60, 89`
- **Catégorie :** Data Integrity / Access Control
- **Problème :** getUserUuid/getEmployeUuid renvoient inconditionnellement HARDCODED_ADMIN_UUID / HARDCODED_EMPLOYE_UUID (Ahmed Nasri) en ignorant l'identité réelle du connecté. Toutes les opérations de pesée et préparation sont attribuées à la même personne : pas de piste d'audit qui-a-fait-quoi en multi-staff.
- **Repro :** Staff A pèse 10 commandes Drive, Staff B en pèse 5. Requêter commandes_drive_lignes/drive_ecarts_poids : pese_par = 5b58e718… pour les 15, prepare_par_employe_id = b16789c3… pour les 15. Impossible de distinguer A de B.
- **Correctif :** Brancher Supabase Auth (Mission 4) : extraire auth.uid() du JWT côté serveur et résoudre profiles.id / employes.id via lookup, comme indiqué dans les TODO du fichier.

### 99. markLineWeighed() n'attend pas le résultat de l'UPDATE (0 ligne touchée silencieux)

- **Fichier :** `apps/stock/lib/staff/preparation-actions.ts:69-86`
- **Catégorie :** Silent Failure
- **Problème :** Réel sur le fond, gravité modérée. L'UPDATE (l.69-80) est bien awaité et propage les erreurs SQL (l.82-85), MAIS sans .select() ni vérification du nombre de lignes affectées : si `id` ne matche aucune ligne (ligne supprimée, mauvais id, ou ligne filtrée par RLS — bien qu'ici service role contourne RLS), Postgres ne renvoie PAS d'erreur, et markLineWeighed retourne {ok:true} alors que rien n'a été persisté. Le préparateur croit la pesée enregistrée (toast succès) sans montant_reel_ttc en base. Non couvert par les connus (le connu sur cette ligne portait sur l'arrondi reelTtcLive, obs 608). P2 (fonction de pesée → impacte la capture Stripe ultérieure).
- **Repro :** Supprimer/altérer l'id d'une ligne en base, appeler markLineWeighed pour cet id : retourne {ok:true}, aucune ligne mise à jour, aucune erreur.
- **Correctif :** Ajouter `.select('id')` et vérifier `if (!data || data.length === 0) return { ok:false, error:'Ligne introuvable' }`.

### 100. auto-generate-pos: Response Returns 502 on Upstream Failure but Logs Only to Stderr

- **Fichier :** `supabase/functions/auto-generate-pos/index.ts:60`
- **Catégorie :** Error Handling
- **Problème :** Quand l'endpoint upstream /api/po/auto-generate renvoie non-2xx, la fonction retourne 502 avec le détail (l.53-61) mais n'envoie aucune alerte/notification admin. Un cron quotidien 06:00 qui échoue passe inaperçu : les bons de commande ne sont pas générés des jours durant sans que personne ne le sache, jusqu'à ce qu'un fournisseur réclame. La mémoire projet (obs. 158, 2026-06-05) confirme ce P2 « PO cron silently created with zero admin notification ». C'est un défaut opérationnel réel (perte d'approvisionnement), pas un crash, d'où P2.
- **Repro :** Faire renvoyer 500 à salam-stock.vercel.app/api/po/auto-generate. Le cron tourne, la fonction renvoie 502, aucun email/notif admin. Le lendemain, toujours pas de PO générés ; détection seulement manuelle.
- **Correctif :** En cas d'upstream non-2xx (ou catch), déclencher une notification admin (Resend/notify pattern) ou logguer vers Sentry avec alerte configurée.

### 101. Drive Order Items Missing produit_id/ean — Sync Trigger falls back to name matching

- **Fichier :** `supabase/functions/create-checkout-session/index.ts:138-148`
- **Catégorie :** Data Consistency
- **Problème :** Dans le flow legacy (orders, branche hasWeightLine=false), create-checkout-session insère items JSONB sans produit_id ni ean. Le trigger sync_drive_order_to_stock cherche produit_id puis ean avant de retomber sur le nom ; ces deux clés étant absentes, tout order legacy est synchronisé vers le Kanban Stock par match de NOM uniquement. Un produit renommé côté Drive, ou deux produits homonymes (particulier vs pro), produisent un mauvais match ou un placeholder « Produit Drive non synchronisé » — exactement le bug que la migration 20260531000004 prétendait corriger, mais resté actif car la partie Drive du TODO (lignes 213-218 de la migration) n'a jamais été faite.
- **Repro :** 1. Renommer un produit côté Stock (ex 'Couscous moyen 1kg' → 'Couscous moyen 1 kg'). 2. Un client Drive commande ce produit en flow unit (sans poids) via create-checkout-session. 3. orders.items contient product_id mais pas produit_id ni ean. 4. Le trigger ne matche pas par UUID/EAN, tente lower(nom)= → échec, préfixe → échec, puis placeholder. 5. La ligne apparaît sur le Kanban prépa comme 'Produit Drive non synchronisé' → préparateur ne sait pas quoi préparer.
- **Correctif :** Dans create-checkout-session/index.ts, ajouter au return de trustedItems (lignes 138-148) : produit_id: p.id et ean: p.ean (en sélectionnant aussi 'ean' dans le SELECT products ligne 75). Le champ DOIT s'appeler produit_id (français) pour matcher v_item->>'produit_id' du trigger, pas product_id.

### 102. Rollback de réservation de créneau sans optimistic lock (decrement aveugle)

- **Fichier :** `supabase/functions/create-checkout-session/index.ts:400-411`
- **Catégorie :** Race Condition
- **Problème :** Dans le bloc catch, le rollback de la réservation lit reserved_count (SELECT L401-405) puis écrit cur.reserved_count - 1 (UPDATE L407-410) SANS clause .eq('reserved_count', cur.reserved_count). Contrairement à la réservation atomique (L185-192) qui, elle, utilise bien l'optimistic lock + .lt(capacity). Une réservation concurrente qui incrémente le compteur entre le SELECT et l'UPDATE du rollback est écrasée : le compteur perd un incrément, le créneau apparaît avec une place de plus que réel → surbooking possible.
- **Repro :** 1. Créneau capacity=2, reserved_count=1. 2. User A : checkout échoue, rollback lit cur.reserved_count=1. 3. Pendant ce temps User B réserve (optimistic lock OK) → reserved_count passe à 2. 4. Le rollback de A écrit 1-1=0 en aveugle, écrasant le 2. 5. DB montre 0 alors que B occupe réellement 1 place → le créneau accepte 2 réservations de trop.
- **Correctif :** Ajouter .eq('reserved_count', cur.reserved_count) à l'UPDATE du rollback (L407-410), ou utiliser un RPC atomique reserved_count = reserved_count - 1 côté Postgres.

### 103. forecast-stockouts: Silent Data Loss if Stock Query Truncated at 5000 Rows

- **Fichier :** `supabase/functions/forecast-stockouts/index.ts:188`
- **Catégorie :** Data Loss
- **Problème :** La requête stock_par_depot a `.limit(5000)` (l.188) sans pagination ni détection de troncature. Si le nombre de couples (produit, dépôt) dépasse 5000, les couples au-delà ne reçoivent ni mise à jour velocity_state ni stockout_forecast, et la réponse affiche `couples_total: 5000` sans avertissement — les alertes de rupture pour ces produits restent figées sur les valeurs précédentes. SCHEMA.md confirme 4 dépôts (Particulier, Professionnel, Sodrune, Salam Toulouse). Avec quelques milliers de produits × jusqu'à 4 dépôts, le seuil 5000 est atteignable mais pas certain pour une seule boutique → impact réel mais borné, d'où P2 et non P1.
- **Repro :** Insérer >5000 lignes dans stock_par_depot, lancer forecast-stockouts. Vérifier que velocity_state/stockout_forecast ne sont mis à jour que pour ~5000 couples ; les autres gardent des prévisions périmées. Réponse `couples_total:5000` sans flag de troncature.
- **Correctif :** Paginer stock_par_depot par batches (range) jusqu'à épuisement, ou détecter `stocks.length === 5000` et logguer/retourner un avertissement explicite de troncature.

### 104. assign_next_bay : race condition → deux commandes assignées à la même borne

- **Fichier :** `supabase/migrations/20260530000002_bay_label.sql:48`
- **Catégorie :** concurrency
- **Problème :** assign_next_bay lit l'ensemble des bornes occupées sans verrou ni sérialisation, puis assigne la première libre. Deux transitions en_preparation→pret concurrentes peuvent assigner la même borne (ex. A1) à deux commandes différentes. Le client verrait deux commandes pointant le même casier physique.
- **Repro :** 1. Deux commandes C1 et C2 au statut 'en_preparation'. 2. Deux requêtes concurrentes appellent rpc('assign_next_bay', {C1}) et {C2}. 3. Les deux lisent v_used identique (ex. ['OVERFLOW']). 4. Les deux trouvent 'A1' comme première libre. 5. Les deux UPDATE leur propre commande bay_label='A1'. 6. C1 et C2 ont toutes deux bay='A1'.
- **Correctif :** Sérialiser via un advisory lock (pg_advisory_xact_lock sur un id fixe de la fonction) en début de fonction, OU verrouiller les lignes occupées avec un SELECT ... FOR UPDATE sans agrégat (boucle de lock) puis recalculer, OU ajouter un index UNIQUE partiel sur bay_label WHERE statut='pret' AND retired_at IS NULL pour échouer bruyamment sur collision et retenter.

### 105. RPC check-in/out : `current_date` (UTC serveur) vs jour local Paris → décalage de jour autour de minuit

- **Fichier :** `supabase/migrations/20260530000007_staff_pointage.sql:132,143`
- **Catégorie :** Time/Date Logic
- **Problème :** Le RPC `pointage_check_in` filtre le shift via `jour = current_date` (ligne 132) et insère `jour = current_date` (ligne 143). `current_date` = date du serveur Supabase (UTC). Entre minuit Paris et minuit UTC (ex. 00h30 Paris = 22h30 UTC la veille en heure d'été), `current_date` vaut encore la veille : le shift cherché et le `jour` inséré sont la veille alors que l'équipe vit le lendemain → 'sans_planning' à tort et pointage rangé sur le mauvais jour. Le repro du candidat ('23h Paris') est faux (23h Paris=21h UTC, même date) ; le défaut réel se situe juste après minuit Paris. NB : le calcul de retard ligne 138 via `AT TIME ZONE 'Europe/Paris'` est, lui, correct.
- **Repro :** À 00h30 Paris (22h30 UTC veille), un employé planifié le jour J pointe : `current_date` serveur = J-1 → aucun shift trouvé pour J-1 → anomalie 'sans_planning' et pointage inséré avec jour=J-1.
- **Correctif :** Remplacer `current_date` par `(now() at time zone 'Europe/Paris')::date` dans le filtre (ligne 132) et l'INSERT (ligne 143) du RPC, ainsi que pour le check_out (ligne 175 utilise déjà current_date pour la borne de départ anticipé).

### 106. verify_pin brute-force distribué via spoofing IP / botnet

- **Fichier :** `supabase/migrations/20260531000023_verify_pin_rate_limit.sql:204`
- **Catégorie :** security
- **Problème :** Le rate-limit verify_pin repose sur l'IP extraite de x-forwarded-for (best-effort, falsifiable côté client puisque la requête anon peut forger l'en-tête). Un attaquant peut soit varier l'IP xff (5 fails/5min PAR IP), soit omettre l'en-tête pour tomber dans le bucket global (20 fails/5min toutes IP nulles confondues). Le dictionnaire 4 chiffres (10000 PIN) reste atteignable via botnet. Limitation reconnue dans le commentaire de la migration.
- **Repro :** 1. Script qui appelle POST /rest/v1/rpc/verify_pin avec apikey anon. 2. Faire varier l'en-tête x-forwarded-for à chaque requête (valeur arbitraire). 3. Le throttle per-IP (5/5min) se réinitialise à chaque IP forgée → débit quasi illimité. 4. Scanner 0000..9999 ; les matches renvoient un uuid employé (les fails renvoient null).
- **Correctif :** Ne pas faire confiance à x-forwarded-for fourni par le client pour un endpoint anon. Mettre le throttle au niveau edge (Cloudflare/Vercel WAF, fail2ban) ou plafonner globalement le débit verify_pin (ex. token bucket global) indépendamment de l'IP. Allonger les PIN ou ajouter un délai forcé.

### 107. adjust_stock clampe le stock négatif à 0 → ledger incohérent (delta != avant→après)

- **Fichier :** `supabase/migrations/20260604000002_stock_ledger_atomic.sql:117`
- **Catégorie :** data-integrity
- **Problème :** adjust_stock() clampe le stock à 0 quand v_avant + p_delta < 0, tout en journalisant le delta brut non clampé. Le ledger stock_movements devient mathématiquement incohérent : quantite_avant + delta != quantite_apres dès qu'on retire plus que le stock disponible. L'audit (raison d'être du ledger, cf. commentaire ligne 54-55) est faussé sur ce cas.
- **Repro :** 1. stock_par_depot.quantite = 50 pour (produit P, dépôt D). 2. Appeler adjust_stock(P, D, -100, 'sortie'). 3. quantite passe à 0 (greatest(0, 50-100)). 4. Inspecter stock_movements : delta=-100, quantite_avant=50, quantite_apres=0. 5. Invariant violé : 50 + (-100) = -50 != 0. SELECT sum(delta) ... ne reconstitue plus l'état réel.
- **Correctif :** Avant le clamp, si v_avant + p_delta < 0 sur une sortie/casse/transfert, soit lever une exception (comme transfer_stock le fait déjà ligne 184-188), soit journaliser le delta EFFECTIVEMENT appliqué (delta_effectif = v_apres - v_avant) plutôt que p_delta. Cohérence ledger restaurée.

### 108. Encours crédit Pro recalculé en AFTER INSERT sans verrou ni contrainte → dépassement de plafond possible

- **Fichier :** `supabase/migrations/_archive/0025_drive_pro.sql:220-270`
- **Catégorie :** Logique métier/Concurrence
- **Problème :** recalc_encours_compte_pro() (l.220-258) est attaché en AFTER INSERT (l.260-262). Aucune contrainte CHECK ni trigger BEFORE INSERT ne valide montant_ttc <= encours_max - encours_actuel. Le contrôle de plafond n'existe QUE côté client (Panier.tsx l.195 creditDepasse). Deux INSERT concurrents du même délégué (deux onglets) lisent un encours_actuel périmé et passent tous deux : encours_actuel final > encours_max. Le recalcul AFTER arrive trop tard. C'est la version DB (autoritative) du même défaut que le contrôle client. Sévérité P2 (pas P1) : volume Pro faible et commandes >500€ passent en validation manager (Panier.tsx l.343-348) avant toute capture/facturation, donc fenêtre de nuisance limitée.
- **Repro :** 1. comptes_pro : encours_max=1000, encours_actuel=950. 2. Délégué ouvre deux onglets /pro/panier, chacun lit encours_actuel=950, creditDisponible=50. 3. Onglet A valide une commande 40€, onglet B valide 40€ quasi simultanément. 4. Les deux INSERT passent (aucune validation BEFORE), recalc AFTER additionne → encours_actuel=1030 > 1000.
- **Correctif :** Ajouter un trigger BEFORE INSERT sur commandes_pro qui verrouille la ligne comptes_pro (SELECT ... FOR UPDATE) et lève une exception si encours_actuel + NEW.montant_ttc > encours_max (quand encours_max>0). Note : NEW.montant_ttc vaut 0 à l'INSERT initial dans le flux actuel (montants posés par UPDATE ensuite l.252-260) — la validation doit donc se faire sur l'UPDATE des montants, pas seulement l'INSERT.

## P3 — Mineur (62)

### 109. Drive sw.js: stale-while-revalidate retourne undefined si offline et asset jamais caché

- **Fichier :** `apps/drive/public/sw.js:134`
- **Catégorie :** offline fallback
- **Problème :** Lignes 121-137 : `cached` peut être undefined ; networkPromise = fetch(request).catch(() => cached) → résout aussi à undefined si offline et jamais caché ; `return cached || networkPromise` → respondWith(Promise<undefined>). respondWith(undefined) provoque une NetworkError pour cet asset. RÉEL d'un point de vue spec, MAIS le seul scénario est offline AU PREMIER chargement (asset /assets/*.js jamais visité) : l'asset est de toute façon irrécupérable, donc l'utilisateur verra une erreur de chargement quoi qu'il arrive. Le new Response('',{status:504}) suggéré serait plus propre mais le résultat visible (asset manquant) est identique. Impact réel quasi nul.
- **Repro :** 1. Vider le cache / 1re visite. 2. Couper le réseau AVANT tout chargement. 3. Une navigation déclenche le fetch d'un /assets/main-[hash].js jamais caché. 4. fetch rejette → networkPromise résout undefined → respondWith(undefined) → NetworkError sur cet asset.
- **Correctif :** `.catch(() => cached ?? new Response('', { status: 504, statusText: 'Offline' }))` ligne 134.

### 110. Drive sw.js: clients.openWindow sans .catch() → unhandled rejection

- **Fichier :** `apps/drive/public/sw.js:212`
- **Catégorie :** notification handling
- **Problème :** Ligne 212 `return clients.openWindow(target)` sans .catch(). Si openWindow rejette (pop-up bloqué, fenêtre non autorisée), la rejection remonte dans event.waitUntil et peut produire un unhandled rejection loggé. RÉEL mais impact strictement cosmétique (log console dans le SW) : aucune donnée perdue, aucune fonction cassée. Note : openWindow depuis un notificationclick est un geste utilisateur, le rejet est rare.
- **Repro :** 1. Cliquer une notification sans fenêtre exploitable. 2. openWindow rejette (contexte restreint). 3. waitUntil reçoit une promesse rejetée → unhandled rejection loggé.
- **Correctif :** `return clients.openWindow(target).catch(() => {})` ligne 212.

### 111. CategoryTabs : contraste texte onglet inactif sous le seuil WCAG AA

- **Fichier :** `apps/drive/src/components/CategoryTabs.tsx:153`
- **Catégorie :** accessibility
- **Problème :** Le libellé d'onglet inactif (ligne 153, text-[#0F1A14]/55) sur fond crème #FAF7EE produit une couleur effective #797D76 et un ratio de contraste de 3.91:1, inférieur au minimum WCAG 1.4.3 AA (4.5:1) pour du texte normal de 12-13px. Lecture difficile pour malvoyants.
- **Repro :** Catalogue Drive : les onglets de rayon inactifs (texte gris-vert pâle) mesurés au contrast checker → 3.91:1 < 4.5:1.
- **Correctif :** Foncer le texte inactif vers ~/68 (text-[#0F1A14]/68 atteint ~4.5:1) ou utiliser une teinte sapin plus soutenue.

### 112. ProductCard role="button" ne gère pas la touche Espace au clavier

- **Fichier :** `apps/drive/src/components/ProductCard.tsx:143`
- **Catégorie :** Accessibility Bug
- **Problème :** La carte produit est un faux bouton (role="button", tabIndex 0) dont le handler clavier ne réagit qu'à Enter. La touche Espace, attendue pour un rôle button ARIA, n'ouvre pas la fiche et déclenche le scroll natif. Sévérité ramenée à P3 : la navigation Enter reste fonctionnelle, seuls les utilisateurs clavier habitués à Espace sont gênés.
- **Repro :** 1. Naviguer au catalogue Drive. 2. Avec Tab, focaliser une carte produit. 3. Presser la barre d'Espace. 4. La fiche produit ne s'ouvre pas (la page scrolle à la place). Enter fonctionne.
- **Correctif :** onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleOpen(); } }}

### 113. Frontière de délai 1h incohérente (>= côté client vs < côté serveur) : créneau affiché sélectionnable puis rejeté

- **Fichier :** `apps/drive/src/hooks/useSlots.ts:25-30`
- **Catégorie :** Business Logic
- **Problème :** isSlotSelectable utilise leadOk = start - now >= MIN_LEAD_MS (l.27, inclusif a exactement 1h). Le serveur rejette si slotStartMs - Date.now() < 60*60*1000 (create-checkout-session l.181, donc rejette aussi a exactement 1h moins epsilon). Pour un creneau a ~1h+quelques secondes, le client le montre selectionnable, et le temps de remplir le checkout (ou meme quelques secondes), le serveur passe sous la barre et rejette 'Ce creneau n'est plus reservable'. Fenetre reelle mais etroite (uniquement autour de la frontiere 1h) et l'erreur cote client est geree par un toast actionnable. P3.
- **Repro :** 1. Creneau a now+3600001ms. 2. Slots l'affiche selectionnable (3600001>=3600000). 3. Attendre ~2s puis soumettre → serveur voit ~3599999<3600000 → 400 'Ce creneau n'est plus reservable (delai 1h)'. 4. L'utilisateur voit l'erreur alors que le slot semblait OK.
- **Correctif :** Ajouter une marge cote client : exiger start-now >= MIN_LEAD_MS + buffer (ex. +2min) dans isSlotSelectable, ou masquer/desactiver les creneaux trop proches de la limite, pour que tout slot affiche selectionnable passe la verif serveur.

### 114. Drive main.tsx: listener controllerchange ajouté à chaque sw-activate-update sans removeEventListener

- **Fichier :** `apps/drive/src/main.tsx:86`
- **Catégorie :** memory leak / event listener
- **Problème :** Le handler 'sw-activate-update' (ligne 78) enregistre un nouveau listener 'controllerchange' (ligne 86) à chaque appel, sans jamais retirer le précédent, et le flag `refreshed` est local à chaque invocation (ne déduplique pas entre invocations). Si l'UI dispatche plusieurs fois 'sw-activate-update' alors qu'un SW waiting existe à chaque fois mais qu'aucun controllerchange ne survient entre-temps, les listeners s'accumulent. RÉEL mais étroit : dès le 1er controllerchange la page reload (window.location.reload ligne 89), ce qui détruit tous les listeners — l'accumulation suppose donc plusieurs dispatches successifs sans activation effective. Impact mémoire négligeable.
- **Repro :** 1. Charger Drive avec un SW waiting. 2. L'UI dispatche window.dispatchEvent(new CustomEvent('sw-activate-update')) une 1re fois → un listener controllerchange est ajouté, SKIP_WAITING posté. 3. Si pour une raison l'activation n'aboutit pas (waiting bloqué) et l'UI re-dispatche l'événement, un 2e listener s'ajoute. Chaque cycle ajoute un listener jamais retiré.
- **Correctif :** Sortir l'enregistrement du listener controllerchange du handler, ou utiliser { once: true } et un flag module-scope pour ne l'enregistrer qu'une fois.

### 115. Deletion modal does not close on Escape key

- **Fichier :** `apps/drive/src/pages/Account.tsx:314-427`
- **Catégorie :** Accessibility
- **Problème :** Le modal de suppression n'écoute pas la touche Échap, contrairement au comportement standard attendu d'un dialog. Le bouton Annuler reste disponible, donc la fermeture clavier passe par lui.
- **Repro :** 1. Ouvrir le modal de suppression. 2. Appuyer sur Échap. 3. Le modal ne se ferme pas (aucun handler). Il faut utiliser le bouton Annuler ou cliquer l'overlay.
- **Correctif :** Ajouter un effet useEffect avec un listener keydown qui appelle closeDeleteModal() sur Escape quand !deleting && !deleteDone, et retirer le listener au démontage.

### 116. Marge approx. soustrait des coûts HT d'un CA TTC (bases mélangées)

- **Fichier :** `apps/drive/src/pages/labo/ProductionNouvelle.tsx:627-637`
- **Catégorie :** Business Logic
- **Problème :** Ligne 637 margeApproxTtc = caTtc - coutTotal. caTtc (633-636) agrège prix_vente_unitaire_ttc (TTC). coutTotal (632) = coutMatieres (cout_unitaire_ht, HT) + coutIndirects (montant, HT). On soustrait donc des coûts HT d'un CA TTC : bases monétaires incohérentes, la marge affichée est surévaluée du montant de TVA sur le CA. Le label dit 'Marge approx. TTC' et la note ligne 660-663 reconnaît explicitement que la marge HT exacte vient de v_productions_kpi après passage en terminée. C'est donc un indicateur volontairement 'approx' avant validation, ce qui atténue la sévérité, mais le chiffre reste mathématiquement faux et peut induire en erreur sur la rentabilité d'un lot.
- **Repro :** 1. Matières : qty=10, PU=10 => coutMatieres=100 (HT) 2. Sorties : qty=10, PV TTC=15,825 => caTtc=158,25 (TTC, ~150 HT à 5,5%) 3. Onglet Valider : affiche Marge approx. TTC = 158,25 - 100 = +58,25 € 4. Après terminée, v_productions_kpi calcule ~50 € (150 HT - 100 HT). L'écart (~8 €) = TVA non retirée du CA.
- **Correctif :** Soit comparer des bases homogènes : convertir le CA en HT (caTtc / (1 + tva)) avant de soustraire les coûts HT, soit retirer l'affichage de marge avant terminée (la note dit déjà que la vraie marge vient de la vue). Le label 'TTC' devrait au minimum ne pas suggérer une marge.

### 117. Recettes : margeByRecette keyé par r.nom au lieu de r.id, collision sur noms dupliqués

- **Fichier :** `apps/drive/src/pages/labo/Recettes.tsx:36-40, 96`
- **Catégorie :** Data Integrity
- **Problème :** Vérifié : aggregateKpiByRecette (useProductionsKpi.ts lignes 71-117) agrège par kpi.recette (le NOM de recette, pas l'id — la vue v_productions_kpi expose une colonne `recette` textuelle) et retourne {recette: string}. Recettes.tsx construit le Map par r.recette (ligne 39) puis lit margeByRecette.get(r.nom) (ligne 96). Si deux recettes distinctes partagent le même `nom`, leurs productions sont fusionnées dans un seul bucket : les DEUX cartes affichent la marge agrégée combinée (pas la marge propre de chacune). Ce n'est pas une perte de données (aucune écriture), juste un KPI d'affichage faussé pour le cas-limite de noms dupliqués. Impact réel mais faible et conditionnel.
- **Repro :** 1. Créer deux recettes avec le nom exact identique (ex. 'Merguez') et des productions distinctes. 2. Ouvrir /v2/labo/recettes : les deux cartes 'Marge moy. 30j' affichent la même valeur (moyenne des productions des deux recettes confondues) au lieu de la marge propre de chacune.
- **Correctif :** Faire remonter recette_id par aggregateKpiByRecette (ajouter la colonne id à la vue ou regrouper par id) et keyer/lire le Map par r.id au lieu de r.nom.

### 118. OrderConfirmation : pas de re-vérification finale du paiement après le timeout de polling (~40s)

- **Fichier :** `apps/drive/src/pages/OrderConfirmation.tsx:288-291`
- **Catégorie :** State Machine
- **Problème :** Le polling de confirm-order s'arrête après 13 essais (~40s) via setPolling(false) (ligne 288-291) SANS appel de vérification final. L'effet ne se relance pas car la dep paymentStatus reste 'unpaid' (deps ligne 302). Si le webhook Stripe confirme à >40s, l'order est bien payé côté serveur mais l'UI reste figée sur 'Paiement en cours de validation' (lignes 528-557) jusqu'à un rechargement manuel. Confirmé : aucun fetch one-shot après le timeout. Impact limité : l'argent est correctement traité serveur, l'utilisateur reçoit un email de confirmation, et tout reload (ou la page /commandes) montre l'état correct. Donc gêne UX, pas perte d'argent ni d'état incohérent persistant.
- **Repro :** 1. Compléter un paiement 3DS dont le webhook met >40s à confirmer (réseau lent / file Stripe). 2. Rester sur OrderConfirmation : spinner 'Confirmation en cours' pendant ~40s puis bascule sur 'Paiement en cours de validation' figé. 3. Le paiement est en réalité 'paid' en DB ; l'UI ne se met jamais à jour sans reload.
- **Correctif :** Après attempts >= MAX_ATTEMPTS, faire un dernier invoke confirm-order et appliquer setOrder() avant setPolling(false), ou afficher un bouton 'Actualiser le statut' qui re-déclenche le polling.

### 119. Input quantité accepte les décimales qui sont silencieusement tronquées

- **Fichier :** `apps/drive/src/pages/pro/Panier.tsx:120-130`
- **Catégorie :** Input Validation / UX
- **Problème :** Le champ quantité est en type='number' (donc accepte les décimales au clavier desktop). onChange convertit via Number() et passe à updateQuantity, où clampQty() applique Math.floor() (proCart.ts:45). L'utilisateur voit la valeur tronquée sans aucun message de validation.
- **Repro :** 1. Ouvrir le panier Pro avec un article 2. Cliquer le champ quantité 3. Taper '2.5' 4. L'affichage retombe à '2' sans message d'erreur
- **Correctif :** Ajouter step={1} sur l'Input (déjà inputMode='numeric'), ou afficher un toast 'quantités entières uniquement' quand Math.floor modifie la valeur. Bug cosmétique, faible priorité.

### 120. DLC count_total dérive de la requête limitée à 60 alors que la card affiche un top de 14/3

- **Fichier :** `apps/stock/app/api/cockpit/snapshot/route.ts:218,525-529`
- **Catégorie :** Data Inconsistency
- **Problème :** Le count affiché dans l'eyebrow et le titre de la card DLC (count_total = nombre de lignes retournées, cappé à 60 par .limit(60)) ne correspond pas au nombre de lignes détail affichées (top sliced à 3). L'utilisateur voit 'X produits à remiser' mais seulement 3 lignes sous la card.
- **Repro :** 1. Avoir >3 alertes DLC (≠ok). 2. Ouvrir /v2/cockpit. 3. La card affiche 'N produits à remiser aujourd'hui' mais ne liste que 3 lignes. Si >60 alertes DLC réelles, N est silencieusement plafonné à 60.
- **Correctif :** Si on veut un vrai total exact au-delà de 60 : faire un COUNT(*) séparé côté SQL. Sinon documenter que count est plafonné à 60. Le mismatch top(3)/count est par design (échantillon) — clarifier le libellé ('top 3 sur N').

### 121. count_total DLC silencieusement plafonné à 60 si plus de 60 alertes en base

- **Fichier :** `apps/stock/app/api/cockpit/snapshot/route.ts:218,527`
- **Catégorie :** Data Truncation
- **Problème :** count_total et dlcCountCritique sont calculés sur les données de la requête plafonnée à 60 lignes. Au-delà de 60 alertes DLC en base, le total affiché est tronqué silencieusement.
- **Repro :** 1. Avoir >60 lots avec niveau_alerte≠ok en base. 2. Ouvrir /v2/cockpit. 3. La card DLC affiche au plus 60 (et count_critique sous-évalué d'autant).
- **Correctif :** Augmenter .limit, ou faire un COUNT(*) séparé pour count_total/count_critique indépendant du top affiché.

### 122. Baseline casse_24h (cockpit/snapshot) — filtre 18-23h lit getHours() UTC côté serveur

- **Fichier :** `apps/stock/app/api/cockpit/snapshot/route.ts:437-439`
- **Catégorie :** date/time/timezone
- **Problème :** Le calcul de la moyenne 7j de casse soirée filtre les events sur dt.getHours() entre 18 et 23 sans conversion Paris. Sur serveur UTC la fenêtre glisse de l'offset Paris (1-2h), incluant/excluant les mauvaises heures et biaisant total_eur_7j_avg et delta_pct.
- **Repro :** En prod (été), un event casse loggué à 19:30 Paris (17:30 UTC) un jour de baseline : il est exclu (h=17) du calcul avg7j, sous-estimant la moyenne soirée et gonflant delta_pct au cockpit.
- **Correctif :** Extraire l'heure Paris : `const h = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(dt));` avant le test 18-23.

### 123. Ticket de retrait n'affiche jamais la TVA (tvaTaux jamais passé)

- **Fichier :** `apps/stock/app/api/commandes-drive/[id]/ticket/route.ts:102-113`
- **Catégorie :** UX dégradée
- **Problème :** Le builder buildTicketRetraitPdf accepte un champ optionnel tvaTaux (ticket-retrait.ts:35) qui imprime la mention « TVA X % incluse » (ticket-retrait.ts:150-153). La route ne SELECT jamais de taux de TVA et n'inclut pas tvaTaux dans l'appel buildTicketRetraitPdf (lignes 102-113). Conséquence : aucun reçu de retrait n'affiche de mention TVA. Ce n'est PAS une perte de données (le total payé montant_capture_ttc/total_ttc reste juste) ni une obligation légale sur un reçu de retrait non-facture — d'où P3 et non P2/Data Loss comme prétendu.
- **Repro :** 1. Créer une commande Drive. 2. GET /api/commandes-drive/{id}/ticket. 3. Ouvrir le PDF : aucune ligne « TVA X % incluse » n'apparaît, alors que le builder sait l'afficher si tvaTaux est fourni.
- **Correctif :** Optionnel : lire les tva_taux des commandes_drive_lignes, dériver le taux dominant et le passer en tvaTaux à buildTicketRetraitPdf. Sinon, retirer le champ mort tvaTaux du builder.

### 124. POST /api/po/auto-generate - No Admin Notification on PO Creation

- **Fichier :** `apps/stock/app/api/po/auto-generate/route.ts:450-468`
- **Catégorie :** Operations - Missing Notification
- **Problème :** La route crée des brouillons de PO sans notification push/email aux admins. Les PO auto-générés (cron) ne sont découverts qu'en ouvrant /v2/po manuellement. UX dégradée, pas un défaut fonctionnel.
- **Repro :** Le cron appelle /api/po/auto-generate en mode proactif et crée des brouillons de PO → aucune push/email envoyée ; admin doit ouvrir /v2/po pour les voir.
- **Correctif :** Après création réussie (autour l.448), appeler le helper push admin (pattern de bdl/finalize) pour notifier le nombre de PO créés avec lien vers /v2/po.

### 125. auto-generate ignore min_commande_euros, crée des PO sous le minimum fournisseur

- **Fichier :** `apps/stock/app/api/po/auto-generate/route.ts:246, 325-338, 382`
- **Catégorie :** Business Logic
- **Problème :** `min_commande_euros` est bien chargé dans le SELECT des fournisseurs (ligne 246) mais n'est JAMAIS lu ni appliqué. La qté est `Math.ceil(c.manquant / condQty) * condQty` (326) et le total groupe `g.lignes.reduce((s,l)=>s+l.qty*l.prix_achat_ht,0)` (382) sans aucun garde-fou sur le minimum. Un brouillon peut donc être créé sous le minimum de commande, que le fournisseur refusera. Sévérité abaissée à P3 : ce sont des BROUILLONS qu'Otmane relit/ajuste avant envoi (la valeur métier est l'anticipation), pas un envoi automatique ; l'impact est un brouillon imparfait, pas une commande envoyée invalide.
- **Repro :** Fournisseur A min_commande_euros=500. Forecast déclenche un besoin valant 300€. auto-generate crée un brouillon de 300€ sans avertissement de sous-minimum.
- **Correctif :** Après calcul du total de groupe, si total < min_commande_euros : gonfler les qtés (par conditionnement) jusqu'à atteindre le minimum, ou marquer le brouillon 'sous-minimum' dans les notes pour qu'Otmane arbitre.

### 126. match-bdl : SELECT d'une colonne inexistante 'depot_id' sur bons_de_livraison + aucune validation de dépôt

- **Fichier :** `apps/stock/app/api/po/[id]/match-bdl/route.ts:69`
- **Catégorie :** Data Integrity/Logic Error
- **Problème :** La requête BDL (ligne 69) sélectionne 'depot_id', colonne inexistante sur bons_de_livraison (la vraie colonne est depot_destination_id). PostgREST renvoie une erreur → la route répond systématiquement 404. De plus aucune validation depot n'existe (seul fournisseur_id comparé). Route sans appelant connu (code mort).
- **Repro :** POST /api/po/[id]/match-bdl avec un bdl_id valide → la requête .select('...depot_id...') sur bons_de_livraison échoue (colonne inexistante), bdlErr non-null, réponse 404 'BDL introuvable' quel que soit le BDL.
- **Correctif :** Remplacer 'depot_id' par 'depot_destination_id' dans le SELECT ligne 69 et, avant le matching, valider bdl.depot_destination_id === po.depot_destination_id (422 sinon). Ou supprimer la route si elle reste non câblée.

### 127. TVA codée en dur à 5,5 % dans le PDF du PO — ignore tva_pct par ligne

- **Fichier :** `apps/stock/app/api/po/send/route.ts:175`
- **Catégorie :** Financial/Calculation Error
- **Problème :** buildPoPdf applique TVA 5,5 % en dur (lignes 175-176, 181) au lieu de sommer par ligne selon l.tva_pct (pourtant chargé). Si une ligne a un taux ≠ 5,5 %, le PDF affiche une TVA/TTC faux. Aujourd'hui sans effet car toutes les lignes sont créées à 5,5 % (auto-generate ligne 442).
- **Repro :** Créer un PO avec une ligne à tva_pct=20 (ex. produit non alimentaire). POST /api/po/send → le PDF calcule TVA = totalHt×0,055 et TTC = totalHt×1,055 pour toutes les lignes, sous-estimant la TVA de la ligne à 20 %.
- **Correctif :** Calculer la TVA par ligne : tvaTotal = Σ ligne_ht × (l.tva_pct/100), puis TTC = totalHt + tvaTotal. Idem pour le total_ttc stocké.

### 128. Réutilisation d'un PaymentIntent potentiellement expiré sans vérifier autorisation_expire_at

- **Fichier :** `apps/stock/app/api/stripe/create-payment-intent/route.ts:98-114`
- **Catégorie :** Payment State Machine
- **Problème :** Branche d'idempotence ligne 98-114 : si stripe_payment_intent_id existe et statut_paiement==='autorise', on retrieve le PI et on renvoie son client_secret sans vérifier autorisation_expire_at. Si l'auto a expiré (>7j), le client reçoit un clientSecret périmé et confirmPayment() échouera côté Stripe sans chemin de récupération automatique. Edge case UX dégradé : pour une commande récente c'est le comportement d'idempotence voulu, mais aucune garde sur l'expiration n'existe.
- **Repro :** 1. Client crée une commande et obtient une pré-autorisation. 2. Revenir >7 jours plus tard sur le lien de paiement. 3. create-payment-intent retrouve le PI 'autorise' et renvoie son client_secret périmé. 4. Le front confirmPayment() échoue ('intent expired') sans recréer de PI.
- **Correctif :** Avant de réutiliser le PI, vérifier si autorisation_expire_at < now() (ou si pi.status n'est plus 'requires_capture') ; si expiré, cancel le PI et en recréer un frais.

### 129. Sync Drive-Pull: race condition sur création du produit placeholder (EAN dupliqué)

- **Fichier :** `apps/stock/app/api/sync/drive-pull/route.ts:185-204`
- **Catégorie :** Data Integrity / Race Condition
- **Problème :** Insert placeholder sans gestion d'erreur : en course au premier setup, le perdant repart avec placeholderId=null et skippe ses items non matchés.
- **Repro :** 1. Aucun produit ean='0000000000000' encore. 2. Deux POST /api/sync/drive-pull concurrents. 3. Les deux passent maybeSingle (null), les deux insèrent. 4. Le 2e échoue (unique ean), created=null → placeholderId=null. 5. Ses items non matchés sont skippés (l.293).
- **Correctif :** Gérer l'erreur d'insert : en cas de 23505, re-SELECT le placeholder par ean et réutiliser son id ; ou utiliser un upsert onConflict:'ean'.

### 130. Boutons d'action de la modal sortie sans disabled/loading : triple-clic → plusieurs UPDATE et plusieurs push

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:537-557`
- **Catégorie :** UX - Anti-double-submit manquant
- **Problème :** Les trois boutons (Accepter l538, Clarification l545, Rejeter l552) appellent void handleX(detail) sans état isSubmitting ni disabled. setDetail(null) n'intervient qu'à la FIN du handler (après l'await). Un triple-clic rapide lance 3 fois le handler avant fermeture. Pour Accepter/Rejeter les UPDATE sont idempotents (même id, même score) donc pas de corruption, mais handleClarification enverra 3 push iPhone au même employé. Impact limité (pas de perte de données) → P3.
- **Repro :** Ouvrir une sortie, cliquer 3x très vite sur 'Demander clarification employé' : 3 push 'Clarification demandée' partent vers l'employé.
- **Correctif :** Ajouter const [busy,setBusy]=useState(false), setBusy(true) avant l'await et false après (finally), disabled={busy} sur les 3 boutons.

### 131. KPI 'SURPLUS à refacturer' calculé avec un prix unitaire fixe de 7,5€

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:326-328`
- **Catégorie :** Logique métier - Valeur codée en dur
- **Problème :** Le KPI SURPLUS (carte 'X à refacturer', l372-378) calcule surplusEnAttente.reduce((s,r)=>s+r.quantite_surplus*7.5,0). Le prix unitaire 7,5€ est codé en dur et ne dépend d'aucun produit : un surplus de produits chers ou bon marché donne la même valeur/unité, faussant le montant à refacturer au fournisseur affiché à l'admin. (Le candidat 11 décrit le même défaut sous l'angle interface → fusionné ici.)
- **Repro :** Avoir un surplus de 2 unités d'un produit à 30€ ; le KPI affiche 15€ (2*7,5) au lieu de ~60€.
- **Correctif :** Joindre alertes_surplus → produits/stock_par_depot ou bons_de_livraison_lignes pour récupérer le prix réel ; 7,5€ uniquement en fallback.

### 132. handleClarification annonce 'push iPhone envoyée' alors que le push est fire-and-forget (échec avalé)

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:172-186`
- **Catégorie :** UX - Faux retour de succès
- **Problème :** Le push est déclenché via import(...).then(...).catch(e=>console.warn) (l172-183) sans await, puis le toast 'Clarification demandée à X (push iPhone envoyée)' s'affiche inconditionnellement (l184). Si sendPush échoue (secret absent → push-send.ts retourne {ok:false}, ou réseau), l'admin lit 'push envoyée' alors qu'aucune notif n'est partie ; l'employé n'est jamais averti. La note DB elle-même est correctement gardée en amont (l164-169), donc pas de perte de données — impact purement UX → P3.
- **Repro :** Désactiver INTERNAL_API_SECRET (push-send renvoie ok:false). Cliquer 'Demander clarification' : toast 'push iPhone envoyée' s'affiche, mais aucun push n'est reçu sur l'iPhone de l'employé.
- **Correctif :** await m.sendPush(...) et adapter le wording du toast selon result.ok (ex. 'clarification enregistrée — push en échec' si !ok).

### 133. catch vide dans le calcul démarque : erreur DB avalée, tab affiché vide sans alerte

- **Fichier :** `apps/stock/app/v2/admin/alertes/page.tsx:311-313`
- **Catégorie :** Gestion d'erreur - Échec silencieux
- **Problème :** Le try démarque (l265) se termine par catch { setDemarque([]); } (l311-313) sans log ni toast : une erreur Supabase (réseau, RLS, timeout) sur les selects produits est indiscernable d'un 'aucune démarque'. Contrairement aux selects sorties/surplus de loadAll qui, eux, font console.error + toast.error (l235-241, l254-257). Cohérent avec l'apprentissage 'erreurs Supabase avalées partout'. Mineur car la donnée démarque est déjà factice (voir bug dédié).
- **Repro :** Couper le réseau pendant loadAll : onglet Démarque affiche 'Aucune démarque détectée' sans aucune indication d'échec, alors que les autres onglets affichent un toast d'erreur.
- **Correctif :** catch (err) { console.error('[alertes] démarque échouée', err); toast.error('Erreur chargement démarque'); setDemarque([]); }

### 134. Factures Pro page: 'today' fige via useMemo([]) ne se met pas a jour a minuit

- **Fichier :** `apps/stock/app/v2/admin/factures-pro/page.tsx:83`
- **Catégorie :** State Management / Time-Sensitive Data
- **Problème :** const today = useMemo(() => new Date(), []) (ligne 83) fige l'instant du montage et alimente estEnRetard/joursRetard (lib/db/pro.ts l.255-267) ainsi que le filtre 'retard' (l.89-90) et le compteur nbRetard (l.98). Si la page reste ouverte au passage de minuit, une facture dont l'echeance bascule cette nuit-la reste classee selon 'hier'. Reel mais portee tres limitee: estEnRetard compare au niveau jour entier (date_echeance + 'T23:59:59'), il faut donc une echeance pile a la date du jour ET garder la page ouverte au-dela de minuit; un simple refresh corrige. Aucun impact data/argent. Severite P2 du candidat exageree -> P3.
- **Repro :** 1. Ouvrir /v2/admin/factures-pro avant minuit avec une facture dont l'echeance = aujourd'hui. 2. Laisser la page ouverte. 3. Apres minuit, la facture n'apparait pas en 'retard' tant qu'on ne rafraichit pas.
- **Correctif :** Recalculer 'today' periodiquement, ex: const today = useMemo(() => new Date(), [Math.floor(Date.now()/60000)]) ou un setInterval qui met a jour un state toutes les minutes.

### 135. Graphe CA admin echoue silencieusement — dashboard sans donnees CA

- **Fichier :** `apps/stock/app/v2/admin/page.tsx:112-114`
- **Catégorie :** Silent Database Error
- **Problème :** Le chargement du CA par jour avale l'erreur dans un .catch silencieux ; en cas d'echec RPC, le graphe CA du cockpit admin est vide sans feedback, indistinguable d'une absence de ventes.
- **Repro :** Provoquer un echec de la RPC listRevenueByDay (reseau down/erreur SQL) : le graphe CA du dashboard admin reste vide, aucun message.
- **Correctif :** .catch((e) => { console.error('[admin] revenue', e); toast.error('CA indisponible'); setRevenue([]); })

### 136. Ligne détail DLC affiche le niveau_alerte (texte statut) au lieu d'une quantité quand quantite_recue est null/0

- **Fichier :** `apps/stock/app/v2/cockpit/page.tsx:306-310`
- **Catégorie :** Display Bug
- **Problème :** Quand quantite_recue est null ou 0, la colonne valeur de la ligne détail DLC affiche le statut ('forcé', 'critique') au lieu d'un compte d'unités, créant une ambiguïté sur ce que représente la valeur.
- **Repro :** 1. Lot DLC avec quantite_recue null ou 0. 2. Ouvrir /v2/cockpit. 3. La ligne détail DLC montre 'forcé' (statut) dans la colonne de droite à la place d'un nombre d'unités.
- **Correctif :** Utiliser un fallback explicite : value={d.quantite_recue != null ? `${d.quantite_recue} u` : '—'}.

### 137. Drawer fournisseur ne valide pas le format email/URL avant save

- **Fichier :** `apps/stock/app/v2/fournisseurs/page.tsx:422-431, 548-558`
- **Catégorie :** Validation
- **Problème :** Les inputs type='email' (email_commandes) et type='url' (certif_pdf_url) n'ont aucune validation JS avant save() : save() écrit directement la valeur brute en base (lignes 345/352). type='email'/'url' du navigateur ne valide QUE dans un <form> soumis ; ici save est déclenché par onClick d'un <button type='button'> hors form, donc la validation HTML native n'est jamais déclenchée. Un email mal formé est persisté ; po/send échouera plus tard côté Resend sans feedback utile à l'admin. Réel mais impact faible (donnée corrigeable, pas de perte/argent).
- **Repro :** Ouvrir le drawer, saisir 'pasunemail' dans Email commandes, cliquer Enregistrer : toast succès, valeur invalide en base. L'envoi de PO échouera ensuite en 502.
- **Correctif :** Valider avant save : email via regex/`includes('@')`, URL via `new URL()` try/catch ; bloquer + toast si invalide.

### 138. Conformité inventaire = 100% quand le théorique total est 0 malgré des écarts réels

- **Fichier :** `apps/stock/app/v2/inventaire/page.tsx:133-134`
- **Catégorie :** Logic / Edge Case
- **Problème :** Le calcul de conformité court-circuite à 100% quand totalTheo===0, même si des écarts non nuls existent. Découvrir 10 articles attendus à 0 affiche '100% conformité' sans déclencher l'alerte low-conf (conf<95), donc Otmane/Ahmed ne sont pas notifiés d'un écart pourtant significatif.
- **Repro :** 1. Inventaire avec un produit quantite_attendue=0 (stock vide en système). 2. Employé compte 10. 3. totalTheo=0, totalEcart=10. 4. conf=100 (branche else). 5. Toast '✅ Inventaire validé · conformité 100%', aucun push urgent, aucune notif admin alors qu'il y a 10 unités d'écart.
- **Correctif :** Si totalTheo === 0 && totalEcart > 0, fixer conf=0 (ou un seuil d'alerte) pour déclencher lowConf et la notification admin. Sinon conserver la formule actuelle.

### 139. Validation d'inventaire en boucle non atomique → état partiel sans feedback

- **Fichier :** `apps/stock/app/v2/inventaire/page.tsx:126-132`
- **Catégorie :** Data Consistency
- **Problème :** La boucle L126-132 appelle completeInventaire séquentiellement (await) sans transaction. Si un appel échoue en milieu de boucle, les items déjà traités passent à statut 'compte' tandis que les suivants restent 'assigne' ; l'exception remonte au catch L178 et la conformité + notifications (L133-176) ne sont jamais calculées. L'employé ne sait pas quel item a échoué. L'état reste cohérent au sens DB (items restants re-comptables) mais la validation est partielle et silencieuse côté UX.
- **Repro :** 1. Employé compte 5 items, clique 'Valider'. 2. completeInventaire réussit pour 3 items (statut 'compte'). 3. Le 4e échoue (erreur DB/réseau). 4. Exception au catch L178 → toast générique 'Erreur lors de la validation'. 5. 3 items 'compte', 2 'assigne' ; aucune notif conformité ; l'employé doit deviner où reprendre.
- **Correctif :** RPC qui complète un tableau d'inventaires atomiquement, ou afficher quels items ont été validés / lesquels ont échoué et permettre de reprendre uniquement les restants.

### 140. Labo page: marges stale affichees au changement de periode

- **Fichier :** `apps/stock/app/v2/labo/page.tsx:132-153`
- **Catégorie :** Race Condition / UX
- **Problème :** Au changement de periode (setPeriod ligne 199), l'effet KPI (lignes 132-145) re-fetch mais ne vide pas kpiLignes avant: pendant le fetch (~quelques 100ms), margeParProd (lignes 149-153) conserve les marges de l'ancienne periode et les affiche sur les productions recentes. Reel mais attenue: un spinner kpiLoading est visible (lignes 207-213) et les valeurs se corrigent des la fin du fetch. Pas de perte de donnees ni d'etat persiste faux, juste un bref flash de valeurs perimees. P2 du candidat -> P3.
- **Repro :** 1. /v2/labo, periode 30j affichee avec marges. 2. Cliquer '7j'. 3. Pendant ~quelques centaines de ms les productions montrent encore les marges 30j (spinner actif) avant rafraichissement.
- **Correctif :** Vider kpiLignes (et kpi) au debut de l'effet periode avant le fetch: setKpiLignes([]); setKpi(null); puis fetch. Ou n'afficher margeParProd que si !kpiLoading.

### 141. PO detail : lignes à quantité 0 sauvegardées

- **Fichier :** `apps/stock/app/v2/po/[id]/page.tsx:129-152, 280-291`
- **Catégorie :** Validation
- **Problème :** QtyControl permet 0 (`Math.max(0, value-1)` et input number sans min>0) et saveLignes() persiste quantite_commandee tel quel sans filtrer les lignes à 0 (lignes 139-145). Une ligne à 0 reste dans le brouillon et apparaît dans le PDF fournisseur (po/send buildPoPdf itère toutes les lignes). Impact faible : 0×prix=0, le total reste correct ; c'est surtout du bruit dans le document. Pas de perte d'argent ni d'incohérence comptable.
- **Repro :** Éditer une ligne PO, qté → 0, Enregistrer : la ligne persiste avec quantite_commandee=0 et figure dans le bon de commande PDF envoyé.
- **Correctif :** Filtrer/avertir les lignes quantite_commandee<=0 avant saveLignes() (ou proposer la suppression de la ligne).

### 142. Paramètre photoUrl jamais utilisé en markMissing — toast 'Photo enregistrée' mensonger

- **Fichier :** `apps/stock/app/v2/preparation/[id]/page.tsx:288-316`
- **Catégorie :** Misleading UX / Unfinished Feature
- **Problème :** markMissing (page.tsx:288) reçoit photoUrl depuis PhotoCapture (ligne 727-729), fait 'void photoUrl' (ligne 315) sans jamais le persister, mais affiche le toast 'Marqué manquant. Photo de l'étagère enregistrée.' (ligne 314). Le message affirme une persistance qui n'a pas lieu : aucune colonne photo n'est écrite sur commandes_drive_lignes. L'employé croit que la preuve photo est sauvegardée (litige client/écart manquant), alors qu'elle est perdue. Impact réel faible (statut manquant lui est bien sauvé) mais le message est trompeur et la fonctionnalité de preuve photo est inachevée.
- **Repro :** Sur une ligne 'en attente', cliquer 'Manquant' → capturer une photo dans PhotoCapture → confirmer. La ligne passe bien à statut 'manquant', le toast dit 'Photo enregistrée', mais la photo n'est nulle part en BD (paramètre void).
- **Correctif :** Soit retirer la mention 'Photo enregistrée' du toast (ligne 314) pour ne pas mentir, soit implémenter l'upload (Supabase storage) + UPDATE d'une colonne missing_photo_url sur la ligne.

### 143. Carton product lookup avale l'erreur DB — surplus mal route vers creation produit

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:254-258`
- **Catégorie :** Silent Database Error
- **Problème :** Lookup produit du carton (hors BDL) sans check error : sur erreur DB, le scan carton est mal route vers le modal de creation produit au lieu d'ouvrir le modal surplus.
- **Repro :** Scanner un EAN carton dont le produit n'est pas dans le BDL, pendant une indispo DB transitoire. Au lieu du modal surplus, le modal 'creation produit' s'ouvre avec l'EAN carton.
- **Correctif :** Ajouter le check : const { data: prodNom, error } = await sb.from('produits')...; if (error) { toast.error('Lookup produit echoue'); return; }

### 144. Recherche carton (apprentissage) renvoie vide sur erreur Supabase — aucun feedback

- **Fichier :** `apps/stock/app/v2/reception/[id]/page.tsx:163-168`
- **Catégorie :** Silent Database Error
- **Problème :** Recherche produit dans le modal d'apprentissage carton sans check error : sur erreur DB la liste apparait vide sans message, l'employe croit que le produit n'existe pas.
- **Repro :** Ouvrir le modal d'apprentissage carton, taper un nom de produit pendant une indispo reseau Supabase : liste vide, aucun message d'erreur.
- **Correctif :** const { data, error } = await sb.from('produits')...; if (error) { toast.error('Recherche impossible'); setCartonSearchResults([]); return; }

### 145. handlePhotoCapture : fetchBdl non awaité → header montre encore le slot photo vide après capture

- **Fichier :** `apps/stock/app/v2/reception/[id]/scan-first/page.tsx:337-361`
- **Catégorie :** UX / State
- **Problème :** Confirmé : handlePhotoCapture (l.337-361) update la photo en DB, ferme la modal (setPhotoOpen(false), l.358) puis appelle `void fetchBdl()` non awaité (l.360). La modal se ferme immédiatement, mais l'aperçu de la photo dans le préambule n'apparaît qu'après le re-fetch (latence réseau). Pendant ce délai le bouton 'Photo côté N' reste vide alors que la photo EST enregistrée. RÉEL mais dégradation UX transitoire (auto-corrigée en 1-2s), aucune perte de donnée ni état faux durable. P3, pas P2.
- **Repro :** 1. Prendre une photo palette, valider. 2. Modal se ferme. 3. Le slot reste vide 1-2s (réseau lent) avant que l'image apparaisse.
- **Correctif :** Afficher un aperçu optimiste immédiat (utiliser le dataUrl localement dans setBdl) avant le re-fetch, ou await fetchBdl() avant de fermer.

### 146. findProduitByEanInternal renvoie null sur erreur DB — produit existant vu 'introuvable'

- **Fichier :** `apps/stock/app/v2/reception/page.tsx:245-250`
- **Catégorie :** Silent Database Error
- **Problème :** Le helper findProduitByEanInternal (resolution produit d'un carton) ne verifie pas .error ; sur erreur DB il renvoie null et le scan carton echoue silencieusement (aucun toast). Le lookup unitaire principal, lui, throw correctement.
- **Repro :** Scanner un EAN carton connu alors que la resolution produit (par id) subit une erreur DB : le scan ne fait rien, aucun message.
- **Correctif :** Dans findProduitByEanInternal : const { data, error } = await sb.from('produits')...; if (error) throw error; (puis remonter l'erreur dans handleScan).

### 147. Aggregated Stock View Does Not Show Items Without Category

- **Fichier :** `apps/stock/app/v2/stock/page.tsx:146-151`
- **Catégorie :** Data Filtering
- **Problème :** Les produits sans catégorie n'ont pas de pastille de filtre 'Sans catégorie'. Ils restent visibles sous 'Tout' mais ne peuvent pas être isolés par filtre.
- **Repro :** Produit avec categorie=null sur /v2/stock 'Tous dépôts' : visible sous 'Tout', mais aucune pastille pour ne montrer que les sans-catégorie.
- **Correctif :** Dans cats, inclure null et ajouter une pastille '(Sans catégorie)' ; adapter filtered/filteredAggregated pour traiter ce cas (cat==='(Sans catégorie)' ? !p.categorie : p.categorie===cat).

### 148. Stock page category pills don't reset when switching between depot and regroupée views

- **Fichier :** `apps/stock/app/v2/stock/page.tsx:44, 313-370`
- **Catégorie :** State inconsistency
- **Problème :** L'état 'cat' (ligne 46, défaut 'Tout') persiste lorsqu'on change de vue via setView (lignes 225/236) sans reset. filtered (vue dépôt) et filteredAggregated (vue regroupée) appliquent tous deux le filtre cat. Les catégories disponibles 'cats' sont recalculées par vue (146-151), donc si on filtre par une catégorie en vue dépôt puis bascule sur 'Tous dépôts', le filtre cat reste actif ; si cette catégorie n'existe pas dans la liste agrégée (ou simplement si la pill correspondante n'est plus rendue), la grille affiche 'Aucun produit ne correspond à la recherche' (ligne 419/422) alors que des produits existent. Désagrément/confusion UX réel, pas un crash ni une perte de données ni un calcul faux. Sévérité P2 exagérée → P3.
- **Repro :** 1. Vue 'Dépôt'. 2. Cliquer une catégorie spécifique (ex: Boucherie). 3. Basculer sur 'Tous dépôts'. 4. Le filtre Boucherie reste appliqué ; si l'agrégat n'a pas cette catégorie visible/sélectionnable, la grille montre 0 résultat avec message 'Aucun produit ne correspond', laissant croire à un bug.
- **Correctif :** Réinitialiser cat à 'Tout' au changement de vue : remplacer onClick={() => setView('depot'/'regroupe')} par un handler qui fait setView(...) + setCat('Tout').

### 149. Saisie quantité transfert ramenée silencieusement dans [1..9999] sans retour utilisateur

- **Fichier :** `apps/stock/app/v2/transfert/page.tsx:398-406`
- **Catégorie :** UX / Validation
- **Problème :** Le onChange de la quantité de transfert clampe à [1,9999] sans feedback. Taper 0 devient 1, taper 50000 devient 9999, silencieusement. L'utilisateur peut croire que sa saisie a été acceptée telle quelle. Le dépassement du stock source est toutefois bloqué au submit (ligne 156).
- **Repro :** 1. /v2/transfert, source+destination+produit choisis. 2. Champ quantité : taper '0' → affiche '1'. 3. Taper '50000' → affiche '9999', sans toast d'avertissement.
- **Correctif :** Au lieu de clamper en silence, afficher un toast si la saisie < 1 ('Quantité minimale: 1') ou > stockSource ('Stock insuffisant'), et laisser la valeur saisie jusqu'à la validation.

### 150. PoDrawer Link n'attend pas la fermeture du drawer avant la navigation

- **Fichier :** `apps/stock/components/po/po-drawer.tsx:246-263`
- **Catégorie :** Navigation / Overlay Management
- **Problème :** Le drawer PO utilise <Link onClick={onClose}> : l'animation de fermeture du sheet se joue pendant la transition de page vers /v2/po/{id} au lieu d'avant.
- **Repro :** 1. Liste PO. 2. Ouvrir un drawer. 3. Taper 'Éditer les lignes'. 4. Observer le sheet glisser pendant que la page d'édition charge.
- **Correctif :** Remplacer le Link par onClick={() => { onClose(); router.push(`/v2/po/${po.id}`); }} pour fermer avant de naviguer (cosmétique).

### 151. lastCodeRef jamais reset à réouverture — dé-dupe bloque un rescan légitime du même EAN

- **Fichier :** `apps/stock/components/reception/scanner-overlay.tsx:89, 126-141, 272`
- **Catégorie :** Logic Error / State
- **Problème :** Confirmé : stopAll() (l.125-141) ne remet pas lastCodeRef.current=null, et le useEffect [open] (l.110-123) ne le reset pas non plus. Si on ferme puis rouvre l'overlay en < 600ms et qu'on rescanne le MÊME EAN, le garde dé-dupe (l.272) l'ignore silencieusement (aucun feedback, aucune incrémentation). RÉEL mais portée très limitée : il faut fermer ET rouvrir ET rescanner le même code en moins de 600ms — fenêtre quasi inatteignable manuellement (fermer overlay + tap 'Démarrer le scan' + repositionner caméra dépasse largement 600ms). Impact réel négligeable d'où P3, pas P1.
- **Repro :** Théorique : scanner EAN X, fermer overlay, rouvrir et rescanner X en moins de 600ms → scan ignoré. En pratique la séquence d'UI dépasse 600ms.
- **Correctif :** Ajouter `lastCodeRef.current = null;` dans stopAll() (l.136 zone reset des refs).

### 152. BayPicker modal does not lock body scroll on iOS

- **Fichier :** `apps/stock/components/v2/BayPicker.tsx:108-130`
- **Catégorie :** Mobile UX
- **Problème :** Confirmé : BayPicker (lignes 48-228) n'a aucun useEffect posant document.body.style.overflow='hidden' quand open=true. Le backdrop motion.div (ligne 116) couvre l'écran mais le body reste scrollable derrière sur iOS (rubber-band). Comportement réel mais purement cosmétique/UX dégradé, pas un crash ni perte de données : P3, pas P2. À noter, plusieurs autres modals du repo ont le même pattern (Account, etc.).
- **Repro :** Ouvrir /v2/preparation, déclencher BayPicker via 'Avancer', scroller : la page derrière bouge sur iOS Safari.
- **Correctif :** useEffect(() => { if (!open) return; const o=document.body.style.overflow; document.body.style.overflow='hidden'; return () => { document.body.style.overflow=o; }; }, [open]);

### 153. BayPicker : modale ne gère pas la touche Escape

- **Fichier :** `apps/stock/components/v2/BayPicker.tsx:108-228`
- **Catégorie :** accessibility
- **Problème :** BayPicker pose role='dialog' aria-modal='true' (lignes 118-120) mais ne capture jamais la touche Escape. Quand le focus est sur le bouton Confirmer, Échap ne ferme pas la modale — déviation du pattern ARIA dialog.
- **Repro :** Ouvrir BayPicker, focus sur 'Confirmer', appuyer Échap : reste ouverte.
- **Correctif :** Ajouter un handler Escape (useEffect window keydown ou onKeyDown sur le panel) appelant onClose.

### 154. CartonLearnModal : 'Modifier la quantité' ne réinitialise pas les résultats de recherche

- **Fichier :** `apps/stock/components/v2/reception/CartonLearnModal.tsx:181-186`
- **Catégorie :** State Management
- **Problème :** Le retour à l'étape qty ne vide pas la recherche : anciens résultats visibles en revenant à l'étape pick.
- **Repro :** 1. Carton learn, étape qty. 2. Suivant → pick. 3. Chercher 'Coca' → 5 résultats. 4. '← Modifier la quantité'. 5. Suivant → anciens résultats Coca encore là.
- **Correctif :** Dans onChangeState vers step:'qty' (ou côté parent), appeler onSearchQueryChange('') et vider searchResults.

### 155. SurplusModal: champ quantité vidé soumet 1 au lieu de l'état vide

- **Fichier :** `apps/stock/components/v2/reception/SurplusModal.tsx:81-87`
- **Catégorie :** Validation
- **Problème :** Vider le champ quantité du SurplusModal laisse qty='' visuellement, mais submitSurplus enregistre quantite_surplus=1 (Number('')||1). Léger mismatch d'affichage sans conséquence sur le stock.
- **Repro :** 1. Ouvrir le modal surplus. 2. Vider le champ quantité (backspace). 3. Cliquer 'Signaler à Otmane et Ahmed'. 4. L'alerte est créée avec quantite_surplus=1 alors que le champ était vide.
- **Correctif :** Sur value==='' en onChange, remettre qty à 1 (au lieu de ''), ou désactiver le bouton submit tant que qty===''.

### 156. SurplusModal : bouton fermer (X) sans aria-label

- **Fichier :** `apps/stock/components/v2/reception/SurplusModal.tsx:56-58`
- **Catégorie :** accessibility
- **Problème :** Le bouton de fermeture (lignes 56-58) ne contient que l'icône X, sans aria-label ni texte. Lecteur d'écran annonce 'bouton' vide.
- **Repro :** Ouvrir SurplusModal, focus sur le X : annoncé 'bouton' sans action.
- **Correctif :** Ajouter aria-label='Fermer' au bouton ligne 56.

### 157. SurplusModal : boutons −/+ (texte symbole) sans aria-label

- **Fichier :** `apps/stock/components/v2/reception/SurplusModal.tsx:70-96`
- **Catégorie :** accessibility
- **Problème :** Les boutons d'incrément/décrément affichent uniquement les caractères '−' et '+' (lignes 76 et 94) sans aria-label. Le contexte ('quantité reçue en plus') n'est pas annoncé pour ces contrôles.
- **Repro :** Ouvrir SurplusModal, focus sur − / + : annonce uniquement le symbole, sans contexte de quantité.
- **Correctif :** Ajouter aria-label='Diminuer la quantité reçue en plus' / 'Augmenter la quantité reçue en plus'.

### 158. StockEditModal : bouton désactivé avec message 'Aucun changement' quand le champ qty est vidé

- **Fichier :** `apps/stock/components/v2/StockEditModal.tsx:84-86`
- **Catégorie :** UI / State Display
- **Problème :** Vider le champ quantité grise le bouton Enregistrer (delta===0) sans explication, pouvant surprendre l'utilisateur en cours de saisie.
- **Repro :** 1. Modale stock, qty=10. 2. Sélectionner tout + backspace (qty=''). 3. Bouton grisé sans message clair.
- **Correctif :** Distinguer le cas qty==='' : afficher 'Saisir une quantité' plutôt que de simplement griser sans contexte.

### 159. StockEditModal : boutons −/+ d'ajustement quantité sans aria-label

- **Fichier :** `apps/stock/components/v2/StockEditModal.tsx:140-167`
- **Catégorie :** accessibility
- **Problème :** Les boutons d'ajustement de quantité (lignes 140-147 et 162-167) ne contiennent qu'une icône Lucide Minus/Plus, aucun aria-label ni texte. Un lecteur d'écran annonce 'bouton' sans fonction.
- **Repro :** Ouvrir StockEditModal, naviguer en lecteur d'écran vers les boutons − et + : annoncés 'bouton' sans contexte.
- **Correctif :** Ajouter aria-label='Diminuer la quantité' / 'Augmenter la quantité'.

### 160. StockEditModal : bouton fermer (X) sans aria-label

- **Fichier :** `apps/stock/components/v2/StockEditModal.tsx:126-131`
- **Catégorie :** accessibility
- **Problème :** Le bouton de fermeture (lignes 126-131) ne contient que l'icône X (ligne 130), aucun aria-label ni texte. Lecteur d'écran annonce 'bouton' sans fonction.
- **Repro :** Ouvrir StockEditModal, focus sur le X : annoncé 'bouton' sans action.
- **Correctif :** Ajouter aria-label='Fermer' au bouton ligne 126.

### 161. Z-score arrondi à 2 décimales AVANT comparaison aux seuils

- **Fichier :** `apps/stock/lib/db/casse.ts:311-314`
- **Catégorie :** Calculation Precision
- **Problème :** l.311 z=round2((observeJour-mu)/sigma) puis l.312-314 compare Math.abs(z) aux seuils. Un z brut de 2.494 devient 2.49 et tombe en 'warning' au lieu d''alerte'. Réel mais l'impact est borné à une bande de 0.005σ exactement sur la frontière, sur une métrique déjà approximative (variance catégorie = somme des variances produit). Niveau changé seulement dans des cas-limites extrêmement rares.
- **Repro :** z brut = 2.494 → round2 = 2.49 < 2.5 → niveau 'warning' au lieu d''alerte'.
- **Correctif :** Comparer le z non arrondi aux seuils, n'arrondir que pour l'affichage.

### 162. createTransfert() rpcErr msg trompeuse si trace échoue après RPC réussie

- **Fichier :** `apps/stock/lib/db/index.ts:590-630`
- **Catégorie :** UX / Error Message
- **Problème :** Réel mais déjà mitigé et de faible gravité. Si transfer_stock réussit (stock déjà déplacé) mais l'INSERT de la trace échoue (l.623), le code throw 'Stock transféré mais trace non enregistrée : ...' (l.625-627). Le message dit donc CORRECTEMENT que le stock a bougé — contrairement à ce qu'affirme le candidat ('UI affiche Transfert refusé'). Le seul résidu : la trace métier (photo/auteur) manque, mais le mouvement reste audité dans stock_movements (le ledger). Aucune perte de stock, message déjà clair. P3, pas P2.
- **Repro :** Faire échouer l'INSERT transferts_inter_depots (ex RLS) après RPC OK : message 'Stock transféré mais trace non enregistrée'.
- **Correctif :** Optionnel : transformer ce throw en avertissement non-bloquant côté UI puisque le mouvement est déjà tracé dans le ledger.

### 163. getSalutation() lit getHours() en UTC côté serveur (route cockpit) — salutation décalée de 1-2h

- **Fichier :** `apps/stock/lib/hijri.ts:524`
- **Catégorie :** date/time/timezone
- **Problème :** getSalutation(now=new Date()) fait `const h = now.getHours()` sans conversion de fuseau. Appelée sans argument dans la route API cockpit/snapshot (serveur Vercel UTC), elle compare une heure UTC aux seuils 11/18 pensés pour Paris. Décalage de 1h (hiver) à 2h (été) → mauvaise salutation 'Sabah el khir/Salam/Msa el khir'.
- **Repro :** Déployer en prod (Vercel UTC). À 16:30 UTC en été (= 18:30 Paris), appeler /api/cockpit/snapshot : le champ salutation renvoie 'Salam' (h=16 < 18) au lieu de 'Msa el khir'. Le cockpit affiche la salutation de l'après-midi en soirée.
- **Correctif :** Extraire l'heure Paris avant comparaison : `const h = Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'}).format(now));`

### 164. Missing DLC Field in Brother Label PDF Output

- **Fichier :** `apps/stock/lib/labels/generate-pdf.ts:118-133`
- **Catégorie :** Feature Incompleteness
- **Problème :** Le builder Brother gère les champs dlc/lot mais la page /v2/etiquettes ne les alimente pas. Choix assumé : page produit sans contexte lot, DLC portée par le certificat halal/fiche lot.
- **Repro :** Aller sur /v2/etiquettes -> Brother -> Générer : le PDF n'affiche jamais DLC ni n° de lot, car generateBrother() ne passe pas ces champs. Comportement documenté lignes 16-23.
- **Correctif :** Si on veut la DLC sur l'étiquette Brother, ajouter un sélecteur de lot dans la page et passer dlc/lot dans le LabelInput de generateBrother() (lignes 84-93). Sinon documenter qu'aucun changement n'est attendu.

### 165. Cache des IDs admin (60s) — désactivation d'un admin propagée avec retard

- **Fichier :** `apps/stock/lib/notifications.ts:5-7, 13-14`
- **Catégorie :** Data Staleness
- **Problème :** getAdminEmployeIds() met en cache la liste des IDs admin 60s. Un admin passé is_active=false continue de recevoir les push admin jusqu'à expiration du cache ; un admin promu attend jusqu'à 60s. Impact mineur (fenêtre <1min).
- **Repro :** Marquer l'admin is_active=false. Pendant les 60s suivantes, déclencher pushToAdmins() : l'admin reçoit encore la notif. Après expiration du cache, il cesse.
- **Correctif :** Réduire CACHE_MS (ex. 10s) ou invalider le cache sur mise à jour d'un employé. Impact faible — non bloquant.

### 166. confirm-order : échec de notify-new-order ignoré, commande confirmée sans notification staff

- **Fichier :** `supabase/functions/confirm-order/index.ts:134-163`
- **Catégorie :** Operational: Error Handling
- **Problème :** L'invocation de notify-new-order est best-effort : son code de statut (500/401, ex. VAPID manquant) n'est pas vérifié et confirm-order renvoie toujours 200. Une notification staff échouée passe inaperçue.
- **Repro :** 1. VAPID non configuré dans notify-new-order. 2. Confirmer une commande online. 3. notify-new-order renvoie 500. 4. L149 logge l'erreur. 5. confirm-order renvoie 200, UI = confirmé. 6. Le staff ne reçoit aucune notification.
- **Correctif :** Vérifier res.ok du fetch notify et logger une alerte CRITICAL si échec, ou renvoyer un champ notify_error dans la réponse pour visibilité. Idéalement valider la présence des clés VAPID au démarrage.

### 167. dlc-scan : endpoint public sans authentification utilise SERVICE_ROLE et expose les données DLC

- **Fichier :** `supabase/functions/dlc-scan/index.ts:63-92`
- **Catégorie :** Security: Unauthorized Access
- **Problème :** La fonction dlc-scan instancie le client Supabase avec SUPABASE_SERVICE_ROLE_KEY (L79) et ne fait aucune vérification d'authentification (ni JWT, ni apikey, ni secret). Avec Access-Control-Allow-Origin:* (L30), tout appelant externe peut lire v_dlc_alerts (lots, quantités, DLC, catégories produits). RLS est contourné par le service-role.
- **Repro :** GET https://<projet>.supabase.co/functions/v1/dlc-scan sans header Authorization (si la fonction est déployée avec --no-verify-jwt). Retourne le JSON complet des alertes DLC avec quantite_recue par lot.
- **Correctif :** Exiger un secret partagé (header x-internal-secret ou Bearer CRON_SECRET) avant d'instancier le client service-role, ou déployer la fonction SANS --no-verify-jwt et utiliser un client anon honorant la RLS au lieu du service-role.

### 168. refresh-cockpit-cache : échec de refresh_casse_views masqué (HTTP 200 malgré données périmées)

- **Fichier :** `supabase/functions/refresh-cockpit-cache/index.ts:93-152`
- **Catégorie :** Operational: Silent Degradation
- **Problème :** La tâche refresh_casse_views est exclue du calcul du statut global (L142) : son échec n'empêche pas un HTTP 200. Un échec réel du refresh (ex. migration 0039 absente) passe inaperçu pour un monitoring basé sur le statut HTTP, et les vues casse restent périmées.
- **Repro :** Déployer sans la fonction refresh_casse_views (migration 0039 absente) ; lancer refresh-cockpit-cache ; la tâche échoue (ok=false) mais la réponse reste ok=true / HTTP 200.
- **Correctif :** Exposer un flag distinct (ex. casse_stale=true) dans la réponse, ou rendre la tâche réellement optionnelle de façon explicite tout en signalant son état pour le monitoring.

### 169. consume_lot_fefo accepte un surplus non tracé sans signaler la couverture partielle

- **Fichier :** `supabase/migrations/20260604000003_fefo_lots.sql:109-113`
- **Catégorie :** Business Logic / Data Integrity
- **Problème :** consume_lot_fefo est non bloquant : si on consomme plus que les lots suivis ne couvrent, la RPC réussit, renvoie le lot principal et laisse le surplus non rattaché à un lot. Le caller n'a aucun moyen de détecter la couverture partielle. Pour la traçabilité halal, une partie de la sortie peut ne pas être traçable sans aucun signal.
- **Repro :** 1. Produit P : lot L1 restante=50, L2 restante=30 (80 suivis). Stock physique=100. 2. Sortie de 100. 3. consume_lot_fefo consomme L1(50)+L2(30), v_reste=20>0. 4. createSortie attache lot_id=L1, mais 20 unités sortent sans lot tracé, et la RPC retourne succès sans indiquer le manque.
- **Correctif :** Soit retourner aussi la quantité non couverte (v_reste) pour que le caller la trace/alerte, soit, si Otmane exige 100% de traçabilité, raise exception si v_reste>0. A minima logger un warning exploitable.

### 170. consume_lot_fefo : surplus consommé au-delà des lots suivis non rattaché à un lot (traçabilité halal)

- **Fichier :** `supabase/migrations/20260604000003_fefo_lots.sql:109`
- **Catégorie :** data-integrity
- **Problème :** consume_lot_fefo consomme la totalité demandée même quand les lots suivis ne couvrent qu'une partie ; le surplus (v_reste>0) n'est rattaché à aucun lot. Le caller attache quand même le 1er lot à la sortie, donnant l'illusion qu'un lot de 5kg a fourni 10kg. Flou de traçabilité halal/DLC sur la part hors-lot. Comportement documenté et assumé.
- **Repro :** 1. Lot L1 (Poulet, quantite_restante=5kg). 2. createSortie(Poulet, 10kg). 3. consume_lot_fefo prend 5kg sur L1 (→0), v_reste=5, retourne L1. 4. sorties_stock.lot_id = L1 pour une sortie de 10kg. 5. L'audit lot L1 'a fourni' 5kg mais la sortie de 10kg lui est rattachée intégralement.
- **Correctif :** Si la traçabilité halal stricte est requise : lever une exception quand v_reste>0 (insuffisance de lots), ou créer une ligne sortie distincte lot_id=NULL pour le surplus non couvert, et documenter la décision. Sinon laisser tel quel (choix assumé).

