"use client";

/**
 * MorningBriefCard — MYTH-02 le copilote proactif "3 choses avant 10h".
 *
 * La SIGNATURE du cockpit : avant les KPI, Otmane voit les 3 actions que
 * le moteur a calculées pendant la nuit, formulées en ton direct, chacune
 * cliquable vers l'écran d'action (deep-link).
 *
 * États :
 *   - loading      : 3 lignes skeleton (le brief arrive après le snapshot)
 *   - zen          : "Tout est sous contrôle ☕" — rien d'urgent
 *   - 1..3 actions : numérotées (1/2/3 en or), icône catégorie, deep-link
 *
 * Dark premium : --surface-1, accent or sur le numéro, hairline gold en
 * tête de carte. C'est le bloc le plus important visuellement — il porte
 * un léger glow or sur le titre pour signaler "le cerveau a bossé".
 */
import type { LucideIcon } from "lucide-react";
import {
  ChevronRight,
  Clock,
  PackageX,
  CalendarHeart,
  ClipboardCheck,
  Flame,
  Coffee,
  Sparkles,
} from "lucide-react";
import type {
  BriefingAction,
  BriefingCategorie,
} from "@/app/api/cockpit/briefing/route";

const CAT_ICON: Record<BriefingCategorie, LucideIcon> = {
  dlc_force: Clock,
  rupture_blocker: PackageX,
  pic_hijri: CalendarHeart,
  ecart_reception: ClipboardCheck,
  casse_anormale: Flame,
};

const TONE_COLOR: Record<BriefingAction["tone"], string> = {
  danger: "var(--danger)",
  warn: "var(--warning)",
  info: "var(--success)",
};

interface MorningBriefCardProps {
  prenom: string;
  actions: BriefingAction[];
  zenMessage: string | null;
  iaReformule: boolean;
  loading: boolean;
  onAction: (href: string) => void;
}

export function MorningBriefCard({
  prenom,
  actions,
  zenMessage,
  iaReformule,
  loading,
  onAction,
}: MorningBriefCardProps) {
  return (
    <section
      aria-label="Brief du matin"
      className="lg relative overflow-hidden rounded-[28px] p-4 sm:p-5"
      style={{
        borderColor: "var(--border-premium)",
      }}
    >
      {/* Voile or léger sur le verre — signature "le cerveau a bossé". */}
      <span
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "linear-gradient(165deg, color-mix(in srgb, var(--accent-gold) 7%, transparent), transparent 60%)",
        }}
      />

      {/* Hairline or en haut — signature "le cerveau a bossé". */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--accent-gold), transparent)",
          opacity: 0.55,
        }}
      />

      {/* En-tête */}
      <header className="flex items-center gap-2.5 mb-3.5">
        <span
          aria-hidden
          className="inline-flex w-9 h-9 rounded-2xl items-center justify-center shrink-0"
          style={{
            background: "var(--accent-gold-soft)",
            color: "var(--accent-gold-bright)",
            boxShadow: "var(--glow-cta)",
          }}
        >
          <Sparkles className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--accent-gold-dim)" }}
          >
            Ton brief du matin
          </p>
          <h2
            className="text-[15.5px] font-extrabold leading-tight"
            style={{
              color: "var(--text-primary)",
              textShadow: "var(--bignum-glow)",
            }}
          >
            {actions.length > 0
              ? `${actions.length} chose${actions.length > 1 ? "s" : ""} avant 10h`
              : "Rien d'urgent ce matin"}
          </h2>
        </div>
        {iaReformule && actions.length > 0 && (
          <span
            className="ml-auto shrink-0 text-[9.5px] font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-full"
            style={{
              background: "var(--accent-gold-soft)",
              color: "var(--accent-gold-dim)",
            }}
            title="Reformulé par le copilote IA"
          >
            Copilote
          </span>
        )}
      </header>

      {/* Corps */}
      {loading ? (
        <BriefSkeleton />
      ) : actions.length === 0 ? (
        <ZenState message={zenMessage} prenom={prenom} />
      ) : (
        <ol className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {actions.map((a, i) => (
            <BriefRow
              key={`${a.categorie}-${i}`}
              action={a}
              index={i + 1}
              order={i}
              onAction={onAction}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function BriefRow({
  action,
  index,
  order,
  onAction,
}: {
  action: BriefingAction;
  index: number;
  order: number;
  onAction: (href: string) => void;
}) {
  const Icon = CAT_ICON[action.categorie] ?? Clock;
  const toneColor = TONE_COLOR[action.tone];
  return (
    <li className="rise-in" style={{ ["--i" as string]: order }}>
      <button
        type="button"
        onClick={() => onAction(action.href)}
        className="tap group w-full text-left flex items-center gap-3 rounded-[20px] p-3 border min-h-[60px]"
        style={{
          background: "var(--surface-2)",
          borderColor: "var(--border-card)",
        }}
      >
        {/* Numéro en or */}
        <span
          aria-hidden
          className="inline-flex w-7 h-7 rounded-full items-center justify-center shrink-0 text-[14px] font-extrabold tabular"
          style={{
            background: "var(--surface-0)",
            color: "var(--accent-gold-bright)",
            border: "1px solid var(--border-premium)",
          }}
        >
          {index}
        </span>

        {/* Icône catégorie (tone) */}
        <span
          aria-hidden
          className="inline-flex w-9 h-9 rounded-2xl items-center justify-center shrink-0"
          style={{
            background: `color-mix(in srgb, ${toneColor} 14%, transparent)`,
            color: toneColor,
          }}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={2.2} />
        </span>

        {/* Texte + meta */}
        <span className="flex-1 min-w-0">
          <span
            className="block text-[13.5px] font-semibold leading-snug"
            style={{ color: "var(--text-primary)" }}
          >
            {action.texte}
          </span>
          {action.meta && (
            <span
              className="block text-[11px] font-bold tabular mt-0.5"
              style={{ color: toneColor }}
            >
              {action.meta}
            </span>
          )}
        </span>

        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform group-active:translate-x-0.5"
          strokeWidth={2.4}
          style={{ color: "var(--text-tertiary)" }}
        />
      </button>
    </li>
  );
}

function ZenState({
  message,
  prenom,
}: {
  message: string | null;
  prenom: string;
}) {
  return (
    <div
      className="rise-in flex items-center gap-3 rounded-[20px] p-3.5 border"
      style={{
        background: "var(--success-soft)",
        borderColor: "color-mix(in srgb, var(--success) 22%, transparent)",
      }}
    >
      <span
        aria-hidden
        className="inline-flex w-10 h-10 rounded-2xl items-center justify-center shrink-0"
        style={{
          background: "color-mix(in srgb, var(--success) 16%, transparent)",
          color: "var(--success)",
        }}
      >
        <Coffee className="w-5 h-5" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <p
          className="text-[14px] font-bold leading-tight"
          style={{ color: "var(--text-primary)" }}
        >
          {message ?? "Tout est sous contrôle ☕"}
        </p>
        <p
          className="text-[12px] mt-0.5"
          style={{ color: "var(--text-secondary)" }}
        >
          Aucune action urgente, {prenom}. Profite du café.
        </p>
      </div>
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-2 lg:grid-cols-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="rise-in flex items-center gap-3 rounded-[20px] p-3 border animate-pulse min-h-[60px]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border-card)",
            ["--i" as string]: i,
          }}
        >
          <span
            className="w-7 h-7 rounded-full shrink-0"
            style={{ background: "var(--surface-0)" }}
          />
          <span
            className="w-9 h-9 rounded-2xl shrink-0"
            style={{ background: "var(--surface-3)" }}
          />
          <span className="flex-1 flex flex-col gap-1.5">
            <span
              className="h-3 rounded-full"
              style={{ background: "var(--surface-3)", width: `${85 - i * 12}%` }}
            />
            <span
              className="h-2 rounded-full"
              style={{ background: "var(--surface-3)", width: "30%" }}
            />
          </span>
        </div>
      ))}
    </div>
  );
}
