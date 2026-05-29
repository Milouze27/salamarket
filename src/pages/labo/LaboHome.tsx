import { Link } from "react-router-dom";
import { subDays } from "date-fns";
import { useMemo } from "react";
import { ArrowRight, BookOpen, Factory, LineChart } from "lucide-react";

import { LaboShell } from "@/components/labo/LaboShell";
import { Card, CardContent } from "@/components/ui/card";

import { useRecettes } from "@/hooks/useRecettes";
import { useProductions } from "@/hooks/useProductions";
import { useProductionsKpi } from "@/hooks/useProductionsKpi";
import { formatEur } from "@/lib/format";

/**
 * Page d'atterrissage `/v2/labo` : récap rapide + 3 grosses cards de
 * navigation vers les sous-modules. Utile parce qu'un user arrivant à
 * /labo sans suffixe ne devrait pas se prendre un 404.
 */
export default function LaboHomePage() {
  const { data: recettes } = useRecettes();
  const { data: productionsEnCours } = useProductions({ statut: "en_cours" });

  const dateFrom = useMemo(
    () => subDays(new Date(), 30).toISOString().slice(0, 10),
    [],
  );
  const { data: kpis } = useProductionsKpi({ dateFrom });

  const margeMois = useMemo(
    () => (kpis ?? []).reduce((s, k) => s + (k.marge_eur_ht ?? 0), 0),
    [kpis],
  );

  return (
    <LaboShell>
      <h2 className="text-2xl font-bold text-[#0E3B2E] mb-1">Bienvenue au labo</h2>
      <p className="text-sm text-[#0E3B2E]/70 mb-6">
        Pilotage des recettes BOM, lancement des productions et suivi des marges.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        <Stat
          label="Recettes actives"
          value={String(recettes?.filter((r) => r.statut === "active").length ?? 0)}
        />
        <Stat
          label="Productions en cours"
          value={String(productionsEnCours?.length ?? 0)}
        />
        <Stat label="Marge HT — 30j" value={formatEur(margeMois)} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <NavCard
          to="/v2/labo/recettes"
          icon={BookOpen}
          title="Recettes"
          description="Catalogue BOM, coût théorique, étapes et main d'œuvre."
        />
        <NavCard
          to="/v2/labo/productions"
          icon={Factory}
          title="Productions"
          description="Lancement de lot, workflow guidé, historique."
        />
        <NavCard
          to="/v2/labo/marges"
          icon={LineChart}
          title="Marges"
          description="Dashboard analytique : marge €/% par jour et par recette."
        />
      </div>
    </LaboShell>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <Card>
    <CardContent className="p-4">
      <div className="text-xs uppercase tracking-wider text-[#0E3B2E]/60 mb-1">
        {label}
      </div>
      <div className="text-xl font-bold text-[#0E3B2E]">{value}</div>
    </CardContent>
  </Card>
);

const NavCard = ({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) => (
  <Link to={to} className="block group">
    <Card className="h-full transition-all hover:shadow-md hover:border-[#0E3B2E]/30">
      <CardContent className="p-5">
        <Icon className="h-6 w-6 text-[#0E3B2E] mb-3" aria-hidden />
        <h3 className="text-base font-semibold text-[#0E3B2E] mb-1 flex items-center gap-2">
          {title}
          <ArrowRight
            className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
            aria-hidden
          />
        </h3>
        <p className="text-sm text-[#0E3B2E]/70 leading-relaxed">
          {description}
        </p>
      </CardContent>
    </Card>
  </Link>
);
