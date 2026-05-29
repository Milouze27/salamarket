# ADR-0001: Migration vers un monorepo Salamarket

- **Status**: accepted
- **Date**: 2026-05-29

## Context

Jusqu'à mai 2026, Salamarket vivait dans **deux dépôts Git séparés** :

- `Milouze27/salamarket-drive` — PWA client (Vite + React 18)
- `AbuMeryem/salam-stock` — PWA staff (Next.js 14 App Router)

Les deux apps partagent :

- **la même base Supabase** (`tltmermqodelorthtbre`) — donc le même schéma SQL, les mêmes migrations, les mêmes RLS, les mêmes edge functions
- **le même langage métier** — `commandes_drive`, `produits`, `unit_type`, `statut_paiement`, kanban, pesée, dépôts, etc. (cf. `CONTEXT.md`)
- **les mêmes triggers de sync** entre `orders` (Drive) et `commandes_drive` (Stock) qui doivent évoluer de manière atomique
- **le même design system** (palette sapin / nuit / or / crème, Plus Jakarta Sans, cf. WORKFLOW §design)
- **la même équipe** (Ahmed Nasri proprio, Otmane Jamal manager, Mohamed Belhamiti associé)

Problèmes pratiques en multi-repo :

1. **Documentation dupliquée** — `CONTEXT.md`, `CLAUDE.md`, `docs/agents/`, `docs/adr/` existaient en double, dérivaient indépendamment, contredisaient l'autre côté.
2. **Migrations Supabase dupliquées** — `supabase/migrations/` vivait dans `salam-stock` mais les triggers touchaient des tables Drive (`orders`, `commandes_drive`). Pas de source de vérité unique.
3. **PRs cross-cutting impossibles** — une feature qui touche le sync forward (`sync_drive_order_to_stock_trigger`) nécessite changes Drive + Stock + migration ; impossible à reviewer atomiquement.
4. **Issues éclatées** — un bug "le statut ne se sync pas" ouvert sur quel repo ? Les deux ? Tracking chaotique.
5. **Design tokens** — risque de dérive entre `brand.ts` (Drive) et `globals.css` (Stock).

## Decision

Migrer vers un **monorepo unique** `Milouze27/salamarket` avec :

- **`npm workspaces`** (Node ≥ 20, npm ≥ 10) — pas de Turborepo, pas de Nx, on garde simple.
- Layout :

  ```
  salamarket/
  ├── apps/
  │   ├── drive/      ← ex salamarket-drive
  │   └── stock/      ← ex salam-stock
  ├── packages/
  │   └── shared/     ← code partagé (drive-pesee, types Supabase)
  ├── supabase/       ← migrations + edge functions unifiées
  ├── docs/
  │   ├── agents/     ← config Matt Pocock skills
  │   └── adr/
  ├── WORKFLOW.md     ← bible métier (copiée depuis /Users/mac/WORKFLOW.md)
  ├── SCHEMA.md       ← référence DB (ex apps/stock/SCHEMA.md)
  ├── CONTEXT.md      ← glossaire unifié (~80 termes)
  └── CLAUDE.md       ← entry point unique
  ```

- **Documentation unifiée à la racine** : un seul `CLAUDE.md`, un seul `CONTEXT.md`, un seul `SCHEMA.md`, un seul `WORKFLOW.md`, un seul `docs/agents/`, un seul `docs/adr/`. Les `docs/agents/` et `docs/adr/` per-app ont été supprimés.
- **Issues centralisées** sur `Milouze27/salamarket` avec scoping par labels `app:drive`, `app:stock`, `app:supabase`, `app:shared` (cf. `docs/agents/issue-tracker.md`).
- **Deux déploiements Vercel séparés** maintenus : `salamarket-drive.vercel.app` (root dir = `apps/drive`) et `salam-stock.vercel.app` (root dir = `apps/stock`). Pas de bundling joint.
- **Migrations Supabase** : un seul dossier `supabase/migrations/` à la racine, source de vérité unique. Les renames historiques (`apps/stock/supabase/migrations/*` → `supabase/migrations/*`) sont préservés par `git mv`.

## Consequences

**Plus facile :**

- Une PR peut toucher Drive + Stock + migration atomiquement.
- Un seul glossaire `CONTEXT.md` (~80 termes dédupliqués) — fini les divergences.
- Un seul tracker d'issues, scopé par `app:*` — visibilité globale du backlog.
- Les agents Claude Code ont **un seul `CLAUDE.md`** à lire au démarrage, qui pointe vers `WORKFLOW.md` pour le détail.
- Refactor cross-cutting (renommer `produits` en `products`, unifier `statut`) devient un changement local.
- Design tokens : la prochaine étape sera de remonter `brand.ts` dans `packages/shared` pour vraie source unique.

**Plus dur / arbitrages :**

- Builds CI plus longs si on déclenche tout sur chaque PR — à terme il faudra du **path-filtering** dans les workflows GitHub Actions (`paths: apps/drive/**` etc.).
- Les contributors doivent installer `npm install` à la racine (workspaces) — pas dans chaque app.
- Historique Git des deux repos d'origine n'a pas été préservé via `git subtree` ; on a fait une importation snapshot. **Trade-off accepté** : l'historique pré-migration reste consultable dans les dépôts archivés.
- Vercel : il faut configurer `Root Directory = apps/drive` et `apps/stock` sur les deux projets ; et la commande `npm install` doit tourner à la racine (workspaces).

## Ce qui a été fait le 2026-05-29 (migration)

- `WORKFLOW.md` copié depuis `/Users/mac/WORKFLOW.md` vers la racine du monorepo.
- `SCHEMA.md` déplacé via `git mv` depuis `apps/stock/SCHEMA.md` vers la racine.
- `CONTEXT.md` créé à la racine en fusionnant les deux glossaires (Drive ~50 termes + Stock ~50 termes) en ~80 termes dédupliqués.
- `CLAUDE.md` créé à la racine, remplaçant les deux per-app (supprimés).
- `docs/agents/{issue-tracker,triage-labels,domain}.md` créés à la racine, per-app supprimés.
- `docs/adr/{README.md,0001-monorepo-migration.md}` créés (ce fichier).
- Référence GitHub canonique : **`Milouze27/salamarket`**.

## Suivi

- ADR-0002 (à écrire) : promouvoir `brand.ts` dans `packages/shared` comme source unique des tokens design.
- ADR-0003 (à écrire) : path-filtering CI sur les workflows GitHub Actions.
- ADR-0004 (à écrire) : résoudre la dette `products` vs `produits` (cf. CONTEXT — migration 0023 jamais appliquée).
