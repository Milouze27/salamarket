"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";

/**
 * Tiny pill that surfaces a lot ID + certifier inside any list row
 * (commandes_drive_lignes, sorties_stock, etc.). Tap → navigates to
 * the staff lot detail page `/v2/lots/:id`.
 *
 * Visual : gold-soft pill with shield icon, certifier abbreviation
 * and the human-readable lot ID, tabular-nums to keep alignment.
 * Tap-target 28px — usually placed inside a row that itself meets
 * the 44pt rule.
 */
export function LotBadge({
  lotId,
  certifier,
  className = "",
}: {
  lotId: string;
  /** Short certifier label, e.g. "AVS" / "ARGML". */
  certifier?: string | null;
  className?: string;
}) {
  if (!lotId) return null;
  return (
    <Link
      href={`/v2/lots/${encodeURIComponent(lotId)}`}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Voir le lot ${lotId}`}
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[color:var(--accent-gold-soft)] text-[#8B6F0E] text-[11px] font-extrabold tracking-tight active:opacity-80 transition-opacity ${className}`}
    >
      <ShieldCheck className="w-3.5 h-3.5" strokeWidth={2.4} />
      {certifier && (
        <span className="uppercase tracking-wider">{certifier}</span>
      )}
      <span className="tabular-nums">{lotId}</span>
    </Link>
  );
}
