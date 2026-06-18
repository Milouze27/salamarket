"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { GlassTabs, GlassTabPanel } from "@/components/v2/GlassTabs";

const PanelLoader = () => (
  <div className="px-5 mt-5">
    <div className="bg-[var(--surface-1)] border border-rule rounded-[20px] p-10 flex items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
      <p className="text-sm text-text-secondary">Chargement…</p>
    </div>
  </div>
);

const ComptesPanel = dynamic(
  () => import("@/components/pro/ComptesPanel").then((m) => m.ComptesPanel),
  { ssr: false, loading: PanelLoader },
);
const CommandesProPanel = dynamic(
  () =>
    import("@/components/pro/CommandesProPanel").then(
      (m) => m.CommandesProPanel,
    ),
  { ssr: false, loading: PanelLoader },
);
const FacturesPanel = dynamic(
  () => import("@/components/pro/FacturesPanel").then((m) => m.FacturesPanel),
  { ssr: false, loading: PanelLoader },
);

type Tab = "comptes" | "commandes" | "factures";

const TABS: { key: Tab; label: string; sousTitre: string }[] = [
  {
    key: "comptes",
    label: "Comptes",
    sousTitre:
      "Valide les nouveaux comptes, suis l'encours et suspends si besoin.",
  },
  {
    key: "commandes",
    label: "Commandes",
    sousTitre:
      "Valide, prépare et expédie les commandes des clients pro.",
  },
  {
    key: "factures",
    label: "Factures",
    sousTitre: "Suis les paiements, repère les retards et exporte la compta.",
  },
];

function isTab(v: string | null): v is Tab {
  return v === "comptes" || v === "commandes" || v === "factures";
}

export default function ProPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get("tab");
    return isTab(t) ? t : "comptes";
  });

  // Garde l'URL en phase avec l'onglet actif (partage / rechargement).
  useEffect(() => {
    const current = searchParams.get("tab");
    if (current !== tab) {
      router.replace(`/v2/admin/pro?tab=${tab}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const sousTitre = TABS.find((t) => t.key === tab)?.sousTitre ?? "";

  return (
    <V2Shell hideNav wide>
      <PageAccentStripe accent="or-sapin" />
      <header className="px-5 pt-7">
        <BackButton />
        <h1 className="h1 text-text-primary mt-3">Espace Pro (B2B)</h1>
        <p className="body-md text-text-secondary mt-1">{sousTitre}</p>
      </header>

      {/* Onglets */}
      <GlassTabs<Tab>
        ariaLabel="Sections de l'espace pro"
        className="px-5 mt-5 overflow-x-auto scrollbar-hide"
        value={tab}
        onChange={setTab}
        items={TABS.map((t) => ({ value: t.key, label: t.label }))}
      />

      <GlassTabPanel tabKey={tab}>
        {tab === "comptes" && <ComptesPanel />}
        {tab === "commandes" && <CommandesProPanel />}
        {tab === "factures" && <FacturesPanel />}
      </GlassTabPanel>
    </V2Shell>
  );
}
