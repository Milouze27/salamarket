# CONTEXT — Salamarket (monorepo)

Glossaire canonique du projet Salamarket (K & A FOOD, Toulouse). Vocabulaire à utiliser tel quel dans le code, les issues, titres de PR, noms de tests, hypothèses. Les termes en **gras** sont canoniques — ne pas dériver vers des synonymes.

> Pour les flux complets et la logique business : voir `WORKFLOW.md` (bible).
> Pour le détail des tables : voir `SCHEMA.md` (36 tables, triggers, RLS, enums).
> Pour les décisions d'architecture : voir `docs/adr/`.

---

## Architecture & versions

- **Monorepo Salamarket** — `npm workspaces`. Deux apps + packages partagés + migrations Supabase unifiées.
- **Drive (app)** — PWA client `apps/drive` (Vite + React 18 + React Router). Déployée sur `salamarket-drive.vercel.app`. Click & collect halal B2C + B2B Pro.
- **Stock (app)** — PWA staff `apps/stock` (Next.js 14 App Router). Déployée sur `salam-stock.vercel.app`. Préparation, réception, sortie, transferts, inventaire, labo, admin.
- **V2** — Architecture actuelle du staff PWA. Routes `/v2/*`. Mobile-first, auth PIN, multi-dépôt, kanban realtime. Toute nouvelle feature staff va en V2.
- **V1 / legacy `/staff/*`** — Routes dépréciées Stock. Conservées pour transition uniquement.
- **Supabase projet** — `tltmermqodelorthtbre` (West EU Ireland). Postgres + Edge Functions + Realtime. Partagé entre Drive et Stock.
- **Edge function** — fonction Deno hébergée par Supabase. Clés : `create-checkout-session`, `verify-checkout-session`, `confirm-order`, `ensure-slots`, `notify-new-order`, `update-order-status`.

---

## Acteurs

- **Client B2C** — particulier qui commande sur le Drive. Auth Supabase. `profiles.role = customer`.
- **Compte Pro** — Client B2B (table `comptes_pro`). Cycle `comptes_pro.statut` : `en_validation` → `actif` (validé par admin) → `suspendu` | `archive`.
- **Employé** — Personne staff qui se connecte par **PIN** sur Stock. Table `employes` avec `role` + `depot_id` principal.
- **Rôle Drive** — `profiles.role` : `customer` (défaut signup) | `employee` | `manager` | `admin`.
- **Rôle staff** — `employes.role` : `admin` | `manager` | `reception` | `preparation` | `caisse`. Détermine la nav et les accès admin (cf. WORKFLOW §4).
- **PIN auth** — Code 4 chiffres par employé. Validation **client-only** en V2 (dette connue, server-side prévu V2.1).
- **Validation manager** — requise pour toute commande Pro > 500 EUR TTC.

---

## Catalogue & produits

- **Produit canonique** — Ligne de la table `produits` (FR, source de vérité backoffice). EAN, nom, marque, catégorie, `prix_drive`, `visible_drive`. FK cible pour `stock_par_depot`, `commandes_drive_lignes`, `receptions_lignes`.
- **`products` (table)** — **Dette** : copie physique de `produits` côté Drive (EN partiel). Devrait être une vue (migration 0023 jamais appliquée). Doit rester synchronisée avec `produits` par UUID identique. Ne pas écrire ici.
- **`unit`** (`unit_type`) — produit à prix fixe, quantité entière (1-50). Pas de pesée.
- **`weight`** (`unit_type`) — produit au poids. Prix par kg, client estime le poids (0.1-5 kg), facturé au poids réel pesé en magasin.
- **`weight_bracket`** (`unit_type`) — produit avec fourchette de poids (ex: 1-1.5 kg) et prix forfaitaire.
- **Drive au poids** — terme global pour toute commande contenant au moins une ligne `weight` ou `weight_bracket`. Déclenche le flux pré-autorisation.

---

## Parcours client B2C

- **B2C Drive** — parcours client particulier : catalogue → panier → créneau → paiement → retrait.
- **Créneau / Slot** — fenêtre de retrait de 30 min, capacité 5 commandes. Stocké dans `pickup_slots`.
- **`ensure-slots`** — edge function qui génère les créneaux 7 jours en avance.
- **Horaires** — semaine 10h / 12h / 17h / 19h, dimanche 10h / 12h / 17h (pas de 19h).
- **Délai minimum** — 1 heure avant le début du créneau pour pouvoir le réserver.
- **Commande minimum** — 15 EUR (`MIN_ORDER_CENTS = 1500`). Bandeau warning + CTA désactivé en dessous.

---

## Parcours B2B Pro

- **B2B Pro** — parcours professionnel : inscription → validation admin → catalogue HT → panier Pro → commande → facture.
- **Pricing Pro** — prix HT par conditionnement + 2 paliers de remise volume + TVA multi-taux (5.5%, 10%, 20%) avec arrondi commercial par ligne.
- **Statut commande Pro** — `commandes_pro.statut` : `a_valider` → `validee` → `en_preparation` → `expediee` → `livree` → `facturee` → `payee` (ou `annulee`).
- **Numéro facture Pro** — séquence annuelle `F2026-XXXX`.
- **Encours Pro** — total facturé non payé par compte Pro. Affiché dans l'admin.

---

## Préparation staff

- **Préparation Drive** — flux staff `/v2/preparation` : kanban realtime des commandes Drive à préparer pour retrait magasin.
- **Kanban 4 colonnes** — `a_preparer` (rouge) → `en_preparation` (jaune) → `pret` (or) → `retire` (vert). Statut dans `commandes_drive.statut`.
- **Batch Pick** — mode picking groupé sur `/v2/preparation`. Agrège toutes les lignes `a_preparer` par produit, liste de courses unique triée par rayon (froid d'abord). Alternative au kanban par commande.
- **Pesée** — saisie par le staff du poids réel par ligne dans le Kanban Stock. Recalcule `montant_reel_ttc`, déclenche la capture Stripe.
- **Écart action** — décision automatique selon l'écart `estime` vs `réel` :
  - `auto_accept` (< 10%)
  - `preparator_decision` (10-20% ET < 5 EUR)
  - `client_notify` (10-20% ET ≥ 5 EUR)
  - `client_validation_required` (> 20%)
- **finalizePreparation** — fonction qui insère les écarts dans `drive_ecarts_poids` puis appelle `/api/stripe/capture-payment`.

---

## Stripe paiements

- **Stripe Checkout** — flux redirect externe. Utilisé UNIQUEMENT pour les paniers 100% `unit`.
- **Stripe Elements inline** — flux intégré dans le Drive (composant `DriveStripePayment`). Utilisé dès qu'il y a 1 ligne `weight`/`weight_bracket`.
- **PI / Payment Intent** — objet Stripe qui représente le paiement. Pour Drive au poids : créé en `manual capture`, valable 7 jours.
- **Manual capture** — mode Stripe utilisé pour Drive au poids : pré-autorisation à la commande, capture après pesée. PI actif 7 jours.
- **Pré-autorisation au poids** — bloque les fonds sans débiter. Montant autorisé = `ceil(weightCents * 1.20) + otherCents`. Marge 20% sur lignes au poids uniquement.
- **Capture** — débit réel après pesée en magasin. Appel `paymentIntents.capture(pi_id, { amount_to_capture })` avec le montant réel.
- **Libération** — annulation du PI (jamais capturé), les fonds reviennent au client sous 7 jours.
- **`statut_paiement`** — colonne sur `commandes_drive` : `NULL` → `autorise` → `capture` | `libere` | `echec`.
- **`drive_ecarts_poids`** — table qui trace chaque écart estimé/réel par ligne, avec action prise.

---

## Commandes (sync Drive ↔ Stock)

- **`commandes_drive`** — table actuelle des commandes Drive (header). Flux manual capture pour Drive au poids. Header + lignes séparées (`commandes_drive_lignes`).
- **`orders`** — table legacy. Flux Stripe Checkout pur (paniers `unit`-only). Items en JSONB.
- **Trigger forward** — `sync_drive_order_to_stock_trigger` : `orders` → `commandes_drive` (paid → a_preparer, ready → pret, etc.). Upsert header + DELETE/INSERT lignes.
- **Trigger reverse** — `sync_stock_statut_to_drive` : `commandes_drive.statut` → `orders.status`.
- **Drive au poids bypass** — les commandes Drive au poids sont créées directement dans `commandes_drive` par l'edge function ; pas de row `orders`. Le trigger forward ne fire pas. C'est voulu.
- **Statut commande Drive** — `commandes_drive.statut` : `a_preparer` → `en_preparation` → `pret` → `retire` (ou `annule`).

---

## Réception marchandise

- **BDL (Bon de Livraison)** — Bon prévu attendu avec fournisseur. Table `bons_de_livraison` + lignes. Permet réception contre bon avec détection d'écarts.
- **Réception libre** — Réception surprise sans BDL. Création à la volée. Mode alternatif au BDL.
- **Surplus** — Produit scanné présent au catalogue mais pas sur le BDL en cours. Déclenche `alertes_surplus` avec photo.
- **BR (Bon de Réception)** — PDF généré à la fin d'une réception (validée). Trace les quantités effectivement reçues.
- **EAN carton** — Code-barres carton qui mappe vers N unités via `codes_barres_cartons` (multiplicateur).
- **Apprentissage EAN** — Workflow déclenché sur EAN inconnu : carton ou unité ? IA reconnaissance produit en assistance.
- **Vision reconnaissance** — `/api/vision-product-recognition` : Claude identifie un produit depuis photo carton.

---

## Sortie & transferts

- **Sortie stock** — Déclaration de perte sur `/v2/sortie`. Type + quantité + photo preuve obligatoire + check cohérence IA. Table `sorties_stock`.
- **Type de sortie** — 7 types : `casse_manipulation`, `casse_client`, `perime_dlc`, `perime_ddm`, `defaut_fournisseur`, `demarque_inconnue`, `autre`.
- **Démarque inconnue** — type historique (remplace `vol_identifie` depuis migration 0002).
- **Cohérence IA** — score 0-1 retourné par `/api/vision-coherence` (Claude vérifie photo vs déclaration). `< 0.6` → push admin "Sortie suspecte". `< 0.4` → urgent.
- **Transfert inter-dépôts** — Mouvement de stock entre dépôts via `/v2/transfert`. Table `transferts_inter_depots`.
- **Routes autorisées** — matrice contraignante hors admin : Particulier ↔ Professionnel, Sodrune ↔ Professionnel. Non-admin : destination = dépôt principal uniquement.

---

## Inventaire

- **Inventaire tournant** — Cycle count quotidien : 7 produits aléatoires assignés à 1 employé random par dépôt. Cron 9h Paris. Table `inventaires_tournants`.
- **Conformité** — Ratio compté / théorique. `< 95%` → push admin urgent.

---

## Labo & productions

- **Recette** — BOM (bill of materials) sur `/v2/labo`. Ingrédients (FK `produits`), étapes, main d'œuvre, coût théorique. Tables `recettes_*`.
- **Production** — Lot exécuté à partir d'une recette. Inputs consommés, outputs produits, coûts indirects. Tables `productions_*`.
- **Marge Labo** — Dashboard analytics (marge EUR/jour, marge %/recette, période 7/30/90j). Vue `v_productions_kpi` (cassée, dette connue).

---

## Caisse & fiscal

- **Cashmag** — POS physique magasin. Ventes importées par CSV via `/v2/admin/import-cashmag`. Table `ventes_cashmag_import`.
- **Z du jour** — récap fiscal quotidien Drive (PDF/CSV/email). Cron 23h59. Route `/v2/admin/recap-fiscal`.
- **Rapport mensuel** — récap consolidé Drive + Magasin (PDF/CSV/email). Cron 1er du mois 6h. Route `/v2/admin/rapport-mensuel`.

---

## Multi-dépôts

- **Dépôt** — point de vente ou entrepôt. Table `depots`. Trois dépôts actuels :
  - **Particulier** (`point_vente`) — vente B2C, défaut Drive.
  - **Professionnel** (`point_vente`) — vente B2B Pro.
  - **Sodrune** (`entrepot`) — stockage central.
- **`stock_par_depot`** — niveaux de stock indépendants par produit × dépôt. Toute mutation de stock passe par là.
- **Dépôt principal** — dépôt affecté à un employé non-admin (`employes.depot_principal_id`). Contraint la destination des transferts.

---

## Notifications

- **Web Push / VAPID** — push notifications via service worker `/sw.js`, abonnements dans `push_subscriptions` (variante Stock avec `employe_id`, `user_id` nullable). iOS nécessite PWA installée (standalone) sur iOS 16.4+.
- **Resend** — provider email transactionnel. Récap mensuel + Z quotidien + email "commande prête".
- **Email "Commande prête"** — envoyé au client quand staff passe `statut = pret`. Template HTML brandé, fire-and-forget.

---

## IA

- **Assistant IA** — Chat Claude pour requêtes business sur `/v2/admin/assistant-ia`. Endpoint `/api/assistant`.
- **Vision cohérence** — `/api/vision-coherence` : Claude vérifie photo vs déclaration sortie stock.
- **Vision reconnaissance** — `/api/vision-product-recognition` : Claude identifie un produit depuis photo carton.

---

## Design system

- **Palette** — sapin `#0E3B2E`, nuit `#082A20`, or `#C9A227`, crème `#FAF7EE`, texte `#0F1A14`.
- **Typeface** — Plus Jakarta Sans uniquement (400-800). Aucun autre typeface, aucun serif décoratif.
- **`apps/drive/src/config/brand.ts`** — source de vérité tokens design Drive. Éditer ici, jamais directement dans les composants.
- **`apps/stock/app/globals.css`** — variables CSS tokens design Stock (même palette, même font).

---

## Conventions

- **Montants** — toujours en centimes (`Cents`) côté code. Affichage TTC pour B2C, HT + TVA pour Pro.
- **Arrondi commercial** — calcul TVA ligne par ligne puis somme. Jamais d'arrondi global.
- **Langue produit** — FR (table `produits`). La table `products` legacy est en EN partiel.
- **Labels d'app** — pour scoper une issue à une app, utiliser `app:drive` ou `app:stock`. Une issue cross-cutting peut omettre le label.

---

~80 termes. Ajouter ici tout nouveau concept métier dès qu'il est nommé dans le code ou la doc.
