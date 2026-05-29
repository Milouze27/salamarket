# Salamarket Drive

Customer-facing PWA (Vite + React 18 + React Router) for K & A FOOD's halal click & collect Drive — B2C catalogue + cart + slot booking + Stripe checkout, plus a B2B Pro flow with HT pricing and volume discounts. Connected to Supabase project `tltmermqodelorthtbre` and a sibling staff app at `salam-stock.vercel.app`.

## Agent skills

### Issue tracker

Issues live in GitHub at `Milouze27/salamarket-drive`. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical 5-role triage state machine. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

## Quick references

- **`/Users/mac/WORKFLOW.md`** — master business logic bible (B2C/B2B flows, Stripe pre-auth/capture, slots, sync triggers, roles, TVA, data model). Always read this before touching domain logic.
- **`src/config/brand.ts`** — single source of truth for design tokens (palette, typography, spacing). Edit here, not in component files.
- **`supabase/migrations/`** — DB schema evolution. New tables/columns require a new migration file; don't edit existing ones.
