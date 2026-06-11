/**
 * CourteDateBanner — entrée "anti-gaspi" sur la home Drive (Bet 2).
 *
 * Affiche une bannière éditoriale fond or doux / texte sapin invitant les
 * clients à découvrir la sélection courte date jusqu'à -50%. Au clic,
 * navigation vers `/?courte_date=1` : la home (Index) lit ce query param
 * et bascule en mode rayon anti-gaspi. On NE passe PAS par `/catalogue`
 * (qui redirige en `<Navigate to="/">` et perdrait le query param → la
 * bannière paraissait alors « morte », ramenant à la home sans filtre).
 *
 * Lit `v_dlc_alerts` (vue créée par la migration 0032) pour afficher le
 * nombre de produits disponibles. Si Supabase n'est pas joignable ou si
 * la vue renvoie 0 ligne, on hide la bannière entièrement — pas de
 * fausse promesse sur la home.
 *
 * Style : palette Salam strict (sapin #0E3B2E sur or doux #F4E9C4),
 * tap target ≥ 44px (mémoire user iPhone PWA).
 */

import { useEffect, useState } from "react";
import { ChevronRight, Leaf } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface DlcRow {
  produit_id: string;
  niveau_alerte: string;
}

export const CourteDateBanner = () => {
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { data, error } = await supabase
          .from("v_dlc_alerts")
          .select("produit_id, niveau_alerte")
          .neq("niveau_alerte", "ok")
          .neq("niveau_alerte", "forcé"); // les forcés sont retirés du Drive

        if (cancelled) return;

        if (error) {
          console.warn("[CourteDateBanner] fetch error:", error.message);
          setCount(0);
          return;
        }

        // Dédoublonne par produit (un produit peut avoir plusieurs lots).
        const rows = (data ?? []) as DlcRow[];
        const unique = new Set(rows.map((r) => r.produit_id));
        setCount(unique.size);
      } catch (e) {
        if (!cancelled) {
          console.warn("[CourteDateBanner] unexpected error:", e);
          setCount(0);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hide tant qu'on n'a pas chargé OU si aucun produit dispo.
  if (count === null || count === 0) return null;

  return (
    <button
      type="button"
      onClick={() => navigate("/?courte_date=1")}
      className="group w-full text-left rounded-2xl border transition-all active:scale-[0.99]"
      style={{
        backgroundColor: "#F4E9C4",
        borderColor: "#C9A227",
        color: "#0E3B2E",
        minHeight: 64,
      }}
      aria-label={`Rayon anti-gaspi : ${count} produit${count > 1 ? "s" : ""} courte date disponible${count > 1 ? "s" : ""}`}
    >
      <div className="flex items-center gap-3 px-4 py-3.5">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: "#0E3B2E", color: "#F4E9C4" }}
        >
          <Leaf className="w-5 h-5" strokeWidth={2.2} />
        </span>
        <div className="flex-1 min-w-0">
          <p
            className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
            style={{ color: "#8B6F0E" }}
          >
            Rayon anti-gaspi
          </p>
          <p
            className="text-[15px] font-extrabold leading-tight mt-0.5 truncate"
            style={{ color: "#0E3B2E" }}
          >
            Courte date jusqu&apos;à <span style={{ color: "#A8231A" }}>-50%</span>
          </p>
          <p className="text-[11.5px] mt-0.5 opacity-80 truncate" style={{ color: "#0E3B2E" }}>
            {count} produit{count > 1 ? "s" : ""} disponible{count > 1 ? "s" : ""}
          </p>
        </div>
        <ChevronRight
          className="w-5 h-5 shrink-0 transition-transform group-hover:translate-x-0.5"
          style={{ color: "#0E3B2E" }}
        />
      </div>
    </button>
  );
};

export default CourteDateBanner;
