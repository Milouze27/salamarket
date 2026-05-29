# Elevation plan — "ça doit choquer" / Salamarket Drive + Stock

**Date**: 2026-05-30
**Demo deadline**: 10 juin 2026 (12 jours)
**Audit method**: Live browser sweep (agent-browser) of both PWAs + code read
**Audit screenshots**: `docs/design/screenshots-2026-05-30/`

Brief: pousser Drive et Stock dans une zone où un visiteur Picnic / Linear / La Belle Vie dit *"attends, c'est qui ces gars ?"*. Pas du SaaS générique, pas du Carrefour froid, pas du folklore vert-or kitsch.

---

## 1. Current state — scores honnêtes (1 → 10)

### Drive (`salamarket-drive.vercel.app`)

| Axis | Score | Notes |
|---|---|---|
| Typography | **7** | Hero éditorial 01/02/03 + Plus Jakarta exploité jusqu'à `tracking-[-0.04em]`. Reste plat sur les sections sous le hero. |
| Color | **6** | Sapin + or installés. Aucune granularité par rayon. Pas de profondeur (1 niveau de sapin). |
| Spacing | **6** | Hero respire. Le rail catégories et la grille produits ont la même densité monotone. |
| Motion | **3** | Hover scale `1.05` sur image. Rien d'autre. Pas de transition route, pas de scroll-driven, pas de feedback "add to cart". |
| Density | **6** | Honnête mobile. Desktop sous-exploité, beaucoup de blanc neutre, peu de hiérarchie de tailles. |
| Hierarchy | **7** | Hero domine. Mais la section "Notre sélection" et la grille ont le même poids visuel. |
| Micro-interactions | **3** | Bouton + sur card = scale `0.98`. Skeleton ok. Rien de mémorable. |
| Branding | **6** | Sceau "Halal Certifié" rond top-right = vraie signature. Mais le reste du parcours oublie totalement la marque. |
| Mobile | **8** | StickyCartCTA + BottomNav pill cohérents, safe-area gérée, hero photo first sur mobile. |
| Onboarding | **5** | 3 slides "Vos produits halal de confiance / Suivant / Passer" = SaaS template. Aucune personnalité. |

**Drive moyenne : 5.7/10**. Solide base, pas mémorable.

### Stock (`salam-stock.vercel.app/v2`)

| Axis | Score | Notes |
|---|---|---|
| Typography | **7** | "Bonne nuit Otmane" + display weight + label-caps = personnalité. |
| Color | **5** | Palette sapin/or respectée dans le shell. Mais `ProductThumbnail` explose en arc-en-ciel sur la page Stock (bleu #4A90E2 surgelés, vert pomme frais, gris pour Boissons…). Wall-of-monograms illisible. |
| Spacing | **6** | Hero pad ok. Nav pill flottant chevauche le contenu utile (Transfert inter-dépôt coupé en deux, CTA "Finaliser & Capturer" overlap product row). |
| Motion | **3** | Aucune. Page transitions = blanche. Le FAB Assistant IA ne respire pas. |
| Density | **5** | Préparation kanban : 30 ordres empilés, même hauteur, zéro hiérarchie de priorité visuelle. |
| Hierarchy | **6** | Hero clair. Listings = mur. |
| Micro-interactions | **4** | Hover sur tiles. Sinon rien. |
| Branding | **6** | Login PIN = beau. Logo SALAM STOCK en monogramme jaune = signature. Le reste = SaaS générique. |
| Mobile | **8** | Tout pensé mobile. Bottom nav pill correct. |
| Realtime feel | **2** | Aucun indicateur live, pas de pulse, pas de "il y a 3 secondes", pas de spark line. C'est un POS sans **battement**. |

**Stock moyenne : 5.2/10**. Architecture saine, ambiance plate.

---

## 2. Target state — qu'est-ce qu'un 10/10 Salamarket ?

Un visiteur arrive et pense :

- **Drive** : "C'est *Aesop pour la viande halal*. Magazine. Confiance. Pas un Drive Carrefour, pas un Picnic vert pomme — c'est *Salamarket*."
- **Stock** : "C'est ce que tu obtiens si Linear + Tesla Service Mode + une vraie boucherie pensaient un outil pour un patron qui pilote 3 points de vente. Ça **vibre**. Tu vois que le système est *vivant*."

Trois piliers tenus partout :

1. **Sapin nuit + or unique + cream chaud**. Aucune couleur hors palette, jamais. Le sapin a 4 valeurs (`#082A20`, `#0E3B2E`, `#14523F`, `#1E6B53`), l'or 3 (`#A88314`, `#C9A227`, `#DDB31C`), point.
2. **Plus Jakarta Sans uniquement**, mais utilisé jusqu'au tracking `-0.05em` sur display et `+0.32em` sur eyebrows. La typo *est* l'ornement.
3. **Mouvement systématique mais discret** : tout transitionne (`200-360ms`, `ease-out-expo`). Rien ne bounce. Rien ne clignote. Mais rien n'est mort.

---

## 3. DRIVE — 7 mouvements de design qui choquent

### D1. Hero parallax + grain photo + or pulse sur le sceau Halal

**Pourquoi** : le sceau "Halal Certifié" rond est déjà ta meilleure signature. Faut le rendre **vivant**.

**Quoi** :
- Photo hero translate-Y `-12%` au scroll (CSS `transform` lié à `scroll-timeline` ou IntersectionObserver pour browsers sans support, jamais animer `top/margin`).
- Grain SVG 4% opacity superposé sur la photo (one inline SVG `<feTurbulence>`).
- Le ring or du sceau anime `opacity 0.45 → 0.75 → 0.45` sur 4.5s, infinite, `ease-in-out`. **C'est ton "live" indicator** — la marque respire.

**Fichier** : `apps/drive/src/components/EditorialIntro.tsx` lignes 83–86.

```diff
- <span aria-hidden className="absolute inset-[6px] rounded-full border-[1.5px] border-[#C9A227]/45" />
+ <span aria-hidden className="absolute inset-[6px] rounded-full border-[1.5px] border-[#C9A227]/45 animate-halal-pulse motion-reduce:animate-none" />
```

Dans `index.css` :
```css
@keyframes halal-pulse {
  0%, 100% { opacity: 0.45; transform: scale(1); }
  50%      { opacity: 0.78; transform: scale(1.04); }
}
.animate-halal-pulse { animation: halal-pulse 4.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
```

**Effort** : 30 min. **Demo** : oui.

---

### D2. Section "Notre sélection" en **scroll horizontal poster** (pas grille de 3)

**Pourquoi** : actuellement c'est 3 cards identiques. Picnic et La Belle Vie cassent ça avec une **lecture cinéma**.

**Quoi** : convertir `WeeklyPicks` en rail horizontal **scroll-snap-x mandatory**, 4-5 cards de tailles **asymétriques** (1 grande "héro produit du jour" 2x + cards normales), première card = portrait full-bleed avec overlay typographique (`text-[#C9A227]` "Pick #01" + nom produit en `text-[44px] font-extrabold tracking-[-0.03em]`), pas de prix collé — le prix arrive au hover/tap.

**Fichier** : `apps/drive/src/components/WeeklyPicks.tsx` (réécriture).

**Effort** : 2-3h. **Demo** : oui.

---

### D3. Tabs catégories — passage de pills à **rail typographique éditorial**

**Pourquoi** : `CategoryTabs` actuel = pills émoji + nom. C'est mignon, c'est SaaS-cute, ce n'est pas Salamarket.

**Quoi** :
```
01 · Boucherie    02 · Charcuterie    03 · Épicerie    ...
─────────────                                              ← underline or sous l'actif
```

- Numérotation tabulaire or `01..08`
- Nom rayon `text-[18px] font-bold tracking-[-0.015em]`
- Actif = underline or 2px qui slide (FLIP / shared layout) — utiliser `<motion.div layoutId="cat-underline">` (Framer Motion) ou pur CSS avec `transform: translateX()` calculé via `useState`.
- Sticky en haut quand on scroll, fond cream `backdrop-blur-md`.

**Fichier** : `apps/drive/src/components/CategoryTabs.tsx` (réécriture). Remove emoji array dans `brand.ts` ; remplacer par numérotation.

**Effort** : 2h. **Demo** : oui.

---

### D4. Add-to-cart : **flying chip** vers l'icône panier + haptic stagger

**Pourquoi** : aujourd'hui `+` clic → silence. L'utilisateur ne sait pas que ça a fonctionné autre que le compteur qui s'incrémente. C'est ce que tout le monde rate. Picnic le fait, Apple le fait.

**Quoi** : au clic sur `+`, créer un `<div>` cloné du thumbnail produit en position fixed, qui **vole** vers l'icône panier du header en ~420ms (`cubic-bezier(0.22, 0.61, 0.36, 1)`), arrive en shrinking à `0.2` scale, déclenche `vibrate(8)` sur mobile, et l'icône panier fait un `scale 1 → 1.18 → 1` court.

**Fichier** : `apps/drive/src/stores/cartStore.ts` + nouveau hook `useFlyToCart.ts` + intégration dans `ProductCard.tsx` lignes 22–29.

**Effort** : 3h. **Demo** : oui — c'est LE moment "wow" du parcours.

---

### D5. Footer-poster signature : **"Indépendant de Toulouse" en display massif**

**Pourquoi** : le footer actuel "Le supermarché halal indépendant de Toulouse" est en `text-base` discret. C'est la phrase qui dit *qui vous êtes*. Elle doit hurler en silence.

**Quoi** : un dernier bloc plein viewport (`h-[80svh] md:h-[60svh]`) sapin foncé `#082A20`, avec :
- Eyebrow or `K & A FOOD · DEPUIS 2018`
- Display `Indépendant.\nDe Toulouse.\nHalal.` en `text-[clamp(48px,12vw,180px)] font-extrabold leading-[0.86] tracking-[-0.05em] text-[#FAF7EE]` — le mot "Halal" passe en or.
- SIRET + adresse en `text-[11px] uppercase tracking-[0.3em]` en bas, label-caps.
- Pas de social, pas de "newsletter", pas de bullshit. Juste *la marque*.

**Fichier** : nouveau `apps/drive/src/components/EditorialFooter.tsx`, monté dans `Index.tsx` après la grille.

**Effort** : 1h. **Demo** : oui.

---

### D6. Onboarding remplacé par **1 seule slide poster**

**Pourquoi** : aujourd'hui 3 slides "Vos produits halal de confiance / Suivant / Passer" = template Calendly. *Skip*.

**Quoi** : 1 slide unique sapin nuit avec :
- Photo viande grande à droite (même slide-1-boucherie.webp)
- Texte gauche : eyebrow `BIENVENUE`, display `Le drive halal\nde Toulouse.`, body court `Click & collect 7j/7, préparé chaque matin avenue Larrieu-Thibaud.`, CTA pleine largeur or `[ Commencer ]`. Pas de "Suivant". Pas de pagination. Un seul écran, un seul CTA.

**Fichier** : `apps/drive/src/components/OnboardingFlow.tsx` (simplifier drastiquement).

**Effort** : 1h. **Demo** : oui.

---

### D7. Page produit — vignette `<ProductCard>` qui **shared-element transition** vers le detail

**Pourquoi** : Aujourd'hui clic produit → page blanche → contenu apparaît. C'est le moment où on voit que c'est une React app et non un produit polished.

**Quoi** : `view-transition-api` (Chrome/Edge/Safari 18+) avec `view-transition-name: product-${id}` sur le thumbnail card ET sur l'image du detail. Le navigateur cross-fade + scale automatiquement. Fallback : `framer-motion` `<motion.img layoutId>`. **Sur Safari iOS 18, ça ressemble à une app native** — c'est exactement le wow factor PWA.

**Fichier** : `apps/drive/src/components/ProductCard.tsx` + `apps/drive/src/pages/ProductDetail.tsx`. Une ligne CSS suffit avec view-transitions activées via `react-router` v7 `unstable_viewTransition`.

**Effort** : 3h (intégration router + fallback). **Demo** : oui sur iOS Safari et Chrome.

---

## 4. STOCK — 7 mouvements de design qui choquent

### S1. **Liquider** le mur d'arc-en-ciel — `ProductThumbnail` repensé

**Pourquoi** : la page `/v2/stock` est aujourd'hui un kaléidoscope (bleu, vert pomme, rouge bordeaux, jaune, gris, sapin) qui blesse les yeux et n'est pas Salamarket.

**Quoi** : réduire `CATEGORY_COLOR` à **4 valeurs** dans la palette officielle uniquement :

```ts
const CATEGORY_COLOR: Record<string, string> = {
  Boucherie: "#082A20",        // sapin nuit
  Charcuterie: "#082A20",
  Frais: "#0E3B2E",            // sapin
  Épicerie: "#C9A227",         // or
  "Épicerie sèche": "#C9A227",
  Surgelés: "#14523F",         // sapin clair
  "Fruits & Légumes": "#14523F",
  Maghreb: "#0E3B2E",
  Conserves: "#C9A227",
  Boissons: "#1E6B53",         // sapin pâle
  Hygiène: "#1E6B53",
  Traiteur: "#082A20",
  Autre: "#1E6B53",
};
```

Et : ajouter un **filet or 1px** en bas de chaque tile pour rythmer le mur. Texte initial passe en `font-extrabold tracking-[-0.04em]` Plus Jakarta (pas serif). Le résultat : une page qui ressemble à un mur de **livres reliés** plutôt qu'à une garderie.

**Fichier** : `apps/stock/components/v2/ProductThumbnail.tsx` lignes 22–39.

**Effort** : 20 min. **Demo** : oui.

---

### S2. ⌘K **Command palette** Linear-grade

**Pourquoi** : Otmane pilote 3 dépôts. Naviguer en tap = lent. ⌘K = "j'ai le contrôle total".

**Quoi** : composant `<CommandPalette>` global, ouvre sur `⌘K` / `Ctrl+K` / **long-press sur le logo SALAM STOCK**, lib `cmdk` (déjà standard React, ~3kb). Actions :
- Naviguer (préparation, stock, admin, alertes DLC, lots, étiquettes…)
- Switcher dépôt (Particulier → Pro → Labo)
- Rechercher produit par nom/EAN
- Actions rapides (Nouvelle réception, Déclarer sortie, Nouveau lot)
- Switch user (PIN re-prompt)

**Fichier** : nouveau `apps/stock/components/v2/CommandPalette.tsx`, monté dans `V2Shell.tsx`. Ajouter `cmdk` à `apps/stock/package.json`.

**Effort** : 4h. **Demo** : oui — *la* feature qui te démarque de Cashmag.

---

### S3. **Tabular-nums + sparklines + live pulse** sur les KPI

**Pourquoi** : Stripe Dashboard et Linear donnent à chaque chiffre un poids. Stock = nombres partout, mais ils sont tous flat.

**Quoi** sur chaque KPI card (dashboard global, alertes DLC, préparation count) :
1. `font-variant-numeric: tabular-nums` partout sur les nombres (existe déjà via `.tabular`, l'appliquer systématiquement).
2. Sparkline inline 60×16px en SVG **sapin** sous chaque nombre principal (7 derniers jours). Pas de lib, 20 lignes de code.
3. Delta jour-J-1 en `text-[11px]` avec arrow ▲▼ et tabular-nums (`+12.4%` en `text-[#2D7A4F]`, `-3.1%` en `text-[#E5483D]`).
4. Sur les cards "live" (préparation en cours, stock temps réel) : un **micro point or 6px** qui pulse `opacity 0.4 → 1 → 0.4` toutes les 2.4s à côté du label "EN COURS". *C'est le battement de l'app*.

**Fichier** : nouveau `apps/stock/components/v2/Sparkline.tsx`, nouveau `LiveDot.tsx`. Appliqués dans dashboard global et préparation kanban.

**Effort** : 3h. **Demo** : oui.

---

### S4. **"Mode atelier nuit"** — dark theme déclenché par horaire ou toggle

**Pourquoi** : Otmane et l'équipe ferment à 19h30. À partir de 18h le commerce baisse les rideaux, lumière jaune chaude. Un staff app sapin-clair en cream à 19h45 = douleur rétinienne.

**Quoi** : `--theme-night` activé :
- automatiquement entre 19h00 et 7h00 locaux (Toulouse),
- OU manuellement via toggle dans header menu,
- bg passe à `#0A1F18` (sapin abyssal), surfaces `#0E2A20`, text `#E8E4D8`, l'or `#C9A227` devient `#DDB31C` (un cran plus brillant pour compenser), bordures `#1A3528`.
- Les ProductThumbnail tiles inversent : background or sur frais/épicerie, sapin clair sur boucherie.
- Transition `300ms ease-out` sur toutes les surfaces.

**Fichier** : `apps/stock/app/globals.css` (ajout `[data-theme="night"] :root` block), nouveau `apps/stock/components/v2/ThemeToggle.tsx`, intégration dans `V2Shell.tsx`. Persister dans `localStorage`.

**Effort** : 4-5h (tester contraste WCAG sur tous les écrans). **Demo** : oui — *le* moment qui fait dire "ils ont pensé à ça".

---

### S5. Kanban préparation **prioritisé visuellement** — retrait imminent qui pulse

**Pourquoi** : aujourd'hui les 30 ordres en attente sont identiques. Otmane ne voit pas que `DRV-2026-0001` est à retirer dans 14 min, et `DRV-2026-43856` est dans 3h.

**Quoi** :
- **3 tiers visuels** : `< 30min` = card surlignée or `bg-[#F4E9C4]` + or pulse + heure rouge `text-[#E5483D]`; `< 2h` = card normale + heure or; `> 2h` = card grisée `opacity-70` jusqu'au survol.
- Tri par urgence par défaut (par retrait croissant), pas par création.
- Le compteur "À PRÉPARER" en haut affiche aussi `urgent: 3` en or à côté.
- Sticky bar en haut quand on scroll : "**3 retraits dans moins de 30 min**" cliquable.

**Fichier** : `apps/stock/app/v2/preparation/page.tsx` + composant card.

**Effort** : 3h. **Demo** : oui — direct ROI opérationnel pour Otmane.

---

### S6. **Density toggle** Confort ↔ Compact dans Stock

**Pourquoi** : sur la page `/v2/stock`, 46 produits monogrammes = 46 cards de 96px. En compact (Linear-style), 46 lignes de 36px tiennent en un écran.

**Quoi** : toggle dans le header `[ ▦ Confort | ☰ Compact ]`. En compact :
- Liste tableau dense : thumbnail 32×32 + nom + catégorie pill + stock tabular-nums + DLC tabular-nums + actions hover.
- Sticky header colonnes.
- Toujours Plus Jakarta, jamais monospace pour les noms ; monospace UNIQUEMENT pour les nombres (`.mono` class déjà en place dans globals).
- Persister choix dans `localStorage`.

**Fichier** : `apps/stock/app/v2/stock/page.tsx` + nouveau `apps/stock/components/v2/DensityToggle.tsx`.

**Effort** : 4h. **Demo** : oui.

---

### S7. **Page 404 réutilisée** comme template d'écran sapin pour toutes les transitions / loadings critiques

**Pourquoi** : la 404 actuelle (sapin block + display "Page non trouvée") est **plus belle que la moitié de l'app**. C'est ton header poster. Réutilise-le.

**Quoi** : extraire le composant en `<HeroBlock variant="sapin" eyebrow=... title=... body=...>` et l'utiliser pour :
- Splash de transition entre flows (Nouvelle réception → Scan en cours → Validation),
- État "En attente" sur préparation quand 0 commande,
- Header de l'admin dashboard (au lieu de la barre verte fine actuelle qui coupe l'écran en deux).

**Fichier** : nouveau `apps/stock/components/v2/HeroBlock.tsx`, refacto de l'AppShell pour l'accueillir.

**Effort** : 2h. **Demo** : oui.

---

## 5. Croisé Drive + Stock — 3 fixes UX bottom-nav (CLAUDE.md / mémoire user)

Le user a une règle persistante : **la nav bottom ne doit JAMAIS cacher du contenu utile**.

Constaté à l'audit :
- **Stock home** : nav pill flottant coupe la card "Transfert inter-dépôt" en deux (visible sur `stock-02-home.png`).
- **Stock préparation detail** : le CTA "FINALISER & CAPTURER 29.20€" overlap la card produit "Glace Magnum Classic x4" (`stock-08-prep-detail.png`).
- **Drive** : `StickyCartCTA` correctement padded (`pb-[150px]`) — OK.

**Fix** : augmenter `--nav-breathing` à `64px` dans `apps/stock/app/globals.css` et appliquer `pb-nav-stack` sur le main de chaque route v2. **Coût** : 10 min. **Demo** : oui, obligatoire.

---

## 6. Skip — ce qu'il ne FAUT PAS faire

| Tentation | Pourquoi non |
|---|---|
| **Ajouter un serif décoratif** (Fraunces, EB Garamond, Cormorant) "pour faire premium" | Mémoire user explicite : Plus Jakarta only. Sapin + or + display weight font le job. |
| **Motifs géométriques arabesques / arabesques décoratives en fond** | Kitsch halal-bling. Otmane est opérateur commerçant, pas calligraphe. La rigueur sapin/or vaut mille mosaïques. |
| **Glassmorphism / blur cards** "modernes" | Loi impeccable absolue. À éviter sauf cas extrême (badge "Toulouse" top-left du hero est justifiable, c'est la seule exception). |
| **Side-stripe borders** (bordure colorée 4px à gauche des cards d'alerte) | Loi impeccable absolue. Préférer fond tinté + leading icon. |
| **Gradient text** (sapin → or sur le titre hero) | Loi impeccable absolue. Le mot "halal" en or solide, le reste en sapin solide — c'est plus fort. |
| **Particules dorées / confettis** au add-to-cart | Tentant, mais → kitsch. Le **flying chip** (D4) est plus élégant et utile. |
| **Mode "Ramadan auto"** avec lune et croissant | Trop folklorique. Si on veut un moment Ramadan, c'est un *banner éditorial* discret avec une vraie offre (préparation matin avant aube), pas une décoration. |
| **Animer la couleur d'arrière-plan** des sections (gradients smooth qui scroll) | Onéreux en CPU, monotone. Préférer scroll-driven `transform` et `opacity` sur images / blocs. |
| **Empty states "drôles"** ("Ouille, votre panier est triste !") | Reste sobre. "Votre panier est vide" + lien catalogue = juste. Ajoute juste un visuel de qualité (illustration sapin minimaliste ou rien). |
| **Skeleton avec shimmer animé blanc**| Plat. Préférer skeleton statique avec léger tint `#E8E4D8` qui breathe (`opacity 0.6 → 1 → 0.6` sur 2.4s). |

---

## 7. Sous-ensemble shippable pour la démo du 10 juin

**12 jours dispo, ~2 jours dev par mouvement budget réaliste**. Priorité absolue, ordre d'attaque :

### Jour 1-2 (sprint démarrage — quick wins esthétiques)

1. **D1** — Halal pulse sur le sceau (30 min)
2. **D5** — Editorial footer "Indépendant de Toulouse" (1h)
3. **D6** — Onboarding 1 slide (1h)
4. **S1** — ProductThumbnail désaturation (20 min)
5. **S7** — HeroBlock extrait et réutilisé (2h)
6. **Croisé** — Fix nav bottom overlap (10 min)

**Résultat fin jour 2** : Drive et Stock cohérents, plus aucun arc-en-ciel, le footer Drive frappe, hero Stock partout.

### Jour 3-5 (les vraies mouvements)

7. **D3** — CategoryTabs rail éditorial (2h)
8. **D4** — Flying chip add-to-cart + haptic (3h)
9. **D7** — View transitions produit (3h)
10. **S3** — Tabular-nums + sparklines + live pulse (3h)
11. **S5** — Kanban prioritisé (3h)

**Résultat fin jour 5** : Drive sent native, Stock vibre.

### Jour 6-8 (les wow features)

12. **S2** — Command palette ⌘K (4h)
13. **S4** — Mode atelier nuit auto (4-5h)
14. **D2** — WeeklyPicks rail horizontal (2-3h)
15. **S6** — Density toggle (4h)

**Résultat fin jour 8** : la démo a 4 moments mémorables (flying chip Drive, view transitions Drive, ⌘K Stock, atelier nuit Stock).

### Jour 9-12 (polish + tests)

- Polish responsive
- Pass a11y (focus rings, contrast, motion-reduce)
- Pass Lighthouse perf
- Préparer 3 scénarios de demo : *"Otmane à 7h ouvre l'app"*, *"Client commande viande à 18h45"*, *"Manager Otmane consulte dashboard depuis salon à 22h"*

### Roadmap post-démo (pas pour le 10 juin)

- **Drive** : page produit en 3D, theme switcher Ramadan, scroll-driven scenes home, image generation hero saisonnière
- **Stock** : keyboard shortcuts overlay (?), inventory diff visualisé, lot-bay heat map, vidéo timelapse réception, integration push notifs visuels (toast custom)

---

## 8. Ressources / références à garder ouvertes pendant l'implémentation

- **Linear** (motion + ⌘K + density) — observer la transition page-to-page et le tabular-nums sur tous les counts.
- **Vercel dashboard** (sparklines, deltas, empty states sober) — voir les graphiques inline et les "no deployments yet" sobres.
- **Picnic** (flying chip add-to-cart, vert primary réussi sans être Whole Foods) — le détail de l'animation cart count.
- **La Belle Vie** (premium grocery French, typo serif évitée chez nous mais hierarchy à étudier) — les sections "Du marché" en hero magazine.
- **Arc Browser** (chrome osé + or-touch sur les pinned tabs) — référence pour les *touches* or, pas pour tout copier.
- **Stripe Dashboard** (numbers, deltas, tabular partout) — chaque chiffre a poids, jamais flat.

---

## 9. Mesure du résultat

Pour dire que les "scores" ont bougé après implémentation, refaire la sweep agent-browser le 9 juin et noter :

- [ ] Drive : moyenne ≥ 8.5/10
- [ ] Stock : moyenne ≥ 8.5/10
- [ ] Aucune couleur hors palette sapin/or/cream/neutres (audit visuel screenshot)
- [ ] Tous les nombres en tabular-nums (audit code grep)
- [ ] Aucun bottom-nav overlap (audit screenshot)
- [ ] Au moins 3 micro-interactions mémorables (flying chip, halal pulse, ⌘K)
- [ ] Mode atelier nuit fonctionnel et auto-trigger 19h

Si on y est : la démo du 10 juin est **un moment**.
