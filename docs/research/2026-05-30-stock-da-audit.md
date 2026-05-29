# Stock DA audit — alignement éditorial sur Drive

**Date :** 2026-05-30
**Auteur :** Audit visuel (senior UI/UX designer)
**Sources visuelles :** `/Users/mac/salamarket/docs/research/audit-screenshots/`
**Sources tokens :** `apps/drive/src/config/brand.ts`, `apps/stock/app/globals.css`

## TL;DR

Stock et Drive partagent **déjà** la palette (Sapin `#0E3B2E`, Or `#C9A227`, Cream `#FAF7EE`), la typo Plus Jakarta Sans, et le langage des cards arrondies. La marche éditoriale de Drive vient surtout de **quatre choses** que Stock n'applique pas encore :

1. **Une typographie display géante** (h1 ~60–72 px avec accent gold sur un mot), pas la h1 28–32 px de Stock.
2. **Des "tiles produit" colorées plein-aplat** (carte sapin avec titre or géant) là où Stock met une image ou un placeholder textuel 2-lettres.
3. **Une grille éditoriale 2-up / 3-up** avec hiérarchie marquée (1 hero + 2 secondaires), pas la liste verticale uniforme de Stock.
4. **Une mise en scène des sections** : eyebrow `LABEL CAPS` → titre display → métadonnée droite → bouton outline. Toujours le même rythme.

Stock est *propre* mais reste sur un registre **dashboard admin**. Pour passer en *registre éditorial staff*, il faut **monter l'échelle typographique**, **densifier la couleur** sur les cards d'action, et **introduire un rythme** (eyebrow / display / metadata) sur chaque écran.

---

## 1. Drive — pattern library du "premium éditorial"

### 1.1 Palette en service

| Token | Hex | Usage Drive |
|---|---|---|
| `--primary-green` | `#0E3B2E` | Header bar, tiles produit pleine couleur, CTA primaires, footer |
| `--accent-gold` | `#C9A227` | Titre display dans les tiles vertes ("Brochettes", "Kefta"), badges, mot accentué dans h1 |
| `--bg-cream` | `#FAF7EE` | Fond global (jamais blanc pur — c'est la signature) |
| `--bg-card` | `#FFFFFF` | Cards produit avec photo |
| Vert chair (tile spéciale) | ~#86A867 | Brochettes hero, Poulet — tiles "tag de saison" |

**Pattern clé Drive : la tile sans image.** Quand le produit n'a pas de photo ou qu'on veut une accent éditorial, on remplace l'image par un **carré sapin plein** avec le nom du produit **en or, font-weight 700, ~28–32 px**. Crée du rythme dans la grille et économise des photos.

### 1.2 Typographie display

Drive utilise une échelle **plus haute** que ce qu'on attend d'un e-commerce :

- **Hero h1** : ~56–64 px, line-height ~1.05, letter-spacing −0.02em, **un mot en or** ("Votre supermarché halal, en *click&collect*."). C'est le seul mot or — discipline.
- **Section h2** : ~32–40 px, weight 600, point final inclus ("Notre sélection."). Le point final est **signature éditoriale** (style magazine).
- **Eyebrow** : `01 / 02 / 03` ou `LABEL CAPS 11 px tracking 0.08em` au-dessus de chaque section. Numérotation = ton "magazine".
- **Product card title** : 14–16 px regular, **sous-titré par le prix en bold** sur la même hauteur.

Stock fait du `28 px → 32 px` pour h1 (`globals.css` ligne 107–113). C'est **deux paliers en dessous** de Drive.

### 1.3 Spacing et rythme

- **Section padding vertical** : ~64–96 px entre blocs. Stock est à 24–32 px.
- **Card padding interne** : 16–20 px sur photo card, **32 px** sur tile pleine couleur.
- **Grid gap** : 12 px sur la sélection, 8–12 px sur la grille produit dense. Drive ne serre pas sa grille → respire.
- **CTA pill** : padding horizontal 24–32 px, hauteur 48 px, full-rounded (border-radius 999px).

### 1.4 Micro-interactions et finitions

- **Badge "Boucherie de la semaine"** : pill or pâle sur tile sombre, top-left absolute.
- **Add-to-cart bouton flottant** : rond vert plein, **+** blanc, ancré bottom-right de chaque card. Pas de "Ajouter au panier" verbeux — l'icône suffit dans la grille.
- **Hover** sur card : translateY(−2px) + shadow `0 4px 20px rgba(14,59,46,0.10)` (déjà dans `globals.css` Stock).
- **Onboarding overlay 01/02/03** au premier load — vrai storytelling, pas un tooltip.
- **Header sapin pleine largeur** avec barre or sous le logo. Recherche en bloc cream sous le header sapin = double-fond signature.

### 1.5 Patterns CSS à porter

```css
/* Hero h1 éditorial Drive */
.hero-display {
  font-size: clamp(40px, 8vw, 64px);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.02em;
}
.hero-display em {            /* mot accentué */
  font-style: normal;
  color: var(--accent-gold);
}

/* Section title style "magazine" */
.section-title {
  font-size: clamp(28px, 4vw, 40px);
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.15;
}
.section-title::after { content: "."; }  /* point final éditorial */

/* Tile produit pleine couleur (remplace image) */
.product-tile-solid {
  background: var(--primary-green);
  border-radius: 16px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  padding: 24px;
  color: var(--accent-gold);
  font-size: clamp(22px, 3.5vw, 32px);
  font-weight: 700;
  text-align: center;
  letter-spacing: -0.01em;
}

/* Eyebrow numéroté "01 / 02 / 03" style */
.eyebrow-num {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-gold);
  letter-spacing: 0.04em;
}
```

---

## 2. Stock — état actuel page par page

### 2.1 `/v2/login` — PIN screen

**Captures :** `stock-02-pin.png`

**Ce qui marche** : badge "S" or, eyebrow `SALAM STOCK`, h1 "Code PIN" en sapin sur cream, mention "Multi-dépôts · Toulouse" — déjà éditorial.

**Ce qui manque vs Drive** :
- Le bloc sapin haut s'arrête net en bas — Drive enchaîne avec un *seamless transition* (radial gradient or qui fade). Stock a déjà un halo or top-right mais pas de transition basse.
- Les 4 cases du PIN sont **trop petites et trop espacées** par rapport à la grandeur du h1. Drive grossirait les cases (taille comparable à h2) avec un focus state animé.
- Pas de "01" eyebrow numéroté (alors que c'est *étape 1 sur 1*, on pourrait jouer la carte éditoriale même ici).

### 2.2 `/v2` — accueil staff

**Captures :** `stock-03-after-login.png`

**Ce qui marche** : eyebrow `· DÉPÔT ACTIF · PARTICULIER`, h1 "Bonne nuit Otmane" avec **prénom en or** (parfait alignement avec Drive). Les 4 cards d'action principales sont propres.

**Problèmes :**
- **Bottom nav recouvre la 3ème card "Transfert inter-dépôt"** → contradiction avec la règle bottom-nav-no-overlap. Le `--nav-breathing: 48px` n'est apparemment pas appliqué ici.
- Les **4 grandes cards** sont toutes blanches identiques. Drive donnerait du **rythme** : la 1ère en sapin plein avec icône or, les autres en surface blanche. Actuellement seul l'icône change de couleur (vert / rouge / or / vert foncé) — pas assez fort.
- Section `ESPACE MANAGER` : le titre est sur une seule ligne `· ESPACE MANAGER` minuscule. Drive utiliserait `02 — ESPACE MANAGER` plus généreux + une rule horizontale or fine.
- La card "Dashboard global" est sapin avec gradient — c'est excellent et c'est exactement le pattern Drive. À répliquer sur la card principale du bloc supérieur.

### 2.3 `/v2/preparation` — Kanban

**Captures :** `stock-04-preparation.png`

**Ce qui marche** : pills "Kanban / Batch Pick" en sapin foncé, badge "TEMPS RÉEL" en or pâle, eyebrow `PRÉPARATION DRIVE`, h1 "Kanban des commandes" — registre cohérent.

**Problèmes :**
- **Densité textuelle excessive** : chaque ligne commande affiche "DRV-2024-XXXX / nom client / N produits / heure / boutons". 30+ items empilés visuellement identiques → fatigue oculaire. Drive ne ferait jamais empiler 30 cartes identiques sans **alternance** (couleur de section, séparateur typographique fort tous les 5).
- Les sections (`À PRÉPARER` / `EN PRÉPARATION` / `PRÊTES AU RETRAIT`) sont annoncées par un mini-titre qui se perd. Manque l'eyebrow numéroté Drive `01 — À PRÉPARER · 12 commandes` avec un compteur or à droite.
- Le bouton "Avancer" répété 30× est **vert plein partout** : il faut graduer (outline pour "À préparer", plein pour "En cours", or pour "Finaliser"). C'est de la sémantique visuelle, pas un changement fonctionnel.

### 2.4 `/v2/preparation/[id]` — détail commande (Batch Pick view captured)

**Captures :** `stock-04b-batch-pick.png`, `stock-09-prep-detail.png`

**Ce qui marche** : header sapin avec ligne or sous le logo (signature Drive), h1 "SM-2026-0001" en mono-style éditorial avec sous-titre client + horaire retrait. Le bouton "Scanner le produit collecté" en sapin plein-largeur est très bien.

**Problèmes :**
- **CTA flottant bottom "FINALISER & CAPTURER 29.20 €"** : recouvre la 2ème card produit ("Glace Magnum") → encore l'overlap bottom-nav. Le CTA flottant doit pousser le contenu avec `padding-bottom`.
- Les **badges produit (2 lettres "CD/GM/CM/OP")** sont colorés par catégorie — bonne idée — mais leur **taille est trop modeste** (~48×48) par rapport au titre produit. Drive grossirait à 64–72 px et passerait le 2-lettres en or sur fond couleur (réutilise le pattern tile-solid).
- "Manquant" badge rouge est sympa mais isolé. Pas de **count en haut** ("4 produits · 4 manquants").

### 2.5 `/v2/stock` — grille produit

**Captures :** `stock-05-stock-grid.png`

**Ce qui marche** : c'est l'écran le plus proche du langage Drive. Tiles 2-lettres colorées par catégorie (rouge boucherie, vert frais, or épicerie, jaune fromage, etc.) — exactement le pattern `product-tile-solid` de Drive.

**Problèmes :**
- Les **2 lettres** sont en blanc/cream. Drive met **en or sur sapin** — plus iconique. Adapter : sur tile sapin → or, sur tile couleur → blanc, mais avec **font weight 700 et taille +25%**.
- L'eyebrow `· STOCK` + h1 "46 produits" est correct mais le sous-titre "Catalogue du dépôt Particulier" est gris faible. Drive le passerait en `LABEL CAPS` séparé.
- Les pills filtres (`Tous / Boissons / Boucherie / Charcuterie / Frais`) sont **trop discrètes** et coupées en haut. Manque le scroll horizontal stylé de Drive avec gradient fade gauche/droite et active-state sapin plein.
- **Le bottom nav recouvre la barre de filtres** au scroll initial → encore le problème d'overlap.

### 2.6 `/v2/admin` — dashboard manager

**Captures :** `stock-06-admin.png`

**Ce qui marche** : eyebrow `· DASHBOARD GLOBAL`, h1 "Bonjour Otmane" (cohérent), bloc "Activité du jour" avec mini-graph, tableaux KPI par dépôt.

**Problèmes :**
- **Trop de couleurs alertes** côte à côte (rouge "Manque", rouge alertes, rose "Inventaire", vert "Stable"). On perd la hiérarchie. Drive ferait une **alerte primaire** (la plus grande, en sapin avec accent or) et les autres en outline subtle.
- Les cards KPI "Particulier / Professionnel / Saidune" sont **toutes identiques visuellement** alors qu'une est verte (Saidune)— mais on ne sait pas pourquoi. Manque un système de **hiérarchie visuelle** : carte la plus active = sapin plein, autres = blanc + bordure or.
- Le bloc "Communication & notifs" empile des cards verbatim. Drive grouperait sous un seul titre `04 — COMMUNICATION` et utiliserait un layout 2-col avec icône or à gauche.
- Le bloc bas "Reçu le ven 8 SM-001" est vert pâle — bien. Mais le contraste texte est faible et le formatage est en monospace simulé sans tabular-nums.

### 2.7 `/v2/sortie` — déclaration sortie

**Captures :** `stock-07-sortie.png`

**Ce qui marche** : header sapin avec **barre rouge** sous le logo (sémantique forte : sortie = destructif). Eyebrow `DÉCLARER UNE SORTIE` en rouge. h1 "Sortie de stock". Sous-titre AI mentionné.

**Problèmes :**
- Le **CTA flottant bottom "DÉCLARER LA SORTIE · Choisir un produit"** est en rouge pâle/désactivé — bien — mais **collé au viewport sans breathing**. Drive laisserait 16–24 px de cream visible sous le CTA même au repos.
- "Scanner le produit" est en sapin et "Rechercher par nom" en outline cream — bonne hiérarchie. Mais ils sont **collés** verticalement, sans espace pour respirer.
- Manque un **bloc de contexte** "Pourquoi déclarer une sortie ?" ou "Tes 3 dernières sortie" pour briser la verticalité tunnel. Drive ne laisse jamais un écran avec 2 boutons seuls + CTA bottom.

### 2.8 `/v2/reception` — hub réception

**Captures :** `stock-08-reception.png`

**Ce qui marche** : header sapin + barre rouge (cohérent destructif/entrée), eyebrow `RÉCEPTION FOURNISSEUR`, h1 "Nouvelle réception". Liste BDL avec progress bar **vert sapin** = très bien.

**Problèmes :**
- Les **icônes "play" or pâle** dans des disques cream à gauche de chaque BDL sont **bonnes** mais perdues : pas de variation entre BDL en cours (134/178) et BDL non démarré (0/115). Drive ferait : démarré = icône or plein, non démarré = icône outline.
- Le compteur `LIVRAISONS EN COURS · 4` est minuscule. Devrait être l'eyebrow numéroté `01 — LIVRAISONS EN COURS · 4` plus généreux.
- Le **bloc "LIVRAISONS ATTENDUES AUJOURD'HUI"** est vide (état empty) avec icône camion grise. Bien fait, mais Drive ajouterait un **CTA secondaire** "Ajouter une livraison attendue" en outline or pour ne pas laisser un trou mort.
- Le bloc "RÉCEPTION LIBRE" en bas avec carte unique "Livraison surprise" est isolé visuellement. Manque un séparateur typographique fort (`02 — RÉCEPTION LIBRE`).

---

## 3. Gap analysis — deltas concrets

| Dimension | Drive | Stock actuel | Action |
|---|---|---|---|
| **Échelle h1** | 56–64 px, line-height 1.05 | 28–32 px (`globals.css` h1) | Créer `.h1-display: clamp(40px, 8vw, 64px)` pour les écrans landing (home, login, hubs). Garder h1 28–32 px pour les détails. |
| **Mot accentué en or** | Systématique sur h1 ("Otmane" est déjà fait sur `/v2`) | Présent sur home, absent sur préparation/réception/sortie | Standardiser : *chaque h1 a UN mot en or*. Pour "Kanban des commandes" → "*Kanban* des commandes". Pour "Nouvelle réception" → "Nouvelle *réception*". |
| **Eyebrow numéroté** | `01 / 02 / 03` style éditorial | `LABEL CAPS` simple sans chiffre | Introduire `.eyebrow-num` avec compteur tabular-nums. Numéroter les sections de chaque page (`01 — À PRÉPARER`, `02 — EN PRÉPARATION`). |
| **Point final éditorial** | "Notre sélection." | "Kanban des commandes" sans point | Ajouter le point final sur les h1/h2 éditoriaux (hubs, landing). Pas sur les écrans transactionnels. |
| **Tile produit pleine couleur** | Carré sapin avec titre or, signature visuelle | Présent sur `/v2/stock` mais avec lettres blanches | Passer les 2-lettres en or sur tile sapin, blanc sur tile couleur. Grossir police +25%. |
| **Spacing section** | 64–96 px entre blocs | 24–32 px | Augmenter `space-y` entre sections sur les hubs (admin, accueil, preparation kanban). |
| **CTA flottant breathing** | Drive ne fait pas de CTA flottant qui mord le contenu | Mord systématiquement (overlap nav) | Ajouter `pb-[calc(var(--cta-height)+var(--nav-breathing))]` au container quand CTA flottant présent. C'est dans `globals.css` mais pas appliqué partout. |
| **Filtres pills horizontaux** | Scroll horizontal avec gradient fade + active-state sapin plein | Pills statiques wrap | Convertir en scroll-x avec snap, active-state sapin plein, gradient fade gauche/droite. |
| **Bouton "Add to cart" rond** | Disque vert plein avec `+` blanc | "Avancer" texte plein 80px | Sur les cards produit Stock, garder du texte (staff a besoin du verbe) mais ajouter une icône or à gauche pour breaking. |
| **Onboarding storytelling** | Overlay 01/02/03 au premier load | Aucun | Optionnel : ajouter un onboarding **PIN-screen unique** "Première fois ?" qui présente les 3 actions principales. |
| **Header sapin pleine largeur + barre or** | Présent | Présent (parfait) mais barre **rouge sur sortie/réception** = bon contraste sémantique | Garder. Document tier ce code couleur (or = neutre, rouge = sortie/réception, vert = entrée). |
| **Footer éditorial** | "Le supermarché halal indépendant de Toulouse." en sapin avec or | Absent (juste "Salam Stock V2 · multi-dépôts Toulouse" minuscule centré) | Ajouter un footer éditorial cohérent avec Drive : sapin plein-largeur, h2 "Le back-office de Salamarket." + mention version + lien support. |

---

## 4. Plan de portage component par component

Pour chaque écran Stock, voici **ce qu'il faut changer pour atteindre le niveau Drive** (purement DA, zéro changement fonctionnel).

### `/v2/login`
- Agrandir les 4 cases PIN (taille = h2). Active-state : bordure or 2px + scale(1.05).
- Ajouter une transition radial-gradient or top-right qui fade vers le bas du bloc sapin.
- Eyebrow : `01 — IDENTIFICATION` avec compteur tabular.
- Point final éditorial : "Code PIN." (assumé éditorial).

### `/v2` (accueil staff)
- **Promouvoir la 1ère card "Nouvelle réception"** en sapin plein (comme "Dashboard global" en bas) avec icône or géant et flèche or.
- Espacer `space-y-3` → `space-y-4` entre cards d'action.
- Padding bottom container = `calc(var(--nav-height) + var(--nav-breathing))` pour ne plus jamais couper la 3ème card.
- Eyebrow section : `02 — ESPACE MANAGER` avec rule horizontale or 1px à 80% width.
- h1 : déjà parfait avec "Otmane" en or.

### `/v2/preparation` (Kanban)
- h1 → "*Kanban* des commandes." (Kanban en or, point final).
- Section headers : `01 — À PRÉPARER · 12` / `02 — EN PRÉPARATION · 6` / `03 — PRÊTES AU RETRAIT · 4` avec compteur or à droite.
- Bouton "Avancer" : graduer (outline pour À préparer, plein pour En préparation, **or** pour Prêtes au retrait).
- Espacer les commandes en `space-y-2` au lieu de `space-y-1`.
- Ajouter une **rule horizontale or** entre les 3 sections (pas un border-top gris).

### `/v2/preparation/[id]`
- Grossir les badges 2-lettres à 64×64, font 24px, couleur or sur sapin.
- Pousser le contenu de `pb-[calc(var(--cta-height)+24px)]` quand CTA flottant présent.
- Ajouter eyebrow numéroté sur chaque zone : `01 — ZONE PARTICULIER · 4 produits` (déjà là, mais petit — agrandir).
- Le bloc h1 mono "SM-2026-0001" pourrait passer en **font display géant** (40 px) avec le numéro en or sous "PRÉPARATION".

### `/v2/stock`
- Tiles 2-lettres : passer le texte en **or sur sapin**, blanc sur tile couleur. Font +25%.
- Eyebrow : `· STOCK` → `01 — CATALOGUE DÉPÔT · PARTICULIER`.
- h1 "46 produits" → "*46* produits dans ton dépôt." (chiffre en or).
- Pills filtres : scroll-x + gradient fade gauche/droite + active-state sapin plein.
- Grille : passer le gap de `gap-2` à `gap-3` pour la respiration.

### `/v2/admin`
- h1 "Bonjour Otmane" — parfait (Otmane en or).
- Section `ALERTES & CONTRÔLES` : promouvoir l'alerte la plus grave en card sapin plein avec icône or, mettre les 2 autres en outline subtle.
- Tableaux KPI 3 dépôts : graduer (le dépôt principal en sapin plein, les 2 autres en surface blanche outline or).
- Bloc Communication : eyebrow `04 — COMMUNICATION & NOTIFS` + layout 2-col.
- Footer page : ajouter un message éditorial "Vue d'ensemble des 3 dépôts · Mise à jour temps réel."

### `/v2/sortie`
- h1 "Sortie de *stock*." (mot en or, point final).
- Ajouter un bloc contexte sous le h1 : "Tes 3 dernières sorties" en mini-list horizontale ou un visuel de réassurance.
- CTA flottant : padding-bottom container = `var(--cta-height) + 24px`.
- Eyebrow `PRODUIT` en `LABEL CAPS` est trop petit — passer à 12 px tracking 0.08em.

### `/v2/reception`
- h1 "Nouvelle *réception*." (mot en or, point final).
- BDL démarré : icône or **plein** dans disque or pâle. BDL non démarré : icône or **outline** dans disque cream + border or pâle.
- Eyebrow section : `01 — LIVRAISONS EN COURS · 4`.
- État vide "Aucune livraison prévue" : ajouter un CTA secondaire outline or "Ajouter manuellement" pour combler le vide visuel.
- Carte "Livraison surprise" : eyebrow `02 — RÉCEPTION LIBRE` au-dessus.

---

## 5. Bonus — opportunités pour aller **au-delà** de Drive

Stock est staff-facing : il a légitimité à des features que Drive ne s'autorise pas. Voici 7 axes où Stock peut dépasser Drive sans trahir l'ADN :

### 5.1 Densité numérique premium
- **Tabular-nums partout** (déjà dans `globals.css` `.tabular`) : appliquer systématiquement sur les compteurs (134/178, 12 cmds, 29,20 €). Drive ne le fait pas pour ses prix → Stock peut être **plus rigoureux**.
- **Mono pour les références** (`SM-2026-0001`, `BDL-2026-0142`) : utiliser `.mono` déjà défini. Élégance technique.

### 5.2 Keyboard shortcuts visibles
- Afficher des **kbd badges** discrets (or pâle sur cream, font mono 10px) à côté des actions : `Avancer ⇧⏎`, `Scanner ⌘K`, `Retour Esc`. Drive n'a pas de clavier physique en B2C → Stock est en backoffice avec scanner USB et clavier.
- Bottom nav : afficher les chiffres `1 2 3 4 5` sur chaque tab pour switch direct.

### 5.3 Live data badges animés
- Badge "TEMPS RÉEL" déjà présent sur `/v2/preparation` : ajouter un **pulse or 2s** (animation `breathe` déjà discutée pour Drive). Drive est mostly statique — Stock peut respirer.
- Quand une commande change de colonne (kanban), micro-animation slide + flash or 200ms.

### 5.4 Multi-touch gestures (PWA staff sur tablette)
- Swipe horizontal sur une card commande Kanban pour avancer/reculer de colonne (avec preview visuel sapin/or).
- Long-press sur une tile produit pour afficher un **radial menu** d'actions rapides (déclarer sortie, transfert, voir détail). Drive ne se le permet pas — Stock peut.

### 5.5 Voice & scanner natifs
- Bouton "Scanner" : ajouter une variante "Dicter" (icône micro or) qui complète, avec waveform animée pendant l'écoute. Drive client ne pense pas voice — Stock staff oui.

### 5.6 Dark mode "atelier nuit"
- Variante sapin **encore plus profond** (`#051A12`) avec or saturé pour les sessions tardives (réception après 19h). Drive client n'en a pas besoin — Stock staff travaille en horaires décalés.

### 5.7 Indicateur "qui regarde quoi" (présence multi-staff)
- Badge or `+2` sur une commande quand 2 autres préparateurs la regardent. Drive client est seul sur sa session — Stock est collaboratif. Petite signature live qui dépasse Drive sans le trahir.

---

## 6. Récap actions prioritaires (P0)

Si on devait faire **5 changements** pour rapprocher Stock du registre éditorial Drive **immédiatement** :

1. **Échelle h1 display** sur tous les écrans hub (login, accueil, preparation, stock, admin, sortie, reception) : passer de 28–32 px à `clamp(40px, 7vw, 56px)` avec mot accentué en or.
2. **Eyebrow numéroté `01 — / 02 — / 03 —`** sur chaque section, remplaçant les `LABEL CAPS` actuels minuscules.
3. **Fix overlap bottom nav** universel : container content avec `padding-bottom: calc(var(--nav-height) + var(--nav-breathing))`. C'est une règle UX user déjà énoncée.
4. **Promotion visuelle de la card principale** sur chaque hub : sapin plein avec icône or au lieu de surface blanche identique aux autres.
5. **Filtres pills scroll-x** avec gradient fade + active-state sapin plein sur `/v2/stock`.

Ces 5 actions, sans toucher au fonctionnel, alignent 80% du registre éditorial.

---

## Annexe — fichiers à éditer

- `apps/stock/app/globals.css` — ajouter `.h1-display`, `.eyebrow-num`, `.product-tile-solid`, classe utilitaire `.pb-cta-stack`.
- `apps/stock/app/v2/page.tsx` — promouvoir card "Nouvelle réception", appliquer eyebrow numéroté.
- `apps/stock/app/v2/preparation/page.tsx` — h1 avec mot en or, section headers numérotés, gradation Avancer.
- `apps/stock/app/v2/preparation/[id]/page.tsx` — grossir badges 2-lettres, padding CTA-stack.
- `apps/stock/app/v2/stock/page.tsx` — tiles or-sur-sapin, filtres scroll-x.
- `apps/stock/app/v2/admin/page.tsx` — hiérarchie alertes, gradation cards KPI.
- `apps/stock/app/v2/sortie/page.tsx` — bloc contexte sous h1, padding CTA-stack.
- `apps/stock/app/v2/reception/page.tsx` — gradation icônes BDL, CTA secondaire dans empty state.
- `apps/stock/app/v2/login/page.tsx` — grossir cases PIN, gradient sapin → cream.

Toutes ces actions sont **DA uniquement** — aucune modification de logique métier, route, données, ou comportement.
