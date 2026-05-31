# Cron Setup — Salamarket

Documentation des crons en production. Le projet utilise une stratégie HYBRIDE :
- **Vercel Crons** (Next.js routes) pour les schedules orchestrés par l'app Stock.
- **Supabase Edge Function Schedules** (pg_cron via Dashboard) en miroir pour
  les jobs critiques DB (refresh des matérialized views).

La redondance est intentionnelle : si Vercel tombe (rebuild, downtime),
les crons Supabase couvrent les MV. Si Supabase pg_cron est désactivé
(plan Free), les routes Vercel prennent le relais.

## Crons en production

| Job | Schedule | Vercel route | Supabase fn | Notes |
|-----|----------|--------------|-------------|-------|
| Inventaire tournant | `0 7 * * *` (matin Paris) | `/api/cron/inventaire-tournant` | — | Assigne 7 produits aléatoires à un employé/dépôt |
| Daily Z | `59 23 * * *` (fin de journée) | `/api/cron/daily-z` | — | Calcule + email le Z |
| Monthly report | `0 6 1 * *` (1er du mois) | `/api/cron/monthly-report` | — | Rapport mensuel |
| Casse digest hebdo | `0 6 * * 1` (lundi 06h UTC ≈ 07-08h Paris) | `/api/cron/casse-weekly-digest` | `casse-weekly-digest` | Email Otmane stats casse semaine |
| Refresh cockpit cache | `0 1 * * *` (02h Paris hiver / 03h été) | `/api/cron/refresh-cockpit` | `refresh-cockpit-cache` | MV ventes quotidiennes + casse baseline |
| Forecast stockouts | `0 */6 * * *` (toutes 6h) | `/api/cron/forecast` | `forecast-stockouts` | Holt smoothing + hijri multiplier |
| DLC scan | `0 * * * *` (toutes 1h) | `/api/cron/dlc-scan` | `dlc-scan` | Détecte produits proches DLC |

## Configuration

### Vercel (apps/stock/vercel.json)
Les schedules sont déclarés dans `apps/stock/vercel.json` sous `crons[]`.
Chaque route HTTP vérifie `Authorization: Bearer ${CRON_SECRET}` (Vercel
ajoute automatiquement ce header sur les routes cron).

### Supabase Edge Functions (Dashboard)
Pour chaque fonction edge listée ci-dessus, configurer un schedule via :
`Dashboard → Edge Functions → [function] → Schedules → Add Schedule`

Schedule recommandés :
- `refresh-cockpit-cache` : `0 1 * * *` UTC
- `forecast-stockouts` : `0 */6 * * *` UTC
- `casse-weekly-digest` : `0 6 * * 1` UTC (lundi 06h UTC)
- `dlc-scan` : `0 * * * *` UTC

### pg_cron (alternative gratuite Supabase)
Si l'instance Supabase n'a pas accès aux Edge Function schedules
(plan Free), activer pg_cron côté SQL :

```sql
-- Une seule fois : enable l'extension
create extension if not exists pg_cron;

-- Cron equivalent pour refresh MV
select cron.schedule(
  'refresh_cockpit_nightly',
  '0 1 * * *',
  $$select public.refresh_mv_ventes_quotidiennes(); select public.refresh_casse_views();$$
);
```

## Vérification

Pour chaque cron, vérifier dans Vercel/Supabase logs :
- Pas d'erreur 5XX en série (plus de 3 d'affilée = page)
- Le job s'est exécuté dans la fenêtre attendue (±10 min)
- La sortie JSON contient `ok: true`

## Plan de bascule (en cas de downtime)

Si Vercel cron down :
1. Vérifier Supabase Edge Function schedule miroir pour le même job
2. Si absent, déclencher manuellement via Dashboard → Edge Functions → Invoke
3. Pour le cockpit : `select public.refresh_mv_ventes_quotidiennes();` direct SQL

Si Supabase down :
1. La route Vercel `/api/cron/refresh-cockpit` continue de tourner mais
   échouera silencieusement faute de DB — c'est OK, Otmane verra des
   stats stale et un banner.
