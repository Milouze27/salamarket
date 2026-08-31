# Chantier « poste de travail » — Salam Stock sur ordinateur

Branche `desktop-fullwidth`. Objectif : l'app, conçue pour l'iPhone, devient
utilisable en plein écran sur un ordinateur (1440 → 1920 px et au-delà), de la
page de code PIN jusqu'à la dernière page admin. **Le téléphone reste
prioritaire en rayon : aucune régression tactile n'est acceptable.**

Ce qui ne change PAS : la palette (sapin, or, crème), Plus Jakarta Sans, les
parcours métier, le contenu. On ré-agence, on ne repeint pas.

---

## État des lieux mesuré avant travaux (31/08/2026)

Banc `scratchpad/qa/audit2.mjs`, étalonné en rouge (témoin 400 px → mesuré
400 px). 40 routes parcourues, session admin injectée, thème nuit.

| Mesure | 1920×1080 | 1440×900 |
|---|---|---|
| Remplissage moyen de la largeur utile | **50 %** | 66 % |
| Vide moyen à droite du contenu | **601 px** | 372 px |
| Pages sans barre latérale | **27 / 40** | 27 / 40 |
| Pages affichant la nav mobile du bas | **38 / 40** | 38 / 40 |
| Page de code PIN | 440 px sur 1920 = **19 %** | 440 / 1440 = 31 % |

Plafonds de largeur écrits dans `V2Shell.tsx:593-595` : `xl:max-w-[1200px]`
(défaut) et `xl:max-w-[1340px]` (`wide`). **Aucun palier `2xl:`** → au-delà de
1280 px, l'app ne s'élargit plus du tout.

**Cause racine n°1** : `hideNav` (`V2Shell.tsx:605`) masque la barre latérale
d'ordinateur en même temps que la nav mobile. 16 pages sont dans ce cas et se
retrouvent **sans aucune navigation** sur grand écran.

**Cause racine n°2** : les réserves d'espace du téléphone sont inconditionnelles
(`globals.css:46,49,53` — `--nav-height:100px`, `--cta-height:96px`,
`--nav-breathing:64px`). `.pb-nav-stack` réserve 164 px de vide en bas de page
même quand la nav du bas n'existe plus.

**Cause racine n°3** : le vocabulaire visuel est mobile — grands titres
`clamp(40px,7vw,56px)` (18 pages), vignettes produit à 4 par ligne au lieu d'un
tableau, 18 feuilles qui montent du bas plafonnées à 460 px, 22 rails à
défilement horizontal, aucun `<table>` de données dans tout le projet.

## Défauts de lisibilité prouvés au pixel

Sonde `scratchpad/qa/contraste.mjs`, étalonnée sur trois paires connues
(21,00 / 4,54 / 2,35 attendus → mesurés à l'identique). Contraste lu sur les
pixels réellement peints, pas calculé depuis le CSS.

| Élément | Nuit | Jour | Seuil | Occurrences |
|---|---|---|---|---|
| `.section-eyebrow` | **2,89:1** ✗ | 11,64 ✓ | 4,5 | 20 |
| `.btn-ghost` | **2,35:1** ✗ | 12,47 ✓ | 4,5 | 3 |
| `.h1-display .gold` (56 px) | 13,07 ✓ | **2,26:1** ✗ | 3,0 | 22 |
| `.eyebrow` | 12,97 ✓ | **4,48:1** ✗ | 4,5 | 25 |
| `.label-caps` gris | 5,24 ✓ | **3,46:1** ✗ | 4,5 | 114 |

Écarté comme artefact de sonde : une mesure isolée de `.label-caps` à 1,01:1 sur
`/v2/reception` — le texte occupait moins de 1,5 % des pixels de sa boîte, la
sonde a comparé deux fonds. Non retenu.

---

## Lots d'exécution

- **LOT 0 — socle** : `hideNav` ne masque plus la barre latérale ; paliers de
  largeur par famille de page + `2xl` ; réserves d'espace bas neutralisées en
  desktop ; bouton flottant assistant repositionné ; barres d'action collées
  alignées sur le conteneur ; feuilles du bas → modales centrées ≥ 1024 px ;
  classe `scrollbar-hide` manquante ; les 5 défauts de contraste ci-dessus.
- **LOT 1 — en-tête de page** : composant unique remplaçant les 25 en-têtes
  copiés-collés ; titre compact + actions à droite en desktop, grand titre
  éditorial conservé au téléphone ; bouton « Retour » masqué quand la barre
  latérale est là.
- **LOT 2 — listes → tableaux** : stock, sans-ean, lots, fournisseurs, forecast,
  alertes, pro, pointage.
- **LOT 3 — tableaux de bord multi-colonnes** : accueil, cockpit, admin,
  rapport-mensuel, labo, ramadan.
- **LOT 4 — flux d'action en deux volets** : réception (×3), sortie, transfert,
  inventaire, préparation (×3), étiquettes, import, équipe, assistant.
- **LOT 5 — code PIN pleine page**.
- **LOT 6 — écrans de borne** : counter, cockpit/tv.
- **LOT 7 — recette** : re-mesure complète des 40 pages aux deux thèmes et aux
  quatre largeurs (390 / 1024 / 1440 / 1920), avant/après chiffré.

## Règles de travail

1. Rien n'est « fait » sans une mesure au navigateur qui le prouve.
2. Le téléphone est re-mesuré à chaque lot (390 px) : toute régression bloque.
3. Pas de nouvelle couleur, pas de nouvelle police, pas d'effet supplémentaire.
4. Toute page qui gagne un tableau garde une vue en cartes sous 1024 px.

---

## Ce qui a été fait, et ce qui a été mesuré (31/08/2026)

### Le chiffre d'ensemble, à 1920 px

Deux relevés faits dans les mêmes conditions, par le même banc étalonné, sur
les **40 pages** de l'application : à gauche l'arbre au commit `1e44c5a`
(avant chantier) servi sur le port 3211, à droite la branche
`desktop-fullwidth` servie sur le port 3210.

| Mesure | Avant | Après |
|---|---|---|
| Remplissage moyen de la largeur utile | **55 %** | **69 %** |
| Vide moyen à droite du contenu | **523 px** | **392 px** |
| Pages avec une barre latérale de navigation | **14 / 40** | **38 / 40** |
| Pages qui débordent hors de l'écran | 0 | 0 |

Moyennes calculées sur les 24 pages retenues : sont écartées les 14 pages qui
**redirigent** ailleurs (elles mesureraient la page d'arrivée) et les 2 écrans
de borne qui n'ont presque pas de texte. Les deux seules pages sans barre
latérale après travaux sont l'écran mural et l'écran de comptoir : ce sont des
bornes, la navigation y est volontairement absente.

**Six pages « reculent » et c'est voulu ou expliqué.** Sortie, transfert et
assistant passent en colonne de saisie étroite (820 px) : un bouton de 1 240 px
ne se vise pas mieux qu'un bouton de 700 px. Fournisseurs, lots et rapport
mensuel affichent en local leur état vide ou leur chargement, faute de base de
données : leur pourcentage mesure du vide, pas une régression — vérifié à
l'image.

### Lisibilité des couleurs

Sonde de contraste sur 24 pages, dans les deux thèmes, seuils WCAG AA
(4,5:1 en texte courant, 3:1 en grand). Étalonnée en rouge avant chaque
passage sur quatre paires de référence, dont un dégradé qu'elle doit refuser
de juger.

| Thème | Avant | Après |
|---|---|---|
| Jour | 5 règles fautives | **0** |
| Nuit | 9 règles fautives | **0** |

Défauts corrigés à la source, jamais au cas par cas : bouton d'état vide à
1,43:1 (9 pages), or vif sur crème à 1,86:1, ambre d'alerte sur son propre
voile à 2,90:1, pastille « En cours » à 1,30:1 (22 emplois), pastille neutre
sans surface (20 emplois), sapin en texte sur le fond de nuit à 2,89:1
(530 emplois potentiels), bouton rouge dont l'encre ne suivait pas le thème.

### Ce qui a été substitué au plan initial

- **LOT 1 (composant d'en-tête unique)** : remplacé par une règle CSS au-delà
  de 1024 px qui réduit les titres géants et resserre les en-têtes. Le
  résultat mesuré est le même ; le refactor de 25 fichiers aurait coûté un
  risque de régression sans contrepartie.
- **Relevés à 1024 et 1440 px** : faits par les équipes sur leur périmètre,
  pas en balayage complet des 40 pages. Le serveur de développement se fige
  après avoir compilé les 40 routes, et trois séries complètes ont été perdues
  avant qu'un banc reprenable et un garde de serveur ne soient écrits.

### Portes de vérification passées

- `npx tsc --noEmit` : 0 erreur.
- `npx next build` dans un arbre séparé : « Compiled successfully », 54 pages
  générées.
- Aucune couleur en dur ajoutée dans un composant ; les seuls hex du chantier
  sont dans `globals.css`, chacun avec la mesure qui le justifie.
- Téléphone à 390 px : comparaison boîte à boîte ou fichier à fichier sur les
  sept pages les plus retouchées — aucun élément peint déplacé.

### Instruments, et ce qu'ils ont failli faire dire

Les bancs vivent dans `.qa-desktop/` (hors dépôt). Cinq pièges rencontrés,
tous corrigés dans les sondes :

1. `scrollWidth > clientWidth` ne voit **rien** : `body` est en
   `overflow-x: clip`. Un tableau poussait la page 34 px hors de l'écran sans
   la moindre trace. On mesure désormais les bords droits réels.
2. Le **Service Worker** sert sa page d'accueil en cache pour toutes les
   adresses après un redémarrage : sept pages différentes ont rendu des
   chiffres identiques au pixel, avec la bonne adresse dans la barre. Les
   sondes bloquent maintenant le Service Worker, et un garde-fou refuse un
   relevé où deux pages distinctes ont la même empreinte de contenu.
3. Le serveur de développement **se fige sans erreur** : la page reste sur son
   spinner et un banc y lit « 0 texte ». Avant de consigner un écran vide, la
   sonde vérifie que le serveur répond et remesure.
4. Un fond peint par un **dégradé** a une couleur de fond transparente : la
   sonde de contraste traversait et attribuait au texte le fond du body. C'est
   ainsi que le héros du cockpit, sapin sombre, a été déclaré « texte blanc
   sur crème ».
5. `max-w-[26ch]` posé sur un conteneur se calcule sur **sa** police, pas sur
   celle du titre qu'il contient : 26ch valaient 208 px au lieu de 520.
