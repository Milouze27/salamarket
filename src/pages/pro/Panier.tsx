// Panier Drive Pro.
// - Lit les items du store zustand
// - Calcule pour chaque ligne le prix HT unitaire après palier dégressif
//   et le TTC ligne
// - Le total bas de page utilise computeCartTotal (somme ligne par ligne
//   pour la méthode arrondi commercial FR)
// - "Valider la commande" :
//     1) INSERT commandes_pro (montants posés ensuite)
//     2) INSERT N lignes commandes_pro_lignes (sans tva_taux, trigger DB
//        recopie products.tva_taux)
//     3) UPDATE commandes_pro avec montants calculés
//     4) clear cart + navigate /pro/commande/:id

import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { useProCartStore, type ProCartItem } from "@/stores/proCart";
import { useComptePro } from "@/hooks/useComptePro";
import { supabase } from "@/integrations/supabase/client";
import { formatEur } from "@/lib/format";
import {
  computeCartTotal,
  computeRemisePct,
  prixHtApresRemise,
  ttcFromHt,
  type CartLine,
} from "@/lib/tva";
import type { CommandeProLigneInsert } from "@/types/pro";

interface LigneCalculee {
  item: ProCartItem;
  remisePct: number;
  prixHtUnit: number; // HT unitaire après palier
  totalHt: number;
  totalTtc: number;
}

const computeLignes = (items: ProCartItem[]): LigneCalculee[] =>
  items.map((item) => {
    const remisePct = computeRemisePct(item.quantite_conditionnements, {
      qty_palier_1: item.qty_palier_1,
      remise_palier_1_pct: item.remise_palier_1_pct,
      qty_palier_2: item.qty_palier_2,
      remise_palier_2_pct: item.remise_palier_2_pct,
    });
    const prixHtUnit = prixHtApresRemise(
      item.prix_ht_unitaire,
      item.quantite_conditionnements,
      {
        qty_palier_1: item.qty_palier_1,
        remise_palier_1_pct: item.remise_palier_1_pct,
        qty_palier_2: item.qty_palier_2,
        remise_palier_2_pct: item.remise_palier_2_pct,
      },
    );
    const totalHt = Math.round(prixHtUnit * item.quantite_conditionnements * 100) / 100;
    const totalTtc = ttcFromHt(totalHt, item.product_tva_taux);
    return { item, remisePct, prixHtUnit, totalHt, totalTtc };
  });

// ─────────────────────────────────────────────────────────────────────
// Sous-composant ligne
// ─────────────────────────────────────────────────────────────────────

interface LineRowProps {
  ligne: LigneCalculee;
  onChangeQty: (v: number) => void;
  onRemove: () => void;
}

const LineRow = ({ ligne, onChangeQty, onRemove }: LineRowProps) => {
  const { item, remisePct, prixHtUnit, totalHt, totalTtc } = ligne;
  return (
    <div className="flex gap-3 py-3">
      <div className="w-16 h-16 rounded-md overflow-hidden bg-slate-100 shrink-0">
        {item.product_image_url ? (
          <img
            src={item.product_image_url}
            alt={item.product_name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300">
            <ShoppingBag size={24} aria-hidden />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-medium text-slate-900 text-sm truncate">
              {item.product_name}
            </h3>
            <p className="text-xs text-slate-500">
              {item.conditionnement_pro ??
                `${item.quantite_par_conditionnement} × ${item.product_unit}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Supprimer"
            className="text-slate-400 hover:text-red-600 transition-colors p-1 -mr-1"
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 mt-2">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={999}
              value={item.quantite_conditionnements}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v)) return;
                onChangeQty(v);
              }}
              className="w-16 h-8 text-center text-sm"
              aria-label="Quantité"
            />
            <span className="text-xs text-slate-500">
              × {formatEur(prixHtUnit)} HT
              {remisePct > 0 && (
                <span className="text-amber-700 font-medium ml-1">
                  (−{remisePct}%)
                </span>
              )}
            </span>
          </div>
          <div className="text-right">
            <div className="font-semibold text-slate-900 text-sm">
              {formatEur(totalHt)} HT
            </div>
            <div className="text-xs text-slate-500">{formatEur(totalTtc)} TTC</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

function PanierInner() {
  const navigate = useNavigate();
  const items = useProCartStore((s) => s.items);
  const updateQuantity = useProCartStore((s) => s.updateQuantity);
  const removeItem = useProCartStore((s) => s.removeItem);
  const clear = useProCartStore((s) => s.clear);
  const { compte } = useComptePro();

  const [submitting, setSubmitting] = useState(false);

  const lignes = useMemo(() => computeLignes(items), [items]);

  // Totaux multi-TVA via computeCartTotal
  const cartLines: CartLine[] = useMemo(
    () =>
      lignes.map((l) => ({
        prix_ht: l.totalHt,
        tva_taux: l.item.product_tva_taux,
      })),
    [lignes],
  );
  const totals = useMemo(() => computeCartTotal(cartLines), [cartLines]);

  // Décomposition TVA par taux pour le récap
  const tvaParTaux = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of lignes) {
      const taux = l.item.product_tva_taux;
      const tva = ttcFromHt(l.totalHt, taux) - l.totalHt;
      map.set(taux, (map.get(taux) ?? 0) + Math.round(tva * 100) / 100);
    }
    return Array.from(map.entries()).map(([taux, montant]) => ({
      taux,
      montant: Math.round(montant * 100) / 100,
    }));
  }, [lignes]);

  const onValider = async () => {
    if (!compte) {
      toast.error("Compte Pro introuvable.");
      return;
    }
    if (items.length === 0) return;
    setSubmitting(true);
    try {
      // 1. Crée la commande sans montants (on les UPDATE ensuite)
      const { data: created, error: errCmd } = await supabase
        .from("commandes_pro")
        .insert({
          compte_pro_id: compte.id,
          statut: "a_valider",
          type_recuperation: "retrait_pro",
        })
        .select("id")
        .single();
      if (errCmd) throw errCmd;
      const cmdId = created.id;

      // 2. INSERT lignes (sans tva_taux, le trigger DB recopie products.tva_taux)
      const rows: CommandeProLigneInsert[] = lignes.map((l) => ({
        commande_pro_id: cmdId,
        produit_id: l.item.produit_id,
        prix_ht_unitaire: l.prixHtUnit,
        quantite_conditionnements: l.item.quantite_conditionnements,
        quantite_par_conditionnement: l.item.quantite_par_conditionnement,
      }));
      const { error: errLignes } = await supabase
        .from("commandes_pro_lignes")
        .insert(rows);
      if (errLignes) throw errLignes;

      // 3. UPDATE montants
      const { error: errUpd } = await supabase
        .from("commandes_pro")
        .update({
          montant_ht: totals.ht,
          montant_tva: totals.tva,
          montant_ttc: totals.ttc,
        })
        .eq("id", cmdId);
      if (errUpd) throw errUpd;

      // 4. Done
      clear();
      toast.success("Commande envoyée. Elle sera validée sous peu.");
      navigate(`/pro/commande/${cmdId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec : ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ProShell title="Panier" showBack>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag
              size={48}
              className="mx-auto text-slate-300 mb-3"
              aria-hidden
            />
            <h2 className="text-lg font-semibold text-slate-900 mb-1">
              Votre panier est vide
            </h2>
            <p className="text-sm text-slate-500 mb-4">
              Ajoutez des produits depuis le catalogue.
            </p>
            <Link to="/pro/catalogue">
              <Button className="bg-slate-900 hover:bg-slate-800">
                Voir le catalogue
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[1fr_320px] gap-6">
          <Card>
            <CardContent className="p-4 divide-y divide-slate-100">
              {lignes.map((l) => (
                <LineRow
                  key={l.item.prix_id}
                  ligne={l}
                  onChangeQty={(v) => updateQuantity(l.item.prix_id, v)}
                  onRemove={() => removeItem(l.item.prix_id)}
                />
              ))}
            </CardContent>
          </Card>

          <Card className="h-fit lg:sticky lg:top-28">
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold text-slate-900">Récapitulatif</h2>
              <div className="flex justify-between text-sm text-slate-700">
                <span>Total HT</span>
                <span className="font-medium">{formatEur(totals.ht)}</span>
              </div>
              {tvaParTaux.map((t) => (
                <div
                  key={t.taux}
                  className="flex justify-between text-sm text-slate-700"
                >
                  <span>
                    TVA {t.taux.toString().replace(".", ",")}%
                  </span>
                  <span>{formatEur(t.montant)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between text-base font-bold text-slate-900">
                <span>Total TTC</span>
                <span>{formatEur(totals.ttc)}</span>
              </div>

              {totals.ttc > 500 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Commande &gt; 500 € TTC : validation manager requise après
                  envoi.
                </p>
              )}

              <Button
                type="button"
                onClick={onValider}
                disabled={submitting}
                className="w-full bg-amber-500 text-slate-900 hover:bg-amber-400 h-11"
              >
                {submitting ? "Envoi…" : "Valider la commande"}
              </Button>
              <Button
                type="button"
                onClick={clear}
                variant="ghost"
                className="w-full text-slate-500"
                disabled={submitting}
              >
                Vider le panier
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </ProShell>
  );
}

export default function PanierPro() {
  return (
    <ProCompteActifGuard>
      <PanierInner />
    </ProCompteActifGuard>
  );
}
