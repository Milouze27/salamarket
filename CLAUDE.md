# CLAUDE.md

Claude Code travaille ici sur **salamarket**, un monorepo npm-workspaces de deux PWA (Drive client + Stock staff) partageant un backend Supabase. Tu lis la doc métier avant de coder, tu respectes les comptes infra, et tu écris tout en français.

## ⚠️ Comptes obligatoires AVANT toute action infra

Tout agent qui touche à `vercel`, `gh` ou `supabase` doit vérifier le compte actif AVANT d'exécuter une commande. Sinon les commandes échouent silencieusement en 403/404 obscurs (incident récurrent qui a coûté des heures). **Ne JAMAIS supposer que le compte actif est le bon — vérifier d'abord.**

| Service | Compte à utiliser | Vérification |
|---------|-------------------|--------------|
| **Vercel** (tous projets `*-mono`, drive, stock) | `dadibelhamiti7@gmail.com` → username `abumeryem`, org `abumeryems-projects` | `vercel whoami` doit retourner `abumeryem` ; sinon `vercel login` avec cet email |
| **GitHub** monorepo `Milouze27/salamarket` | `Milouze27` | `gh auth status` puis `gh auth switch --user Milouze27` |
| **GitHub** legacy `AbuMeryem/salam-stock` | `AbuMeryem` | `gh auth switch --user AbuMeryem` |
| **GitHub** legacy `Milouze27/salamarket-drive` | `Milouze27` | `gh auth switch --user Milouze27` |
| **Supabase** projet `tltmermqodelorthtbre` | (CLI déjà loggé) | `supabase projects list` doit lister `salamarket-drive` |

## Project Context

salamarket appartient à **K & A FOOD** (épicerie halal premium, Toulouse, SIRET 802 773 812). Deux PWA partagent le même backend Supabase :

- **Drive** (`apps/drive`) — PWA client **B2C / B2B Pro** : catalogue, panier, vente au poids, créneaux (slots) de retrait, paiement Stripe (pré-autorisation + capture manuelle). Public : clients particuliers et comptes Pro.
- **Stock** (`apps/stock`) — PWA staff / **POS atelier** : réception, casse/sortie, transferts, préparation Drive, inventaire, étiquettes EAN-13, bons de commande (PO), labo, cockpit admin, IA vision. Public : employés en boutique.

Démo prévue avec Ahmed Nasri (proprio K & A FOOD), Otmane Jamal (manager), Mohamed Belhamiti (associé) — Drive/Stock en **mode test Stripe**.

### Lire d'abord (vérité métier — racine du repo)

- **`WORKFLOW.md`** — bible métier : flux B2C/B2B, Stripe pré-auth/capture, slots, triggers de sync, rôles, TVA, data model. **À lire avant toute feature** touchant Drive, Pro, paiement, préparation, réception, sortie, transfert, inventaire, labo ou admin.
- **`SCHEMA.md`** — référence DB complète (36 tables, 2 vues, 7+ triggers, enums, sequences, RLS).
- **`CONTEXT.md`** — glossaire domaine (~80 termes) à employer dans code, issues, titres de PR, tests.
- `DESIGN.md` / `PRODUCT.md` — design system & contexte produit staff. `.quench/HANDOFF.md` — note de passation.
- Beaucoup de `*_REPORT.md` / `CHECKIN_*.md` / `AUDIT_*.md` à la racine des apps sont des **artefacts de sessions passées**, pas de la doc canonique.

## Stack & Architecture

Monorepo **npm workspaces** (Node `>=20`, npm `>=10`). `.npmrc` force `legacy-peer-deps=true`. TS 5. Font **Plus Jakarta Sans**, chiffres `tabular-nums` pour KPI/prix. Backend partagé **Supabase** (Postgres + Auth + Edge Functions Deno), projet `tltmermqodelorthtbre`. Hosting **Vercel** (org `abumeryems-projects`).

```
apps/drive/    PWA client — Vite 5 + React 18 + React Router 6 + shadcn/ui (Radix)
               + Tailwind 3 + Zustand + TanStack Query + react-hook-form/zod
               + Stripe (Checkout + Elements, capture manuelle) + Sentry. Port dev 8080.
               → salamarket-drive.vercel.app
  src/pages    routes : Cart, Checkout, DriveAuPoids, Slots, Orders, pro/, labo/,
               admin/, EmployeeKanban… (code-splittées via React.lazy dans App.tsx)
  src/components  + components/ui (shadcn)
  src/stores   Zustand : cartStore.ts, checkoutStore.ts, proCart.ts
  src/lib      supabase.ts, tva.ts, format.ts, stripe-errors-fr.ts, pushNotifications…
  src/config/brand.ts   SOURCE DE VÉRITÉ des design tokens Drive
  src/test     Vitest + jsdom

apps/stock/    PWA staff — Next.js 14.2 App Router + Tailwind 3 + Zustand + Stripe
               + Sentry + Resend, scanners (@zxing, html5-qrcode),
               PDF/étiquettes (jspdf, bwip-js). Port dev 3000.
               → salam-stock.vercel.app
  app/v2/*     UI staff ACTUELLE : preparation, reception, sortie, transfert, inventaire,
               lots, po, labo, cockpit, counter, etiquettes, forecast, fournisseurs,
               admin, login, stock. (app/staff/preparation est déprécié → 301 vers /v2/preparation)
  app/api/*    stripe, sync, cron, po, push, email, cockpit, forecast, vision-*, assistant…
  app/globals.css   SOURCE DE VÉRITÉ des design tokens Stock (CSS variables)
  lib/         supabase.ts/supabase-server.ts, stripe.ts, pdf/, labels/, ai/,
               nav-roles.ts, rate-limit.ts, hijri.ts…
  middleware.ts, instrumentation.ts, sentry.*.config.ts, next.config.mjs

packages/shared/   @salamarket/shared — TS source NON compilé (src/index.ts, src/drive-pesee.ts).
                   Stock le consomme via transpilePackages:['@salamarket/shared'] (next.config.mjs) ;
                   Drive via workspace "*".

supabase/      config.toml (project_id tltmermqodelorthtbre), migrations/ (~45 fichiers
               horodatés 0001→0030+, certains .OBSOLETE/_archive), functions/ (13 Edge
               Functions Deno : create-checkout-session, verify-checkout-session,
               confirm-order, ensure-slots, forecast-stockouts, dlc-scan,
               cart-abandonment, gdpr-delete-account, refresh-cockpit-cache,
               notify-new-order, update-order-status, auto-generate-pos, casse-weekly-digest),
               seed/ + seeds/

docs/          adr/ (0001-monorepo-migration.md) ; agents/ (domain.md, issue-tracker.md,
               triage-labels.md = config skills Matt Pocock) ; demo/
scripts/       db-snapshot.sh, seed-demo.mjs, upload-photos-drive.mjs
```

**Deux régimes de types** : Stock `strict:true` ; Drive laxiste (`strictNullChecks:false`, `noImplicitAny:false`, no-unused-vars off). N'attends pas le même niveau de rigueur entre les deux apps.

## Commands

Scripts réellement présents dans les `package.json` (racine + workspaces). Les `typecheck`/`test` ne sont **pas** exposés à la racine — les lancer par workspace.

| Commande | Effet |
|----------|-------|
| `npm install` | Installe tous les workspaces (`.npmrc` → legacy-peer-deps) |
| `npm run drive:dev` | Drive en dev (vite, port 8080) — alias de `npm run dev -w apps/drive` |
| `npm run drive:build` | Build prod Drive (`vite build`) |
| `npm run stock:dev` | Stock en dev (`next dev`, port 3000) — alias de `npm run dev -w apps/stock` |
| `npm run stock:build` | Build prod Stock (`next build`) |
| `npm run build:all` | ⚠️ **CASSÉ** — le script racine est `npm run build:all -ws --if-present`, il récurse sur un script `build:all` qui n'existe dans aucun workspace : il ne build donc **rien** (no-op silencieux). Pour builder les deux apps, utiliser `npm run drive:build` + `npm run stock:build`, ou corriger le script en `npm run build -ws --if-present`. |
| `npm run lint:all` | Lint des workspaces ayant un script lint (`npm run lint -ws --if-present`) |
| `npm run dev -w apps/drive` | Drive dev direct (= drive:dev) |
| `npm run build:dev -w apps/drive` | Build Drive en mode development (`vite build --mode development`) |
| `npm run lint -w apps/drive` | ESLint Drive (`eslint .`) |
| `npm run typecheck -w apps/drive` | Types Drive (`tsc --noEmit`) — non exposé à la racine |
| `npm run test -w apps/drive` | Tests Vitest Drive une fois (`vitest run`) |
| `npm run test:watch -w apps/drive` | Tests Vitest Drive en watch |
| `npm run preview -w apps/drive` | Sert le build prod Drive (`vite preview`) |
| `npm run dev -w apps/stock` | Stock dev direct (= stock:dev) |
| `npm run start -w apps/stock` | Sert le build prod Stock (`next start`) |
| `npm run lint -w apps/stock` | Lint Stock (`next lint`) |
| `npm run typecheck -w apps/stock` | Types Stock (`tsc --noEmit`) — non exposé à la racine |

Pas de script de formatage : Prettier 3 est en devDep racine mais **sans config ni script** — ne présume pas d'un `npm run format`.

## Conventions & hard rules

- **Français partout** : code, issues, titres de PR, commits, tests. Emploie le vocabulaire métier de `CONTEXT.md` (pas de jargon SaaS).
- **Design tokens = source unique** : éditer `apps/drive/src/config/brand.ts` (Drive) et `apps/stock/app/globals.css` (Stock). **JAMAIS de hex en dur** dans les composants. Palette commune : sapin `#0E3B2E`, or `#C9A227`, crème `#FAF7EE`.
- **Identité** : Stock est **dark par défaut** (mode atelier nuit), mode jour crème en opt-in ; identité halal/maghrébine tasteful (salutations *Sabah el khir* / *Msa el khir*, repères hijri via `lib/hijri.ts`).
- **DB append-only** : toute évolution de schéma = **NOUVEAU fichier** dans `supabase/migrations/` (horodaté). Ne jamais éditer une migration existante ni un `.OBSOLETE`/`_archive`. Tenir `SCHEMA.md` à jour. Schéma partagé entre Drive et Stock (un seul projet `tltmermqodelorthtbre`).
- **Lire `WORKFLOW.md`** avant toute feature touchant Drive, Pro, paiement, préparation, réception, sortie, transfert, inventaire, labo ou admin.
- **Drive code-splitting** : routes via `React.lazy` dans `App.tsx` + `manualChunks` vendor dans `vite.config` — préserver ce découpage (sinon le bundle vendor regonfle à ~700 KB).
- **Tests** : Drive = Vitest (jsdom), fichiers `src/**/*.{test,spec}.{ts,tsx}`, setup `src/test/setup.ts`. Stock **n'a aucun runner de test** configuré.
- **Installs** : rester en `npm install --legacy-peer-deps`. Les `vercel.json` d'app installent via `cd ../.. && npm install --legacy-peer-deps`. Côté Drive il traîne `bun.lock` + `bun.lockb` + `package-lock.json` — **s'en tenir à npm**.

## Agent skills (Matt Pocock)

- **Issue tracker** : GitHub `Milouze27/salamarket` — voir `docs/agents/issue-tracker.md`.
- **Triage** : state-machine canonique à 5 rôles — voir `docs/agents/triage-labels.md`.
- **Domain** : single-context `CONTEXT.md` + `docs/adr/` — voir `docs/agents/domain.md`.

## Gotchas

- **Comptes multiples = piège n°1** : `vercel`/`gh`/`supabase` échouent en 403/404 silencieux si le mauvais compte est actif. Toujours `vercel whoami` / `gh auth status` / `supabase projects list` AVANT d'agir (cf. table en tête).
- **CSP enforced côté Stock** (`next.config.mjs`) + HSTS preload 2 ans (**irréversible** côté navigateur). Toute nouvelle origine réseau (Stripe / Supabase / Anthropic / Sentry) doit être ajoutée à la CSP, sinon elle est bloquée en prod. Drive a aussi sa CSP + HSTS dans `apps/drive/vercel.json`.
- **Service Worker Stock** (`public/sw.js` + SWRegister) versionne ses caches sur `NEXT_PUBLIC_BUILD_ID` = SHA du commit (généré dans `next.config.mjs` depuis `VERCEL_GIT_COMMIT_SHA`). Une release qui ne change pas le SHA peut servir un cache périmé ; en dev le build id vaut `dev`.
- **Route `/staff/preparation` dépréciée** (2026-05-16) → **301 vers `/v2/preparation`** (redirect dans `next.config.mjs` + map dans `middleware.ts`). Le dossier `app/staff/` n'existe plus dans le repo (seul subsiste le redirect ; le `DEPRECATED.md` mentionné en commentaire du `next.config.mjs` n'existe pas). La nouvelle UI staff vit sous `app/v2/*`.
- **Crons Vercel uniquement côté Stock** (`apps/stock/vercel.json`, 7 jobs) : `/api/cron/{inventaire-tournant, daily-z, monthly-report, casse-weekly-digest, refresh-cockpit, forecast, dlc-scan}`.
- **Pas de `vercel.json` racine** : chaque app a le sien (framework + `installCommand 'cd ../.. && npm install --legacy-peer-deps'`). Build id Stock aligné sur `VERCEL_GIT_COMMIT_SHA`.
- **Edge Functions Deno** déployées via CLI Supabase. Secrets/env par app : voir `.env.example`, `.env.local.example`, `.env.production` (non commités).

## Do / Don't

- ✅ Vérifier le compte (`vercel`/`gh`/`supabase`) AVANT toute commande infra.
- ✅ Lire `WORKFLOW.md` / `SCHEMA.md` / `CONTEXT.md` avant de coder une feature métier.
- ✅ Créer une **nouvelle** migration horodatée pour tout changement DB.
- ✅ Passer par `brand.ts` (Drive) / `globals.css` (Stock) pour toute couleur/token.
- ❌ Ne pas éditer une migration existante, un `.OBSOLETE` ou un `_archive`.
- ❌ Ne pas mettre de hex en dur dans un composant ni présumer d'un `npm run format`.
- ❌ Ne pas casser le code-splitting Drive (`React.lazy` + `manualChunks`).
- ❌ Ne pas ajouter une origine réseau sans l'inscrire dans la CSP Stock (et Drive).
- ❌ Ne pas faire d'install « propre » sans `--legacy-peer-deps`, ni basculer sur bun.
