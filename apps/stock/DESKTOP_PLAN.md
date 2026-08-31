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
