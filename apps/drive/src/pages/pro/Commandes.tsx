// Liste des commandes Pro du compte connecté (côté délégué).
// - Filtre par statut (a_valider … payee), recherche par numero_commande
// - Tri date desc (la requête useCommandesPro renvoie déjà date desc)
// - Clic ligne → /pro/commande/:id
// - "Recommander" : réhydrate le panier Pro à partir des lignes de la
//   commande, en re-résolvant le tarif Pro ACTUEL via le catalogue (les
//   prix/paliers figés en base peuvent être périmés ; on repart du tarif
//   en cours pour rester cohérent avec ce que l'utilisateur paiera).

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardList, Loader2, RotateCcw, Search } from "lucide-react";
import { toast } from "sonner";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

import { useCommandesPro } from "@/hooks/useCommandesPro";
import { useCatalogPro } from "@/hooks/useCatalogPro";
import { useProCartStore, type ProCartItem } from "@/stores/proCart";
import { supabase } from "@/integrations/supabase/client";
import { formatEur, formatDate } from "@/lib/format";
import {
  LABEL_STATUT_COMMANDE,
  STATUTS_COMMANDE_PRO,
  type CommandePro,
  type StatutCommandePro,
} from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Badge statut : couleurs via tokens (sapin / or) — pas de variant brut.
// ─────────────────────────────────────────────────────────────────────

const STATUT_BADGE_CLASS: Record<StatutCommandePro, string> = {
  a_valider: "bg-gold-soft text-gold-text border-gold/30",
  validee: "bg-emerald-100 text-emerald-900 border-emerald-200",
  en_preparation: "bg-sky-100 text-sky-900 border-sky-200",
  expediee: "bg-indigo-100 text-indigo-900 border-indigo-200",
  livree: "bg-teal-100 text-teal-900 border-teal-200",
  facturee: "bg-violet-100 text-violet-900 border-violet-200",
  payee: "bg-emerald-600 text-white border-emerald-600",
  annulee: "bg-cream-300 text-ink-soft border-line-medium",
};

function StatutBadge({ statut }: { statut: string }) {
  const key = statut as StatutCommandePro;
  const cls =
    STATUT_BADGE_CLASS[key] ?? "bg-cream-200 text-ink-soft border-line";
  const label = LABEL_STATUT_COMMANDE[key] ?? statut;
  return (
    <Badge variant="outline" className={`${cls} whitespace-nowrap`}>
      {label}
    </Badge>
  );
}

// Statuts proposés au filtre (on garde l'ordre du workflow, on retire
// "annulee" qui est rarement filtrée et reste accessible via "Tous").
const FILTRES_STATUT: StatutCommandePro[] = STATUTS_COMMANDE_PRO.filter(
  (s) => s !== "annulee",
);

// ─────────────────────────────────────────────────────────────────────
// Carte commande
// ─────────────────────────────────────────────────────────────────────

interface RowProps {
  commande: CommandePro;
  onRecommander: (commande: CommandePro) => void;
  recommanding: boolean;
}

function CommandeRow({ commande, onRecommander, recommanding }: RowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Link
        to={`/pro/commande/${commande.id}`}
        className="flex-1 min-w-0 group"
        aria-label={`Voir la commande ${commande.numero_commande ?? ""}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sapin group-hover:underline truncate">
            {commande.numero_commande ?? "Sans numéro"}
          </span>
          <StatutBadge statut={commande.statut} />
        </div>
        <div className="text-xs text-ink-soft mt-0.5">
          {formatDate(commande.date_commande)}
        </div>
      </Link>

      <div className="text-right">
        <div className="font-semibold text-ink">
          {formatEur(commande.montant_ttc)}
        </div>
        <div className="text-xs text-ink-soft">TTC</div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRecommander(commande)}
        disabled={recommanding}
        className="h-11 min-w-[44px] shrink-0"
        aria-label={`Recommander ${commande.numero_commande ?? "cette commande"}`}
      >
        {recommanding ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <RotateCcw size={16} aria-hidden />
        )}
        <span className="ml-1.5 hidden sm:inline">Recommander</span>
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

function CommandesInner() {
  const navigate = useNavigate();
  const { commandes, isLoading, isError } = useCommandesPro();
  const { catalog } = useCatalogPro();
  const clear = useProCartStore((s) => s.clear);
  const addItem = useProCartStore((s) => s.addItem);

  const [query, setQuery] = useState("");
  const [statut, setStatut] = useState<StatutCommandePro | null>(null);
  const [recommandingId, setRecommandingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return commandes.filter((c) => {
      if (statut && c.statut !== statut) return false;
      if (q && !(c.numero_commande ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [commandes, query, statut]);

  // Recommander : charge les lignes de la commande, re-résout le tarif
  // Pro actuel par produit (via le catalogue en cache), reconstruit des
  // ProCartItem complets puis remplit le panier.
  const onRecommander = async (commande: CommandePro) => {
    setRecommandingId(commande.id);
    try {
      const { data: lignes, error } = await supabase
        .from("commandes_pro_lignes")
        .select("produit_id, quantite_conditionnements")
        .eq("commande_pro_id", commande.id);
      if (error) throw error;
      if (!lignes || lignes.length === 0) {
        toast.error("Cette commande ne contient aucune ligne.");
        return;
      }

      // Index du catalogue par produit_id (premier tarif Pro actif trouvé).
      const tarifParProduit = new Map(
        catalog
          .filter((t) => t.products)
          .map((t) => [t.produit_id, t] as const),
      );

      const items: {
        item: Omit<ProCartItem, "quantite_conditionnements">;
        qty: number;
      }[] = [];
      let indisponibles = 0;
      for (const l of lignes) {
        const tarif = tarifParProduit.get(l.produit_id);
        if (!tarif || !tarif.products) {
          indisponibles += 1;
          continue;
        }
        items.push({
          item: {
            prix_id: tarif.id,
            produit_id: tarif.produit_id,
            product_name: tarif.products.name,
            product_image_url: tarif.products.image_url,
            product_tva_taux: tarif.products.tva_taux,
            product_unit: tarif.products.unit,
            prix_ht_unitaire: tarif.prix_ht_unitaire,
            quantite_par_conditionnement: tarif.quantite_par_conditionnement,
            conditionnement_pro: tarif.conditionnement_pro,
            qty_palier_1: tarif.qty_palier_1,
            qty_palier_2: tarif.qty_palier_2,
            remise_palier_1_pct: tarif.remise_palier_1_pct,
            remise_palier_2_pct: tarif.remise_palier_2_pct,
          },
          qty: l.quantite_conditionnements,
        });
      }

      if (items.length === 0) {
        toast.error(
          "Aucun produit de cette commande n'est disponible au catalogue actuel.",
        );
        return;
      }

      clear();
      for (const { item, qty } of items) addItem(item, qty);

      if (indisponibles > 0) {
        toast.success(
          `Panier rempli. ${indisponibles} produit(s) indisponible(s) ignoré(s).`,
        );
      } else {
        toast.success("Panier rempli depuis cette commande.");
      }
      navigate("/pro/panier");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Recommande impossible : ${msg}`);
    } finally {
      setRecommandingId(null);
    }
  };

  return (
    <ProShell title="Mes commandes">
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList size={18} aria-hidden />
            Mes commandes
          </CardTitle>

          {/* Recherche */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden
            />
            <Input
              type="search"
              placeholder="Rechercher par numéro de commande…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 text-base"
              aria-label="Rechercher une commande"
            />
          </div>

          {/* Filtres statut */}
          <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
            <Button
              type="button"
              size="sm"
              variant={statut === null ? "default" : "outline"}
              onClick={() => setStatut(null)}
              className={
                statut === null
                  ? "bg-sapin hover:bg-sapin/90 text-white shrink-0"
                  : "shrink-0"
              }
            >
              Tous
            </Button>
            {FILTRES_STATUT.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={statut === s ? "default" : "outline"}
                onClick={() => setStatut(s)}
                className={
                  statut === s
                    ? "bg-sapin hover:bg-sapin/90 text-white shrink-0"
                    : "shrink-0"
                }
              >
                {LABEL_STATUT_COMMANDE[s]}
              </Button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="p-6 text-center text-red-700">
              Erreur lors du chargement des commandes.
            </div>
          ) : commandes.length === 0 ? (
            <EmptyState
              title="Aucune commande pour le moment"
              hint="Passez votre première commande depuis le catalogue Pro."
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Aucune commande ne correspond"
              hint="Essayez un autre statut ou un autre numéro."
            />
          ) : (
            <div className="divide-y divide-line">
              {filtered.map((c) => (
                <CommandeRow
                  key={c.id}
                  commande={c}
                  onRecommander={onRecommander}
                  recommanding={recommandingId === c.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </ProShell>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto w-12 h-12 rounded-full bg-sapin/5 flex items-center justify-center mb-3">
        <ClipboardList size={24} className="text-sapin/40" aria-hidden />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="text-sm text-ink-soft mt-1">{hint}</p>
      <Link to="/pro/catalogue" className="inline-block mt-4">
        <Button className="bg-gold text-sapin-deep hover:bg-gold-bright h-11">
          Voir le catalogue
        </Button>
      </Link>
    </div>
  );
}

export default function CommandesPro() {
  return (
    <ProCompteActifGuard>
      <CommandesInner />
    </ProCompteActifGuard>
  );
}
