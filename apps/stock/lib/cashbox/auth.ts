/**
 * Garde d'authentification partagée pour les routes /api/cashbox/* qui
 * exposent des données fiscales (CA, TVA, frais Stripe, net encaissé).
 *
 * Aucune de ces données ne doit être servie sur un GET public : un tiers
 * qui devine `date`/`mois` récupérerait sinon le chiffre d'affaires réel
 * de K & A FOOD. Les pages admin passent par des server actions qui
 * injectent le secret côté serveur (cf. lib/actions/cashbox.ts).
 *
 * Modes acceptés (alignés sur monthly-report-pdf) :
 *   - header `x-internal-secret` = INTERNAL_API_SECRET (server actions)
 *   - header `authorization: Bearer <CRON_SECRET>` (cron Vercel)
 *   - header `x-vercel-cron: 1` (cron Vercel runtime)
 */
export function checkCashboxAuth(req: Request): {
  ok: boolean;
  error?: string;
  status?: number;
} {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!internalSecret && !cronSecret) {
    return {
      ok: false,
      status: 503,
      error:
        "route cashbox mal configurée (INTERNAL_API_SECRET ou CRON_SECRET requis)",
    };
  }
  const provided = req.headers.get("x-internal-secret");
  if (internalSecret && provided === internalSecret) return { ok: true };
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return { ok: true };
  const vercelCron = req.headers.get("x-vercel-cron");
  if (cronSecret && vercelCron === "1") return { ok: true };
  return { ok: false, status: 401, error: "unauthorized" };
}
