/**
 * HalalBadgeLink — passeport halal cliquable + utilitaires prix DLC.
 *
 * Ce module regroupe la couche "preuve différenciante" Salamarket côté Drive :
 *
 *  1. <HalalBadgeLink>  — pour un produit boucherie/charcuterie, récupère le lot
 *     le plus récent (produits_lots where produit_id=X order by created_at desc
 *     limit 1) et affiche un badge bouclier + or « Halal certifié · {certifier} »
 *     cliquable vers /lot/{id} (la page publique de traçabilité LotPublic).
 *     Fallback « Halal certifié » NON cliquable si aucun lot n'est trouvé — on
 *     ne fabrique jamais un faux lien de preuve.
 *
 *  2. useDlcDiscount() + <DlcPriceTag> — remise anti-gaspi DLC. La source de
 *     vérité est la vue SQL `v_dlc_alerts` (migrations 0032 + 20260604000001),
 *     déjà grantée à `anon` et déjà consommée par CourteDateBanner. Elle expose
 *     remise_suggeree_pct / niveau_alerte / jours_restants par LOT. On agrège
 *     par produit en gardant la remise la plus forte parmi les lots ACTIFS
 *     (niveau ≠ ok, ≠ forcé — les forcés sont retirés du Drive). Aucune remise
 *     fabriquée : si la vue ne renvoie rien d'exploitable, le composant ne rend
 *     rien et l'appelant affiche le prix plein.
 *
 * Tables hors types générés (produits_lots, v_dlc_alerts) → cast `as never`
 * comme dans LotPublic.tsx. products.id === produits.id (mêmes UUID, cf.
 * SCHEMA.md « produits vs products » + migration 0030), donc product.id matche
 * directement produit_id côté lots/DLC.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatPrice } from "@/lib/format";

// ─────────────────────────────────────────────────────────────────────────────
// Data — lot le plus récent (passeport halal)
// ─────────────────────────────────────────────────────────────────────────────

interface LatestLot {
  id: string;
  certifier_name: string | null;
}

/**
 * Lot le plus récent d'un produit. `enabled=false` (ex. produit non viande)
 * court-circuite la requête. Best-effort : toute erreur RLS/réseau → null,
 * jamais de throw (on dégrade en fallback « Halal certifié » sans lien).
 */
function useLatestLot(productId: string | undefined, enabled: boolean) {
  const [lot, setLot] = useState<LatestLot | null>(null);

  useEffect(() => {
    if (!enabled || !productId) {
      setLot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("produits_lots" as never)
          .select("id, certifier_name")
          .eq("produit_id", productId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) {
          setLot(null);
          return;
        }
        setLot(data as unknown as LatestLot);
      } catch {
        if (!cancelled) setLot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, enabled]);

  return lot;
}

// ─────────────────────────────────────────────────────────────────────────────
// Data — remise DLC active (v_dlc_alerts)
// ─────────────────────────────────────────────────────────────────────────────

interface DlcAlertRow {
  niveau_alerte: string | null;
  remise_suggeree_pct: number | null;
  jours_restants: number | null;
}

export interface DlcDiscount {
  /** Pourcentage de remise (entier, ex. 30 pour -30 %). */
  pct: number;
  /** Jours restants avant DLC du lot retenu (le plus urgent exploitable). */
  joursRestants: number | null;
  /** Prix plein en cents (rappel). */
  fullCents: number;
  /** Prix remisé en cents, arrondi à l'euro-cent. */
  discountedCents: number;
}

/**
 * Remise DLC active pour un produit, ou null si aucune source exploitable.
 *
 * On lit v_dlc_alerts par produit_id et on retient la remise la plus forte
 * parmi les lots dont le niveau est actif côté Drive :
 *   - on exclut 'ok'    (> 7 j → pas de démarque)
 *   - on exclut 'forcé' (DLC dépassée → produit retiré du Drive, comme la
 *     bannière courte date)
 * et dont remise_suggeree_pct > 0. Sans ligne exploitable → null (prix plein).
 *
 * `priceCents` permet de pré-calculer le prix remisé pour l'appelant.
 */
export function useDlcDiscount(
  productId: string | undefined,
  priceCents: number,
  enabled = true,
): DlcDiscount | null {
  const [discount, setDiscount] = useState<DlcDiscount | null>(null);

  useEffect(() => {
    if (!enabled || !productId) {
      setDiscount(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("v_dlc_alerts" as never)
          .select("niveau_alerte, remise_suggeree_pct, jours_restants")
          .eq("produit_id", productId);
        if (cancelled) return;
        if (error || !data) {
          setDiscount(null);
          return;
        }
        const rows = (data as unknown as DlcAlertRow[]).filter(
          (r) =>
            r.niveau_alerte !== "ok" &&
            r.niveau_alerte !== "forcé" &&
            (r.remise_suggeree_pct ?? 0) > 0,
        );
        if (rows.length === 0) {
          setDiscount(null);
          return;
        }
        // Remise la plus avantageuse pour le client (le lot le plus urgent
        // porte généralement la plus forte remise).
        const best = rows.reduce((a, b) =>
          (b.remise_suggeree_pct ?? 0) > (a.remise_suggeree_pct ?? 0) ? b : a,
        );
        const pct = best.remise_suggeree_pct ?? 0;
        if (pct <= 0 || pct >= 100) {
          setDiscount(null);
          return;
        }
        setDiscount({
          pct,
          joursRestants: best.jours_restants,
          fullCents: priceCents,
          discountedCents: Math.round(priceCents * (1 - pct / 100)),
        });
      } catch {
        if (!cancelled) setDiscount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId, priceCents, enabled]);

  return discount;
}

/**
 * Ensemble des produit_id ayant une remise DLC active (anti-gaspi), pour filtrer
 * le catalogue (rayon « courte date »). Une seule requête sur v_dlc_alerts, même
 * règle d'éligibilité que useDlcDiscount (niveau ≠ ok/forcé, remise > 0).
 * Retourne null tant que c'est en cours (≠ Set vide = chargé mais aucun produit).
 */
export function useDlcProductIds(enabled = true): Set<string> | null {
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!enabled) {
      setIds(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("v_dlc_alerts" as never)
          .select("produit_id, niveau_alerte, remise_suggeree_pct");
        if (cancelled) return;
        if (error || !data) {
          setIds(new Set());
          return;
        }
        const rows = data as unknown as Array<{
          produit_id: string | null;
          niveau_alerte: string | null;
          remise_suggeree_pct: number | null;
        }>;
        const set = new Set<string>();
        for (const r of rows) {
          if (
            r.produit_id &&
            r.niveau_alerte !== "ok" &&
            r.niveau_alerte !== "forcé" &&
            (r.remise_suggeree_pct ?? 0) > 0
          ) {
            set.add(r.produit_id);
          }
        }
        setIds(set);
      } catch {
        if (!cancelled) setIds(new Set());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI — Passeport halal
// ─────────────────────────────────────────────────────────────────────────────

interface HalalBadgeLinkProps {
  productId: string | undefined;
  /** Le produit est-il une viande certifiable (boucherie / charcuterie) ? */
  isCertifiable: boolean;
  /**
   * `card` : pill discrète (overlay catalogue). `detail` : bloc en évidence
   * (bandeau preuve sur la PDP).
   */
  variant?: "card" | "detail";
  className?: string;
}

/**
 * Badge passeport halal. Rendu uniquement pour les produits certifiables.
 * Cliquable vers /lot/{id} si un lot existe, sinon badge statique « Halal
 * certifié » (jamais de lien mort).
 */
export const HalalBadgeLink = ({
  productId,
  isCertifiable,
  variant = "card",
  className,
}: HalalBadgeLinkProps) => {
  const lot = useLatestLot(productId, isCertifiable);

  if (!isCertifiable) return null;

  const certifier = lot?.certifier_name?.trim() || null;
  const label = certifier ? `Halal certifié · ${certifier}` : "Halal certifié";

  // ── Variante carte : pill compacte (overlay image). Discret mais cliquable
  //    quand un lot existe (stopPropagation pour ne pas ouvrir la PDP). ──
  if (variant === "card") {
    const pill =
      "inline-flex items-center gap-1 max-w-full pl-1 pr-1.5 h-[20px] rounded-full bg-[#FAF7EE]/95 backdrop-blur text-[#0E3B2E] text-[9px] font-extrabold uppercase tracking-[0.06em] shadow-sm ring-1 ring-black/5";
    const content = (
      <>
        <BadgeCheck size={11} className="text-[#C9A227] shrink-0" aria-hidden />
        <span className="truncate">{certifier ? "Halal" : "Halal"}</span>
      </>
    );
    if (lot) {
      return (
        <Link
          to={`/lot/${lot.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`${pill} hover:bg-white active:scale-95 transition ${className ?? ""}`}
          aria-label={`${label} · voir la traçabilité du lot`}
          title={label}
        >
          {content}
        </Link>
      );
    }
    return (
      <span
        className={`${pill} ${className ?? ""}`}
        aria-label="Produit halal certifié"
        title={label}
      >
        {content}
      </span>
    );
  }

  // ── Variante detail : bloc preuve en évidence (carte or doux). ──
  const inner = (
    <span className="flex items-center gap-3 w-full">
      <span
        className="shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center"
        aria-hidden
      >
        <ShieldCheck size={20} className="text-[#C9A227]" />
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block text-[10px] uppercase tracking-[0.18em] font-bold text-[#8B6F0E]">
          Passeport halal
        </span>
        <span className="block text-[15px] font-extrabold text-[#0E3B2E] leading-tight truncate">
          {certifier ? "Halal certifié" : "Halal certifié"}
        </span>
        {certifier && (
          <span className="block text-[12px] font-semibold text-[#3E2E0A]/80 truncate">
            Certifié {certifier}
          </span>
        )}
      </span>
      {lot && (
        <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-[#0E3B2E] underline underline-offset-2">
          Voir le lot
        </span>
      )}
    </span>
  );

  const blockBase =
    "flex items-center gap-3 rounded-3xl border border-[#C9A227]/40 bg-[#FBF6E2] p-4";

  if (lot) {
    return (
      <Link
        to={`/lot/${lot.id}`}
        className={`${blockBase} active:scale-[0.99] transition-transform hover:border-[#C9A227]/70 ${className ?? ""}`}
        aria-label={`${label} · ouvrir la page de traçabilité du lot ${lot.id}`}
      >
        {inner}
      </Link>
    );
  }

  return (
    <div
      className={`${blockBase} ${className ?? ""}`}
      aria-label="Produit halal certifié"
    >
      {inner}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// UI — Prix DLC
// ─────────────────────────────────────────────────────────────────────────────

interface DlcPriceTagProps {
  discount: DlcDiscount;
  /**
   * `card` : prix barré + prix remisé compacts + tag « -X% · DLC courte ».
   * `detail` : version plus grande pour la PDP.
   */
  variant?: "card" | "detail";
  className?: string;
}

/**
 * Affichage prix barré + prix remisé + tag remise DLC. Prêt à brancher : il ne
 * fait QUE le rendu d'une remise déjà validée (useDlcDiscount). Si l'appelant
 * n'a pas de remise (null), il n'instancie simplement pas ce composant.
 */
export const DlcPriceTag = ({
  discount,
  variant = "card",
  className,
}: DlcPriceTagProps) => {
  const { pct, fullCents, discountedCents } = discount;
  const tag = (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F1] px-2 py-0.5 text-[#A4271F] font-extrabold uppercase tracking-[0.04em]"
      aria-hidden
    >
      -{pct}% · DLC courte
    </span>
  );

  if (variant === "detail") {
    return (
      <span className={`inline-flex flex-col gap-1.5 ${className ?? ""}`}>
        <span className="inline-flex items-baseline gap-3 flex-wrap">
          <span className="text-[26px] md:text-[32px] font-extrabold text-[#A4271F] tabular-nums tracking-[-0.02em]">
            {formatPrice(discountedCents)}
          </span>
          <span className="text-[16px] md:text-[18px] font-semibold text-[#0F1A14]/45 line-through tabular-nums">
            {formatPrice(fullCents)}
          </span>
        </span>
        <span className="text-[11px]">{tag}</span>
        <span className="sr-only">
          Prix réduit de {pct} pour cent · date limite de consommation courte
        </span>
      </span>
    );
  }

  // card
  return (
    <span className={`flex flex-col gap-0.5 ${className ?? ""}`}>
      <span className="flex items-baseline gap-1.5">
        <span className="text-[15.5px] md:text-[16px] font-extrabold text-[#A4271F] tabular-nums tracking-[-0.01em] leading-tight">
          {formatPrice(discountedCents)}
        </span>
        <span className="text-[11px] font-semibold text-[#0F1A14]/45 line-through tabular-nums">
          {formatPrice(fullCents)}
        </span>
      </span>
      <span className="text-[8.5px]">{tag}</span>
      <span className="sr-only">
        Prix réduit de {pct} pour cent · date limite de consommation courte
      </span>
    </span>
  );
};

export default HalalBadgeLink;
