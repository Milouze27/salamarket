"use server";

/**
 * Server actions wrappers pour /api/cashbox/monthly-report*.
 *
 * Les rapports mensuels exposent du P&L (CA, TVA collectée, top produits).
 * Ils ne doivent PAS être servis à un appel anonyme externe. La protection
 * se fait via x-internal-secret côté API route ; ces server actions
 * injectent le secret côté serveur sans l'exposer au browser.
 *
 * Pour les téléchargements PDF/CSV, on retourne le binaire en base64 :
 * le caller (client component) le convertit en Blob puis le passe à
 * downloadOrShare ou à un <a download>.
 */

import { headers } from "next/headers";

interface MonthlyReportSummary {
  // shape minimale — le caller la cast vers son type complet si besoin.
  consolidation: {
    ca_ttc_total: number;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

async function resolveOrigin(): Promise<string> {
  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function fetchMonthlyReport(
  mois: string,
): Promise<{ ok: boolean; data?: MonthlyReportSummary; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }

  const origin = await resolveOrigin();
  try {
    const res = await fetch(
      `${origin}/api/cashbox/monthly-report?mois=${encodeURIComponent(mois)}`,
      {
        headers: { "x-internal-secret": internalSecret },
        cache: "no-store",
      },
    );
    const json = (await res.json().catch(() => ({}))) as
      | MonthlyReportSummary
      | { error: string };
    if (!res.ok) {
      const errMsg =
        "error" in json && typeof json.error === "string"
          ? json.error
          : `HTTP ${res.status}`;
      return { ok: false, error: errMsg };
    }
    return { ok: true, data: json as MonthlyReportSummary };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface BinaryDownloadResult {
  ok: boolean;
  /** base64-encoded body */
  base64?: string;
  contentType?: string;
  filename?: string;
  error?: string;
}

async function fetchBinaryProtected(
  path: string,
  fallbackContentType: string,
  fallbackFilename: string,
): Promise<BinaryDownloadResult> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }

  const origin = await resolveOrigin();
  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { "x-internal-secret": internalSecret },
      cache: "no-store",
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, error: errText.slice(0, 200) };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? fallbackContentType;
    const dispo = res.headers.get("content-disposition") ?? "";
    const fnameMatch = dispo.match(/filename="?([^"]+)"?/);
    const filename = fnameMatch ? fnameMatch[1] : fallbackFilename;
    return {
      ok: true,
      base64: buf.toString("base64"),
      contentType,
      filename,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Récap fiscal journalier (daily-Z) : le JSON expose CA/TVA/net encaissé,
 * désormais protégés par x-internal-secret côté API route. Cette action
 * injecte le secret et renvoie le summary tel quel (le caller le cast vers
 * DailyZSummary).
 */
export async function fetchDailyZ(
  date: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }
  const origin = await resolveOrigin();
  try {
    const res = await fetch(
      `${origin}/api/cashbox/daily-z?date=${encodeURIComponent(date)}`,
      { headers: { "x-internal-secret": internalSecret }, cache: "no-store" },
    );
    const json = (await res.json().catch(() => ({}))) as
      | Record<string, unknown>
      | { error: string };
    if (!res.ok) {
      const errMsg =
        "error" in json && typeof json.error === "string"
          ? json.error
          : `HTTP ${res.status}`;
      return { ok: false, error: errMsg };
    }
    return { ok: true, data: json };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchDailyZPdf(
  date: string,
): Promise<BinaryDownloadResult> {
  return fetchBinaryProtected(
    `/api/cashbox/daily-z-pdf?date=${encodeURIComponent(date)}`,
    "application/pdf",
    `salam-drive-Z-${date}.pdf`,
  );
}

export async function fetchDailyZCsv(
  date: string,
): Promise<BinaryDownloadResult> {
  return fetchBinaryProtected(
    `/api/cashbox/daily-z-csv?date=${encodeURIComponent(date)}`,
    "text/csv; charset=utf-8",
    `salam-drive-Z-${date}.csv`,
  );
}

export async function fetchMonthlyReportPdf(
  mois: string,
): Promise<BinaryDownloadResult> {
  return fetchBinaryProtected(
    `/api/cashbox/monthly-report-pdf?mois=${encodeURIComponent(mois)}`,
    "application/pdf",
    `salam-rapport-mensuel-${mois}.pdf`,
  );
}

export async function fetchMonthlyReportCsv(
  mois: string,
): Promise<BinaryDownloadResult> {
  return fetchBinaryProtected(
    `/api/cashbox/monthly-report-csv?mois=${encodeURIComponent(mois)}`,
    "text/csv; charset=utf-8",
    `salam-rapport-mensuel-${mois}.csv`,
  );
}

/**
 * Imports CSV (catalogue stock / ventes cashmag) : ces routes mutent des
 * données en masse → protégées par x-internal-secret. Ces actions injectent
 * le secret côté serveur ; les pages admin les appellent au lieu d'un fetch
 * direct. Le JSON brut de la route est renvoyé tel quel (le caller le cast).
 */
async function postImportProtected(
  path: string,
  body: unknown,
): Promise<unknown> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return { ok: false, error: "INTERNAL_API_SECRET non configuré." };
  }
  const origin = await resolveOrigin();
  try {
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return await res.json().catch(() => ({
      ok: false,
      error: `HTTP ${res.status}`,
    }));
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function importStockAction(
  csv: string,
  depotId: string,
): Promise<unknown> {
  return postImportProtected("/api/cashbox/import-stock", {
    csv,
    depot_id: depotId,
  });
}

export async function importCashmagAction(
  csv: string,
  importedBy: string,
): Promise<unknown> {
  return postImportProtected("/api/cashbox/import-cashmag", {
    csv,
    importedBy,
  });
}
