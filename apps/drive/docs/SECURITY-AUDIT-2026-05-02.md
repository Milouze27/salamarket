# Security audit — 2026-05-02

**Scope** : code source actuel sur `main` (HEAD `969b3ec`, tag `pre-autonomy-2026-05-02`).
**Method** : audit statique 6 axes (secrets/env, RLS, edge functions, auth flow, frontend, PWA).
**Verdict global** : **OK pour pitch**. Aucun finding *high severity* nécessitant un fix code. Quelques recommandations *low/medium* documentées ci-dessous.

---

## A — Secrets & env

| Variable | Surface | Verdict |
|---|---|---|
| `VITE_SUPABASE_URL` | Front (vite) | ✅ publique attendue |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) | Front | ✅ publique attendue |
| `VITE_VAPID_PUBLIC_KEY` | Front | ✅ publique attendue (web push) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge functions only | ✅ jamais référencée dans `src/` |
| `STRIPE_SECRET_KEY` | Edge functions only | ✅ jamais référencée dans `src/` |
| `VAPID_PRIVATE_KEY` | Edge functions only | ✅ jamais référencée dans `src/` |

`grep "console\.(log|error|warn).*(?:token|secret|password|key)" src/` → **0 match**. Aucun leak de secret en logs frontend.

⚠️ **L1 — `.env.example` absent du repo.** Pas critique, mais un nouveau dev qui clone le repo n'a aucun template des variables nécessaires. Recommandation : créer `.env.example` (côté front uniquement, ne pas y mettre les clés serveur Supabase).

## B — RLS Policies Supabase

Tables auditées via `supabase/migrations/` :

| Table | RLS enabled | Policies | Verdict |
|---|---|---|---|
| `products` | ✅ | SELECT public (lecture catalogue) | ✅ approprié |
| `profiles` | ✅ | SELECT/INSERT/UPDATE own (`auth.uid() = id`) | ✅ |
| `pickup_slots` | ✅ | SELECT public | ✅ approprié |
| `push_subscriptions` | ✅ | SELECT/INSERT/UPDATE/DELETE own (`auth.uid() = user_id`) | ✅ — UPDATE policy ajoutée par migration `push_subscriptions_update_policy.sql` |

⚠️ **M1 — Migrations manquantes dans le repo : `orders` et `profiles.role`.**
Les types Supabase générés (`src/integrations/supabase/types.ts:17`) confirment l'existence de la table `orders` et de la colonne `profiles.role`, mais aucune migration au repo ne les crée. Elles ont sans doute été appliquées via Lovable Cloud SQL Editor sans être commitées. Conséquences :
- Le projet n'est pas reproductible à 100 % from scratch (un nouveau dev devra les recréer manuellement).
- **Les RLS sur `orders` ne sont pas vérifiables côté code.** Le frontend `useEmployeeOrders.ts` et `services/admin.ts` font des `from("orders").select(...)` directs — ça implique une RLS qui autorise les rôles admin/employee à voir tous les orders, et qui interdit à un client de voir d'autres orders que les siens.

**Recommandation** : exporter les RLS courantes sur `orders` depuis Supabase Studio et les commiter dans une migration `<timestamp>_orders_table.sql`. Vérifier en particulier :
- `SELECT` : `auth.uid() = user_id OR get_user_role() IN ('admin','employee')`
- `INSERT` : autorisé par service_role uniquement (les clients passent par `create-checkout-session`)
- `UPDATE` : autorisé par service_role uniquement (sinon un client peut self-promote son order à `picked_up`)

Ce n'est pas un finding "j'ai vu un bug" — c'est "je n'ai pas pu vérifier, à confirmer côté Studio".

## C — Edge functions

| Function | Auth check | Validation inputs | Role check | Verdict |
|---|---|---|---|---|
| `create-checkout-session` | ✅ JWT user | ✅ stricte (qty 1-50, in_stock, créneau futur ≥1h) | N/A (tout user authentifié) | ✅ excellent |
| `confirm-order` | ✅ JWT user | ✅ + ownership check (`.eq("user_id", user.id)`) | N/A | ✅ excellent — idempotent + race-safe (`.eq("status","pending")`) |
| `verify-checkout-session` | ✅ JWT user | ✅ + ownership check | N/A | ✅ explicitement read-only (commentaire en tête) |
| `update-order-status` | ✅ JWT user | ✅ whitelist `KANBAN_STATUSES` | ✅ admin OR employee | ✅ |
| `notify-new-order` | ❌ **pas d'auth** | partielle (filtre type=INSERT/table=orders) | N/A | ⚠️ M2 — voir ci-dessous |
| `ensure-slots` | ❌ **pas d'auth** | N/A | N/A | ⚠️ L2 — voir ci-dessous |

⚠️ **M2 — `notify-new-order` sans auth check.**
Le brief mission indique explicitement "Auth check au début (sauf notify-new-order qui est appelée en interne)" — donc **trade-off accepté**. Mais conséquence : un attaquant qui découvre l'URL publique `https://<project>.supabase.co/functions/v1/notify-new-order` peut envoyer un payload arbitraire `{ type: "INSERT", table: "orders", record: { total_cents: 99999900, ... } }` et déclencher des notifications push trompeuses aux admins/employees ("Commande de 999 999 €").

Pas de fuite de données ni de corruption en base, mais perte de confiance possible. **Mitigation future** (post-pitch) : header partagé `X-Webhook-Secret` vérifié par la function, configuré aussi dans le Database Webhook Supabase.

⚠️ **L2 — `ensure-slots` sans auth check.**
La fonction est upsert idempotent (pas de corruption possible) et retourne la liste publique des créneaux (qui est de toute façon lisible en RLS). Risque limité à du DDoS / consommation quota service_role. À envisager : auth optionnelle ou rate limiting Supabase.

⚠️ **L3 — Pas de rate limiting** sur les edge functions. Acceptable pour le pitch, mais si l'app décolle, ajouter rate limiting par user via une table `rate_limits` ou via les features Supabase (si dispo).

## D — Auth flow

- ✅ Tokens stockés via Supabase SDK (localStorage). Pas de leak en logs.
- ✅ **Defense in depth** : routes `/admin`, `/admin/reglages`, `/employe` protégées côté React (`RoleProtectedRoute` dans `src/App.tsx:79-99`) ET côté edge function (`update-order-status` re-check le role via `get_user_role()` RPC).
- ✅ Stripe `metadata` cross-checked dans `confirm-order` (`session.metadata?.order_id !== order_id` → 400) — empêche un attaquant de réutiliser une session Stripe d'une autre commande.

## E — Frontend surface

| Check | Résultat |
|---|---|
| `dangerouslySetInnerHTML` | 1 occurrence dans `src/components/ui/chart.tsx:70` — composant shadcn/ui standard pour injecter du CSS dérivé du config chart, pas de user input. ✅ |
| `eval(` | 0 match. ✅ |
| `target="_blank"` | 0 match. N/A. ✅ |
| CSRF | Géré par Supabase via JWT (pas de form classique avec session cookie). ✅ |

## F — PWA specific

| Check | Résultat |
|---|---|
| Service Worker n'intercepte pas les routes API | ✅ `sw.js:26-30` exclut `/functions/v1/`, `supabase.co`, `stripe.com` |
| Manifest scope correct | ✅ `scope: "/"` |
| Network-first pour navigation HTML | ✅ avec fallback `offline.html` |
| HTTPS only | ✅ via Lovable Cloud (auto) |
| Push handler propre (`waitUntil`) | ✅ `sw.js:58-77` |

---

## Résumé

| Severity | Count | Items |
|---|---|---|
| 🔴 High | 0 | — |
| 🟡 Medium | 2 | M1 (migrations orders/role absentes), M2 (notify-new-order sans auth — trade-off accepté) |
| 🟢 Low | 3 | L1 (.env.example absent), L2 (ensure-slots sans auth), L3 (pas de rate limiting) |

**Aucun fix code requis avant le pitch.** Les 4 money shots ne sont pas impactés.

## Recommandations post-pitch

1. **Commiter les RLS de `orders`** (export depuis Supabase Studio → migration `<ts>_orders_table.sql`), confirmer qu'un client ne peut pas SELECT/UPDATE les orders d'autres users.
2. **Ajouter un secret partagé** sur `notify-new-order` (X-Webhook-Secret), à configurer aussi dans le Database Webhook Supabase.
3. **Créer `.env.example`** avec les 3 variables `VITE_*` (sans valeur).
4. **Auth optionnelle ou rate limiting** sur `ensure-slots` si l'app prend du volume.
5. **Rate limiting global** par user sur les edge functions sensibles (`create-checkout-session`, `update-order-status`).
