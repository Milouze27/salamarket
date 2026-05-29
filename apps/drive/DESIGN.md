# Design System — Salamarket Drive

## Visual Theme

**Native-app warmth.** PWA mobile-first qui se comporte comme une app iOS native. Sapin profond + doré chaleureux sur surface blanc-cassé tinté. Pas de SaaS-cream cliché, pas de halal-décoratif (drapeaux, calligraphies). Le caractère premium vient de la précision typographique, des espaces généreux et des micro-interactions — pas d'effets décoratifs.

**Theme** : light mode uniquement. Scène physique : *"Maman de famille à Toulouse, smartphone iPhone à la main, debout dans la cuisine en plein après-midi, ouvre l'app pour commander avant la fermeture du supermarché Salamarket"*. Lumière chaude naturelle, lisibilité directe sous soleil. Le dark mode trahirait le ton chaleureux et accessible voulu pour un supermarché halal indépendant.

## Colors (OKLCH-tinted, brand-warm)

Stratégie : **Restrained + 1 accent doré**. Le sapin domine surfaces sombres (header, splash, success, CTAs primaires). Le doré est l'accent rare, utilisé pour signal (badges, indicateurs actifs, halos success). Le blanc-cassé tinté warm porte tous les contenus.

| Token | Value | Role |
|---|---|---|
| `primary` | `#0E3B2E` | Sapin profond Salam Market — CTAs, header, success surfaces, focus |
| `primary-hover` | `#14523F` | Sapin hover (mobile : `active:`) |
| `primary-dark` | `#082A20` | Sapin nuit — gradients endpoint, texte sur or |
| `accent` | `#C9A227` | Or principal Salam Market — badges, indicateurs actifs, halos |
| `accent-bright` | `#DDB31C` | Or brillant — capture photo, badges hover |
| `accent-soft` | `#F4E9C4` | Or fond doux — cards traiteur, pills or |
| `bg` | `#FAF7EE` | Cream chaud Salam Market — fond global |
| `surface` | `#FFFFFF` | Cards, modals, sticky bars |
| `text` | `#0F1A14` | Texte principal — quasi-noir tinté sapin |
| `text-secondary` | `#6B7280` | Texte secondaire |
| `text-tertiary` | `#9CA3AF` | Hints, captions |
| `border` | `#E8E4D8` | Bordures, séparateurs |
| `border-medium` | `#D1CCB8` | Bordures input focus |
| `destructive` | `#E5483D` | Rouge tomate — erreurs, suppression |
| `success` | `#2D7A4F` | Vert prairie — conformité, scan réussi |
| `warning` | `#D97706` | Ambre — alertes, états partiels |

**Tinted neutrals rule** : `#FAF7EE` (chroma ~0.005 vers warm-sapin) et `#0F1A14` (chroma ~0 légèrement tinté sapin) — tirés vers le brand pour cohésion. Cohérent avec Salam Stock V2.

**Interdits** : `#000` (utiliser `#0F1A14`), `#FFF` (utiliser `#FAF7EE` pour surfaces, `#FFFFFF` réservé aux cards/sticky bars en contraste avec le bg).

## Typography

**Font** : Plus Jakarta Sans (variable, weights 400/500/600/700/800). Sans-serif moderne, généreuse, lisibilité native iOS, support tabular-nums pour les prix. Police partagée avec Salam Stock V2 pour cohérence brand cross-app.

**Type scale** (1.25 ratio, validation skill) :

| Token | Size / Line | Usage |
|---|---|---|
| `display` | 32px / 1.1, weight 800 | Hero titles, splash |
| `h1` | 24px / 1.15, weight 700 | Page titles |
| `h2` | 20px / 1.2, weight 700 | Section titles |
| `h3` | 18px / 1.25, weight 600 | Card titles |
| `body-lg` | 16px / 1.5, weight 400 | Body principal mobile (évite zoom iOS) |
| `body` | 14px / 1.5, weight 400 | Body secondaire |
| `label` | 12px / 1.3, weight 600, tracking 0.18em, uppercase | Labels de section ("RÉCAPITULATIF") |
| `caption` | 11px / 1.3, weight 500 | Sous-textes, captions, bottom nav labels |

**Tabular-nums** : tous les prix, totaux, quantités, durées (`tabular-nums` Tailwind class).

**Line length** : max 65ch sur descriptions/paragraphes (cap par max-width).

## Border Radius (HARMONISATION — règle stricte)

Aujourd'hui le code mélange `rounded-full` / `rounded-2xl` / `rounded-xl` / `rounded-lg` / `rounded-md` sans logique. **À partir de maintenant** :

| Token | Value | Cas d'usage exclusif |
|---|---|---|
| `pill` | `rounded-full` (9999px) | Boutons CTA primaires + secondaires, badges, pills statut, stepper buttons, FAB, avatars |
| `card` | `rounded-2xl` (16px) | Cards produits, cards récap, sections, cards items panier, modals, sticky bars |
| `image` | `rounded-xl` (12px) | Thumbnails images dans cards, image mini avatars |
| `input` | `rounded-xl` (12px) | Inputs text, textarea, search bar |
| `chip` | `rounded-md` (6px) | Tags discrets, code blocs (rare) |

**Règle d'or** : tout bouton qu'on tape avec le pouce → `rounded-full`. Tout container de contenu → `rounded-2xl`. Cohérence visuelle immédiate, pattern "vraie app premium" (Apple Music, Spotify, Linear).

## Components

### Buttons (uniformisés)

**Primary CTA** (action principale page) :
- Hauteur : `h-14` (56px) sur mobile, `h-12` (48px) sur desktop
- Radius : `rounded-2xl` (les CTAs primaires utilisent rounded-2xl pour forme premium "soft brick", pas rounded-full pill — exception au pattern pill ci-dessus pour les CTAs FULL WIDTH qui méritent une silhouette distincte)
- Bg : `bg-gradient-to-r from-[#0E3B2E] to-[#082A20]`
- Text : `text-white font-bold text-base`
- Shadow : `shadow-lg shadow-[#0E3B2E]/30`
- Hover : `hover:shadow-xl hover:shadow-[#0E3B2E]/40`
- Active : `active:scale-[0.99]`
- Transition : `transition-all duration-200`
- Icon : optionnel à droite, `ArrowRight` qui translate-x-0.5 au hover

**Secondary CTA** (action secondaire) :
- Hauteur : `h-12` (48px)
- Radius : `rounded-full`
- Bg : `bg-white border border-border`
- Text : `text-[#0E3B2E] font-semibold text-sm`
- Active : `active:scale-[0.98]`

**Tertiary / Text button** (vider panier, "Modifier") :
- Padding : `px-3 py-2` (touch zone garantie)
- Pas de bg
- Text : `text-sm font-medium text-muted hover:text-destructive`

**Stepper buttons** (panier qty +/−) :
- Taille : `w-7 h-7` (28px) — exception au 44pt min car groupés dans un bloc parent qui garantit 44pt+
- Radius : `rounded-full`
- Active : `active:scale-90`

### Cards
- Radius : `rounded-2xl`
- Bg : `bg-white`
- Border : `border border-border`
- Shadow : `shadow-sm` (élévation 1)
- Padding : `p-4` (16px) standard, `p-5` (20px) pour cards premium (récap)
- **Jamais de cards imbriqués**

### Sticky bars (header, bottom CTA bar, bottom nav)
- Bg : `bg-white/95 backdrop-blur` (header light) ou `bg-gradient sapin` (header brand)
- Border : `border-b` ou `border-t`
- Safe area : `paddingTop: env(safe-area-inset-top)` ou `paddingBottom: env(safe-area-inset-bottom)`
- z-index : header `z-50`, bottom-nav `z-40`, sticky CTA bar `z-30`

### Header (REFONTE — voir critique ci-dessous)

Le header actuel (gradient sapin bg avec logo + search + user menu + cart icon) ne convainc pas. À redesigner avec une approche plus éditoriale et chaleureuse — voir spec dans la prochaine itération.

## Spacing (4pt scale, vary for rhythm)

Tailwind default scale (4pt base). **Règle de rythme** : ne pas utiliser le même padding partout, varier pour créer respiration et hiérarchie.

- Items list : `gap-2.5` (10px)
- Sections : `gap-3` à `gap-4` (12-16px)
- Page padding : `px-4` mobile, `px-6` md+
- Section padding interne : `p-4` standard, `p-5` premium, `py-8` hero

## Motion (purposeful, never decorative)

Curves : `ease-out` (pas de bounce ni elastic). Spring physics réservé aux feedback tactiles.

| Animation | Duration | Easing | Cas |
|---|---|---|---|
| Tap feedback (scale) | 150ms | `ease-out` | `active:scale-[0.98]` sur tous pressables |
| Page entry stagger | 300-500ms | `ease-out` | `animate-in fade-in slide-in-from-bottom-*` Tailwind |
| Cart bump (badge) | 400ms | `cubic-bezier(0.34, 1.56, 0.64, 1)` (springy) | Quand qty change |
| Success pop (check) | 600ms | spring-like | Page confirmation |
| Hero ken-burns | 8000ms | `ease-out` | Slider homepage |
| Skeleton shimmer | 1600ms | `ease-in-out` infinite | Loading states |
| Halo ping (success) | 1400ms | `ease-out` | Cercles autour du check |

**Bans** : pas d'animation sur `width`, `height`, `top`, `left`. Uniquement `transform` / `opacity`. Respect `prefers-reduced-motion` natively via `animate-in` Tailwind.

## Effects (Shadows, Backdrops)

**Shadow scale** :
- `shadow-sm` (élévation 1) : cards static, items panier
- `shadow-md` (élévation 2) : badges, FABs, sticky bars
- `shadow-lg shadow-[#0E3B2E]/30` (élévation 3) : CTA primaires, surfaces actives
- `shadow-xl shadow-[#0E3B2E]/40` (élévation 4) : hover state du CTA primaire

**Tinted shadows** : ombres colorées sapin (`/30` opacity) sur les CTAs sapin pour cohésion visuelle. Doré (`shadow-[#C9A227]/40`) pour les éléments accent.

**Backdrop blur** : `backdrop-blur-md` réservé aux sticky bars + modals. **Jamais en décoratif** (anti-glassmorphism).

## Iconography

**Lib unique** : `lucide-react`. Stroke 2 par défaut, 2.5 pour bold (CTAs, actifs), 1.5 pour decoratif soft (success badge, empty states).

**Tailles** :
- 12-14px : icons inline texte (Store, BadgeCheck dans pills)
- 16-18px : icons CTAs, ArrowRight
- 20-22px : icons header, bottom nav, qty controls
- 44+px : icons hero, success badge, empty states

**Bans** : aucun emoji utilisé comme icon structurel. Les emojis sont font-dependent et inconsistants cross-platform.

## Layout

**Container widths** :
- `max-w-md` (448px) : pages compte, login, signup, formulaires
- `max-w-2xl` (672px) : pages catalogue mobile, panier, fiche produit
- `max-w-7xl` (1280px) : layout desktop wide (rare, app surtout mobile)

**Mobile-first** : tout est designé d'abord mobile, breakpoints `md:` (768px+) seulement pour adaptations rares.

**Safe areas** : toutes les fixed bars respectent `env(safe-area-inset-*)`. Pages avec bottom nav ont `pb-20` pour ne pas masquer le contenu.
