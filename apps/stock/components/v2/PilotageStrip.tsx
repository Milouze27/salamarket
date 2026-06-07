"use client";

/**
 * PilotageStrip — bandeau « pilotage du jour » partagé par cockpit / dashboard
 * admin / accueil. Source unique : getPilotageToday() (lib/db/pilotage).
 *
 * Anti-slop : pas de hero-metric template ni de grille de 4 cartes identiques.
 * Un lead éditorial (CA du jour, Drive + magasin) puis une rangée d'indicateurs
 * opérationnels tappables (commandes Drive en cours, ruptures, valeur stock).
 * Tokens uniquement, dark natif, mobile-first (la rangée passe en ligne ≥ sm).
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShoppingBag, PackageX, Boxes, ArrowRight } from "lucide-react";
import { getPilotageToday, type PilotageToday } from "@/lib/db/pilotage";
import { useV2 } from "@/lib/v2-store";

function eur(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: n >= 1000 ? 0 : 2,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n);
}

export function PilotageStrip({ allDepots = false }: { allDepots?: boolean }) {
  const depot = useV2((s) => s.currentDepot);
  const [data, setData] = useState<PilotageToday | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const depotId = allDepots ? undefined : depot?.id;
    void getPilotageToday(depotId).then((d) => {
      if (mounted.current) setData(d);
    });
    return () => {
      mounted.current = false;
    };
  }, [depot?.id, allDepots]);

  const enCours = data
    ? data.drive_orders.a_preparer +
      data.drive_orders.en_preparation +
      data.drive_orders.pret
    : 0;

  return (
    <section
      className="rounded-[24px] border p-4 sm:p-5"
      style={{
        background: "var(--hero-gradient, var(--primary-green))",
        borderColor: "var(--accent-gold-hairline, rgba(201,162,39,0.24))",
      }}
    >
      {/* Lead : CA du jour (total) + répartition Drive / magasin */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-[var(--accent-gold-bright)]">
            Aujourd'hui · CA encaissé
          </p>
          <p className="text-[34px] sm:text-[40px] leading-none font-extrabold tabular text-[var(--text-on-dark)] mt-1.5">
            {data ? eur(data.ca_jour.total) : "—"}
          </p>
          <p className="text-[12.5px] text-[var(--text-on-dark-muted)] mt-2 tabular">
            Drive{" "}
            <span className="font-bold text-[var(--text-on-dark)]">
              {data ? eur(data.ca_jour.drive) : "—"}
            </span>
            {"  ·  "}
            Magasin{" "}
            <span className="font-bold text-[var(--text-on-dark)]">
              {data ? eur(data.ca_jour.magasin) : "—"}
            </span>
          </p>
        </div>
      </div>

      {/* Indicateurs opérationnels — rangée tappable */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
        <Indicateur
          href="/v2/preparation"
          icon={ShoppingBag}
          value={data ? String(enCours) : "—"}
          label="Commandes Drive en cours"
          hint={
            data
              ? `${data.drive_orders.a_preparer} à préparer · ${data.drive_orders.pret} prêtes`
              : ""
          }
          urgent={enCours > 0}
        />
        <Indicateur
          href="/v2/forecast"
          icon={PackageX}
          value={data ? String(data.presse.ruptures) : "—"}
          label="Ruptures imminentes"
          hint="Ce qui presse"
          urgent={(data?.presse.ruptures ?? 0) > 0}
        />
        <Indicateur
          href="/v2/stock"
          icon={Boxes}
          value={data ? eur(data.stock.valeur) : "—"}
          label="Valeur de stock"
          hint={data ? `${data.stock.lignes} réfs en stock` : ""}
          urgent={false}
        />
      </div>
    </section>
  );
}

function Indicateur({
  href,
  icon: Icon,
  value,
  label,
  hint,
  urgent,
}: {
  href: string;
  icon: typeof ShoppingBag;
  value: string;
  label: string;
  hint: string;
  urgent: boolean;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border p-3 flex items-center gap-3 active:scale-[0.98] transition-transform min-h-[64px]"
      style={{
        background: "rgba(255,255,255,0.06)",
        borderColor: urgent
          ? "rgba(232,194,74,0.45)"
          : "rgba(255,255,255,0.12)",
      }}
    >
      <span
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: urgent
            ? "rgba(232,194,74,0.18)"
            : "rgba(255,255,255,0.08)",
          color: urgent ? "var(--accent-gold-bright)" : "var(--text-on-dark)",
        }}
      >
        <Icon className="w-4.5 h-4.5" strokeWidth={2.2} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[17px] font-extrabold tabular leading-none text-[var(--text-on-dark)]">
          {value}
        </p>
        <p className="text-[11px] text-[var(--text-on-dark-muted)] mt-1 leading-tight truncate">
          {label}
        </p>
        {hint ? (
          <p className="text-[10px] text-[var(--text-on-dark-muted)] opacity-80 mt-0.5 truncate">
            {hint}
          </p>
        ) : null}
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-[var(--text-on-dark-muted)] opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}
