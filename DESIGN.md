# Salam Stock — DESIGN

Système de design de l'app staff (PWA). Source de vérité tokens : `apps/stock/app/globals.css`. Ne jamais coder de hex en dur dans les composants — toujours via variable CSS.

## Thème

- **Dark par défaut** (mode atelier « nuit ») via `:root:not([data-theme="jour"])` + `[data-theme="nuit"]`. **Jour** (cream) = opt-in `[data-theme="jour"]`.
- Scène : staff dans un magasin sous éclairage variable, écran tenu une main ; le dark réduit l'éblouissement en réserve/labo, le jour sert au comptoir lumineux. Contraste AA minimum partout.

## Couleur

- **Sapin** : `--primary-green` #0e3b2e / hover #14523f / dark #082a20.
- **Or** : `--accent-gold` #c9a227 / bright #ddb31c. Or = accent rare et précieux (≤ ~10% de surface), jamais décor de masse.
- Sémantique : `--success`, `--warning`, `--danger` (+ `*-soft`). Surfaces : `--surface-1/2/3`, `--bg-cream`, `--border-card/hairline/premium`.
- ⚠️ **Tokens qui flippent jour/nuit** (`--accent-gold-soft`, `--*-soft`) : ne PAS les utiliser sur une surface **theme-invariante** (ex. héro toujours sombre) — utiliser une valeur translucide fixe (cf fix cockpit HeroKpi).
- Texte sur fond sombre : `--text-on-dark` / `--text-on-dark-muted` (classes `text-text-ondark*`, nesting Tailwind volontaire). Éviter `text-white/35–45` (échoue AA).

## Typo

- Plus Jakarta Sans. Hiérarchie par échelle + graisse (≥ 1.25 entre niveaux), jamais plate. Chiffres tabular pour les KPI/prix. Eyebrow caps `label-caps`.

## PWA (impératif)

- `safe-area-inset-*` sur header (safe-top) et bottom-nav (pb-safe) : standalone iOS/iPad sans chrome.
- Zone de pouce = bas. Bottom-nav 4 onglets + Plus-sheet. Cibles ≥ 44px. Inputs ≥ 16px (anti-zoom iOS, media `pointer:coarse`).
- Pas de hover comme seul signal. Feedback tactile (active:scale). Jamais d'écran bloquant : tout flux caméra/scan a un filet (input file capture).
- SW : prompt de mise à jour ; offline = état clair, pas d'échec muet.

## Layout / motion

- Rythme d'espacement varié (pas le même padding partout). Cartes seulement quand c'est la meilleure affordance ; jamais de cartes imbriquées ; pas de grille de cartes identiques à l'infini.
- Motion : ease-out exponentiel, pas de bounce, ne pas animer les propriétés de layout.

## Bans (slop)

hero-metric template (grand chiffre + label + dégradé), grilles de cartes identiques, bordures-accent latérales > 1px, texte en dégradé, glassmorphism décoratif, modale par réflexe.

## Print & étiquettes (outputs physiques = la marque en vrai)

- **Étiquettes EAN-13** (Brother QL-820, ~62mm) : code-barres net (quiet zone respectée, hauteur de barres suffisante pour scan fiable), nom produit tronqué proprement (ellipsis, pas de coupe brutale), prix lisible, marque discrète. Aucune donnée non échappée injectée dans le HTML d'impression (anti-XSS printLabel).
- **Tag promo DLC** : prix barré + prix remisé + `-X%` clair, mention DLC/date, sapin+or, lisible à 50cm sur le rayon.
- **PDFs** (factures pro, bons de réception, ticket Z, rapport mensuel) : bâtis sur le module canonique `apps/stock/lib/pdf/brand.ts` (en-tête marque, palette, typo, pied légal SIRET). Pattern pure-builder + route fine. Montants alignés à droite, TVA détaillée par taux, dates en Europe/Paris, totaux arrondis (règles FR). Pas de débordement de texte, pagination propre.
