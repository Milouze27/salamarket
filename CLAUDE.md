# Salamarket

Monorepo Salamarket — Drive (B2C/B2B Pro) + Stock (staff POS) sur Supabase partagé. Plateforme halal multi-canal pour K & A FOOD (SIRET 802 773 812, Toulouse).

## ⚠️ Comptes obligatoires AVANT toute action infra

Tout agent qui touche à `vercel`, `gh`, `supabase` doit checker le compte actif AVANT d'exécuter une commande. Sinon les commandes échouent silencieusement avec des 403/404 obscurs (incident récurrent qui a fait perdre des heures sur ce projet).

| Service | Compte à utiliser | Comment vérifier |
|---------|-------------------|------------------|
| **Vercel** (tous projets `*-mono`, drive, stock) | `dadibelhamiti7@gmail.com` → username `abumeryem` (org `abumeryems-projects`) | `vercel whoami` doit retourner `abumeryem`. Si non : `vercel login` puis choisir cet email. |
| **GitHub** monorepo `Milouze27/salamarket` | `Milouze27` | `gh auth status` puis `gh auth switch --user Milouze27` si besoin |
| **GitHub** legacy `AbuMeryem/salam-stock` | `AbuMeryem` | `gh auth switch --user AbuMeryem` |
| **GitHub** legacy `Milouze27/salamarket-drive` | `Milouze27` | `gh auth switch --user Milouze27` |
| **Supabase** projet `tltmermqodelorthtbre` | (CLI déjà loggé) | `supabase projects list` doit lister `salamarket-drive` |

**Règle absolue** : ne JAMAIS supposer que le compte actif est le bon. Toujours vérifier d'abord.

## Workspaces

- `apps/drive` — PWA client (Vite + React 18) → `salamarket-drive.vercel.app`
- `apps/stock` — PWA staff (Next.js 14) → `salam-stock.vercel.app`
- `packages/shared` — code partagé (drive-pesee, types Supabase)
- `supabase` — migrations + edge functions (projet `tltmermqodelorthtbre`)

## Agent skills

### Issue tracker

GitHub `Milouze27/salamarket`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role state machine. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at root. See `docs/agents/domain.md`.

## Quick references

- **`WORKFLOW.md`** — master business logic bible (B2C/B2B flows, Stripe pre-auth/capture, slots, sync triggers, roles, TVA, data model). Always read first for any feature touching Drive, Pro, paiement, préparation, réception, sortie, transfert, inventaire, labo, admin.
- **`SCHEMA.md`** — full DB reference (36 tables, 2 views, 7+ triggers, enums, sequences, RLS).
- **`CONTEXT.md`** — domain glossary (~80 terms) to use in code, issues, PR titles, tests.
- **`apps/drive/src/config/brand.ts`** — design tokens Drive (palette, typography, spacing). Edit here, not in component files.
- **`apps/stock/app/globals.css`** — design tokens Stock (CSS variables, same palette).
- **`supabase/migrations/`** — DB schema evolution (0001 → 0030+). New tables/columns require a new migration file; don't edit existing ones.
