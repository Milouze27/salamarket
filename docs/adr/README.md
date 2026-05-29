# Architecture Decision Records

This directory holds **ADRs** — short markdown documents that capture a single architectural decision: the context that forced it, the options considered, the choice made, and the consequences.

## When to write one

Write an ADR when you make a decision that:

- Constrains future code (e.g. "all Drive payment flows use Stripe manual capture")
- Resolves a debated tradeoff (e.g. "keep `orders` and `commandes_drive` as separate tables instead of merging")
- Establishes a convention that a newcomer would otherwise re-litigate
- Locks in a vendor or library choice with non-trivial switching cost

Don't write an ADR for routine implementation details, bug fixes, or decisions that are already captured in `CONTEXT.md` as glossary terms.

## Format

One file per decision, numbered sequentially: `0001-short-kebab-title.md`, `0002-...`, etc.

Recommended skeleton:

```markdown
# ADR-NNNN: Short title

- **Status**: proposed | accepted | superseded by ADR-MMMM
- **Date**: YYYY-MM-DD

## Context

What problem are we solving? What constraints apply?

## Decision

What did we decide? Be specific.

## Consequences

What becomes easier, harder, or different as a result? What did we trade away?
```

## Conventions in this repo

- ADRs are written in French or English — match the surrounding docs (most of the team operates in French).
- Reference `CONTEXT.md` terms when discussing domain concepts; don't redefine them inline.
- When an ADR is superseded, update its status header — don't delete the file.
- If an agent's output contradicts an existing ADR, the agent must surface the conflict explicitly rather than silently overriding (per `docs/agents/domain.md`).
