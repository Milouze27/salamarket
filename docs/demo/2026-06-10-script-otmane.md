# Démo Otmane — Script clic par clic — 10 juin 2026

> **Audience** : Otmane Jamal (gérant K&A FOOD, décideur) · Ahmed Nasry (associé) · Mohamed Belhamiti (associé, présentateur)
> **Durée totale** : 25-30 min pitch + 5 min setup + 10 min Q&R
> **Format** : démo live sur prod Vercel, projetée + iPad comptoir + téléphone scan
> **Objectif** : signature lettre d'intention pilote 30 jours (500 €/mois)
> **KPI succès** : Otmane dit "on signe quand" — pas "on en reparle"

---

## Section 1 — Pré-démo

### Checklist J-1 (9 juin, soir)

**Infra & déploiements** (responsable : tech)
- [ ] `vercel whoami` → vérifie compte `abumeryem` actif (sinon `vercel login` avec `dadibelhamiti7@gmail.com`)
- [ ] Drive prod build vert sur `salamarket-drive.vercel.app` (Vercel dashboard → Deployments → Production = Ready)
- [ ] Stock prod build vert sur `salam-stock.vercel.app` (idem)
- [ ] `gh auth switch --user Milouze27` pour le repo monorepo si push de dernière minute
- [ ] `supabase projects list` → `salamarket-drive` (projet `tltmermqodelorthtbre`) listé
- [ ] Migrations appliquées en prod : `supabase migration list --linked` → confirmer 0031 (lots) → 0039 (casse baseline) toutes au statut `applied`

**Env vars Vercel à valider**
- [ ] Drive : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY` (mode test `pk_test_*`)
- [ ] Stock : `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY` (mode test), `ANTHROPIC_API_KEY` (Assistant IA), `RESEND_API_KEY`, `VAPID_PRIVATE_KEY` + `VAPID_PUBLIC_KEY`

**Data seed démo** (responsable : tech)
- [ ] Lot démo `L2026-05-A23` seedé en DB : produit "Brochettes Poulet Marinées", fournisseur Bigard Castres, abattoir AVS, date_abattage `2026-05-28`, certifier `AVS`, certifier_valid_until `2026-12-31`, dlc `2026-06-12`
- [ ] Vérifier URL publique `https://salamarket-drive.vercel.app/lot/L2026-05-A23` (200 + page rendue)
- [ ] 3 lots DLC démo seedés : 1 lot DLC J-1 (alerte critique -50%), 1 lot J-2 (suggestion -30%), 1 lot J-7 (warning)
- [ ] 5 commandes Drive seedées au statut varié : 2 `a_preparer`, 1 `en_preparation`, 1 `pret` (avec `bay_label = "A3"`, `pret_at` récent), 1 `retire`
- [ ] PIN Otmane configuré : `1234` (employé `Otmane Jamal`, role `admin`, dépôt principal Particulier)
- [ ] 1 PO démo prêt à confirmer dans `/v2/po` (fournisseur Bigard, 3 lignes, suggéré par predictions)
- [ ] 3 produits seedés sur la page d'accueil Drive avec photos vraies (Brochettes Poulet Marinées au poids, Boulettes Maître Saucier au poids, Couscous Royal `weight_bracket`)

**Comptes test**
- [ ] Client Stripe test `4242 4242 4242 4242` exp `12/30` cvc `123` validé sur Drive (pré-autorisation + capture fonctionnelles)
- [ ] Push subscription Otmane active sur iPhone (PWA installée standalone, iOS 16.4+)
- [ ] Assistant IA testé avec la question "combien de poulet vendu cette semaine" → réponse cohérente

**Backup**
- [ ] Screencast 5×30s pré-enregistré (un par acte) en `.mov` 1080p sur le laptop (`~/Desktop/demo-backup/`)
- [ ] PDF slide deck Acte 5 (Fédération + Roadmap + Compétiteurs + Closing) prêt sur le laptop ET sur clé USB
- [ ] Wi-Fi 4G/5G personnel actif comme backup réseau (hotspot iPhone testé)

**Répétition complète chronométrée** : 22h00 J-1, viser 24 min flat. Si > 28 min → couper Acte 4 sur PO et Assistant IA.

---

### Checklist J matin (10 juin, avant le rdv)

**Matériel physique** (1h avant rdv)
- [ ] Laptop chargé 100% + chargeur USB-C dans le sac
- [ ] Adaptateur HDMI / USB-C → écran TV/projecteur de la salle (tester sur écran K&A FOOD ou apporter le sien)
- [ ] iPad au comptoir K&A FOOD branché secteur, ouvert sur `/v2/counter` fullscreen (mode kiosque, gesture lock)
- [ ] iPhone (Mohamed) chargé 100%, app caméra prête pour scan QR
- [ ] Câble Lightning de secours pour iPhone

**Réseau salle**
- [ ] Wi-Fi K&A FOOD identifié + mot de passe testé sur laptop + iPad + iPhone
- [ ] Si bande passante < 10 Mbps : passer en hotspot iPhone (5G) dès le début

**Pré-charges navigateur** (30 min avant)
- [ ] Ouvrir 4 onglets Chrome : (1) `salamarket-drive.vercel.app` panier vide, (2) `salam-stock.vercel.app/v2` PIN screen, (3) `salam-stock.vercel.app/v2/cockpit`, (4) slides Acte 5
- [ ] Onglet iPad : `salam-stock.vercel.app/v2/counter` fullscreen, mode atelier nuit OFF (passe en clair si après 19h)
- [ ] DevTools fermées sur tous les onglets (pas de console visible pendant la démo)

**Mental check** (Mohamed, 15 min avant)
- [ ] Relire l'intro Acte 1 (3 phrases d'accroche)
- [ ] Vérifier que les noms sont mémorisés : Otmane Jamal (gérant), Ahmed Nasry (owner)
- [ ] Reformuler à voix haute le closing Acte 5 ("Pour passer en prod chez vous, il manque…")

---

## Section 2 — Setup salle (5 min, T-5 à T-0)

### Disposition idéale

```
                  [ ÉCRAN TV / PROJECTEUR ]
                              |
              +---------------+---------------+
              |                               |
        [ Mohamed ]                     [ iPad comptoir ]
        présentateur                    posé sur la table
        debout, laptop                  écran face à Otmane
              |
        +-----+-----+
        |           |
   [ Otmane ]   [ Ahmed ]   <-- décideurs face à l'écran
   centre, le      droite,
   regard direct    appui

                  [ iPhone QR ]
                  Mohamed dans la poche
```

- **Otmane au centre, face écran**. Mohamed à gauche pilote le laptop, peut tourner l'écran vers Otmane sans gêner.
- **Ahmed à droite d'Otmane**. Sa réaction valide ou invalide. Le regarder 2-3 fois pendant la démo.
- **iPad au comptoir réel K&A FOOD** si la démo se fait dans le magasin. Sinon poser l'iPad à 2m de la table, écran face au groupe — c'est le "comptoir simulé".
- **Mohamed reste debout** pour énergie + accès clavier rapide.

### Devices à connecter (ordre)

1. **Laptop → écran TV** via HDMI/USB-C. Tester slides Acte 5 plein écran d'abord, puis Chrome plein écran. **Désactiver les notifications macOS** (Focus → Do Not Disturb).
2. **iPad → Wi-Fi salle** + ouvrir `/v2/counter` fullscreen + verrouiller orientation paysage.
3. **iPhone → Wi-Fi salle** + ouvrir app caméra (raccourci control center pour QR direct).

### Premier slide à l'écran avant le début

Slide poster sapin nuit `#082A20` plein écran avec :

- Eyebrow or `01 — DÉMO SALAMARKET STOCK` (label-caps `tracking-[0.3em]`)
- Display blanc cassé `Le système d'orchestration\nde la fédération halal.`
- Body or `Toulouse · 10 juin 2026`
- En bas : logos K&A FOOD + Salamarket en sapin clair

Laisser cette slide affichée pendant que Otmane et Ahmed s'installent et qu'on sert le café. Crée l'ambiance "on est sérieux" sans démarrer.

---

## Section 3 — Le pitch (25-30 min) — Clic par clic

> **Règle d'or narrateur** : 1 clic = 1 phrase. Pas de discours, pas d'explication tech non sollicitée. Si Otmane interrompt avec une question → répondre direct, ne pas dérouler le script.

---

### ACTE 1 — "Le client commande" (5 min) — Drive PWA

**T+0 à T+5 · Écran projeté : `salamarket-drive.vercel.app`**

**Intro (15 sec)** — Mohamed : *"Otmane, on commence par ce que ton client voit. Tu connais déjà le Drive, mais regarde ce qui a changé en deux semaines."*

#### Clic 1 — Hero page d'accueil
- **Action** : ouvrir `salamarket-drive.vercel.app` sur le grand écran
- **Pointer du doigt sur l'écran** : le sceau "Halal Certifié" rond top-right qui pulse en or toutes les 4.5s
- **Dire** : *"Tu vois ce sceau qui respire ? C'est le signal qu'on est vivant. C'est notre signature de marque, personne d'autre dans le halal en France ne l'a."*
- **Scroll lent** vers le bas
- **Pointer** : le hero numéroté `01 — / 02 — / 03 —` en or, le rail "Notre sélection" horizontal cinéma
- **Dire** : *"On n'est pas un Drive Carrefour. On est un magazine éditorial halal. Chaque section a son rythme."*

#### Clic 2 — CategoryTabs
- **Action** : cliquer sur `02 · Boucherie` dans le rail catégories sticky
- **Pointer** : l'underline or qui slide d'une catégorie à l'autre (FLIP animation)
- **Dire** : *"Numérotation tabulaire, underline or qui glisse. Détail de Linear, détail de Stripe."*

#### Clic 3 — Fiche produit Brochettes Poulet
- **Action** : cliquer sur la card `Brochettes Poulet Marinées` (catégorie Boucherie, au poids)
- **Pointer** : la transition shared-element (view-transitions API) qui zoom la vignette vers la grande image
- **Dire** : *"Tu sens ce passage ? C'est natif iOS Safari et Chrome — la PWA ressemble à une app native installée. Aucun concurrent halal ne le fait."*
- **Pointer le prix** : `9,90 €/kg · estimé 1,2 kg → 11,88 €`
- **Dire** : *"Pré-autorisation 20% au-dessus, capture après pesée. C'est le système Drive au poids qu'on a déjà, mais regarde le reste."*

#### Clic 4 — Add to cart (LE moment wow)
- **Action** : cliquer sur le `+` AJOUTER sur la fiche produit
- **REGARDER l'écran avec Otmane** : la vignette se clone et **vole en arc** vers l'icône panier du header en 420ms, l'icône panier fait un mini scale `1 → 1.18 → 1`
- **Dire (silence pendant l'anim, puis)** : *"Ça, c'est Picnic, c'est Apple. Le client sait que ça a marché sans regarder le compteur."*
- **Si Otmane sourit** : noter pour le closing — c'est gagné sur l'esthétique.

#### Clic 5 — Panier + CourteDateBanner
- **Action** : cliquer sur l'icône panier du header
- **Pointer** : le bandeau or en haut du panier `CourteDateBanner` — `"Anti-gaspi · 2 produits à -50% près d'expiration"`
- **Dire** : *"Bet anti-gaspi. La plainte client #1 de Toulouse c'est les DLC courtes — on en fait un argument d'achat. On récupère 70 k€ par an de démarque dans 12 mois."*
- **Pointer** : la ligne de panier avec `Brochettes Poulet · estimé 1,2 kg · 11,88 €`

#### Clic 6 — Créneau
- **Action** : cliquer `Choisir un créneau`
- **Pointer** : grille créneaux 7 jours, slot vert sélectionnable, slot gris complet (capacité 5/5)
- **Dire** : *"Slots auto-générés 7 jours en avance. Capacité 5 commandes par créneau, délai minimum 1 heure."*
- **Action** : cliquer un slot demain 12h00
- **Action** : cliquer `Valider le créneau`

#### Clic 7 — Checkout
- **Action** : page paiement `/paiement`
- **Pointer en bas** : `Total estimé 11,88 € · Pré-autorisé 14,30 € (libéré sous 7j)`
- **Dire** : *"Le client sait exactement combien on bloque. Transparence. La marge 20% est sur la viande uniquement, pas sur le reste."*
- **Action** : remplir Stripe Elements avec `4242 4242 4242 4242` `12/30` `123`
- **Action** : cliquer `Payer 14,30 €`
- **Attendre confirmation `/commande/confirmee/:id`**
- **Pointer** : QR code de retrait + numéro `DRV-2026-04217`
- **Dire** : *"Cette commande vient d'être créée. Elle va apparaître dans Stock dans 2 secondes. On y va."*

#### Clic 8 — Footer "Indépendant. De Toulouse. Halal."
- **Action** : scroll tout en bas du footer Drive (montrer rapidement)
- **Pointer** : le display géant `Indépendant. De Toulouse. Halal.` (clamp 48-180px), le mot "Halal" en or
- **Dire** : *"Voilà qui tu es, Otmane. C'est ta marque. Pas un footer Calendly."*

**Transition Acte 2 (10 sec)** — *"Maintenant on bascule côté staff."*

---

### ACTE 2 — "Le staff prépare" (5 min) — Stock PWA

**T+5 à T+10 · Écran projeté : `salam-stock.vercel.app`**

#### Clic 9 — PIN screen
- **Action** : ouvrir `salam-stock.vercel.app` → PIN screen
- **Pointer** : le logo SALAM STOCK en monogramme or sur sapin nuit
- **Dire** : *"Auth PIN 4 chiffres, mobile-first. Ton équipe se connecte en 2 secondes, pas de mot de passe à retenir."*
- **Action** : taper `1234` (PIN Otmane démo)

#### Clic 10 — Mode atelier nuit (si après 19h ou toggle manuel)
- **Action** : si on est après 19h le mode atelier nuit est déjà actif. Sinon cliquer toggle 🌙/☀️ dans le header
- **Pointer** : la transition 300ms vers le thème sapin abyssal `#0A1F18`, l'or qui devient `#DDB31C` plus brillant
- **Dire** : *"Ton équipe ferme à 19h30. À 19h, les rideaux baissent, la lumière jaune chaude rentre. L'app suit. WCAG validé."*
- **Action** : retoggle vers le thème jour pour la suite (mieux pour projeter)

#### Clic 11 — Dashboard /v2
- **Pointer** : eyebrow `01 — DÉPÔT PARTICULIER`, h1 `Bonsoir Otmane.` en display
- **Dire** : *"Personnalisé. C'est ton dashboard, pas un dashboard générique."*
- **Pointer** : la `HeroActionCard` sapin plein avec halo or `Nouvelle réception` au centre
- **Pointer** : le `WeeklyPicksRail` en bas avec sparklines sapin sous chaque KPI
- **Dire** : *"Chaque chiffre a un poids. Tabular-nums partout, delta jour vs hier, sparkline 7 jours. C'est Stripe Dashboard."*

#### Clic 12 — ⌘K Command Palette (wow Linear)
- **Action** : presser `⌘K`
- **Pointer** : la palette qui glide-in du haut
- **Action** : taper `boucherie` lentement
- **Pointer** : les résultats filtrent en live (produits, actions, navigation)
- **Action** : taper `préparation`, sélectionner `Aller à /v2/preparation`
- **Dire** : *"⌘K Linear-grade. Otmane, tu pilotes 3 dépôts. Navigation tap = lent. ⌘K = tu as le contrôle total."*

#### Clic 13 — Kanban préparation prioritisé
- **Sur `/v2/preparation`**
- **Pointer le DlcBanner** en haut : `"3 lots à risque DLC — voir alertes"`
- **Pointer le compteur** : `À PRÉPARER 12 · urgent 3` (urgent en or)
- **Pointer les 3 tiers visuels** :
  - cards or `bg-[#F4E9C4]` qui pulsent = `< 30 min` avant retrait
  - cards normales = `< 2h`
  - cards grisées `opacity-70` = `> 2h`
- **Dire** : *"Avant : 30 commandes empilées identiques. Ton équipe ratait les urgentes. Maintenant : tri par urgence, l'or pulse, tu vois en 1 seconde ce qui chauffe."*
- **Action** : toggle `Batch Pick` ON
- **Pointer** : la liste de courses unique triée par rayon (froid d'abord)
- **Dire** : *"Mode batch pick : ton préparateur fait une seule course pour 8 commandes. Économise 40% de temps."*

#### Clic 14 — Détail commande + pesée
- **Action** : cliquer sur la commande `DRV-2026-04217` (celle qu'on vient de créer Acte 1)
- **Action** : sur la ligne `Brochettes Poulet Marinées · estimé 1,2 kg` → cliquer `Peser`
- **Action** : taper `1,18` kg (poids réel)
- **Pointer** : recalcul automatique → `Réel 11,68 € · Écart -0,20 € · auto_accept (< 10%)`
- **Dire** : *"Écart sous 10% → auto-validé, le client n'est pas notifié. Au-dessus, on lui pose la question."*
- **Action** : cliquer `Assigner bay` → modal s'ouvre → cliquer `A3`
- **Pointer** : `bay_label = A3` apparaît en or sur la card
- **Action** : cliquer `FINALISER & CAPTURER 11,68 €`
- **Pointer** : toast confirmation `Capture Stripe OK · client notifié`
- **Dire** : *"Capture Stripe live, le client reçoit le mail 'commande prête'. On bascule sur le comptoir."*

**Transition Acte 3 (5 sec)** — *"Regarde l'iPad."*

---

### ACTE 3 — "Le client retire" (3 min) — Counter screen

**T+10 à T+13 · Écran iPad fullscreen : `/v2/counter`**

#### Clic 15 — Slide-in en or sur l'iPad
- **Pointer l'iPad** : la commande `DRV-2026-04217 · Mohamed B. · A3` qui slide-in en or géant sur l'écran counter (transition 360ms ease-out-expo)
- **Dire** : *"Aucun supermarché halal en France n'a ça. Carrefour Drive a une version froide. La nôtre est éditoriale."*
- **Pointer** : la liste des 10 prochaines commandes prêtes, avec bay (A1, A2, A3, B1…)

#### Clic 16 — Scan QR client (Mohamed joue le client)
- **Action** : Mohamed sort son iPhone, ouvre la caméra
- **Action** : Mohamed scanne le QR du ticket de retrait `DRV-2026-04217` (le QR est sur l'écran de confirmation Drive ou imprimable)
- **Pointer iPhone** : la page publique `salamarket-drive.vercel.app/lot/L2026-05-A23` s'ouvre
- **Pointer écran iPhone projeté ou montré à Otmane** :
  - `Brochettes Poulet Marinées`
  - `Fournisseur : Bigard Castres`
  - `Abattoir : SOCOPA Castres (SIRET 552 028 770)`
  - `Date abattage : 28/05/2026`
  - `Certificateur : AVS (validité jusqu'au 31/12/2026)`
  - `Contrôleur : Mohammed Aboubaker`
  - `DLC : 12/06/2026`

#### **POINT WOW** — Le pitch traçabilité halal (60 sec, ralentir)
- **Dire calmement, regard direct sur Otmane** :
  *"Otmane. Regarde bien. Ce QR, on le génère sur chaque ticket. Le client scanne, il voit le fournisseur, l'abattoir, la date d'abattage, le certificateur AVS, le contrôleur nommé. **Aucun concurrent halal en France ne fait ça.** Pas halal-store, pas Aya Market, pas Mahalle. Carrefour halal encore moins. C'est notre moat catégoriel. Et pour AVS et ARGML, c'est la fin de la friction d'audit annuel — 2 à 3 jours-homme économisés."*

- **Pause 3 secondes**.

- **Continuer** :
  *"Le jour où AVS lance un contrôle surprise, ton équipe lui donne un PIN auditeur, il voit la traçabilité au lot, l'historique des certifs, les températures cold-chain. Il ne voit pas les clients, pas les prix. Tu sors un PDF audit en 1 clic."*

**Transition Acte 4 (10 sec)** — *"Maintenant remonte d'un cran. Tu es le patron. Voici ton cockpit."*

---

### ACTE 4 — "Otmane pilote" (5 min) — Cockpit + automation

**T+13 à T+18 · Écran projeté : retour laptop**

#### Clic 17 — /v2/cockpit
- **Action** : `⌘K` → taper `cockpit` → entrée
- **Pointer en haut** : `Ventes hier 8 432 € · target 9 000 € · -6,3% ▼` en or si en-dessous, vert si au-dessus
- **Pointer** : alertes critiques `2 ruptures · 1 lot DLC J-1 · 1 employé en retard pointage`
- **Pointer staff présent** : `4/6 · Sara en pause · Karim au labo`
- **Pointer météo + hijri** : `Mardi 10 juin · 28°C · 14 Dhū al-Ḥijja 1447 · Aïd al-Adha J-7`
- **Dire** : *"30 secondes le matin. Tu sais où ton business en est. Le hijri est natif — Aïd al-Adha dans 7 jours, c'est ton pic. Préparation J-60 commence dans le module forecast."*

#### Clic 18 — /v2/forecast (rupture + booster hijri)
- **Action** : cliquer `Voir prévisions ruptures` ou `⌘K → forecast`
- **Pointer** : liste des 8 SKU prévus en rupture J-4 / J-2 / J-1
- **Pointer en or** : `Agneau épaule · J-2 · booster Aïd 2,8× · réassort suggéré 120 kg`
- **Dire** : *"Le calendrier hijri natif. Le modèle baseline + booster Ramadan/Aïd au lot. Spécialiste halal = 15-25% du CA annuel sur Ramadan, on en fait un sous-système, pas une saisonnalité."*

#### Clic 19 — /v2/admin/alertes-dlc
- **Action** : `⌘K → DLC` ou clic sur l'alerte cockpit
- **Pointer** : 3 lots démo avec niveaux visuels distincts :
  - Lot J-7 : warning jaune `Attention`
  - Lot J-2 : suggestion or `Démarque suggérée -30%`
  - Lot J-1 : critique rouge `Démarque forcée -50%`
- **Action** : cliquer `Appliquer -50%` sur le lot J-1
- **Pointer toast** : `Prix mis à jour · Drive synchronisé · Étiquette imprimée rayon`
- **Dire** : *"Anti-gaspi automatisé. La plainte client #1 sur Toulouse devient un argument d'achat 'rayon courte date'. ROI 3-6 mois, 70 k€ par an récupérés sur la démarque."*

#### Clic 20 — /v2/po (Purchase Orders auto)
- **Action** : `⌘K → po` → entrée
- **Pointer** : `PO suggéré · Bigard Castres · 3 lignes · 1 240 € · généré depuis predictions hier soir`
- **Action** : cliquer le PO → voir le détail (3 lignes, prix négociés, dernière commande)
- **Action** : cliquer `Confirmer et envoyer fournisseur`
- **Pointer toast** : `PO PO-2026-0042 envoyé à contact@bigard-castres.fr · token magic-link valide 14j`
- **Dire** : *"PO auto-générés depuis les prédictions. Ton fournisseur reçoit un email avec un magic-link, il confirme en 1 clic, ça revient en réception scannable. Plus de 'j'oublie de réassortir le poulet le mardi'."*

#### Clic 21 — Assistant IA (vocal si possible)
- **Action** : `⌘K → assistant` → entrée
- **Action** : cliquer micro (ou taper si pas d'autorisation micro)
- **Dire à voix haute** : *"Combien de poulet vendu cette semaine ?"*
- **Pointer la réponse Claude** (streamée) :
  > *"Du 4 au 10 juin, le rayon volaille a vendu 1 248 kg pour 11 230 € TTC, dont 62% en brochettes marinées. Marge brute estimée 38%. La meilleure journée a été samedi (218 kg). Ramp-up Aïd al-Adha à anticiper sur l'agneau dès le 12 juin."*
- **Dire** : *"Claude branché sur ta DB. Toutes tes questions business en langage naturel. C'est ton analyste financier qui ne dort jamais."*

**Transition Acte 5 (10 sec)** — *"Voilà ce qu'on a build. Maintenant la suite. Slides."*

---

### ACTE 5 — "L'ambition" (4-5 min) — Slides + roadmap

**T+18 à T+23 · Slides plein écran**

#### Slide 1 — Fédération Salamarket
- **Visuel** : carte de France avec 9 points (Bordeaux, Chambéry, Dijon, Gennevilliers, Le Mans, Marseille, Montpellier, Rouen, Toulouse — Toulouse en or, les 8 autres en sapin clair)
- **Titre display** : `Une plateforme. Huit SARL. Demain cinquante.`
- **Body** :
  - Aujourd'hui : K&A FOOD Toulouse · 13,8 M€ CA · 16 FTE · 3 dépôts
  - Demain (12 mois) : 8 SARL fédérées · ~100 k€ ARR
  - 36 mois : 50+ indépendants halal FR · ~600 k€ ARR
- **Dire** : *"Otmane, tu as la fédération Salamarket. 9 SARL indépendantes, pas un groupe. Ce qu'on a build ici à Toulouse, c'est multi-tenant from day 1. Une seule installation, on l'ouvre à Gennevilliers, à Bordeaux, à Marseille. Tu deviens le moteur de la fédération — pas juste le gérant d'un magasin."*

#### Slide 2 — Roadmap 2026-2027
- **Visuel** : timeline 3 phases sur 12 mois
- **Phase 1 — Harden Toulouse (Juin → Sept 2026)**
  - Lot trace end-to-end (sync Cashmag réel)
  - DLC pricing push Cashmag auto
  - Pickup screen + tote scanning routine
  - Rôle auditeur AVS livré
  - **KPI** : démarme 1,4% → 1,1% = 40 k€ mesurables
- **Phase 2 — Multi-tenant deploy (Oct → Déc 2026)**
  - 2-3 SARL onboarded (Gennevilliers, Bordeaux, Marseille)
  - Setup-wizard tenant + doc self-serve
  - **KPI** : 36 k€ ARR signés
- **Phase 3 — Platform play (Q1 → Q2 2027)**
  - Forecast AI fresh meat mature
  - Marketplace inter-SARL (surstock Toulouse → Marseille)
  - Auditor portal AVS/ARGML
  - **KPI** : 120 k€ ARR · 8-10 SARL
- **Dire** : *"Trois phases. Phase 1 = on prouve les chiffres chez toi. Phase 2 = on ouvre à 3 SARL. Phase 3 = on devient une plateforme avec effets de réseau."*

#### Slide 3 — Compétiteurs vs Salamarket
- **Visuel** : tableau 4 colonnes
  | Feature                  | Cashmag | Lightspeed | Concurrents halal FR | **Salamarket** |
  |--------------------------|---------|------------|----------------------|----------------|
  | NF525 encaissement       | ✅      | ✅         | ⚠️                   | ✅ (via Cashmag) |
  | Halal lot trace + QR public | ❌    | ❌         | ❌                   | ✅ unique      |
  | Calendrier hijri natif   | ❌      | ❌         | ❌                   | ✅ unique      |
  | AI shrinkage indépendant | ❌      | ❌         | ❌                   | ✅ unique      |
  | Multi-tenant fédération  | ❌      | partiel    | ❌                   | ✅ from day 1  |
  | Rôle auditeur AVS read-only | ❌  | ❌         | ❌                   | ✅ unique      |
- **Dire** : *"Cashmag reste, on ne touche pas à ton encaissement NF525. On orchestre par-dessus. Trois moats qu'aucun éditeur générique ne shippera avant 18-24 mois : halal lot trace au QR, hijri natif, AI démarme indépendant."*

#### Slide 4 — Pricing & investissement pilote
- **Visuel** : 3 tiers + offre pilote
- **Tier 1** : 500 €/mois (mono-dépôt, < 2 M€ CA)
- **Tier 2** : 1 000 €/mois (multi-dépôts, 2-10 M€) ← **K&A FOOD**
- **Tier 3** : 2 000 €/mois (> 10 M€, pack Drive + B2B Pro)
- **Setup intégration Cashmag** : 2 500 € one-shot
- **🎁 Offre pilote 30 jours** : gratuit, full support, KPI mesurés (démarme, ruptures, NPS staff)
- **Dire** : *"Pilote 30 jours gratuit. On mesure la démarme avant/après. Si on ne te récupère pas 3 k€ minimum en 30 jours, tu nous dois rien. Si oui, on signe Tier 2 à 1 k€/mois."*

#### Closing (60 sec) — "Pour passer en prod chez vous"
- **Slide finale** : checklist `Pour démarrer le pilote chez K&A FOOD`
  - **Cette semaine** : signature lettre d'intention pilote (template prêt, on envoie demain)
  - **Semaine 1** : intégration Cashmag (export NF525 quotidien read-only) — 5 jours dev
  - **Semaine 2** : onboarding staff (Otmane + 4 préparateurs + Sara) — 1 demi-journée chacun
  - **Semaine 3-4** : run live + mesure KPI (démarme, ruptures, NPS)
  - **Semaine 5** : revue chiffres ensemble · décision Tier 2 ou stop
- **Dire (regard direct Otmane)** :
  *"Otmane. Pour passer en prod chez toi, il manque trois choses : (1) ton OK signature pilote, (2) accès à l'export NF525 Cashmag quotidien — 5 jours de dev pour brancher, (3) une demi-journée par employé pour onboarder. Coût : 0 € pour 30 jours. Délai : on démarre lundi prochain si tu valides cette semaine. Qu'est-ce qu'il faut que je clarifie pour qu'on signe ?"*

- **Silence**. Laisser Otmane parler.

---

## Section 4 — Backup plan

### Si Wi-Fi salle fail
- **Plan A** : basculer instantanément en hotspot iPhone 5G (préparé J-1, mot de passe noté)
- **Plan B** : screencast pré-enregistré `~/Desktop/demo-backup/`
  - `acte1-drive.mov` (30 sec parcours achat brochettes)
  - `acte2-stock-prep.mov` (30 sec PIN + kanban + pesée)
  - `acte3-counter-qr.mov` (30 sec slide-in iPad + scan QR)
  - `acte4-cockpit-po.mov` (30 sec cockpit + DLC + PO + IA)
  - `acte5-slides.pdf` (slides 1-4 en local)
- **Narration** : *"On a perdu le Wi-Fi 30 secondes, je vous montre ce qu'on a tourné hier — c'est exactement le même flow."*

### Si Stripe fail (test mode down ou key expirée)
- **Sauter le clic 7** (paiement live) → montrer screenshot `commande-confirmee.png` du J-1
- **Dire** : *"Voici comment ça s'est passé hier sur la commande test 04216. Idem aujourd'hui en prod."*

### Si Supabase fail (auth ou query timeout)
- **Sauter sur les screencasts** acte par acte
- **Ne pas paniquer**. Dire : *"Le système a un hoquet, je vous montre l'enregistrement, on reprend le live après."*

### Si Otmane pose une question qu'on ne sait pas
- **Réponse type** : *"Bonne question. On note, je te reviens dans 24h avec la réponse précise."*
- **Mohamed note dans Notion** `meeting-notes/2026-06-10-otmane.md`
- **Ne JAMAIS inventer** une réponse technique. Otmane détecte le bullshit, c'est éliminatoire.

### Si Otmane veut "voir le code" ou "tester sur son téléphone"
- **Lui passer l'iPad** : il peut cliquer librement sur `/v2/counter` puis sur le dashboard
- **Lui passer le PIN** `1234` s'il veut tester l'auth
- **Ne pas montrer le code source** : c'est une démo business, pas une review tech

### Si Ahmed challenge sur le coût
- **Réponse cadre** : *"500 € par mois Tier 1, 1 k€ Tier 2 pour vous. Bench Lightspeed : 89-289 € mais aucun feature halal. Bench Toast : 79-499 $ idem. On vend la verticalité halal + hijri + multi-tenant. Et le pilote 30 jours est gratuit — vous ne payez que si on prouve les chiffres."*

---

## Section 5 — Suivi J+1 (11 juin)

### Email récap (envoyer avant 14h le 11 juin)

**To** : Otmane Jamal · **Cc** : Ahmed Nasry, Mohamed Belhamiti
**Subject** : Salamarket Stock — récap démo 10/06 + prochaines étapes

**Body** (template) :

> Otmane, Ahmed,
>
> Merci pour le temps hier. Recap des 3 décisions actées :
>
> 1. **[Décision 1 — ex : pilote 30 jours validé sur principe]**
> 2. **[Décision 2 — ex : intégration Cashmag à démarrer semaine 24]**
> 3. **[Décision 3 — ex : onboarding staff prévu mardi 16/06 matin]**
>
> Prochaines étapes immédiates :
> - Vendredi 12/06 : envoi du contrat pilote 30 jours pour signature électronique (DocuSign)
> - Lundi 15/06 : kick-off intégration Cashmag — j'aurai besoin de l'accès export NF525 quotidien
> - Mardi 16/06 matin : onboarding Otmane + Sara + 2 préparateurs (1h30 chacun, dans vos locaux)
> - Lundi 22/06 : go-live pilote · 1ère mesure KPI à J+30 (lundi 22/07)
>
> Documents joints :
> - Récap visuel des 5 actes démo (PDF)
> - Slides Acte 5 (fédération, roadmap, pricing)
> - Spec technique intégration Cashmag (3 pages)
>
> Questions encore ouvertes côté vous : aucune notée pendant la démo, mais si quoi que ce soit revient, on est là.
>
> Salam,
> Mohamed

### Contrat pilote 30 jours (à préparer J+1)
- **Template** : `docs/legal/pilote-30j-template.md` (à créer si pas encore)
- **Clauses clés** :
  - Période : 30 jours calendaires à partir du go-live
  - Coût : 0 € (intégration Cashmag offerte, support inclus)
  - Engagement K&A FOOD : 1 demi-journée onboarding par employé concerné · accès export NF525 quotidien · revue KPI à J+30
  - Engagement Salamarket : disponibilité 5j/7 ouvrés · response time < 4h ouvrées · réversibilité totale en cas d'arrêt
  - KPI mesurés : démarme (€/mois), nombre de ruptures évitées, NPS staff (5 questions), temps préparation moyen
  - Sortie : à J+30, soit Tier 2 signé (1 000 €/mois engagement 12 mois) soit arrêt sans frais et désinstall sous 7j
- **Signature** : DocuSign envoyé vendredi 12/06, deadline retour lundi 15/06 EOD

### Onboarding staff (semaine 25-26)
- **Jour J onboarding** (mardi 16/06 matin) :
  - 9h-9h30 : Otmane — tour cockpit + cas d'usage manager
  - 9h30-10h30 : Sara + 2 préparateurs — kanban prép, batch pick, pesée, finalisation
  - 10h30-11h : Karim (labo) — module recettes/productions (optionnel pilote)
- **Support post-onboarding** : Slack dédié K&A FOOD · response time < 4h ouvrées · Mohamed en astreinte semaine 1
- **Documentation** : tutoriels vidéo 2-3 min par flow, hébergés sur `salam-stock.vercel.app/v2/help` (à créer)

### Métriques à tracker (dashboard interne Salamarket)
- Date go-live · J+7 · J+14 · J+21 · J+30 :
  - Nb commandes Drive préparées via Stock
  - Démarme totale € (vs baseline 30j précédent K&A FOOD)
  - Nb ruptures évitées (alertes forecast appliquées)
  - NPS staff (Google Form 5 questions)
  - Temps préparation moyen par commande (chrono kanban)
- **Revue J+30** : meeting 1h Otmane + Ahmed + Mohamed · présentation chiffres · décision Tier 2 ou stop

---

## Annexe — Checklist exécution Mohamed (à imprimer / sur téléphone)

```
T-60min : check matos, café Otmane + Ahmed, premier slide affiché
T-30min : préchargement 4 onglets, iPad fullscreen, iPhone caméra
T-15min : silence Slack/Discord/WhatsApp, mode Focus macOS ON
T-5min  : Otmane et Ahmed s'installent, setup (Section 2)
T+0     : ACTE 1 — Drive PWA (5 min) — finir T+5
T+5     : ACTE 2 — Stock PWA (5 min) — finir T+10
T+10    : ACTE 3 — Counter + QR (3 min) — finir T+13
T+13    : ACTE 4 — Cockpit + auto (5 min) — finir T+18
T+18    : ACTE 5 — Slides (5 min) — finir T+23
T+23    : SILENCE — laisser Otmane parler
T+25    : Q&R libre (jusqu'à T+35 max)
T+35    : closing + agenda J+1 confirmé verbalement
```

**Règles personnelles Mohamed pendant la démo** :
- Pas de "euh", pas de "tu vois", pas de "c'est cool"
- Toujours regarder Otmane quand on dit le point wow d'un acte
- Si Otmane prend son téléphone : c'est mauvais signe → accélérer ou poser une question directe
- Si Otmane se penche en avant : c'est gagné → ralentir, laisser respirer
- Ahmed regarde Otmane : sa réaction à Ahmed compte autant que la sienne
