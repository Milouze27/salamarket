# Stock Ambition 2026 — Consolidated Strategy Brief

> **Date :** 2026-05-30
> **Audience :** Otmane (gérant), product + eng Salamarket
> **Sources :** `2026-05-30-salamarket-context.md`, `2026-05-30-stock-landscape.md`, `2026-05-30-stock-da-audit.md`
> **Décision attendue :** valider le scope démo June 10 + arbitrer le roadmap Q3/Q4 2026

---

## 1. Executive summary

**Vision.** Stock devient le système d'orchestration multi-tenant pour la fédération Salamarket — 1 SARL aujourd'hui (K&A FOOD Toulouse, 13,8 M€ CA, 16 FTE, 3 dépôts Particulier/Pro/Sodrune), 8 SARL fédérées demain (Bordeaux, Marseille, Montpellier, Le Mans, Gennevilliers, Rouen, Dijon, Chambéry), 50+ à horizon 36 mois (autres halal indépendants français qui souffrent du même gap POS).

**3 différenciateurs que personne dans le halal FR ne shippe.**

1. **Halal lot traceability native** — chaque lot porte `certifier_id` (AVS / ARGML / Mosquée Paris) + `supplier_lot` + abattoir + date abattage, exposé via QR public `/lot/[id]` sur le ticket client et le Drive. Aucun concurrent FR (halal-store, halalmarket, mahalle, halbutche, Aya Market) ne le fait. Carrefour halal encore moins.
2. **Calendrier hijri first-class** — forecast Ramadan/Aïd au lot, historique 3 ans glissants, ramp-up J-60 sur dattes/semoule/agneau. Le pic vaut **15-25 % du CA annuel** pour un spécialiste — un POS générique le traite en "saisonnalité", on en fait un sous-système.
3. **AI shrinkage à l'échelle indépendant** — pas de CV Trigo capex-heavy : algo simple sur écarts inventaire tournant × ventes prévisionnelles × DLC. La cible est **réduire la démarque de 1,4 % à 0,9 % du CA = 70 k€/an récupérés** sur Toulouse seul (équivalent 1 FTE).

**Unfair advantage.** K&A FOOD a déjà **13,8 M€ CA + 16 FTE + 8 SARL fédérées Salamarket**. Stock n'est pas un produit qui cherche son marché — c'est un **SaaS interne ready-to-go** avec un design partner captif (Otmane), une distribution gratuite (réseau Salamarket), et une compliance halal/HACCP impossible à reproduire pour un éditeur générique. ARPU cible **500-2000 €/mois par SARL**, soit 50-200 k€ ARR à 8 SARL, 300 k€-1,2 M€ ARR à 50.

---

## 2. Strategic positioning

**Le réseau Salamarket est une fédération de SARL indépendantes, pas un groupe centralisé.** 9 dépôts officiels (Bordeaux, Chambéry, Dijon, Gennevilliers, Le Mans, Marseille, Montpellier, Rouen, Toulouse), entités juridiques séparées (DHM 34, DHM 13, K2A, H Center IDF, Salamarket IDMSB, etc.), aucune DSI centrale, aucun stack commun. C'est **précisément le contexte qui rend un produit horizontal "Stock" pertinent** : il se vend une fois à chaque SARL, sans politique groupe à négocier.

**Stock est multi-tenant from day 1.** Architecture data isolation par `tenant_id` (= SIRET de la SARL) dès la première ligne de schema. RLS Supabase obligatoire sur toutes les tables métier. Une seule instance, N SARL. Si on ne fait pas ça maintenant, on le paie cher à la SARL #3.

**Cashmag reste, Stock orchestre par-dessus.** Pas de migration POS — Cashmag est NF525, staff formé, encaissement résolu. Stock = couche au-dessus : achats, réception Sodrune, transferts inter-dépôts, prix, fiches produit, Drive, traçabilité, forecast, démarque. Intégration via export caisse NF525 quotidien (sync ventes ← Cashmag) + push prix → Cashmag. **Zéro risque de casser l'encaissement** — c'est le principal levier d'acceptation Otmane.

**Pricing cible.**
- Tier 1 (mono-dépôt, <2 M€ CA) : **500 €/mois**.
- Tier 2 (multi-dépôts ou 2-10 M€) : **1 000 €/mois**.
- Tier 3 (>10 M€ ou pack Drive + B2B Pro) : **2 000 €/mois**.
- Setup one-shot intégration Cashmag : **2 500 €**.

Benchmark : Lightspeed Retail 89-289 €/mois, Toast 79-499 $/mois, mais aucun ne fait halal/hijri/multi-tenant fédération. On vend la verticalité.

---

## 3. The 10 bets (ranked)

Scoring : Impact (€/an récupérés ou moat), Effort (dev-weeks), Demo-critical (June 10).

### Bet 1 — Halal lot traceability + QR `/lot/[id]`
- **Insight** : research #2 §5.3 + research #1 §5.5 — zéro concurrent FR halal le fait, AVS/ARGML exigent traçabilité au lot, plainte clients récurrente sur "info produit manquante".
- **Impact** : **moat catégoriel**. Asset trust artefact qui transforme le ticket de caisse en preuve. Permet de vendre 200-500 € de prime tarifaire / mois aux SARL pour le module "audit-ready". Quantifiable : 1 audit AVS évité = 2-3 j-h économisées + 0 risque retrait certif.
- **Effort** : **M (3-4 sem)**. Schema `produits_lots` (lot_id, supplier_lot, certifier_id, dlc, abattoir, date_abattage), propagation `receptions_lignes → stock_par_depot_lot → ventes_lignes`, page publique Next.js `/lot/[id]`, QR sur ticket Cashmag (via post-processing PDF ou champ libre).
- **Demo-critical** : **OUI**. C'est le pitch.
- **Description** : à chaque réception, le préparateur scanne ou saisit le lot fournisseur. À la vente (Cashmag → sync), le lot vendu est figé sur la ligne. Le ticket porte un QR `salamarket.fr/lot/L2026-05-A23` → page publique qui affiche : viande, fournisseur, SIRET, abattoir, date abattage, certificateur (AVS/ARGML), validité certif, contrôleur. Démo June 10 : un ticket réel + un téléphone qui scanne en live.

### Bet 2 — DLC alerts + dynamic pricing -30 % J-2/J-3
- **Insight** : research #1 §1 + §5.4 — la plainte client #1 sur Toulouse est "DLC courtes", démarque France retail = 1,4 % CA = 138-200 k€/an pour K&A FOOD.
- **Impact** : **70 k€/an** récupérés en réduisant la démarque de 0,5 pt + résout la plainte client #1. ROI documenté 3-6 mois sur le pattern Afresh/OrderGrid (-37 à -76 % sur le frais).
- **Effort** : **S (2 sem)**. Edge function quotidienne qui scanne `stock_par_depot_lot.dlc`, banner sur `/v2/preparation` + `/v2/labo`, règle de pricing auto `-30 % J-2 / -50 % J-1` poussée vers Cashmag + Drive avec étiquette "Promo courte date".
- **Demo-critical** : **OUI**. Visuel immédiat, story claire pour Otmane.
- **Description** : trois niveaux d'alerte (J-7 attention, J-3 démarque suggérée, J-1 démarque forcée). Push automatique vers le Drive avec section "Rayon courte date -30/-50 %" — transforme la plainte client en argument d'achat. Anti-gaspi.

### Bet 3 — Multi-tenant architecture from day 1
- **Insight** : research #1 §1 + §6 Bet 10 — fédération Salamarket = 8 SARL indépendantes, pas un groupe. Si Stock marche à Toulouse, pitch aux 8 autres = 2 sem d'install chacun.
- **Impact** : **moat structurel + ARR**. Sans ça, chaque SARL = un fork = inviable. Avec : 8 SARL × 1 k€/mois = 96 k€ ARR an 1, 50 SARL × 1 k€/mois = 600 k€ ARR an 3.
- **Effort** : **M (3 sem)** maintenant, **XL (12+ sem)** si retrofit après. **Faire maintenant**.
- **Demo-critical** : **NON** (invisible UI), mais à shipper avant la 2e SARL.
- **Description** : `tenant_id` (= SIRET) sur toutes les tables métier (`produits`, `stock_par_depot`, `commandes_drive`, `employes`, `fournisseurs`, `receptions`). RLS Supabase par tenant. Une auth tenant-aware sur le PIN screen (le PIN appartient à un tenant). Un super-admin Salamarket peut switcher de tenant pour support.

### Bet 4 — Hijri calendar forecast Ramadan/Aïd
- **Insight** : research #1 §3 — Ramadan = +30 % ventes halal GMS, jusqu'à 26 % part halal sur volailles vs 6,6 % en année normale. Spécialiste = 15-25 % du CA annuel sur 1 mois.
- **Impact** : **300-600 k€** de CA mieux servi = -15 % de ruptures sur les SKU critiques (dattes, lait fermenté, semoule, agneau) + -20 % de surstocks post-Aïd. Économie démarque post-Ramadan estimée 30-50 k€/an.
- **Effort** : **M (3 sem)** pour v1 (Prophet/ARIMA + booster hijri sur catégories key). **L (6+ sem)** si on veut un ML maison.
- **Demo-critical** : **OUI** (en slide + un graph mock sur dattes). Trop tôt pour shipper du forecast réel d'ici June 10.
- **Description** : calendrier hijri natif dans la DB (table `hijri_events` : Ramadan début/fin, Aïd al-Fitr, Aïd al-Adha, Achoura). Modèle baseline par catégorie + booster J-60 → J-1 du Ramadan. Réassort suggéré avec horizon Aïd. Vue admin "Préparation Ramadan 1448" qui descend les 30 SKU prioritaires.

### Bet 5 — Drive DA port to Stock (5 P0 from audit)
- **Insight** : research #3 §6 — Stock partage déjà la palette/typo Drive, mais reste "dashboard admin" vs "registre éditorial premium". 5 changements DA = 80 % du gap.
- **Impact** : **perception démo**. Otmane et investisseurs verront un produit qui *ressemble* à Drive — cohérence de marque = signal de qualité. Aucun € direct mais multiplie l'impact de tout le reste.
- **Effort** : **S (1 sem)**. Pur CSS + composants existants.
- **Demo-critical** : **OUI**. C'est ce qu'on voit.
- **Description** : (1) échelle h1 display `clamp(40px, 7vw, 56px)` avec mot accentué or sur tous les hubs, (2) eyebrow numéroté `01 — / 02 —` partout, (3) fix overlap bottom nav universel via `padding-bottom: calc(var(--nav-height) + var(--nav-breathing))`, (4) promotion card principale sur chaque hub en sapin plein avec icône or, (5) filtres pills scroll-x avec gradient fade sur `/v2/stock`.

### Bet 6 — Customer-facing pickup screen + bay label
- **Insight** : research #2 §2.4 + §6.1 — Carrefour Drive a plate detection, **aucun concurrent halal FR** n'a de pickup screen. Pattern UX cheap mais visible.
- **Impact** : **UX qualitative + bouche-à-oreille**. Calme la queue pendant Ramadan (50-100 retraits/jour vs 10 en année normale). Pas de € direct mais effet "premium" sur la cible voisine d'Aya Market.
- **Effort** : **S (1 sem)**. Champ `pret_bay_label` sur `commandes_drive`, route fullscreen `/v2/counter` (TV ou iPad au comptoir), impression bay sur ticket retrait.
- **Demo-critical** : **OUI**. Un iPad au comptoir pendant la démo, ça parle.
- **Description** : chaque commande prête se voit assigner une bay (A1, A2, B1…). Écran fullscreen affiche les 10 prochaines commandes prêtes avec n° et bay. Client scanne son QR de retrait → confirmation visuelle. Réduit le "où est ma commande ?" qui tue le NPS.

### Bet 7 — Tote-per-order picker workflow
- **Insight** : research #2 §4.1 — pattern Instacart Fulfillment Pro standard, élimine une classe entière d'erreurs "produit oublié / mélangé avec autre commande".
- **Impact** : **-30 à -50 % erreurs picking** (Instacart benchmark). À 50 commandes/jour × 5 % erreur × 15 € coût remédiation = 110 €/jour récupérés = **40 k€/an**.
- **Effort** : **S (2 sem)**. Champ `tote_code` sur `commandes_drive`, scan au début du pick, validation hardware de chaque item scanné contre la commande attendue.
- **Demo-critical** : **NON** (mais montrable en 30 sec si on a le temps).
- **Description** : préparateur scanne un sticker tote (panier physique) au début. Chaque produit scanné est validé contre la commande du tote. Si mismatch → bloque. Hardware-enforced "no mixed bag".

### Bet 8 — Auditor read-only role (AVS/ARGML)
- **Insight** : research #2 §5.2 — AVS exige "controllers permanents", ARGML "from slaughter to packaging". Un rôle audit lecture-seule supprime la friction des audits annuels.
- **Impact** : **0 € direct mais kill criterion d'achat** pour toute SARL halal. C'est une case à cocher pour conserver la certif. Différenciateur vs Cashmag/Lightspeed.
- **Effort** : **S (1 sem)**. `employes.role = 'auditor'`, RLS read-only sur tables traçabilité, masquage PII clients, vue dédiée `/v2/audit`.
- **Demo-critical** : **NON** (mais à mentionner verbalement dans le pitch halal).
- **Description** : un contrôleur AVS reçoit un PIN dédié, voit la traçabilité au lot, l'historique des certifs fournisseurs, les températures cold-chain. Ne voit pas les clients, ne voit pas les prix. Export PDF audit en 1 clic.

### Bet 9 — Loyalty fidélité fréquence (anti Aya Market)
- **Insight** : research #1 §2 + §6 Bet 7 — Aya Market à 200 m est la vraie menace, pas Carrefour. Métrique nord = fréquence de visite, pas panier moyen.
- **Impact** : **+10-15 % fréquence visites** sur les 20 % top clients = ~150-200 k€/an de CA défendu sur Toulouse. Difficile à quantifier précisément.
- **Effort** : **M (3 sem)**. Schema `fidelite` (client_id, visites_mois, dernier_visite), règles (4e visite du mois = -10 %), notif WhatsApp J+10 sans visite.
- **Demo-critical** : **NON**. Phase 2.
- **Description** : récompenser la 4e visite/mois plutôt que le panier 80 €. Le client doit voir Salamarket comme "ma course halal de la semaine". Notif WhatsApp Business (canal natif cible) à J+10 sans visite : "On a réassorti tes Maîtres Sauciers."

### Bet 10 — AI demand forecast fresh meat
- **Insight** : research #2 §6.1 — 37-76 % réduction waste sur le frais (Afresh, OrderGrid, Bright Minds). Halal carcass cycle = zero marge passé DLC.
- **Impact** : **30-50 k€/an** sur la boucherie Toulouse seule (waste fresh meat estimé 5-8 % du CA boucherie ~ 1,5 M€ × 0,5 pt récupéré).
- **Effort** : **L (6-8 sem)** pour v1 production-ready. Démarrer sur **1 catégorie × 1 dépôt** (bœuf frais Particulier).
- **Demo-critical** : **NON**. Slide vision + mock graph.
- **Description** : modèle Prophet/ARIMA sur historique `commandes_drive_lignes` × jour-de-semaine × hijri × météo. Suggestion réassort quotidienne pour le boucher. Itère vers ML maison à partir de la 3e SARL connectée (plus de data).

---

### Bets écartés (explicitement)

- **CV shrinkage detection (Trigo-style)** : research #2 §6.4 — capex Trigo trop élevé pour un indépendant à ce stade. À revisiter à 3+ SARL connectées (mutualisation coût). **2027.**
- **AR picking glasses** : research #2 §6.3 — wow factor zéro ROI à cette échelle. **Skip définitif.**
- **Voice commands warehouse** : research #2 §6.3 — gimmick. Reception/labo n'ont pas le besoin volume. **Skip.**
- **Robotic picking (Ocado/Picnic)** : research #2 §6.4 — wrong economics. **Skip.**

---

## 4. Demo plan — June 10 (T+11 jours)

### Shippable (en ~10 jours)

| Bet | Effort | Owner |
|---|---|---|
| **Bet 5** — Drive DA port (5 P0) | 1 sem | Frontend |
| **Bet 1** — Halal lot traceability (schema + page `/lot/[id]` + QR sur ticket) | 3-4 sem **réduits à 1 sem en démo-mode** : schema + page publique avec 1 lot seeded en vrai, pas de propagation Cashmag | Backend + Frontend |
| **Bet 2** — DLC alerts banner + démarque suggérée -30 % (sans push Cashmag, juste UI) | 1 sem | Backend léger |
| **Bet 6** — Pickup screen `/v2/counter` + bay label | 1 sem | Frontend |

**Total : ~10 dev-jours répartis entre 2 devs** = faisable sur 11 jours réels avec un buffer démo (J+10) pour répétition.

### Demo without shipping (slides + Figma)

- **Bet 4** Hijri forecast — slide avec un graph mock "Ramadan 1448 : +320 % sur dattes Medjool, -45 % sur charcuterie". Story claire.
- **Bet 3** Multi-tenant — un slide d'architecture (1 boîte "Stock", 8 boîtes "SARL fédérées"). Pas de UI à montrer.
- **Bet 10** AI forecast — un mock graphique fresh meat avec courbe prévision vs réel.
- **Bet 8** Auditor role — un screenshot mockup d'une vue audit avec watermark "AVS contrôleur".
- **Bet 7** Tote scanning — gif/vidéo de 15 sec montrant un scan tote.

### Strictement off-table

- Toute migration Cashmag (zéro risque encaissement avant démo).
- Tout module B2B Pro/factures (hors scope démo, phase 3).
- Tout dark mode "atelier nuit" (bonus DA research #3 §5.6 — Q4).
- CV computer vision, robotique, AR — voir §3 bets écartés.

---

## 5. Post-demo roadmap (Q3/Q4 2026)

### Phase 1 — Harden differentiators (Juin → Septembre 2026)

Objectif : passer les 4 bets démo en production multi-tenant chez K&A FOOD Toulouse, prouver les chiffres.

- **Bet 1** complet : propagation lot end-to-end (réception → stock → ticket Cashmag réel via post-processing PDF NF525).
- **Bet 2** complet : push prix Cashmag automatique + étiquette imprimée rayon.
- **Bet 4** v1 : forecast Ramadan opérationnel pour Ramadan 1448 (commence ~mars 2027 — préparation J-60 = janvier).
- **Bet 6** + **Bet 7** complets : pickup screen + tote scanning en routine.
- **Bet 8** : rôle auditor livré, premier audit AVS via Stock.
- **KPI cible** : démarque Toulouse de 1,4 % → 1,1 % (= 40 k€ récupérés mesurables sur 6 mois).

### Phase 2 — Multi-tenant deploy (Octobre → Décembre 2026)

Objectif : ouvrir Stock à 2-3 SARL Salamarket de la fédération.

- **Bet 3** validé en prod (2e SARL en onboarding).
- Setup-wizard tenant : SIRET, Cashmag credentials, premier dépôt, premiers employés, import catalogue (CSV ou scrape Cashmag).
- Doc onboarding self-serve.
- Cibles : **Gennevilliers** (358 abonnés IG = équipe déjà digital), **Bordeaux** (583 abonnés IG), **Marseille** (DHM 13).
- **KPI cible** : 3 SARL signées d'ici décembre 2026, **36 k€ ARR signed**.

### Phase 3 — Platform play (Q1 → Q2 2027)

Objectif : transformer Stock d'un produit interne en plateforme avec effets de réseau.

- **Bet 9** Loyalty fidélité fréquence (différencie sur la proximité Aya Market).
- **Bet 10** AI forecast fresh meat (mature avec 3 SARL = 10× data Toulouse seul).
- **Module Auditor portal** : AVS/ARGML peuvent se connecter à plusieurs SARL clientes en un seul login — devient un argument commercial pour les certificateurs eux-mêmes.
- **Supplier scorecard** : note chaque fournisseur sur ponctualité, qualité, taux de défaut, certif à jour. Mutualisé sur les SARL = pouvoir de négociation collectif.
- **Marketplace inter-SARL** : Toulouse a un surstock d'agneau post-Aïd → Marseille en manque → transfert auto-suggéré. Réseau Salamarket devient un mini-supply-chain mutualisé.
- **KPI cible** : 8-10 SARL signées, **120 k€ ARR**, NPS interne > 50.

---

## 6. Risk register

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| **Otmane veto si quelque chose casse l'encaissement** | Haute | Critique (mort produit) | Stock **n'écrit jamais dans Cashmag** avant Phase 1 complète. Tout passe par export NF525 quotidien (read-only). Push prix Cashmag uniquement après validation manuelle pendant 30 jours. |
| **Cashmag intégration coût/lock-in** | Moyenne | Élevé | Si pas d'API publique : scraper export NF525 quotidien (légal, le fichier appartient à K&A FOOD). Budget intégration : 2-3 sem dev + 1 sem QA. Si Cashmag change format → couche d'abstraction. |
| **Politique halal AVS vs ARGML** | Moyenne | Moyen | Ne **jamais** prendre parti dans le choix du certificateur. Schema neutre : `certifier_id` est un FK, pas un enum hard-codé. Onboarding chaque SARL choisit ses certificateurs. Précédent Isla Délice 2012 (AVS → ARGML) = ça arrive. |
| **Tech debt monorepo migration** | Moyenne | Moyen | Le monorepo `apps/drive` + `apps/stock` + `packages/shared` est déjà en place. Risque réel = duplication code (auth, types Supabase). Mitigation : factoriser `@salamarket/shared-auth` et `@salamarket/shared-types` **avant** la 2e SARL. |
| **Sodrune (entrepôt) zero info publique** | Haute | Moyen | Research #1 trou identifié — Sodrune n'est pas accessible WebSearch. Mitigation : entretien interne Otmane avant Phase 1 pour valider le modèle multi-dépôt (Particulier / Pro / Sodrune). |
| **Ramadan 1448 calé sur février-mars 2027** | Certaine | Élevé si on rate | Forecast Bet 4 doit être **shippé en janvier 2027** pour préparation J-60. Rétro-planning : déc 2026 = données 3 ans chargées, jan 2027 = modèle calibré, fév 2027 = en prod. |
| **NF525 self-cert deadline 2026-09-01** | Certaine | Bas (Cashmag s'en occupe) | Stock ne prend pas de paiement direct. Tant qu'on reste surcouche, la compliance NF525 reste sur Cashmag. **Ne pas inverser cette posture sans audit juridique préalable.** |
| **Concurrence : Cashmag/Lightspeed se réveillent sur le halal** | Faible | Moyen | Marché halal FR = 7-12 Md€, croissance 15 %/an. Si un éditeur générique vise le segment, notre moat = (1) vertical halal au lot, (2) hijri natif, (3) design partner K&A FOOD = 8 SARL captives. Délai d'avance estimé 18-24 mois. |
| **Démo June 10 échoue** | Faible | Élevé | Buffer J+10 pour répétition. Démo en local (pas en prod live, pas de Wi-Fi salle de réunion). Plan B : screencast pré-enregistré de chaque flow. Fallback : slides Figma uniquement. |

---

**TL;DR opérationnel.**
- 10 jours : DA port + lot traceability démo + DLC banner + pickup screen. C'est ce qui sort June 10.
- 3 mois : harden chez Toulouse, mesurer 40 k€ démarque récupérée.
- 6 mois : 3 SARL signées, multi-tenant prouvé, 36 k€ ARR.
- 12 mois : 8-10 SARL, 120 k€ ARR, plateforme avec effets de réseau (auditor portal, supplier scorecard, transferts inter-SARL).
- Moat : halal lot traceability + hijri forecast + AI shrinkage indépendant. Trois axes que ni Cashmag, ni Lightspeed, ni les concurrents halal FR ne shippent en 2026.
