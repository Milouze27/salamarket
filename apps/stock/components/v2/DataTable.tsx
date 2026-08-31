"use client";

/**
 * DataTable — tableau de données pour le poste de travail (≥ lg).
 *
 * Pourquoi ce composant existe : avant le 31/08/2026, le projet ne contenait
 * AUCUN <table> de données (vérifié sur 41 000 lignes). Les listes étaient des
 * grilles de vignettes carrées pensées pour le pouce : à 1920 px, la page Stock
 * montrait 8 produits par écran là où un tableau en montre une trentaine.
 *
 * Ce composant n'est JAMAIS rendu sous 1024 px — les pages gardent leur vue en
 * cartes pour le terrain. C'est l'appelant qui choisit, avec `hidden lg:block`.
 *
 * Parti pris de rendu, cohérent avec la DA existante :
 *   - vrai <table> sémantique (lecteurs d'écran, sélection au clavier) ;
 *   - en-tête collant sous la barre d'application, jamais de capitales
 *     espacées décoratives : 12px / 600, couleur secondaire ;
 *   - filets `--border-hairline` seulement horizontaux, pas de quadrillage ;
 *   - chiffres en `tabular-nums` pour que les colonnes s'alignent ;
 *   - survol de ligne sur `--surface-2`, jamais d'ombre ni de glow.
 */

import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export interface Column<T> {
  /** Identifiant technique, sert de clé de tri. */
  key: string;
  /** En-tête affiché. */
  label: string;
  /** Contenu de la cellule. */
  render: (row: T) => ReactNode;
  /** Comparateur. Absent = colonne non triable. */
  sort?: (a: T, b: T) => number;
  /** Largeur CSS fixe (ex. "120px"). Absent = la colonne s'étire. */
  width?: string;
  /** Alignement du contenu. Les nombres vont à droite. */
  align?: "left" | "right" | "center";
  /** Masque la colonne sous 1280px (colonnes de confort). */
  xlOnly?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  getKey,
  onRowClick,
  emptyLabel = "Aucune ligne",
  defaultSort,
  caption,
  rowAccent,
}: {
  rows: T[];
  columns: Column<T>[];
  getKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyLabel?: string;
  /** Colonne triée au premier rendu. */
  defaultSort?: { key: string; dir: "asc" | "desc" };
  /** Résumé du tableau pour les lecteurs d'écran. */
  caption?: string;
  /** Filet vertical coloré en tête de ligne (alerte, rupture…). */
  rowAccent?: (row: T) => string | null;
}) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSort?.key ?? null);
  const [dir, setDir] = useState<"asc" | "desc">(defaultSort?.dir ?? "asc");

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const out = [...rows].sort(col.sort);
    return dir === "desc" ? out.reverse() : out;
  }, [rows, columns, sortKey, dir]);

  function toggle(col: Column<T>) {
    if (!col.sort) return;
    if (sortKey === col.key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col.key);
      setDir("asc");
    }
  }

  if (!rows.length) {
    return (
      <p
        className="text-[14px] py-10 text-center"
        style={{ color: "var(--text-secondary)" }}
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    // overflow-x-auto : une largeur de colonnes qui déborde défile DANS le
    // tableau, jamais en poussant la page entière (règle de mise en page).
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((col) => {
              const active = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  scope="col"
                  style={{
                    width: col.width,
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    borderBottom: "1px solid var(--border-medium)",
                    textAlign: col.align ?? "left",
                  }}
                  className={`sticky top-0 z-10 py-2.5 px-3 text-[12px] font-semibold whitespace-nowrap bg-[color:var(--surface-1)] ${
                    col.xlOnly ? "hidden xl:table-cell" : ""
                  }`}
                  aria-sort={
                    active ? (dir === "asc" ? "ascending" : "descending") : undefined
                  }
                >
                  {col.sort ? (
                    <button
                      type="button"
                      onClick={() => toggle(col)}
                      className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
                    >
                      {col.label}
                      {active ? (
                        dir === "asc" ? (
                          <ChevronUp className="w-3.5 h-3.5" strokeWidth={2.4} />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" strokeWidth={2.4} />
                        )
                      ) : (
                        <ChevronDown
                          className="w-3.5 h-3.5 opacity-25"
                          strokeWidth={2.4}
                          aria-hidden
                        />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const accent = rowAccent?.(row) ?? null;
            return (
              <tr
                key={getKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                className={`data-row ${onRowClick ? "cursor-pointer" : ""}`}
                style={
                  accent
                    ? ({ "--row-accent": accent } as React.CSSProperties)
                    : undefined
                }
                data-accent={accent ? "1" : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    style={{ textAlign: col.align ?? "left" }}
                    className={`py-2.5 px-3 text-[13.5px] align-middle ${
                      col.align === "right" ? "tabular-nums" : ""
                    } ${col.xlOnly ? "hidden xl:table-cell" : ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
