"use client";

/* ReceptionsPanel — archives des bons de réception (BR PDF)
 * ────────────────────────────────────────────────────────
 * Extrait de /v2/admin/bons-reception pour vivre comme onglet
 * « Réceptions » de la page Achats. Header/BackButton/V2Shell retirés
 * (fournis par la page hôte). Toute la logique conservée : fetch BDL
 * réceptionnés, filtres période, recherche, KPI, lien signé BR PDF,
 * preview photos.
 */

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Search,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { DataTable } from "@/components/v2/DataTable";
import { supabase } from "@/lib/supabase";

interface BdlRow {
  id: string;
  numero_bdl: string;
  numero_bdl_fournisseur: string | null;
  date_livraison_prevue: string;
  statut: "prevue" | "en_cours" | "receptionnee" | "litige";
  receptionne_le: string | null;
  photo_palette_url_1: string | null;
  photo_bdl_url: string | null;
  fournisseurs: { nom: string } | null;
  depots: { nom: string } | null;
  bons_de_livraison_lignes: Array<{
    quantite_attendue: number;
    quantite_recue: number;
  }>;
}

type PeriodKey = "today" | "7j" | "30j" | "all";

function fmtDateTimeFr(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/** Totaux de lignes d'un BR — utilisés par la carte ET par le tableau. */
function totauxBdl(r: BdlRow) {
  const lignes = r.bons_de_livraison_lignes.length;
  const attendu = r.bons_de_livraison_lignes.reduce(
    (s, l) => s + l.quantite_attendue,
    0,
  );
  const recu = r.bons_de_livraison_lignes.reduce(
    (s, l) => s + l.quantite_recue,
    0,
  );
  return { lignes, attendu, recu, ecart: recu - attendu };
}

/** ADM-04 : le BR est derrière un lien signé. On ouvre l'onglet AVANT
 *  l'await (sinon le navigateur le compte comme pop-up), puis on y pose
 *  l'URL signée générée côté serveur. */
function ouvrirBrPdf(bdlId: string) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  void import("@/lib/actions/doc-url")
    .then((m) => m.signBonReceptionPdfUrl(bdlId))
    .then((url) => {
      if (win) win.location.href = url;
    })
    .catch(() => win?.close());
}

export function ReceptionsPanel() {
  const [rows, setRows] = useState<BdlRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>("7j");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    const sb = supabase();
    if (!sb) {
      setLoading(false);
      return;
    }
    const { data, error } = await sb
      .from("bons_de_livraison")
      .select(
        `id, numero_bdl, numero_bdl_fournisseur, date_livraison_prevue, statut, receptionne_le,
         photo_palette_url_1, photo_bdl_url,
         fournisseurs (nom),
         depots (nom),
         bons_de_livraison_lignes (quantite_attendue, quantite_recue)`,
      )
      .eq("statut", "receptionnee")
      .order("receptionne_le", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as BdlRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      period === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : period === "7j"
          ? now - 7 * 86_400_000
          : period === "30j"
            ? now - 30 * 86_400_000
            : 0;
    let l = rows.filter((r) => {
      if (!r.receptionne_le) return false;
      return new Date(r.receptionne_le).getTime() >= cutoff;
    });
    if (query.trim()) {
      const q = query.toLowerCase();
      l = l.filter(
        (r) =>
          r.numero_bdl.toLowerCase().includes(q) ||
          (r.numero_bdl_fournisseur?.toLowerCase().includes(q) ?? false) ||
          (r.fournisseurs?.nom.toLowerCase().includes(q) ?? false) ||
          (r.depots?.nom.toLowerCase().includes(q) ?? false),
      );
    }
    return l;
  }, [rows, period, query]);

  const stats = useMemo(() => {
    let nbLignes = 0;
    let totalRecu = 0;
    let totalAttendu = 0;
    for (const r of filtered) {
      nbLignes += r.bons_de_livraison_lignes.length;
      for (const l of r.bons_de_livraison_lignes) {
        totalAttendu += l.quantite_attendue;
        // ADM-02 : on somme le reçu RÉEL (brut), comme la carte BR et le BR
        // PDF (document fiscal). Plafonner ici créait un KPI (134/178) qui
        // contredisait la carte et le PDF (137/178) pour le même BR. Le total
        // d'unités reçues doit refléter la marchandise réellement entrée.
        totalRecu += l.quantite_recue;
      }
    }
    return { nbBdl: filtered.length, nbLignes, totalRecu, totalAttendu };
  }, [filtered]);

  return (
    <>
      {/* KPI — plafonné dès lg (trois compteurs sur 1 600 px se lisent mal). */}
      <div className="grid grid-cols-3 gap-2 mb-4 lg:max-w-[720px]">
        <Kpi label="BR émis" value={stats.nbBdl} />
        <Kpi label="Lignes" value={stats.nbLignes} />
        <Kpi
          label="Unités reçues"
          value={`${stats.totalRecu}/${stats.totalAttendu}`}
        />
      </div>

      {/* Filtres période */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto scrollbar-none -mx-1 px-1">
        {(
          [
            { k: "today", l: "Aujourd'hui" },
            { k: "7j", l: "7 jours" },
            { k: "30j", l: "30 jours" },
            { k: "all", l: "Tout" },
          ] as Array<{ k: PeriodKey; l: string }>
        ).map((opt) => (
          <button
            key={opt.k}
            onClick={() => setPeriod(opt.k)}
            data-active={period === opt.k}
            className="pill-filter shrink-0"
          >
            {opt.l}
          </button>
        ))}
      </div>

      {/* Search — ce champ n'est pas un input[type=search], la règle de largeur
          de globals.css ne s'y applique pas : on le borne ici. */}
      <div className="relative mb-5 lg:max-w-[460px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="N° BDL, fournisseur, dépôt…"
          className="input-field !pl-10 !rounded-full"
        />
      </div>

      {loading ? (
        <div className="lg p-8 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <p className="text-sm text-text-secondary">Chargement…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="lg p-8 text-center">
          <FileText className="w-7 h-7 text-text-tertiary mx-auto mb-2" />
          <p className="font-bold text-text-primary">
            Aucun BR sur cette période
          </p>
          <p className="text-xs text-text-secondary mt-1">
            Les BR apparaissent ici dès qu&apos;une réception est validée sur
            /v2/reception.
          </p>
        </div>
      ) : (
        <>
          {/* ── POSTE DE TRAVAIL (≥ lg) : tableau des BR ────────────────────
            L'écart reçu/attendu est la colonne qui décide d'un litige : il
            était noyé en bas de carte, il devient une colonne triable. */}
          {/* contain:inline-size — sans lui, la largeur minimale du tableau
            remonte jusqu'au <main> (élément flex à min-width:auto dans
            V2Shell) et pousse toute la page hors de l'écran, sans barre de
            défilement puisque body est en overflow-x:clip. Avec, le tableau
            défile DANS son cadre, comme prévu par DataTable. */}
          <div className="hidden lg:block" style={{ contain: "inline-size" }}>
            <DataTable
              rows={filtered}
              getKey={(r) => r.id}
              caption={`Bons de réception validés, ${filtered.length} lignes`}
              defaultSort={{ key: "date", dir: "desc" }}
              emptyLabel="Aucun BR sur cette période."
              rowAccent={(r) => {
                const { ecart } = totauxBdl(r);
                if (ecart < 0) return "var(--danger)";
                if (ecart > 0) return "var(--warning)";
                return null;
              }}
              columns={[
                {
                  key: "numero",
                  label: "N° BR",
                  width: "148px",
                  sort: (a, b) => a.numero_bdl.localeCompare(b.numero_bdl, "fr"),
                  render: (r) => (
                    <span
                      className="mono text-[12.5px] font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.numero_bdl}
                    </span>
                  ),
                },
                {
                  key: "numero_fourn",
                  label: "N° fournisseur",
                  width: "168px",
                  xlOnly: true,
                  render: (r) => (
                    <span
                      className="mono text-[12.5px]"
                      style={{ color: "var(--text-tertiary)" }}
                    >
                      {r.numero_bdl_fournisseur || "—"}
                    </span>
                  ),
                },
                {
                  key: "fournisseur",
                  label: "Fournisseur",
                  sort: (a, b) =>
                    (a.fournisseurs?.nom ?? "").localeCompare(
                      b.fournisseurs?.nom ?? "",
                      "fr",
                    ),
                  render: (r) => (
                    <span
                      className="font-semibold truncate block"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.fournisseurs?.nom ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "depot",
                  label: "Dépôt",
                  width: "132px",
                  sort: (a, b) =>
                    (a.depots?.nom ?? "").localeCompare(b.depots?.nom ?? "", "fr"),
                  render: (r) => (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {r.depots?.nom ?? "—"}
                    </span>
                  ),
                },
                {
                  key: "date",
                  label: "Réceptionné le",
                  width: "168px",
                  sort: (a, b) =>
                    (a.receptionne_le ?? "").localeCompare(b.receptionne_le ?? ""),
                  render: (r) => (
                    <span
                      className="whitespace-nowrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {fmtDateTimeFr(r.receptionne_le)}
                    </span>
                  ),
                },
                {
                  key: "statut",
                  label: "Statut",
                  width: "112px",
                  render: () => (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-bold whitespace-nowrap"
                      style={{
                        background: "var(--success-soft)",
                        color: "var(--success)",
                      }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Validé
                    </span>
                  ),
                },
                {
                  key: "lignes",
                  label: "Lignes",
                  width: "84px",
                  align: "right",
                  sort: (a, b) => totauxBdl(a).lignes - totauxBdl(b).lignes,
                  render: (r) => (
                    <span style={{ color: "var(--text-secondary)" }}>
                      {totauxBdl(r).lignes}
                    </span>
                  ),
                },
                {
                  key: "quantites",
                  label: "Reçu / attendu",
                  width: "148px",
                  align: "right",
                  sort: (a, b) => totauxBdl(a).recu - totauxBdl(b).recu,
                  render: (r) => {
                    const t = totauxBdl(r);
                    return (
                      <span style={{ color: "var(--text-secondary)" }}>
                        <b style={{ color: "var(--text-primary)" }}>{t.recu}</b>
                        {" / "}
                        {t.attendu}
                      </span>
                    );
                  },
                },
                {
                  key: "ecart",
                  label: "Écart",
                  width: "96px",
                  align: "right",
                  sort: (a, b) => totauxBdl(a).ecart - totauxBdl(b).ecart,
                  render: (r) => {
                    const { ecart } = totauxBdl(r);
                    if (ecart === 0) {
                      return (
                        <span style={{ color: "var(--text-tertiary)" }}>0</span>
                      );
                    }
                    return (
                      <span
                        className="font-bold"
                        style={{
                          color:
                            ecart < 0 ? "var(--danger)" : "var(--warning)",
                        }}
                      >
                        {ecart > 0 ? "+" : ""}
                        {ecart}
                      </span>
                    );
                  },
                },
                {
                  key: "pdf",
                  label: "",
                  width: "124px",
                  align: "right",
                  render: (r) => (
                    <button
                      type="button"
                      onClick={() => ouvrirBrPdf(r.id)}
                      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap"
                      style={{
                        background: "var(--primary-green)",
                        color: "var(--text-on-dark)",
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      BR PDF
                    </button>
                  ),
                },
              ]}
            />
          </div>

          {/* ── TERRAIN (< lg) : cartes au pouce, inchangées ─────────────── */}
          <div className="space-y-2.5 lg:hidden">
          {filtered.map((r, idx) => {
            const totalLignes = r.bons_de_livraison_lignes.length;
            const totalAttendu = r.bons_de_livraison_lignes.reduce(
              (s, l) => s + l.quantite_attendue,
              0,
            );
            const totalRecu = r.bons_de_livraison_lignes.reduce(
              (s, l) => s + l.quantite_recue,
              0,
            );
            const ecart = totalRecu - totalAttendu;
            return (
              <div
                key={r.id}
                className="lg lg-hover rise-in p-4"
                style={{ "--i": Math.min(idx, 8) } as React.CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[14px] font-extrabold text-text-primary">
                        BR {r.numero_bdl}
                      </p>
                      <span className="bg-success-soft text-success text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        Validé
                      </span>
                    </div>
                    <p className="text-[12px] text-text-secondary mt-0.5">
                      {r.fournisseurs?.nom ?? "—"} · {r.depots?.nom ?? "—"}
                    </p>
                    {r.numero_bdl_fournisseur && (
                      <p className="text-[10.5px] text-text-tertiary mono mt-0.5">
                        N° fournisseur : {r.numero_bdl_fournisseur}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => ouvrirBrPdf(r.id)}
                    className="bg-primary text-white rounded-full px-3.5 py-2 text-[11.5px] font-bold inline-flex items-center gap-1.5 shadow-card active:scale-[0.97] transition-transform shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    BR PDF
                  </button>
                </div>

                <div className="flex items-center justify-between mt-3 pt-3 border-t border-rule text-[11.5px] text-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <Truck className="w-3 h-3" />
                    Réceptionné {fmtDateTimeFr(r.receptionne_le)}
                  </span>
                  <span className="inline-flex items-center gap-2 tabular">
                    <span>
                      <b className="text-text-primary">{totalLignes}</b> lignes
                    </span>
                    <span className="text-text-tertiary">·</span>
                    <span>
                      <b className="text-text-primary">{totalRecu}</b>/
                      {totalAttendu} u.
                    </span>
                    {ecart !== 0 && (
                      <span
                        className={`font-bold ${ecart < 0 ? "text-danger" : "text-warning"}`}
                      >
                        ({ecart > 0 ? "+" : ""}
                        {ecart})
                      </span>
                    )}
                  </span>
                </div>

                {/* Mini preview des photos jointes */}
                {(r.photo_palette_url_1 || r.photo_bdl_url) && (
                  <div className="flex gap-1.5 mt-3">
                    {r.photo_palette_url_1 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={r.photo_palette_url_1}
                        alt="Palette"
                        className="w-12 h-12 object-cover rounded-lg border border-rule"
                      />
                    )}
                    {r.photo_bdl_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        loading="lazy"
                        decoding="async"
                        src={r.photo_bdl_url}
                        alt="BDL papier"
                        className="w-12 h-12 object-cover rounded-lg border border-rule"
                      />
                    )}
                    <span className="text-[10.5px] text-text-tertiary self-center ml-1">
                      photos intégrées au BR
                    </span>
                  </div>
                )}
              </div>
            );
          })}
          </div>
        </>
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="lg p-3">
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p className="text-[18px] font-extrabold tabular text-text-primary leading-none mt-1">
        {value}
      </p>
    </div>
  );
}
