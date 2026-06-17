"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Sparkles,
  Sprout,
} from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { ProductThumbnail } from "@/components/v2/ProductThumbnail";
import { EditorialEyebrow } from "@/components/v2/EditorialEyebrow";
import { useV2 } from "@/lib/v2-store";
import {
  assignInventairesPourDepot,
  completeInventaire,
  listInventairesDuJour,
  listProduitsInDepot,
} from "@/lib/db";
import type { InventaireTournant, ProduitInDepot } from "@/lib/types/db";

const HistoriquePanel = dynamic(
  () =>
    import("@/components/inventaire/HistoriquePanel").then(
      (m) => m.HistoriquePanel,
    ),
  {
    ssr: false,
    loading: () => (
      <p className="px-5 pt-10 text-center text-text-secondary">Chargement…</p>
    ),
  },
);

type Tab = "aujourdhui" | "historique";

interface Row extends InventaireTournant {
  produit?: ProduitInDepot;
}

export default function V2InventairePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get("tab") === "historique" ? "historique" : "aujourdhui",
  );

  function selectTab(next: Tab) {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`/v2/inventaire?${params.toString()}`);
  }

  const depot = useV2((s) => s.currentDepot);
  const employe = useV2((s) => s.currentEmploye);

  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!depot) return;
    void load();
  }, [depot]);

  async function load() {
    if (!depot) return;
    setLoading(true);
    try {
      let invs = await listInventairesDuJour({ depotId: depot.id });
      // Auto-assign 5 produits if none yet for today (the cron does this in prod).
      if (invs.length === 0) {
        invs = await assignInventairesPourDepot(depot.id, 5);
        if (invs.length > 0) {
          // id stable par dépôt+jour → ne se ré-affiche pas en boucle (reload)
          toast.success(
            `Inventaire du jour : ${invs.length} produits assignés aléatoirement pour une couverture équitable.`,
            { id: `inv-assigned-${depot.id}-${new Date().toDateString()}` },
          );
        }
      }
      const stock = await listProduitsInDepot(depot.id);
      const merged: Row[] = invs.map((i) => ({
        ...i,
        produit: stock.find((p) => p.id === i.produit_id),
      }));
      setRows(merged);
    } catch (e) {
      console.error(e);
      toast.error("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }

  const mine = useMemo(() => {
    if (!employe) return rows;
    // Show all but mark mine
    return rows.sort((a) => (a.employe_assigne_id === employe.id ? -1 : 1));
  }, [rows, employe]);

  // Décompte de clôture, source unique partagée par le bouton et
  // validateAll. Un produit "à moi" est soit ENCORE à compter (statut
  // assigne), soit DÉJÀ compté (statut compte/valide, p.ex. dans une
  // session antérieure). Le compteur du bouton doit refléter le total
  // réellement compté (saisie locale d'une ligne assigne + lignes déjà
  // comptées), sinon il affiche 0/0 et bloque la clôture alors que des
  // produits sont comptés (bug STK-OPS-05).
  const cloture = useMemo(() => {
    const minePending = rows.filter(
      (r) => r.statut === "assigne" && r.employe_assigne_id === employe?.id,
    );
    const mineDone = rows.filter(
      (r) =>
        (r.statut === "compte" || r.statut === "valide") &&
        r.employe_assigne_id === employe?.id,
    );
    const fillable = minePending.filter((r) => {
      const raw = (counts[r.id] ?? "").trim();
      if (raw === "") return false;
      const c = Number(raw);
      return Number.isFinite(c) && c >= 0;
    });
    const totalMine = minePending.length + mineDone.length;
    // Comptés = déjà comptés (DB) + saisis localement maintenant.
    const compteCount = mineDone.length + fillable.length;
    return { minePending, mineDone, fillable, totalMine, compteCount };
  }, [rows, counts, employe]);

  async function validateAll() {
    if (!employe) return;

    const { minePending, mineDone, fillable, totalMine } = cloture;

    if (totalMine === 0) {
      toast.error("Aucun produit à valider sur cet inventaire.", {
        id: "inv-nothing-to-do",
      });
      return;
    }

    // Rien de nouveau à saisir mais des produits déjà comptés : l'inventaire
    // est déjà couvert, on ne bloque pas l'utilisateur sur un faux 0/0.
    if (fillable.length === 0 && mineDone.length > 0) {
      toast.success("Tous tes produits sont déjà comptés.", {
        id: "inv-already-done",
      });
      return;
    }

    if (fillable.length === 0) {
      toast.error(
        `Compte au moins un produit (sur ${minePending.length}) avant de valider.`,
        { id: "inv-empty" },
      );
      return;
    }

    // Partiel = il reste des produits NON comptés (ni saisis maintenant, ni
    // déjà comptés en base).
    const partial = fillable.length + mineDone.length < totalMine;
    if (partial) {
      const restant = totalMine - fillable.length - mineDone.length;
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          `Il reste ${restant} produit${restant > 1 ? "s" : ""} non compté${restant > 1 ? "s" : ""} sur ${totalMine}. ` +
            "Valider partiellement ?\n\nLes produits non comptés resteront à compter plus tard.",
        );
      if (!ok) return;
    }

    setSubmitting(true);
    let totalEcart = 0;
    let totalTheo = 0;
    try {
      for (const r of fillable) {
        const c = Number((counts[r.id] ?? "").trim());
        await completeInventaire(r.id, c);
        const ecart = c - (r.quantite_attendue ?? 0);
        totalEcart += Math.abs(ecart);
        totalTheo += r.quantite_attendue ?? 0;
      }
      // Conformité : 100 % seulement si AUCUN écart. Si le théorique est 0
      // mais qu'on a compté des écarts (stock fantôme), c'est 0 %, pas 100 %.
      const conf =
        totalTheo > 0
          ? Math.max(0, 100 - (totalEcart / totalTheo) * 100)
          : totalEcart > 0
            ? 0
            : 100;
      const progress = `${fillable.length + mineDone.length}/${totalMine}`;
      const lowConf = conf < 95;
      // Push iPhone admin — inventaire complété (urgent si conformité basse)
      void import("@/lib/notifications").then((m) =>
        m.pushToAdmins({
          title: lowConf
            ? `⚠️ Inventaire ${depot?.nom ?? ""} · conformité ${conf.toFixed(0)}%`
            : `✅ Inventaire ${depot?.nom ?? ""} validé`,
          body: `${employe.prenom ?? "Employé"} a compté ${progress} produits · ${totalEcart} unités d'écart`,
          url: "/v2/inventaire/historique",
          tag: `inv-done-${Date.now()}`,
          urgent: lowConf,
        }),
      );
      if (lowConf) {
        toast.warning(
          `Inventaire ${progress} validé · conformité ${conf.toFixed(1)}% · Otmane + Ahmed notifiés.`,
          { id: "inv-done" },
        );
        // HOTFIX vague 7 : server action injecte x-internal-secret.
        try {
          const { sendInternalNotify } = await import("@/lib/actions/notify");
          await sendInternalNotify({
            kind: "inventaire_low_conformite",
            payload: {
              depot: depot?.nom,
              employe: `${employe.prenom} ${employe.nom}`,
              conformite: conf,
              ecarts: totalEcart,
              comptes: fillable.length + mineDone.length,
              assignes: totalMine,
            },
          });
        } catch (e) {
          console.warn("[notify] inventaire fail:", e);
        }
      } else {
        toast.success(
          `Inventaire ${progress} validé · conformité ${conf.toFixed(1)}% · admin notifié.`,
          { id: "inv-done" },
        );
      }
      await load();
    } catch (e) {
      console.error(e);
      toast.error(
        e instanceof Error ? e.message : "Erreur lors de la validation",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="or" />
      <header className="px-5 pt-7">
        <BackButton />
        <EditorialEyebrow
          num="01"
          label="Inventaire"
          className="mt-3"
        />
        {tab === "aujourdhui" ? (
          <>
            <h1 className="h1-display mt-3">
              <span className="gold">{rows.length}</span> produit
              {rows.length > 1 ? "s" : ""} à compter.
            </h1>
            <p className="body-md text-text-secondary mt-3 max-w-[40ch]">
              Tirage automatique chaque matin à 7h dans le dépôt actif.
            </p>
          </>
        ) : null}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => selectTab("aujourdhui")}
            data-active={tab === "aujourdhui"}
            className="pill-filter"
          >
            Aujourd&apos;hui
          </button>
          <button
            onClick={() => selectTab("historique")}
            data-active={tab === "historique"}
            className="pill-filter"
          >
            Historique
          </button>
        </div>
      </header>

      {tab === "historique" ? (
        <HistoriquePanel />
      ) : loading ? (
        <div className="px-5 pt-10 text-center text-text-secondary">
          Chargement…
        </div>
      ) : rows.length === 0 ? (
        <div className="px-5 pt-10 text-center text-text-secondary">
          Aucun inventaire assigné aujourd&apos;hui.
        </div>
      ) : (
        <section className="px-5 mt-5 space-y-3">
          <div className="bg-gold-soft rounded-2xl p-3 flex items-start gap-2 text-xs text-primary-dark">
            <Sparkles className="w-4 h-4 mt-0.5 shrink-0" />
            <p>
              Les produits sont tirés au sort parmi le catalogue du dépôt actif.
              Compte physiquement, saisis la quantité, valide.
            </p>
          </div>
          {mine.map((r, i) => {
            const isMine = r.employe_assigne_id === employe?.id;
            const c = parseInt(counts[r.id] ?? "", 10);
            const ecart = !Number.isNaN(c)
              ? c - (r.quantite_attendue ?? 0)
              : null;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-white border rounded-2xl p-4 ${
                  isMine ? "border-primary" : "border-rule"
                }`}
              >
                <div className="flex items-start gap-3">
                  <ProductThumbnail
                    nom={r.produit?.nom ?? "?"}
                    categorie={r.produit?.categorie}
                    size={48}
                    rounded="xl"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-primary line-clamp-2">
                      {r.produit?.nom ?? "Produit"}
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {isMine ? "Assigné à toi" : "Assigné à un collègue"}
                      {r.statut === "compte" && " · compté"}
                      {r.statut === "valide" && " · validé"}
                    </p>
                  </div>
                </div>
                {r.statut === "assigne" && isMine ? (
                  <div className="flex items-end justify-between mt-4 gap-3">
                    <div>
                      <p className="label-caps text-text-tertiary">THÉORIQUE</p>
                      <p className="text-lg font-bold text-text-primary mt-0.5">
                        {r.quantite_attendue ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="label-caps text-text-tertiary text-right">
                        COMPTÉ
                      </p>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={counts[r.id] ?? ""}
                        onChange={(e) =>
                          setCounts((c) => ({
                            ...c,
                            // Comptage en unités entières : pas de décimale.
                            [r.id]: e.target.value.replace(/[^0-9]/g, ""),
                          }))
                        }
                        className="w-20 mt-0.5 text-center bg-cream border border-rule rounded-xl py-2.5 min-h-[44px] text-lg font-bold"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end justify-between mt-3 text-xs text-text-secondary">
                    <span>Théorique : {r.quantite_attendue ?? "—"}</span>
                    {r.quantite_comptee !== null && (
                      <span>
                        Compté : <strong>{r.quantite_comptee}</strong> · écart{" "}
                        <strong
                          className={
                            r.ecart === 0 ? "text-success" : "text-warning"
                          }
                        >
                          {r.ecart > 0 ? "+" : ""}
                          {r.ecart}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
                {ecart !== null &&
                  ecart !== 0 &&
                  r.statut === "assigne" &&
                  isMine && (
                    <p className="text-[11px] text-warning font-bold mt-2">
                      Écart prévu : {ecart > 0 ? "+" : ""}
                      {ecart}
                    </p>
                  )}
              </motion.div>
            );
          })}
        </section>
      )}

      {tab === "aujourdhui" && (
      <div className="fixed bottom-0 inset-x-0 z-30 pb-safe pointer-events-none">
        <div className="mx-auto max-w-[460px] px-4 pt-3 pb-3 pointer-events-auto">
          {(() => {
            const { totalMine, compteCount, minePending, fillable } = cloture;
            const nothingAssigned = totalMine === 0;
            // "Rien à saisir" : aucune ligne assigne reste OU aucune saisie en
            // cours, mais des produits sont déjà comptés → bouton actif (la
            // clôture est possible), juste pas en mode "compte d'abord".
            const noneFilled =
              !nothingAssigned &&
              fillable.length === 0 &&
              compteCount === 0;
            // On peut valider dès qu'il y a au moins un produit compté
            // (localement ou déjà en base), ou rien à faire (déjà tout compté).
            const canValidate =
              !nothingAssigned &&
              (fillable.length > 0 || minePending.length === 0);
            return (
              <button
                onClick={validateAll}
                disabled={submitting || nothingAssigned || !canValidate}
                className={`w-full rounded-[22px] px-5 py-4 flex items-center justify-between shadow-card-lg disabled:opacity-50 transition-colors ${
                  noneFilled ? "bg-warning text-white" : "bg-primary text-white"
                }`}
              >
                <div className="text-left">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gold">
                    {submitting
                      ? "Validation…"
                      : noneFilled
                        ? "Compte au moins 1 produit"
                        : "Valider l'inventaire"}
                  </p>
                  <p className="text-[15px] font-extrabold mt-0.5">
                    {compteCount}/{totalMine} compté
                    {totalMine > 1 ? "s" : ""}
                  </p>
                </div>
                <span className="bg-white/15 backdrop-blur-sm rounded-full p-2.5">
                  {submitting ? (
                    <Sprout className="w-5 h-5" />
                  ) : (
                    <Check className="w-5 h-5" />
                  )}
                </span>
              </button>
            );
          })()}
        </div>
      </div>
      )}
    </V2Shell>
  );
}
