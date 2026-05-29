# PRODUCT.md — Salamarket Drive

## Register

**product** — App client-facing pour commander en click & collect. Le design SERT la confiance et la rapidité de commande, il n'est pas le produit à vendre.

## Users

Familles musulmanes de Toulouse (25-55 ans), majoritairement mobiles iPhone. Elles font leurs courses halal hebdomadaires et veulent éviter le déplacement long ou les files d'attente du samedi. Elles ouvrent l'app le matin, choisissent leurs produits depuis le canapé, retiennent un créneau l'après-midi, passent récupérer en 5 minutes au comptoir Salamarket Toulouse (8 av. Larrieu-Thibaud).

Le contexte d'usage est mobile-first et fragmenté : entre deux activités, debout dans la cuisine, dans les transports. La PWA installée sur l'écran d'accueil iOS doit se comporter comme une vraie app native, pas un site web mobile.

## Product Purpose

Un drive halal en click & collect adossé à un supermarché halal indépendant à Toulouse. La promesse : commander en 3 minutes, récupérer en 5. Pas de livraison, pas de stock illimité, pas de comparateur de prix. C'est un supermarché halal indépendant numérisé, pas un Carrefour Drive.

Le succès se mesure à : nombre de commandes par semaine, taux de conversion panier → commande confirmée, NPS sur la fluidité du retrait magasin.

## Brand Personality

Trois mots : **chaleureux, premium, fiable**.

Voix : tutoiement informel mais respectueux ("Votre panier"), jamais commercial agressif. Pas de FOMO, pas de "il en reste 2 !". Confiance tranquille du commerçant qui connaît ses clients.

Émotion cible à l'ouverture : reconnaissance et soulagement (*"ah, c'est facile"*), pas excitation marketing.

## Anti-references

- **Carrefour Drive / Auchan Drive** : froid, corporate, fonctionnel sans âme
- **Uber Eats / Deliveroo** : pression marketing, FOMO, gamification, urgences fabriquées
- **Sites web mobiles "responsive"** : qui se reconnaissent immédiatement comme du web et pas de l'app native
- **Templates SaaS génériques** : cards uniformes blanches, gradient mauve/bleu cliché, hero metric "1000+ clients satisfaits"
- **Étalage halal stéréotypé** : drapeaux, calligraphies arabes décoratives, croissant lune omniprésent. Le caractère halal est une garantie qualité, pas une identité visuelle imposée

## Design Principles

1. **Le supermarché indépendant, pas la chaîne** — Salamarket est un supermarché halal local et indépendant, pas un Carrefour ni un Auchan. Chaque écran doit évoquer la confiance d'une enseigne qu'on connaît et qu'on a choisie, pas l'efficacité froide d'une grande surface anonyme. Le doré du logo et la chaleur du sapin sont les deux ancres émotionnelles.

2. **Mobile-first standalone iOS** — la PWA installée doit être indistinguable d'une app native. Safe-area, bottom nav, touch 44pt+, haptic-like animations. Aucun élément qui rappelle qu'on est dans Safari.

3. **Premium accessible** — l'élégance ne doit jamais devenir intimidante. Les typo et espacements sont raffinés mais les CTAs sont gros, lisibles, évidents. Une grand-mère doit pouvoir commander.

4. **Le checkout est sacré** — quand le user entre dans le flow d'achat (panier → créneau → paiement), tout disparaît sauf l'action en cours. Pas de bottom nav, pas de distractions, focus pur sur la transaction.

5. **Le halal est une garantie, pas une décoration** — le badge "Halal certifié" est un label de confiance discret, pas un branding visuel. La typographie et les couleurs ne doivent rien évoquer du Maghreb stéréotypé.

## Accessibility & Inclusion

- WCAG AA minimum (contraste 4.5:1 sur le texte body, 3:1 sur les éléments UI)
- Touch targets ≥44pt (iOS HIG)
- Support `prefers-reduced-motion` (animations en `animate-in` Tailwind, native respect)
- Tap feedback visuel sous 100ms (active:scale-[0.98] sur tous les pressables)
- Screen readers : aria-label sur tous les boutons icônes, aria-hidden sur les icônes décoratives
- Pas de gestes-only (chaque action critique a un bouton visible)
- Lisibilité sous lumière directe extérieure (l'utilisatrice peut être dehors en train de marcher)
