import { useMemo } from "react";
import { Moon, Sparkles } from "lucide-react";
import { getDriveHijriContext } from "@/lib/hijri";

// ─────────────────────────────────────────────────────────────────
// RamadanBanner — bandeau mode Ramadan / Aïd sur la home.
//
// Lit getDriveHijriContext() (calcul local, zéro réseau). Hors de toute
// fenêtre hijri → return null (la home reste neutre). En période, affiche
// un bandeau sapin nuit chaleureux : titre contextuel + sous-titre + un
// petit countdown si on est en pré-fenêtre (J-7 → J-1).
//
// Pas de hex en dur hors charte : on reste sur sapin/or/crème comme le
// reste du Drive (alignés sur brand.ts).
// ─────────────────────────────────────────────────────────────────

interface Copy {
  eyebrow: string;
  titre: string;
  sous_titre: string;
}

export const RamadanBanner = () => {
  const ctx = useMemo(() => getDriveHijriContext(), []);

  if (!ctx.occasion || ctx.occasion === "general") return null;

  const j = ctx.jours_jusqua;
  const compteRebours =
    !ctx.en_cours && j > 0 ? (j === 1 ? "Demain" : `J-${j}`) : null;

  const copy: Copy = (() => {
    switch (ctx.occasion) {
      case "ramadan_iftar":
        if (ctx.dix_dernieres_nuits) {
          return {
            eyebrow: "Mois béni",
            titre: "Les 10 dernières nuits",
            sous_titre:
              "Tout pour vos ftours et vos soirées — dattes, viande fraîche et l'essentiel, prêt au retrait.",
          };
        }
        return {
          eyebrow: ctx.en_cours ? "Ramadan Moubarak" : "Ramadan approche",
          titre: ctx.en_cours
            ? "Mode Ramadan"
            : "Préparez votre premier ftour",
          sous_titre: ctx.en_cours
            ? "Dattes, viande halal et tout l'essentiel du ftour — commandez, retirez en magasin."
            : "On a rassemblé l'essentiel des ftours pour anticiper sans stress.",
        };
      case "eid_fitr":
        return {
          eyebrow: "Aïd Moubarak",
          titre: "Mode Aïd al-Fitr",
          sous_titre:
            "Pâtisseries, viande de fête et tout pour célébrer — prêt en click & collect.",
        };
      case "eid_adha":
        return {
          eyebrow: "Aïd Moubarak",
          titre: "Mode Aïd al-Adha",
          sous_titre:
            "Viande de l'Aïd, accompagnements et épices de fête — sécurisez votre commande.",
        };
      case "achoura":
        return {
          eyebrow: "Achoura",
          titre: "Tout pour Achoura",
          sous_titre:
            "Les indispensables du jour, halal et frais, prêts au retrait magasin.",
        };
      default:
        return { eyebrow: "", titre: "", sous_titre: "" };
    }
  })();

  return (
    <section
      aria-label={copy.titre}
      className="max-w-7xl mx-auto px-6 md:px-8 mt-6"
    >
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#082A20] via-[#0E3B2E] to-[#0E3B2E] px-6 py-7 md:px-10 md:py-9 shadow-[0_24px_48px_-28px_rgba(8,42,32,0.55)]">
        {/* Croissant déco, hors flux, ne capte pas le pointeur. */}
        <Moon
          size={170}
          strokeWidth={1}
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 text-[#C9A227]/12 rotate-[18deg]"
        />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.28em] font-bold text-[#C9A227]">
              <Sparkles size={12} aria-hidden />
              {copy.eyebrow}
            </span>
            <h2 className="mt-2.5 text-[24px] md:text-[34px] leading-[1.05] text-[#FAF7EE] font-extrabold tracking-[-0.03em]">
              {copy.titre}
            </h2>
            <p className="mt-2.5 text-[13.5px] md:text-[15px] leading-[1.5] text-[#FAF7EE]/75 max-w-[52ch]">
              {copy.sous_titre}
            </p>
          </div>

          {compteRebours && (
            <span className="shrink-0 inline-flex flex-col items-center justify-center min-w-[64px] px-3 py-2 rounded-2xl bg-[#C9A227]/15 border border-[#C9A227]/40">
              <span className="text-[20px] md:text-[24px] font-extrabold text-[#C9A227] tabular-nums leading-none tracking-[-0.03em]">
                {compteRebours}
              </span>
              <span className="mt-1 text-[9px] uppercase tracking-[0.14em] font-bold text-[#FAF7EE]/60">
                {j === 1 ? "" : "à venir"}
              </span>
            </span>
          )}
        </div>
      </div>
    </section>
  );
};

export default RamadanBanner;
