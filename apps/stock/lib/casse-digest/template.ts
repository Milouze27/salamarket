/**
 * HTML template Casse Weekly Digest.
 *
 * Inline CSS uniquement (clients mail = Outlook 2007 IE engine, Gmail
 * strip <style>, Apple Mail OK). Pas de Tailwind ici.
 *
 * Tokens Drive DA (apps/stock/app/globals.css) :
 *   sapin #0E3B2E · gold #C9A227 · cream #FAF7EE · text #0F1A14
 * Font Plus Jakarta Sans (system fallback car custom font = bloqué par
 * la plupart des clients mail).
 */
import type { CasseDigestData, ActionRecommandee } from "./index";

const C = {
  sapin: "#0E3B2E",
  sapinDark: "#082A20",
  gold: "#C9A227",
  goldSoft: "#F4E9C4",
  cream: "#FAF7EE",
  white: "#FFFFFF",
  text: "#0F1A14",
  textMuted: "#5A6470",
  border: "#E8E4D8",
  danger: "#E5483D",
  dangerSoft: "#FEF2F1",
  success: "#2D7A4F",
  warning: "#D97706",
  warningSoft: "#FEF3E2",
};

const FONT_STACK =
  "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

const fmtEur = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });

const fmtEurDecimal = (n: number) =>
  n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });

function badgeDelta(delta: number | null): string {
  if (delta === null) {
    return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${C.cream};color:${C.textMuted};font-size:12px;font-weight:600;">premier point</span>`;
  }
  const positive = delta > 0;
  const bg = positive ? C.dangerSoft : "#E8F5EE";
  const fg = positive ? C.danger : C.success;
  const sign = positive ? "+" : "";
  const arrow = positive ? "&#x2197;" : "&#x2198;";
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${bg};color:${fg};font-size:12px;font-weight:700;">${arrow} ${sign}${delta}% vs S-1</span>`;
}

function badgePriorite(p: ActionRecommandee["priorite"]): string {
  const map: Record<ActionRecommandee["priorite"], { bg: string; fg: string; label: string }> = {
    haute: { bg: C.dangerSoft, fg: C.danger, label: "Priorité haute" },
    moyenne: { bg: C.warningSoft, fg: C.warning, label: "Priorité moyenne" },
    basse: { bg: C.cream, fg: C.textMuted, label: "Suggéré" },
  };
  const s = map[p];
  return `<span style="display:inline-block;padding:3px 8px;border-radius:6px;background:${s.bg};color:${s.fg};font-size:11px;font-weight:600;letter-spacing:0.02em;text-transform:uppercase;">${s.label}</span>`;
}

export function renderCasseDigestHtml(d: CasseDigestData): string {
  const top = d.top_produits;
  const pic = d.pic_horaire;

  const topRowsHtml = top.length === 0
    ? `<tr><td style="padding:24px;text-align:center;color:${C.textMuted};font-size:14px;">Aucune casse cette semaine. Travail propre, bravo.</td></tr>`
    : top.map((p, i) => {
        const sigmaTag = p.ecart_sigma !== null && p.ecart_sigma > 1
          ? `<span style="color:${C.danger};font-weight:600;font-size:12px;">+${p.ecart_sigma}σ</span>`
          : p.ecart_sigma !== null
          ? `<span style="color:${C.textMuted};font-size:12px;">${p.ecart_sigma > 0 ? "+" : ""}${p.ecart_sigma}σ</span>`
          : `<span style="color:${C.textMuted};font-size:11px;">baseline incomplète</span>`;
        return `
          <tr>
            <td style="padding:14px 16px;border-bottom:1px solid ${C.border};vertical-align:top;">
              <div style="display:flex;align-items:baseline;gap:8px;">
                <span style="color:${C.gold};font-weight:700;font-size:18px;width:24px;">${i + 1}</span>
                <div style="flex:1;">
                  <div style="color:${C.text};font-weight:600;font-size:15px;line-height:1.3;">${escapeHtml(p.produit_nom)}</div>
                  <div style="color:${C.textMuted};font-size:12px;margin-top:2px;">${escapeHtml(p.depot_nom)} · ${p.qte.toFixed(p.qte < 10 ? 2 : 0)} unités</div>
                </div>
              </div>
            </td>
            <td style="padding:14px 16px;border-bottom:1px solid ${C.border};text-align:right;vertical-align:top;">
              <div style="color:${C.sapin};font-weight:700;font-size:15px;">${fmtEur(p.valeur_eur)}</div>
              <div style="margin-top:4px;">${sigmaTag}</div>
            </td>
          </tr>`;
      }).join("");

  const actionsHtml = d.actions.map((a, i) => `
    <tr>
      <td style="padding:0 0 12px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.white};border:1px solid ${C.border};border-radius:12px;">
          <tr>
            <td style="padding:16px 18px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;background:${C.sapin};color:${C.white};border-radius:50%;font-weight:700;font-size:12px;">${i + 1}</span>
                ${badgePriorite(a.priorite)}
              </div>
              <div style="color:${C.text};font-weight:600;font-size:15px;line-height:1.4;margin-bottom:6px;">${escapeHtml(a.titre)}</div>
              <div style="color:${C.textMuted};font-size:13px;line-height:1.55;">${escapeHtml(a.detail)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join("");

  const picHtml = pic
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.sapin};border-radius:12px;margin-top:24px;">
      <tr>
        <td style="padding:20px 22px;">
          <div style="color:${C.gold};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px;">Pic horaire dominant · 90j</div>
          <div style="color:${C.white};font-size:18px;font-weight:600;line-height:1.4;">
            <span style="color:${C.gold};">${escapeHtml(pic.jour_label)}</span> entre <span style="color:${C.gold};">${escapeHtml(pic.heure_label)}</span><br/>
            sur ${escapeHtml(pic.depot_nom)}
          </div>
          <div style="color:#D7E0DA;font-size:13px;margin-top:10px;line-height:1.5;">
            ${fmtEurDecimal(pic.valeur_perdue_eur_90j)} perdus cumulés &middot; ${pic.nb_employes_distincts} employé${pic.nb_employes_distincts > 1 ? "s" : ""} concerné${pic.nb_employes_distincts > 1 ? "s" : ""} (identifiants anonymisés)
          </div>
        </td>
      </tr>
    </table>`
    : "";

  const depotsHtml = d.depots.length > 0
    ? `
    <div style="margin-top:20px;">
      <div style="color:${C.textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Répartition par dépôt</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${d.depots.map((dp) => {
          const pct = d.total_eur_semaine > 0
            ? Math.round((dp.valeur_eur / d.total_eur_semaine) * 100)
            : 0;
          return `
          <tr>
            <td style="padding:6px 0;color:${C.text};font-size:13px;font-weight:500;">${escapeHtml(dp.depot_nom)}</td>
            <td style="padding:6px 0;text-align:right;color:${C.textMuted};font-size:12px;">${pct}%</td>
            <td style="padding:6px 0 6px 16px;text-align:right;color:${C.sapin};font-size:13px;font-weight:600;width:90px;">${fmtEur(dp.valeur_eur)}</td>
          </tr>`;
        }).join("")}
      </table>
    </div>`
    : "";

  const ramadanBannerHtml = d.ramadan_proche
    ? `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.goldSoft};border:1px solid ${C.gold};border-radius:10px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 18px;">
          <div style="color:${C.sapinDark};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">&#x1F319; Calendrier hijri</div>
          <div style="color:${C.text};font-size:14px;line-height:1.5;font-weight:500;">${escapeHtml(d.ramadan_proche.message)}</div>
        </td>
      </tr>
    </table>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Casse semaine — Salam Stock</title>
</head>
<body style="margin:0;padding:0;background:${C.cream};font-family:${FONT_STACK};color:${C.text};">
  <span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">
    ${fmtEur(d.total_eur_semaine)} de casse cette semaine ${d.delta_pct !== null ? `(${d.delta_pct > 0 ? "+" : ""}${d.delta_pct}% vs S-1)` : ""} &middot; 3 actions concrètes
  </span>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.cream};padding:24px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td>
                    <div style="color:${C.gold};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Salam Stock &middot; Digest hebdo</div>
                    <div style="color:${C.sapin};font-size:24px;font-weight:700;margin-top:4px;letter-spacing:-0.01em;">Casse de la semaine</div>
                    <div style="color:${C.textMuted};font-size:13px;margin-top:2px;">${escapeHtml(d.semaine_label)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Hero KPI -->
          <tr>
            <td style="background:${C.sapin};border-radius:16px;padding:28px 24px;">
              <div style="color:${C.gold};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Total casse semaine</div>
              <div style="color:${C.white};font-size:42px;font-weight:700;margin-top:6px;letter-spacing:-0.02em;line-height:1;">${fmtEur(d.total_eur_semaine)}</div>
              <div style="margin-top:12px;">
                ${badgeDelta(d.delta_pct)}
                <span style="color:#D7E0DA;font-size:13px;margin-left:8px;">S-1 : ${fmtEur(d.total_eur_semaine_precedente)}</span>
              </div>
            </td>
          </tr>

          <!-- Spacer -->
          <tr><td style="height:24px;"></td></tr>

          ${ramadanBannerHtml ? `<tr><td>${ramadanBannerHtml}</td></tr>` : ""}

          <!-- Top 3 produits -->
          <tr>
            <td>
              <div style="color:${C.textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px;">Top 3 produits qui pèsent</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.white};border:1px solid ${C.border};border-radius:12px;overflow:hidden;">
                ${topRowsHtml}
              </table>
              ${depotsHtml}
            </td>
          </tr>

          ${pic ? `<tr><td>${picHtml}</td></tr>` : ""}

          <!-- Actions -->
          <tr><td style="height:28px;"></td></tr>
          <tr>
            <td>
              <div style="color:${C.textMuted};font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">3 actions pour ta réunion lundi</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                ${actionsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr><td style="height:24px;"></td></tr>
          <tr>
            <td style="border-top:1px solid ${C.border};padding-top:18px;">
              <div style="color:${C.textMuted};font-size:11px;line-height:1.6;">
                Tu reçois ce digest car tu es manager d'un dépôt K&amp;A FOOD.<br/>
                Données calculées à partir des saisies casse <strong>${escapeHtml(d.semaine_label)}</strong>, baseline glissante 28 jours.<br/>
                Identifiants employés anonymisés (SHA-256) conformément RGPD.
              </div>
              <div style="color:${C.textMuted};font-size:11px;margin-top:14px;">
                <strong style="color:${C.sapin};">Salam Stock</strong> &middot; Généré le ${new Date(d.generated_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })}
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderCasseDigestText(d: CasseDigestData): string {
  const lines: string[] = [];
  lines.push(`SALAM STOCK — Digest casse hebdomadaire`);
  lines.push(d.semaine_label);
  lines.push("");
  lines.push(`Total semaine : ${fmtEur(d.total_eur_semaine)}`);
  if (d.delta_pct !== null) {
    lines.push(`Variation vs S-1 : ${d.delta_pct > 0 ? "+" : ""}${d.delta_pct}% (S-1 : ${fmtEur(d.total_eur_semaine_precedente)})`);
  }
  lines.push("");
  if (d.top_produits.length > 0) {
    lines.push(`TOP 3 PRODUITS`);
    d.top_produits.forEach((p, i) => {
      const sigma = p.ecart_sigma !== null ? ` (${p.ecart_sigma > 0 ? "+" : ""}${p.ecart_sigma}σ)` : "";
      lines.push(`${i + 1}. ${p.produit_nom} — ${fmtEur(p.valeur_eur)}${sigma} — ${p.depot_nom}`);
    });
    lines.push("");
  }
  if (d.pic_horaire) {
    lines.push(`PIC HORAIRE (90j) : ${d.pic_horaire.jour_label} ${d.pic_horaire.heure_label} sur ${d.pic_horaire.depot_nom}`);
    lines.push(`  ${fmtEurDecimal(d.pic_horaire.valeur_perdue_eur_90j)} perdus, ${d.pic_horaire.nb_employes_distincts} employé(s) anonymisé(s)`);
    lines.push("");
  }
  lines.push(`3 ACTIONS POUR LUNDI`);
  d.actions.forEach((a, i) => {
    lines.push(`${i + 1}. [${a.priorite.toUpperCase()}] ${a.titre}`);
    lines.push(`   ${a.detail}`);
  });
  lines.push("");
  lines.push(`— Salam Stock`);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
