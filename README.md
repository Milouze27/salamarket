# Salamarket

Monorepo Salamarket — plateforme halal multi-canal pour K & A FOOD (Toulouse).

## Structure

```
salamarket/
├── apps/
│   ├── drive/      # PWA client (Vite + React) — salamarket-drive.vercel.app
│   └── stock/      # PWA staff (Next.js 14) — salam-stock.vercel.app
├── packages/
│   └── shared/     # Code partagé (drive-pesee, types Supabase, etc.)
├── supabase/
│   ├── config.toml
│   ├── migrations/ # Toutes les migrations unifiées
│   └── functions/  # Edge functions Deno
├── docs/
│   └── agents/     # Config Matt Pocock skills (issue tracker, triage, domain)
├── WORKFLOW.md     # Bible métier complète
├── SCHEMA.md       # Référence DB
├── CONTEXT.md      # Glossaire domaine
└── CLAUDE.md       # Entry point Claude Code
```

## Quick start

```bash
npm install                # installe les workspaces
npm run drive:dev          # démarre Drive en dev (port 8081)
npm run stock:dev          # démarre Stock en dev (port 3000)
npm run drive:build        # build Drive
npm run stock:build        # build Stock
```

## Stack

- **Drive** : Vite + React 18 + React Router + shadcn/ui + Tailwind
- **Stock** : Next.js 14 App Router + Tailwind
- **DB** : Supabase Postgres (projet `tltmermqodelorthtbre`) — partagée
- **Auth** : Supabase Auth (Drive) + PIN client-side (Stock V2)
- **Paiements** : Stripe (mode test) — Checkout standard + Elements manual capture
- **Hosting** : Vercel (org `abumeryems-projects`)
- **Font** : Plus Jakarta Sans
- **Palette** : `#0E3B2E` (sapin) · `#C9A227` (or) · `#FAF7EE` (crème)

## Docs

- [`WORKFLOW.md`](./WORKFLOW.md) — bible métier complète (parcours, business rules, Stripe, sync)
- [`SCHEMA.md`](./SCHEMA.md) — schéma DB exhaustif (36 tables, triggers, RLS)
- [`CONTEXT.md`](./CONTEXT.md) — glossaire domaine
- [`CLAUDE.md`](./CLAUDE.md) — entry point pour Claude Code

## Démo

10 juin 2026 avec Ahmed Nasri (proprio K & A FOOD) + Otmane Jamal (manager) + Mohamed Belhamiti (associé).
