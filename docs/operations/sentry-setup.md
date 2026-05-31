# Sentry Setup (Drive + Stock)

Backlog ref : `obs-no-sentry-error-tracking` (P1).

Sentry est armé côté code mais **ne tournera pas** tant que les variables d'env Vercel ne sont pas posées. Tant que `NEXT_PUBLIC_SENTRY_DSN` (Stock) et `VITE_SENTRY_DSN` (Drive) sont vides, `Sentry.init()` skip silencieusement. Le code est défensif : zéro impact si pas configuré.

## 1. Créer le compte Sentry (10 min)

1. https://sentry.io/signup/ — compte org `salamarket` (dadibelhamiti7@gmail.com).
2. Créer 2 projets :
   - `stock` — platform "Next.js" (App Router).
   - `drive` — platform "React".
3. Récupérer les DSN dans **Settings → Projects → [project] → Client Keys (DSN)**.

## 2. Créer l'auth token (upload sourcemaps)

1. **Settings → Account → Auth Tokens → Create New Token**.
2. Scopes : `project:read`, `project:releases`, `org:read`.
3. Copier le token (format `sntrys_...`).

## 3. Variables d'env Vercel

Sur **chaque** projet Vercel (Production + Preview + Development), poser :

### Projet `salam-stock` (Next.js)

```sh
NEXT_PUBLIC_SENTRY_DSN=https://xxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXX
SENTRY_DSN=https://xxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXX
SENTRY_ORG=salamarket
SENTRY_PROJECT=stock
SENTRY_AUTH_TOKEN=sntrys_xxxxxxxxxxxxxxxxxxxxx
```

> Note : la DSN n'est PAS un secret (elle est embarquée dans le bundle browser de toute façon). Mais le SENTRY_AUTH_TOKEN, lui, est sensible — ne le commit jamais.

### Projet `salamarket-drive` (Vite)

```sh
VITE_SENTRY_DSN=https://xxxxxxxxxxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXX
```

(Vite expose au browser tout ce qui commence par `VITE_`. Pas besoin du auth token côté Drive — on n'upload pas les sourcemaps Vite via Sentry pour l'instant.)

## 4. Commandes CLI Vercel (one-shot)

```sh
cd apps/stock
vercel env add NEXT_PUBLIC_SENTRY_DSN production
vercel env add NEXT_PUBLIC_SENTRY_DSN preview
vercel env add NEXT_PUBLIC_SENTRY_DSN development
vercel env add SENTRY_DSN production
vercel env add SENTRY_ORG production
vercel env add SENTRY_PROJECT production
vercel env add SENTRY_AUTH_TOKEN production

cd ../drive
vercel env add VITE_SENTRY_DSN production
vercel env add VITE_SENTRY_DSN preview
```

Prérequis : `vercel whoami` doit retourner `abumeryem` avant.

## 5. Vérification post-déploiement

1. Déclencher une exception volontaire :
   - Stock : `https://salam-stock.vercel.app/_sentry-test` (à créer si besoin) qui throw.
   - Drive : ouvrir la console et taper `Sentry.captureException(new Error("smoke test"))`.
2. Vérifier sur **sentry.io → [project] → Issues** que l'événement apparaît dans les 60s.
3. Confirmer que `environment: production` est tagué.

## 6. Alerting (à configurer côté Sentry)

- **Settings → Alerts → Create Alert Rule**.
- Stock : seuil "more than 5 events in 1h" → email + (optionnel) Slack `#alerts`.
- Drive : seuil "more than 10 events in 1h" (volume browser plus élevé).
- Issue assignment : auto-assign à `dadibelhamiti7@gmail.com` (owner unique pour l'instant).

## Architecture côté code

- **Stock** : `apps/stock/sentry.{client,server,edge}.config.ts` chargés par `withSentryConfig` (next.config.mjs). `instrumentation.ts` registre le hook `onRequestError` Next 14. `app/error.tsx` capture les erreurs SSR avec tag `digest`.
- **Drive** : `Sentry.init()` dans `src/main.tsx` avant `createRoot`. `src/components/ErrorBoundary.tsx` capture les erreurs React avec le `componentStack` en context.
- **tracesSampleRate** : 10% en prod, 100% ailleurs. Override possible par variable env si besoin de plus de granularité.

## Coûts attendus

- Plan **Developer** (free) : 5k errors + 10k performance units / mois. Suffit largement pour Drive+Stock vu le volume actuel (< 100 users/jour).
- Si scale → plan **Team** $26/mois pour 50k errors.
