"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ArrowRight,
  ClipboardList,
  Gauge,
  PackageSearch,
  Repeat2,
  ShoppingBag,
  Sparkles,
  Tag,
} from "lucide-react";
import { useV2 } from "@/lib/v2-store";
import { V2Shell } from "@/components/v2/V2Shell";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { HeroActionCard } from "@/components/v2/HeroActionCard";
import { WeeklyPicksRail } from "@/components/v2/WeeklyPicksRail";

/** Hero action — promoted card sapin plein en tête du hub. */
const HERO_ACTION = {
  href: "/v2/reception",
  title: "Nouvelle réception",
  desc: "Scan carton, unité, photo, validation BDL.",
  icon: ArrowDownToLine,
  eyebrow: "Action principale",
} as const;

/** Actions secondaires — surfaces blanches en grille. */
const ACTIONS = [
  {
    href: "/v2/sortie",
    title: "Déclarer une sortie",
    desc: "Casse, périmé, défaut, photo + IA",
    icon: ArrowUpRight,
    accent: "danger",
  },
  {
    href: "/v2/transfert",
    title: "Transfert inter-dépôt",
    desc: "Bouger du stock entre dépôts",
    icon: Repeat2,
    accent: "gold",
  },
  {
    href: "/v2/stock",
    title: "Voir le stock",
    desc: "Catalogue produits du dépôt",
    icon: PackageSearch,
    accent: "neutral",
  },
] as const;

/** Tuiles communes manager + admin : le quotidien de pilotage rapproché. */
const MANAGER_ACTIONS = [
  {
    href: "/v2/preparation",
    title: "Préparation drive",
    desc: "Commandes à préparer",
    icon: ShoppingBag,
  },
  {
    href: "/v2/stock",
    title: "Stock du dépôt",
    desc: "Catalogue produits",
    icon: PackageSearch,
  },
  {
    href: "/v2/inventaire",
    title: "Inventaire tournant",
    desc: "5 à 10 produits par jour",
    icon: ClipboardList,
  },
  {
    href: "/v2/etiquettes",
    title: "Imprimer étiquettes",
    desc: "EAN-13 Brother QL-820",
    icon: Tag,
  },
] as const;

/** Tuiles réservées admin : la vue 3 dépôts + le cockpit temps réel. */
const ADMIN_ONLY_ACTIONS = [
  {
    href: "/v2/admin",
    title: "Dashboard global",
    desc: "Vue 3 dépôts, alertes IA",
    icon: Sparkles,
  },
  {
    href: "/v2/cockpit",
    title: "Cockpit",
    desc: "Ventes, alertes, staff en 30 s",
    icon: Gauge,
  },
] as const;

/** C2-A — palette Salam strictement appliquée sur les cards secondaires. */
const accentClass: Record<string, string> = {
  // Transfert inter-dépôt → or plein, icône blanche
  gold: "bg-[var(--accent-gold)] text-white",
  // Déclarer une sortie → rouge bordeaux plein, icône blanche
  danger: "bg-[var(--danger)] text-white",
  // Voir le stock → sapin foncé, icône or
  neutral: "bg-[var(--primary-green-dark)] text-[var(--accent-gold)]",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

/** Sous-titre orienté tâche, propre au rôle (onboarding + cap clair). */
function introForRole(role: string | undefined): string {
  switch (role) {
    case "reception":
      return "Scanne les cartons fournisseur pour démarrer la réception.";
    case "preparation":
      return "Voici les commandes drive à préparer aujourd'hui.";
    case "caisse":
      return "Consulte le stock ou gère le retrait au comptoir.";
    case "manager":
    case "admin":
      return "Pilote tes 3 dépôts et le drive d'un coup d'œil.";
    default:
      return "Choisis une action pour démarrer.";
  }
}

export default function V2HomePage() {
  const employe = useV2((s) => s.currentEmploye);
  const depot = useV2((s) => s.currentDepot);
  const role = employe?.role;
  const isManager = role === "manager" || role === "admin";
  const isAdmin = role === "admin";

  const greet = greeting();
  const firstName = employe?.prenom ?? employe?.nom ?? "";
  const intro = introForRole(role);

  return (
    <V2Shell>
      <header className="px-5 pt-7">
        <EditorialEyebrow
          num="01"
          label={depot ? `Dépôt · ${depot.nom}` : "Dépôt non sélectionné"}
        />
        <h1 className="h1-display mt-3">
          {greet} <span className="gold">{firstName}</span>.
        </h1>
        <p className="body-md text-text-secondary mt-3 max-w-[36ch]">{intro}</p>
      </header>

      {/* HERO ACTION — sapin plein, promotion de l'action principale */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
        className="px-5 mt-6"
      >
        <HeroActionCard
          href={HERO_ACTION.href}
          eyebrow={HERO_ACTION.eyebrow}
          title={HERO_ACTION.title}
          desc={HERO_ACTION.desc}
          icon={HERO_ACTION.icon}
        />
      </motion.section>

      {/* SECONDARY ACTIONS — surfaces blanches, eyebrow numéroté */}
      <section className="px-5 mt-8">
        <EditorialEyebrow num="02" label="Autres opérations" />
        <div className="space-y-3 mt-3">
          {ACTIONS.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.href}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.22,
                  ease: [0.22, 0.61, 0.36, 1],
                  delay: i * 0.04,
                }}
              >
                <Link
                  href={a.href}
                  className="bg-white rounded-[20px] shadow-card border border-rule p-4 flex items-center gap-4 card-tappable focus-visible:outline-2 focus-visible:outline-primary block"
                >
                  <span
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${accentClass[a.accent]}`}
                  >
                    <Icon className="w-5 h-5" strokeWidth={2.2} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-text-primary leading-tight">
                      {a.title}
                    </p>
                    <p className="text-[12.5px] text-text-secondary mt-1 leading-snug">
                      {a.desc}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-text-tertiary shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>

      {isManager && (
        <section className="px-5 mt-9">
          <EditorialEyebrow
            num="03"
            label={isAdmin ? "Espace admin" : "Espace manager"}
            className="mb-3"
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
            {/* Admin : tuiles globales (dashboard, cockpit) en tête, puis le
                quotidien manager. Manager : uniquement le quotidien. */}
            {(isAdmin
              ? [...ADMIN_ONLY_ACTIONS, ...MANAGER_ACTIONS]
              : MANAGER_ACTIONS
            ).map((a, i) => {
              const Icon = a.icon;
              // Les tuiles admin-only se distinguent par un fond dégradé sapin→or.
              const isGlobal =
                a.href === "/v2/admin" || a.href === "/v2/cockpit";
              const isEtiquettes = a.href === "/v2/etiquettes";
              const isPrep = a.href === "/v2/preparation";
              const isInventaire = a.href === "/v2/inventaire";
              return (
                <motion.div
                  key={a.href}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.22,
                    ease: [0.22, 0.61, 0.36, 1],
                    delay: 0.18 + i * 0.04,
                  }}
                >
                  <Link
                    href={a.href}
                    className={`relative rounded-[20px] shadow-card border p-4 card-tappable focus-visible:outline-2 focus-visible:outline-primary block h-full ${
                      isGlobal
                        ? "border-transparent text-white"
                        : "bg-white border-rule"
                    }`}
                    style={
                      isGlobal
                        ? {
                            background:
                              "linear-gradient(135deg, var(--primary-green) 0%, var(--primary-green-hover) 55%, var(--accent-gold) 130%)",
                          }
                        : undefined
                    }
                  >
                    <span
                      className={`inline-flex w-10 h-10 rounded-xl items-center justify-center mb-3 ${
                        isGlobal
                          ? "bg-white/15 text-white backdrop-blur-sm"
                          : isEtiquettes
                            ? "bg-[var(--accent-gold-bright)] text-[var(--primary-green)]"
                            : isPrep
                              ? "bg-[var(--accent-gold)] text-[var(--primary-green)]"
                              : isInventaire
                                ? "bg-[var(--accent-gold)] text-[var(--primary-green)]"
                                : "bg-cream text-primary"
                      }`}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.2} />
                    </span>
                    <p
                      className={`text-[14px] font-bold leading-tight ${
                        isGlobal ? "text-white" : "text-text-primary"
                      }`}
                    >
                      {a.title}
                    </p>
                    <p
                      className={`text-[11.5px] mt-1 leading-snug ${
                        isGlobal ? "text-white/85" : "text-text-tertiary"
                      }`}
                    >
                      {a.desc}
                    </p>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </section>
      )}

      {/* WEEKLY PICKS — rail horizontal "04 Cette semaine"
          Placé en dernier pour respecter l'ordre numérique 01→02→03→04
          (audit manuel a constaté 01→02→04→03 avant). */}
      <WeeklyPicksRail />

      <footer>
        <p className="text-center text-[11px] text-text-tertiary mt-12">
          Salam Stock V2 · multi-dépôts Toulouse
        </p>
      </footer>
    </V2Shell>
  );
}
