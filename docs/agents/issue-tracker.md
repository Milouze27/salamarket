# Issue tracker: GitHub

Issues and PRDs for this monorepo live as GitHub issues at [`Milouze27/salamarket`](https://github.com/Milouze27/salamarket). Use the `gh` CLI for all operations.

> **Important** — this is a single repo backing both apps (`apps/drive` and `apps/stock`). Use the **scoping labels** below to indicate which app an issue concerns.

## Scoping labels

When opening an issue, apply one of:

- `app:drive` — touches `apps/drive` (client PWA)
- `app:stock` — touches `apps/stock` (staff PWA)
- `app:supabase` — DB migrations, edge functions, RLS, triggers
- `app:shared` — `packages/shared` or root tooling
- (cross-cutting issues that span multiple apps may use several `app:*` labels at once, or none)

Create these labels on first use via `gh label create "app:drive" --color "0E3B2E"` etc.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies. Prefix the title with `[drive]`, `[stock]`, `[supabase]`, or `[shared]` for human scannability and also apply the matching `app:*` label.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters. Scope by app with `--label app:drive` etc.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## Common labels in this repo

Canonical triage roles (see `triage-labels.md` for the state machine):

- `needs-triage` — maintainer needs to evaluate
- `needs-info` — waiting on reporter
- `ready-for-agent` — fully specified, AFK-ready
- `ready-for-human` — needs human implementation
- `wontfix` — will not be actioned (already exists as a GitHub default label)

Scoping (one per app, see above):

- `app:drive`, `app:stock`, `app:supabase`, `app:shared`

Other labels currently present in the repo (GitHub defaults):

- `bug` — something isn't working
- `enhancement` — new feature or request
- `documentation` — improvements or additions to documentation
- `duplicate` — already exists
- `good first issue`
- `help wanted`
- `invalid`
- `question`

The canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`) and the `app:*` scoping labels may not yet exist as GitHub labels — create them on first use via `gh label create "<name>" --description "..." --color "<hex>"`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue. Apply the matching `app:*` label.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
