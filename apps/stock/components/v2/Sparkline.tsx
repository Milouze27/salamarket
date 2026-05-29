"use client";

import { useMemo } from "react";

interface Props {
  /** Series numérique — au moins 2 points pour tracer une ligne. */
  data: number[];
  /** Largeur SVG en pixels — défaut 72. */
  width?: number;
  /** Hauteur SVG en pixels — défaut 22. */
  height?: number;
  /** Couleur de la ligne et du dot — défaut or Salamarket #C9A227. */
  color?: string;
  /** Couleur de l'aire — défaut or-soft #F4E9C4. */
  fillColor?: string;
  /** ARIA label pour lecteur d'écran. Si omis, le SVG est aria-hidden. */
  ariaLabel?: string;
}

// Smooth Catmull-Rom-like cubic path builder. Produit une courbe continue
// qui passe par tous les points (plus joli qu'une polyline). Tension = 0.5.
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
  }
  const tension = 0.4;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension * 0.5;
    const cp1y = p1.y + (p2.y - p0.y) * tension * 0.5;
    const cp2x = p2.x - (p3.x - p1.x) * tension * 0.5;
    const cp2y = p2.y - (p3.y - p1.y) * tension * 0.5;
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  return d;
}

// Sparkline — pure SVG, zero deps, 60fps friendly (static, no runtime
// recalc per frame). Used inline next to KPI numbers.
export function Sparkline({
  data,
  width = 72,
  height = 22,
  color = "#C9A227",
  fillColor = "#F4E9C4",
  ariaLabel,
}: Props) {
  const { linePath, areaPath, lastDot } = useMemo(() => {
    if (!data || data.length === 0) {
      return { linePath: "", areaPath: "", lastDot: null };
    }
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    // Inset stroke & dot from edges to avoid clipping.
    const padX = 2;
    const padY = 4;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;
    const points = data.map((v, i) => {
      const norm = (v - min) / range; // 0..1
      return {
        x: padX + i * step,
        y: padY + innerH - norm * innerH,
      };
    });
    const line = buildSmoothPath(points);
    // Area = line + close along baseline.
    const area = `${line} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`;
    const last = points[points.length - 1];
    return { linePath: line, areaPath: area, lastDot: last };
  }, [data, width, height]);

  if (!data || data.length === 0) return null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      style={{ display: "block", overflow: "visible" }}
    >
      <path d={areaPath} fill={fillColor} opacity={0.55} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {lastDot && (
        <circle
          cx={lastDot.x}
          cy={lastDot.y}
          r={3}
          fill={color}
          stroke="#FAF7EE"
          strokeWidth={1.2}
        />
      )}
    </svg>
  );
}

export default Sparkline;
