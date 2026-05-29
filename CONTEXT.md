# Salamarket Drive — Glossaire domaine

Vocabulaire canonique du projet. Quand un agent nomme un concept domaine (titre d'issue, hypothese, nom de test, proposition de refactor), il doit utiliser le terme defini ici plutot qu'un synonyme.

> Pour les details de workflow et la logique business complete : voir `/Users/mac/WORKFLOW.md` (Bible). Ce fichier ne contient que le glossaire.

---

## Apps & infrastructure

- **Drive** — l'app client (ce repo, `salamarket-drive`). PWA Vite + React 18, deployee sur `salamarket-drive.vercel.app`. Click & collect halal pour K & A FOOD (SIRET 802 773 812, Toulouse).
- **Stock** — l'app staff (`salam-stock`, Next.js 14). Sur la meme base Supabase. Gere preparation, reception, sortie stock, admin.
- **Supabase projet** — `tltmermqodelorthtbre` (West EU Ireland). Postgres + Edge Functions + Realtime.
- **Edge function** — fonction Deno hebergee par Supabase. Cles : `create-checkout-session`, `verify-checkout-session`, `confirm-order`, `ensure-slots`, `notify-new-order`, `update-order-status`.

---

## Parcours client

- **B2C Drive** — parcours client particulier : catalogue -> panier -> creneau -> paiement -> retrait.
- **B2B Pro** — parcours professionnel : inscription -> validation admin -> catalogue HT -> panier Pro -> commande -> facture.
- **Compte Pro** — `comptes_pro.statut` : `en_validation` -> `actif` (valide par admin) -> `suspendu` | `archive`.
- **Pricing Pro** — prix HT par conditionnement + 2 paliers de remise volume + TVA multi-taux (5.5%, 10%, 20%) avec arrondi commercial par ligne.
- **Validation manager** — requise pour toute commande Pro > 500 EUR TTC.

---

## Produits

- **`unit`** — produit a prix fixe, quantite entiere (1-50). Pas de pesee.
- **`weight`** — produit au poids. Prix par kg, client estime le poids (0.1-5 kg), facture au poids reel pese en magasin.
- **`weight_bracket`** — produit avec fourchette de poids (ex: 1-1.5 kg) et prix forfaitaire.
- **Drive au poids** — terme global pour toute commande contenant au moins une ligne `weight` ou `weight_bracket`. Declenche le flux pre-autorisation.
- **`produits`** — table catalogue canonique (FR). EAN, nom, marque, categorie, `prix_drive`, `visible_drive`.
- **`products`** — table legacy en doublon de `produits`. DETTE : devrait etre une vue (migration 0023). Ne pas ecrire ici.

---

## Creneaux

- **Creneau / Slot** — fenetre de retrait de 30 min, capacite 5 commandes. Stocke dans `pickup_slots`.
- **`ensure-slots`** — edge function qui genere les creneaux 7 jours en avance.
- **Horaires** — semaine 10h / 12h / 17h / 19h, dimanche 10h / 12h / 17h (pas de 19h).
- **Delai minimum** — 1 heure avant le debut du creneau pour pouvoir le reserver.

---

## Paiement Stripe

- **Stripe Checkout** — flux redirect externe. Utilise UNIQUEMENT pour les paniers 100% `unit`.
- **Stripe Elements inline** — flux integre dans le Drive (composant `DriveStripePayment`). Utilise des qu'il y a 1 ligne `weight`/`weight_bracket`.
- **PI / Payment Intent** — l'objet Stripe qui represente le paiement. Pour Drive au poids : cree en `manual capture`, valable 7 jours.
- **Pre-autorisation** — bloque les fonds sur la carte client sans les debiter. Montant autorise = `ceil(weightCents * 1.20) + otherCents`. La marge 20% ne s'applique qu'aux lignes au poids.
- **Capture** — debit reel apres pesee en magasin. Appel `paymentIntents.capture(pi_id, { amount_to_capture })` avec le montant reel.
- **Liberation** — annulation du PI (jamais capture), les fonds reviennent au client sous 7 jours.
- **`statut_paiement`** — colonne sur `commandes_drive` : `NULL` -> `autorise` -> `capture` | `libere` | `echec`.

---

## Commandes

- **`commandes_drive`** — table actuelle des commandes Drive (header). Flux manual capture pour Drive au poids. Header + lignes separees (`commandes_drive_lignes`).
- **`orders`** — table legacy. Flux Stripe Checkout pur (paniers `unit`-only). Items en JSONB.
- **Sync forward** — trigger `sync_drive_order_to_stock_trigger` : `orders` -> `commandes_drive` (upsert header + DELETE/INSERT lignes).
- **Sync reverse** — trigger `sync_stock_statut_to_drive` : `commandes_drive.statut` -> `orders.status`.
- **Bypass Drive au poids** — les commandes au poids sont creees directement dans `commandes_drive` par l'edge function ; pas de row `orders`. Le trigger forward ne fire pas. C'est voulu.
- **Statut commande Drive** — `commandes_drive.statut` : `a_preparer` -> `en_preparation` -> `pret` -> `retire` (ou `annule`).
- **Statut commande Pro** — `commandes_pro.statut` : `a_valider` -> `validee` -> `en_preparation` -> `expediee` -> `livree` -> `facturee` -> `payee` (ou `annulee`).
- **Numero facture Pro** — sequence annuelle `F2026-XXXX`.

---

## Pesee & ecarts

- **Pesee** — saisie par le staff du poids reel par ligne dans le Kanban Stock. Calcule `montant_reel_ttc`.
- **`drive_ecarts_poids`** — table qui trace les ecarts entre estime et reel.
- **Ecart pesee** — % de difference entre poids estime et poids reel. Seuils :
  - `< 10%` -> `auto_accept` (capture immediate)
  - `10-20%` ET `< 5 EUR` -> `preparator_decision`
  - `10-20%` ET `>= 5 EUR` -> `client_notify`
  - `> 20%` -> `client_validation_required`

---

## Roles & comptes

- **`profiles.role`** (Drive) — `customer` (defaut signup) | `employee` | `manager` | `admin`.
- **`employes.role`** (Stock) — `admin` | `manager` | `reception` | `preparation` | `caisse`. Auth PIN client-only (DETTE securite).
- **Depot principal** — depot affecte a un employe non-admin (`employes.depot_principal_id`). Contraint la destination des transferts.

---

## Multi-depots

- **Depot** — point de vente ou entrepot. Trois depots actuels :
  - **Particulier** (`point_vente`) — vente B2C, depot par defaut Drive.
  - **Professionnel** (`point_vente`) — vente B2B Pro.
  - **Sodrune** (`entrepot`) — stockage central.
- **`stock_par_depot`** — niveaux de stock independants par produit x depot.
- **Routes de transfert autorisees** — Particulier <-> Professionnel, Sodrune <-> Professionnel. Admin peut tout.

---

## Notifications

- **Web Push / VAPID** — push notifications via service worker `/sw.js`, abonnements dans `push_subscriptions`. iOS necessite PWA installee (standalone) sur 16.4+.
- **Resend** — provider email transactionnel. Utilise pour recaps comptables, "commande prete", etc.
- **Email "Commande prete"** — envoye au client quand staff passe `statut = pret`. Template HTML brande, fire-and-forget.

---

## Design system

- **Palette** — sapin `#0E3B2E`, nuit `#082A20`, or `#C9A227`, creme `#FAF7EE`, texte `#0F1A14`.
- **Typeface** — Plus Jakarta Sans uniquement (400-800). Aucun autre typeface, aucun serif decoratif.
- **`src/config/brand.ts`** — source de verite unique des tokens design. Editer ici, jamais directement dans les composants.

---

## Conventions

- **Montants** — toujours en centimes (`Cents`) cote code. Affichage TTC pour B2C, HT + TVA pour Pro.
- **Arrondi commercial** — calcul TVA ligne par ligne puis somme. Jamais d'arrondi global.
- **Commande minimum** — 15 EUR (`MIN_ORDER_CENTS = 1500`). Bandeau warning + CTA desactive en dessous.
- **Langue produit** — FR (table `produits`). La table `products` legacy est en EN partiel.
