# Salam Stock — PRODUCT

> Contexte design pour l'app **staff** (PWA) de K & A FOOD. Pour le Drive client (B2C/B2B), voir apps/drive.

## Register

**product** — le design SERT l'outil (app métier staff), il n'est pas le produit vendu. Densité, rapidité d'exécution et lisibilité priment sur l'effet marketing.

## Product Purpose

PWA de gestion multi-dépôts d'une épicerie **halal** premium (K & A FOOD, Toulouse). Le staff y fait, debout dans le magasin, une main sur l'iPhone : réception de marchandise, déclaration de casse/sortie, transfert inter-dépôt, préparation des commandes Drive, inventaire tournant. Les admins (Otmane, Ahmed) y pilotent : ventes, alertes IA, casse, DLC, fournisseurs, factures pro, fiscal.

## Users

- **Propriétaire-opérateur** (Otmane, Ahmed) : veut voir l'état de SON commerce d'un coup d'œil en ouvrant l'app (CA, alertes, ce qui presse), puis agir. Exigeant sur le rendu (l'app reflète son commerce premium).
- **Staff terrain** (ex. Mohamed) : réceptionne, scanne, déclare la casse, prépare le Drive. Pressé, une main, parfois gants, lumière variable, bruit. Zéro tolérance pour un écran qui bloque ou un tap raté.

## Contexte d'usage = contraintes de design

- **PWA standalone installée** (écran d'accueil iOS/iPad). Pas de chrome navigateur : l'app DOIT gérer les `safe-area-inset` (notch, barre home), le header sticky et la bottom-nav au pouce. Feeling **natif**, pas web.
- **Mobile-first, une main** : zone de pouce = bas d'écran. Cibles tactiles ≥ 44px. Pas de hover comme seul affordance (tactile). Anti-zoom iOS (inputs ≥ 16px).
- **Terrain** : contraste fort requis (lumière magasin), états de chargement/erreur explicites, jamais d'écran noir bloquant (toujours un filet).
- **Offline / réseau instable** : service worker, feedback clair quand une action échoue.

## Marque & ton

- **Sapin** (#0e3b2e) + **or** (#c9a227). **Dark par défaut** (mode atelier nuit), mode jour cream en opt-in raffiné.
- Identité **halal / maghrébine tasteful** : salutations contextuelles (Sabah el khir / Msa el khir), repères hijri (Ramadan, échéances) — un détail culturel qu'aucun concurrent FR n'a. Jamais folklorique ni caricatural : sobre, premium, respectueux.
- Ton : direct, opérationnel, chaleureux mais pro. Français, vocabulaire métier (cf CONTEXT.md). Pas de jargon SaaS.

## Principes stratégiques

1. **La tâche d'abord** : ouvrir l'app = être à 1 tap de l'action du moment (réception le matin, casse en journée, prépa Drive). Le superflu se range (Plus-sheet / ⌘K), il n'encombre pas.
2. **Le commerce en un coup d'œil** pour l'admin, sans tableau de bord générique : montrer ce qui PRESSE (alertes, retards), pas un mur de chiffres décoratifs.
3. **Jamais bloqué** : chaque caméra/scan/chargement a un filet ; chaque erreur se dit.
4. **Cohérence par tokens** : couleurs/espacements/ombres via variables CSS (globals.css), jamais de hex en dur.

## Anti-références (ce qu'on ne veut PAS)

- Le dashboard SaaS générique : grand chiffre + petit label + accent dégradé (hero-metric template), grilles de cartes identiques icône+titre+texte à l'infini.
- Le « back-office » terne gris/bleu. Les bordures-accent latérales. Le texte en dégradé. Le glassmorphism décoratif.
- Tout ce qui « sent l'IA » : convergence vers le même layout neutre.
