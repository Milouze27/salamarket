# INCIDENT 2026-05-30 — Vercel deploys Blocked par email git incorrect

> **Severity** : High (a fait perdre ~2h de debug)
> **Project** : Salamarket monorepo (`Milouze27/salamarket`)
> **Status** : Fix appliqué côté git config, reste à fix côté Vercel/GitHub user link (action user)

## Symptômes

- ~10 commits poussés sur `main` du monorepo
- Tous marqués **`Blocked`** par Vercel (dashboard) ou **`UNKNOWN`** (CLI)
- Bandeau warning sur le dashboard : **"GitHub user not found"** + **"Vercel Account: Unavailable"**
- Bouton **"Fix Git Configuration"** proposé

## Root cause

Le `git config user.email` local était à `rmdiscount3182@gmail.com` (compte GitHub `Milouze27`), pas à `dadibelhamiti7@gmail.com` (compte `abumeryem` lié à l'org Vercel `abumeryems-projects`).

Vercel vérifie l'**email du commit author** en plus du compte CLI / dashboard. Si l'email n'est pas lié à un user Vercel autorisé sur l'org, le deploy est bloqué AVANT même de tenter le build (build duration `0ms`).

## Ce qui a trompé le debug (2h perdues)

- `vercel whoami` retournait bien `abumeryem` → on pensait que l'auth Vercel CLI était suffisante
- `vercel project inspect` montrait `rootDirectory: apps/stock` + framework correct
- On a chassé : quota Hobby, build queue stuck, GitHub App permissions révoquées, monorepo workspace install (sous-problème réel mais pas le bloqueur principal)
- Le screenshot du dashboard utilisateur a finalement révélé l'erreur explicite "GitHub user not found"

## Fix minimal appliqué

```bash
git config user.email "dadibelhamiti7@gmail.com"
git config user.name "abumeryem"
git commit --allow-empty -m "fix(deploy): corriger commit author email"
git push origin main
```

## ⚠️ Le fix email seul ne suffit PAS forcément

Il faut aussi que **l'un de ces 3 cas** soit vrai :
- Le GitHub user propriétaire du repo (`Milouze27`) ait `dadibelhamiti7@gmail.com` comme email **vérifié** sur son profil GitHub
- OU le repo soit transféré vers le compte GitHub lié à `dadibelhamiti7@gmail.com`
- OU click sur **"Fix Git Configuration"** dans le bandeau Vercel pour passer par le wizard de liaison automatique

## Règle générale (à mémoriser pour TOUS les futurs agents)

**Avant TOUT push sur un repo Salamarket déployé sur Vercel** :

```bash
# 1. Vercel CLI auth
vercel whoami            # doit retourner: abumeryem

# 2. Git author email (CRITIQUE pour auto-deploys)
git config user.email    # doit retourner: dadibelhamiti7@gmail.com
git config user.name     # doit retourner: abumeryem
```

Si l'un des deux est faux, fix AVANT de push, sinon le deploy sera Blocked en silence.

## Références croisées

- Auto-memory file : `~/.claude/projects/-Users-mac/memory/reference_vercel_account.md`
- Auto-memory file : `~/.claude/projects/-Users-mac/memory/reference_github_accounts.md`
- Monorepo CLAUDE.md section "Comptes obligatoires" (en tête)

## Tags

`vercel` · `git` · `deploy` · `incident` · `blocker` · `monorepo` · `commit-author-email`
