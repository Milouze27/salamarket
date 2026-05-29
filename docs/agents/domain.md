# Domain Docs

How the engineering skills should consume this monorepo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`WORKFLOW.md`** at the repo root — master business logic bible. Always read first for any feature touching Drive, Pro, paiement, préparation, réception, sortie, transfert, inventaire, labo, admin.
- **`CONTEXT.md`** at the repo root — canonical glossary (~80 terms).
- **`SCHEMA.md`** at the repo root — full DB reference (36 tables, triggers, RLS, enums).
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a **single-context monorepo** — one shared glossary and one ADR series cover both apps (`apps/drive` and `apps/stock`), because they share the same Supabase database and the same domain language.

```
/
├── WORKFLOW.md          ← master business logic bible
├── CONTEXT.md           ← domain glossary
├── SCHEMA.md            ← DB reference
├── CLAUDE.md            ← entry point for Claude Code
├── docs/
│   ├── agents/
│   │   ├── issue-tracker.md
│   │   ├── triage-labels.md
│   │   └── domain.md    ← this file
│   └── adr/
│       ├── README.md
│       ├── 0001-monorepo-migration.md
│       └── 0002-...md
├── apps/
│   ├── drive/
│   └── stock/
├── packages/
│   └── shared/
└── supabase/
    ├── migrations/
    └── functions/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (monorepo migration) — but worth reopening because…_
