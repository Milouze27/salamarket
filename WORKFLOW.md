# SALAMARKET — Workflow & Business Logic Bible

> Document vivant. Mis a jour a chaque nouvelle feature ou correction.
> Derniere MaJ : 2026-05-25

---

## 1. Vue d'ensemble

Salamarket est une plateforme halal multi-canal pour **K & A FOOD** (SIRET 802 773 812, 8 av. Larrieu-Thibaud 31100 Toulouse). Deux PWA connectees au meme Supabase :

| App | Stack | URL prod | Repo |
|-----|-------|----------|------|
| **Drive** (client) | Vite + React 18 + React Router | `salamarket-drive.vercel.app` | `/salamarket-drive` |
| **Stock** (staff) | Next.js 14 App Router | `salam-stock.vercel.app` | `/salam-stock` |

**Supabase projet** : `tltmermqodelorthtbre` (West EU Ireland)
**Stripe** : mode test (`sk_test_*` / `pk_test_*`), API `2026-04-22.dahlia`
**Font unique** : Plus Jakarta Sans (400-800)
**Palette** : `#0E3B2E` (sapin), `#082A20` (nuit), `#C9A227` (or), `#FAF7EE` (creme), `#0F1A14` (texte)

---

## 2. Architecture

```
                        CLIENT (B2C / B2B Pro)
                    salamarket-drive.vercel.app
                              |
                    Supabase Edge Functions
                    (create-checkout-session,
                     verify-checkout-session,
                     confirm-order, ensure-slots,
                     notify-new-order, update-order-status)
                              |
                    Supabase Postgres (tltmermqodelorthtbre)
                    - orders, products, pickup_slots, profiles
                    - commandes_drive, commandes_drive_lignes
                    - comptes_pro, commandes_pro, produits_pro_prix
                    - produits (table canonique FR)
                              |
              ----------------+----------------
              |                                |
     Triggers SQL                    API Routes Next.js
     (sync orders <-> commandes)     salam-stock.vercel.app
                                     /api/stripe/* (PI, capture, webhook)
                                     /api/cashbox/* (Z, rapports, import)
                                     /api/push/* (Web Push)
                                     /api/assistant (Claude IA)
                                     /api/vision/* (coherence, reconnaissance)
                                     /api/sync/drive-pull
                                     /api/cron/* (inventaire, daily-z, monthly)
                              |
                        STAFF (employes)
                    salam-stock.vercel.app
```

---

## 3. Parcours utilisateur

### 3.1 B2C Drive — Commande client

```
Accueil (/) → Catalogue produits → Fiche produit → Panier
→ Choix creneau (/creneaux) → Paiement (/paiement)
→ Confirmation (/commande/confirmee/:id) → Mes commandes (/commandes)
```

**Trois types de produits** :
- `unit` : prix fixe en centimes, quantite entiere (1-50)
- `weight` : prix/kg, client estime le poids (0.1-5 kg), facture au poids reel
- `weight_bracket` : fourchette poids (ex: 1-1.5 kg), prix forfaitaire

**Pre-autorisation (Drive au poids)** :
- Montant autorise = `ceil(weightCents * 1.20) + otherCents`
- Marge 20% uniquement sur les lignes au poids
- Capture apres pesee en magasin, difference liberee sous 7 jours

**Checkout split** :
- Panier 100% `unit` → Stripe Checkout (redirect externe)
- Panier avec au moins 1 ligne `weight`/`weight_bracket` → Stripe Elements inline (manual capture)

**Slot / Creneau** :
- Generes 7 jours en avance via edge function `ensure-slots`
- Semaine : 10h, 12h, 17h, 19h (4 creneaux/jour, 30 min chacun)
- Dimanche : 10h, 12h, 17h (pas de 19h, magasin ferme a 18h)
- Capacite : 5 commandes/creneau
- Delai minimum : 1 heure avant le debut du creneau

### 3.2 B2B Drive Pro — Commande professionnelle

```
Inscription (/pro/inscription, 3 etapes) → Validation admin
→ Login (/pro/login) → Catalogue HT (/pro/catalogue)
→ Panier Pro (/pro/panier) → Commande creee
→ Detail (/pro/commande/:id) → Factures (/pro/factures)
```

**Cycle de vie compte Pro** :
`en_validation` → `actif` (admin valide) → `suspendu` | `archive`

**Pricing Pro** :
- Prix HT unitaire par conditionnement
- 2 paliers de remise volume (qty seuil + % remise)
- TVA multi-taux (5.5%, 10%, 20%) avec arrondi commercial par ligne
- Commandes > 500 EUR TTC : validation manager requise

**Cycle de vie commande Pro** :
`a_valider` → `validee` → `en_preparation` → `expediee` → `livree` → `facturee` → `payee` | `annulee`

**Facturation** :
- Numero auto : `F2026-XXXX` (sequence annuelle)
- PDF genere via react-pdf (`InvoicePDF.tsx`)
- Suivi echeance, relance, statut paiement

### 3.3 Staff — Preparation Drive

```
Login PIN (/v2/login) → Dashboard (/v2)
→ Kanban preparation (/v2/preparation) → Detail commande (/v2/preparation/:id)
→ Scan produits + pesee → Finaliser & capturer Stripe → Commande prete
```

**Kanban 4 colonnes** :
`a_preparer` (rouge) → `en_preparation` (jaune) → `pret` (or) → `retire` (vert)

**Realtime** : Supabase postgres_changes sur `commandes_drive` + `commandes_drive_lignes`, fallback polling 12s.

**Pesee (Drive au poids)** :
- Input poids reel par ligne → calcul montant_reel_ttc
- Ecart % entre estime et reel → seuils d'action :
  - < 10% → `auto_accept`
  - 10-20% ET < 5 EUR → `preparator_decision`
  - 10-20% ET >= 5 EUR → `client_notify`
  - > 20% → `client_validation_required`

**Capture Stripe** :
1. `finalizePreparation()` insere les ecarts dans `drive_ecarts_poids`
2. Appelle `/api/stripe/capture-payment` avec le montant reel
3. Stripe `paymentIntents.capture(pi_id, { amount_to_capture })`
4. Update `commandes_drive.statut_paiement = 'capture'`
5. Update `commandes_drive.statut = 'pret'`

### 3.4 Staff — Reception marchandise

```
/v2/reception → Choisir BDL attendu ou "Reception libre"
→ Scanner codes-barres → Valider quantites → Photos palette (obligatoire)
→ Stock incremente → BR PDF genere
```

**Deux modes** :
- **BDL (Bon de Livraison)** : reception contre bon prevu, ecarts detectes automatiquement
- **Libre** : reception surprise sans BDL, creation a la volee

**Barcode scanning** :
- EAN unitaire → lookup `produits.ean`
- EAN carton → lookup `codes_barres_cartons` → multiplicateur quantite
- EAN inconnu → workflow d'apprentissage (carton ou unite ?) + IA reconnaissance produit

**Surplus** : produit scanne present en catalogue mais pas sur le BDL → alerte admin avec photo

### 3.5 Staff — Sortie stock

```
/v2/sortie → Scan ou recherche produit → Type de sortie
→ Quantite + Photo preuve (obligatoire) → IA coherence check → Validation
```

**7 types** : `casse_manipulation`, `casse_client`, `perime_dlc`, `perime_ddm`, `defaut_fournisseur`, `demarque_inconnue`, `autre`

**IA coherence** (`/api/vision-coherence`) :
- Claude analyse la photo vs la declaration
- Score 0-1 retourne
- Score < 0.6 → push notification admin "Sortie suspecte"
- Score < 0.4 → notification urgente

### 3.6 Staff — Transfert inter-depots

```
/v2/transfert → Source + Destination → Scan produit → Quantite → Valider
```

**Regles** :
- Non-admin : destination = son depot principal uniquement
- Routes autorisees : Particulier ↔ Professionnel, Sodrune ↔ Professionnel
- Admin : toute combinaison
- Quantite <= stock source

### 3.7 Staff — Inventaire tournant

```
/v2/inventaire → Produits assignes (7 random/jour/depot) → Compter → Valider
```

**Cron quotidien** (9h Paris) : assigne 7 produits aleatoires a 1 employe random par depot.
**Conformite** < 95% → push admin urgent.

### 3.8 Module Labo (recettes & productions)

```
/v2/labo → Recettes (BOM ingredients) → Lancer production
→ Wizard (inputs, outputs, couts indirects) → KPI marges
```

- **Recettes** : ingredients (FK produits), etapes, main d'oeuvre, cout theorique
- **Productions** : lots avec inputs consommes, outputs produits, couts indirects
- **Marges** : dashboard analytics (marge EUR/jour, marge %/recette, periode 7/30/90j)

### 3.9 Admin — Gestion & reporting

| Route | Fonction |
|-------|----------|
| `/v2/admin` | Dashboard global multi-depots, KPIs, activite |
| `/v2/admin/import-cashmag` | Import CSV ventes caisse physique |
| `/v2/admin/rapport-mensuel` | Rapport consolide Drive + Magasin (PDF/CSV/email) |
| `/v2/admin/recap-fiscal` | Z du jour Drive (PDF/CSV/email) |
| `/v2/admin/alertes` | Sorties suspectes IA, demarque, surplus |
| `/v2/admin/bons-reception` | Historique BDL + BR PDF |
| `/v2/admin/assistant-ia` | Chat Claude pour requetes business |
| `/admin/comptes-pro` | Gestion comptes Pro (valider/suspendre) |
| `/admin/commandes-pro` | Workflow commandes Pro |
| `/admin/factures-pro` | Suivi facturation Pro |

---

## 4. Systeme de roles

### Drive (profiles.role)

| Role | Acces |
|------|-------|
| `customer` | B2C (catalogue, panier, commandes) — defaut signup |
| `employee` | Kanban employe, module Labo |
| `manager` | Admin Pro (comptes, commandes, factures) |
| `admin` | Tout (backoffice + Pro admin + settings) |

### Stock (employes.role)

| Role | Nav principale | Acces admin |
|------|----------------|-------------|
| `admin` | Accueil, Stock, Inventaire, Admin | Dashboard global, tous depots, edit stock toujours |
| `manager` | Accueil, Reception, Sortie, Stock | Dashboard, preparation |
| `reception` | Accueil, Reception, Sortie, Stock | — |
| `preparation` | Accueil, Reception, Sortie, Stock | — |
| `caisse` | Accueil, Reception, Sortie, Stock | — |

---

## 5. Stripe — Flux de paiement

### 5.1 Checkout standard (unit-only)

```
create-checkout-session (Edge) → Stripe Checkout (redirect)
→ confirm-order (Edge, webhook) → orders.status = confirmed
→ notify-new-order (push) → Kanban employe
```

### 5.2 Drive au poids (manual capture)

```
create-checkout-session (Edge) → INSERT commandes_drive
→ DriveStripePayment (Elements inline) → create-payment-intent (API)
→ PI cree (manual capture) → Client confirme carte
→ statut_paiement = 'autorise', PI actif 7 jours
→ Staff pese en magasin → saveWeightLigne par ligne
→ finalizePreparation → capture-payment (API)
→ stripe.paymentIntents.capture(amount_reel)
→ statut_paiement = 'capture', commande 'pret'
```

### 5.3 Cycle de vie statut_paiement

```
NULL → 'autorise' (PI cree + client confirme)
    → 'capture' (pesee + capture par staff)
    → 'libere' (PI cancel/expire, webhook)
    → 'echec' (payment_failed, webhook)
```

### 5.4 Webhook events geres

- `payment_intent.canceled` → statut_paiement = 'libere'
- `payment_intent.payment_failed` → statut_paiement = 'echec'
- `payment_intent.succeeded` → statut_paiement = 'capture' (reconciliation)

---

## 6. Sync orders ↔ commandes_drive

### Forward (orders → commandes_drive)

Trigger `sync_drive_order_to_stock_trigger` sur INSERT/UPDATE `orders` :
- paid → a_preparer
- confirmed → a_preparer
- preparing → en_preparation
- ready → pret
- picked_up → retire
- cancelled → annule

Upsert header + DELETE/INSERT lignes (flatten `orders.items` JSONB).

### Reverse (commandes_drive → orders)

Trigger `sync_stock_statut_to_drive` sur UPDATE `commandes_drive.statut` :
- en_preparation → preparing
- pret → ready
- retire → picked_up
- annule → cancelled

### Note : Drive au poids bypass

Les commandes Drive au poids sont creees directement dans `commandes_drive` par l'edge function (pas dans `orders`). Elles n'ont PAS de row dans `orders`. Le trigger forward ne fire pas. C'est voulu — ces commandes vivent uniquement dans `commandes_drive`.

---

## 7. Multi-depots

| Depot | Type | Usage |
|-------|------|-------|
| Particulier | point_vente | Vente B2C, depot par defaut Drive |
| Professionnel | point_vente | Vente B2B Pro |
| Sodrune | entrepot | Stockage central |

**Stock par depot** : chaque produit a un niveau de stock independant par depot (`stock_par_depot`).

**Transferts** : contraints par la matrice de routes autorisees (cf. 3.6).

---

## 8. Notifications

### Push (Web Push / VAPID)

- Service worker `/sw.js`, abonnements dans `push_subscriptions`
- iOS : doit etre installe en PWA (standalone) sur iOS 16.4+
- Cibles : `employe_ids` specifiques ou tous les admins

### Declencheurs

| Evenement | Cible | Urgence |
|-----------|-------|---------|
| Sortie IA score < 0.6 | Admins | Normal |
| Sortie IA score < 0.4 | Admins | Urgent |
| Inventaire conformite < 95% | Admins | Urgent |
| Reception validee | Admins | Normal |
| Surplus detecte | Admins | Normal |
| Produit cree pendant reception | Admins | Normal |
| Transfert termine | Admins | Normal |
| Commande prete (legacy) | Via /api/notify | Normal |
| Inventaire assigne (cron) | Employe assigne | Normal |

### Email (Resend)

- Recap comptable mensuel automatique (cron 1er du mois)
- Recap quotidien Z (cron 23h59)

---

## 9. Cron jobs

| Route | Horaire | Action |
|-------|---------|--------|
| `/api/cron/inventaire-tournant` | 9h Paris daily | Assigne 7 produits random a 1 employe random par depot |
| `/api/cron/daily-z` | 23h59 Paris daily | Genere Z du jour + notification |
| `/api/cron/monthly-report` | 1er du mois 6h | Rapport consolide mois precedent |

---

## 10. IA integree

| Endpoint | Modele | Usage |
|----------|--------|-------|
| `/api/vision-coherence` | claude-sonnet-4-6 | Verification photo sortie stock |
| `/api/vision-product-recognition` | claude-sonnet-4-5 | Reconnaissance produit carton |
| `/api/assistant` | claude-sonnet-4-6 | Chat BI (ventes, stock, alertes, perf) |

Fallback mock si `ANTHROPIC_API_KEY` absent.

---

## 11. TVA

| Categorie | Taux |
|-----------|------|
| Alimentaire (defaut) | 5.5% |
| Traiteur, Boissons | 10% |
| Hygiene, Bazar | 20% |

Arrondi commercial : calcul par ligne puis somme (pas d'arrondi global).

---

## 12. Data model

Schema complet : voir `salam-stock/SCHEMA.md` (36 tables, 2 views, 7+ triggers).

### Tables cles

| Table | Description |
|-------|-------------|
| `produits` | Catalogue canonique (FR). EAN, nom, marque, categorie, prix_drive, visible_drive |
| `products` | **DETTE** : devrait etre une vue sur `produits` (migration 0023) mais existe comme table physique |
| `stock_par_depot` | Niveaux de stock par produit × depot |
| `commandes_drive` | Commandes B2C Drive (header) |
| `commandes_drive_lignes` | Lignes de commande Drive (FK produits) |
| `orders` | Commandes legacy (Stripe Checkout flow, JSONB items) |
| `comptes_pro` | Comptes B2B Pro |
| `commandes_pro` | Commandes B2B Pro (header) |
| `commandes_pro_lignes` | Lignes B2B Pro |
| `pickup_slots` | Creneaux de retrait |
| `employes` | Staff avec PIN + role + depot principal |
| `depots` | Points de vente et entrepots |

---

## 13. QA Browser — Issues pre-demo (2026-05-25)

| Prio | App | Issue | Statut |
|------|-----|-------|--------|
| P0 | Drive | Onboarding overlay "Passer" button non-fonctionnel → visiteurs bloques | A fixer |
| P0 | Drive | Brochettes Poulet affiche 0,00 EUR dans "Notre selection" homepage | A fixer |
| P1 | Stock | Bottom nav overlap contenu sur TOUTES les pages (pas de padding-bottom) | A fixer |
| P1 | Drive | Pave de saumon image blanche/cassee | A fixer |
| P1 | Stock | Page sortie stock : elements UI qui se chevauchent | A fixer |
| P2 | Drive | Pro login/inscription header bleu marine au lieu de vert brand | A fixer |
| P2 | Drive | Bouton login/signup vert sauge au lieu de vert brand | A fixer |
| P2 | Stock | Credentials demo visibles sur ecran PIN (1234/5678/9999) | Voulu pour demo |
| P3 | Drive | PWA install prompt agressif, couvre contenu | Nice-to-have |
| P3 | Drive | Certains produits avec images placeholder texte | Nice-to-have |

### Ce qui est deja bien (investor-ready)

- Palette vert/or/creme coherente et premium
- Plus Jakarta Sans exclusivement
- Pages produit au poids exceptionnelles
- Cart avec estimation + creneau + recap
- Dashboard Stock feature-rich et professionnel
- Kanban realtime avec badges
- Admin multi-depot, alertes IA, recap fiscal
- Performance excellente : Stock < 300ms, Drive < 620ms
- Aucun banner "MODE DEMO LOCAL"

---

## 14. Dette technique connue

| # | Dette | Impact | Priorite |
|---|-------|--------|----------|
| 1 | `products` table physique au lieu de view sur `produits` | Duplication de donnees, FK split | Post-demo |
| 2 | Auth PIN client-only (pas de validation serveur) | Securite faible | V2.1 |
| 3 | RLS permissif (`SELECT USING (true)` sur 20+ tables) | Risque securite prod | V2.1 |
| 4 | `v_productions_kpi` reference mauvaises colonnes | Vue KPI cassee | P2 |
| 5 | Sequences annuelles (seq_commande_pro_2026) | Renouveler pour 2027 | Dec 2026 |
| 6 | Sync drive-pull utilise matching par nom (ILIKE) | Fragile si renommage | Post-demo |
| 7 | Stripe en mode test uniquement | Basculer en live pour prod | Pre-lancement |

---

## 14. Env vars requises

### Drive (Vercel + Supabase Edge)

| Variable | Valeur |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://tltmermqodelorthtbre.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key |
| `VITE_SUPABASE_PROJECT_ID` | `tltmermqodelorthtbre` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` |
| `VITE_STRIPE_API_BASE_URL` | `https://salam-stock.vercel.app` |
| `STRIPE_SECRET_KEY` (Edge) | `sk_test_...` |
| `SITE_URL` (Edge) | `https://salamarket-drive.vercel.app` |

### Stock (Vercel)

| Variable | Valeur |
|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `STRIPE_SECRET_KEY` | `sk_test_...` (doit commencer par `sk_test_`) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` |
| `NEXT_PUBLIC_APP_URL` | `https://salam-stock.vercel.app` |
| `ANTHROPIC_API_KEY` | Pour IA (optionnel, mocks si absent) |
| `RESEND_API_KEY` | Pour emails |
| `CRON_SECRET` | Auth cron Vercel |

---

## 15. Features ajoutees (2026-05-26)

### 15.1 "Commander a nouveau"
- Bouton sur chaque commande dans "Mes commandes"
- Re-fetch les produits pour verifier dispo + prix actuel
- Pre-remplit le panier, navigue vers `/panier`

### 15.2 Commande minimum 15 EUR
- Panier : bandeau warning + CTA desactive si total < 15 EUR
- Checkout : guard redirect vers `/panier` si < 15 EUR
- Constante `MIN_ORDER_CENTS = 1500`

### 15.3 Email "Commande prete"
- Quand staff marque `statut = pret`, email automatique au client
- Template HTML brande (vert/or/creme) avec adresse magasin
- Fire-and-forget (ne bloque jamais le workflow preparation)
- Via `/api/email/send` (Resend)

### 15.4 Batch Pick (preparation groupee)
- Toggle Kanban / Batch Pick en haut de `/v2/preparation`
- Agrege toutes les lignes `a_preparer` par produit
- Liste de courses unique triee par rayon (froid d'abord)
- Checkbox par produit, barre de progression
- Expandable : detail par commande pour chaque produit

---

## 16. Idees & roadmap future

> Ajouter ici toute nouvelle idee pour Salamarket.

- [ ] Basculer Stripe en mode live
- [ ] Unifier `products` en vue sur `produits` (drop table physique)
- [ ] Auth serveur (Supabase Auth + middleware Next.js)
- [ ] RLS restrictif par role/depot
- [ ] Password reset flow (Drive)
- [x] ~~Notification client quand commande prete~~ → 15.3
- [ ] Tracking livreur pour livraison Pro
- [ ] Programme fidelite client
- [ ] Multi-magasin (au-dela de Toulouse)
- [ ] App mobile native (React Native ou Capacitor)
- [ ] Webhook Stripe `checkout.session.completed` (confirmer automatiquement)
- [ ] Module marges Drive (cout d'achat vs prix de vente Drive)
- [ ] Alertes rupture de stock automatiques
- [ ] Integration comptable (export FEC)
- [ ] QR code sur tickets de retrait
- [ ] Historique prix fournisseurs
- [ ] Dashboard client (suivi commande temps reel)
- [ ] Panier abandonne — email relance H+1 et H+24
- [ ] Pricing dynamique DLC — -30% a J-2 d'expiration
- [ ] Auto-reappro fournisseur — seuils de stock + email/WhatsApp
- [ ] Slot dynamique — capacite basee sur staff present
- [ ] Import CashMag automatique — cron ou webhook POS

---

*Document genere le 2026-05-25 par analyse exhaustive de 5 agents Opus sur les deux codebases.*
