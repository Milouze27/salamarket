# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues at [`Milouze27/salamarket-drive`](https://github.com/Milouze27/salamarket-drive). Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
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

Other labels currently present in the repo (GitHub defaults):

- `bug` — something isn't working
- `enhancement` — new feature or request
- `documentation` — improvements or additions to documentation
- `duplicate` — already exists
- `good first issue`
- `help wanted`
- `invalid`
- `question`

The canonical triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`) may not yet exist as GitHub labels — create them on first use via `gh label create "<name>" --description "..." --color "<hex>"`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
