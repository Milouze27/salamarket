"use client";

/* CertHalalBadge
 * ─────────────
 * Affiche le statut du certificat halal d'un fournisseur en un coup
 * d'œil — vert (>30j), ambre (<30j), rouge (expiré ou manquant).
 *
 * UX rule : c'est l'élément qui DOIT sauter aux yeux d'Otmane. À gauche
 * du nom fournisseur, taille md min, jamais en gris.
 *
 * Variantes :
 *   - size="sm" : pour les listes (PO dashboard)
 *   - size="md" : pour les drawers/details
 *   - size="lg" : pour la page fournisseurs (admin) et le hero page PO
 */

import { ShieldCheck, ShieldAlert, ShieldX, ShieldQuestion } from "lucide-react";
import {
  certifAlerte,
  joursRestants,
  ORGANISME_LABELS,
  type CertifOrganisme,
} from "@/lib/types/po";

interface Props {
  organisme: CertifOrganisme | null;
  numero?: string | null;
  expireLe: string | null | undefined;
  size?: "sm" | "md" | "lg";
  /** Affiche le label "Halal — AVS jusqu'au 12 nov." (sinon icône seule + j). */
  verbose?: boolean;
}

export function CertHalalBadge({
  organisme,
  numero,
  expireLe,
  size = "md",
  verbose = false,
}: Props) {
  const alerte = certifAlerte(expireLe);
  const j = joursRestants(expireLe);

  // Couleurs — directes Drive DA, jamais Tailwind théorique.
  const palette = {
    ok: {
      bg: "#E8F5EE",
      fg: "#2D7A4F",
      border: "#B8DEC9",
      Icon: ShieldCheck,
      title: "Certif valide",
    },
    expire_60j: {
      bg: "#F4E9C4",
      fg: "#8B6F0E",
      border: "#E2D196",
      Icon: ShieldCheck,
      title: "Certif valide (renouvellement à prévoir)",
    },
    expire_30j: {
      bg: "#FEF3E2",
      fg: "#D97706",
      border: "#F4D49A",
      Icon: ShieldAlert,
      title: "Certif expire bientôt",
    },
    expiree: {
      bg: "#FEF2F1",
      fg: "#E5483D",
      border: "#F4B7B1",
      Icon: ShieldX,
      title: "Certif EXPIRÉE — commandes bloquées",
    },
    manquante: {
      bg: "#FEF2F1",
      fg: "#E5483D",
      border: "#F4B7B1",
      Icon: ShieldQuestion,
      title: "Aucun certif halal renseigné",
    },
  }[alerte];

  const dims = {
    sm: { px: 8, py: 3, fs: 11, icon: 12, gap: 4 },
    md: { px: 10, py: 4, fs: 12, icon: 14, gap: 6 },
    lg: { px: 14, py: 8, fs: 14, icon: 18, gap: 8 },
  }[size];

  let label: string;
  if (alerte === "manquante") {
    label = verbose ? "Aucun certif halal" : "—";
  } else if (alerte === "expiree") {
    const days = Math.abs(j ?? 0);
    label = verbose
      ? `${organisme ? ORGANISME_LABELS[organisme] : ""} expiré il y a ${days} j`
      : `Expiré ${days}j`;
  } else if (alerte === "expire_30j") {
    label = verbose
      ? `${organisme ? ORGANISME_LABELS[organisme] : ""} expire dans ${j} j`
      : `J–${j}`;
  } else if (verbose && organisme) {
    label = `Halal · ${ORGANISME_LABELS[organisme]}${numero ? ` n°${numero}` : ""}`;
  } else {
    label = organisme ? ORGANISME_LABELS[organisme] : "Halal";
  }

  const Icon = palette.Icon;

  return (
    <span
      title={palette.title}
      className="inline-flex items-center whitespace-nowrap font-semibold tabular"
      style={{
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        borderRadius: 999,
        paddingInline: dims.px,
        paddingBlock: dims.py,
        fontSize: dims.fs,
        gap: dims.gap,
        letterSpacing: 0.01,
      }}
    >
      <Icon size={dims.icon} strokeWidth={2.4} />
      <span>{label}</span>
    </span>
  );
}
