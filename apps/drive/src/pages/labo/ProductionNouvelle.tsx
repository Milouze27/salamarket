import { useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, FlaskConical, ListChecks, Receipt, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { LaboShell } from "@/components/labo/LaboShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import {
  useProduction,
  useUpdateProduction,
  useAddProductionInput,
  useAddProductionOutput,
  useAddProductionCoutIndirect,
} from "@/hooks/useProductions";
import { useProducts } from "@/hooks/useProducts";
import { formatEur, formatQty } from "@/lib/format";

// Types CHECK contrainte sur productions_couts_indirects.type
const COUT_TYPES = [
  { value: "main_oeuvre", label: "Main d'œuvre supplémentaire" },
  { value: "energie", label: "Énergie" },
  { value: "consommable", label: "Consommable" },
  { value: "amortissement_equipement", label: "Amortissement équipement" },
  { value: "autre", label: "Autre" },
] as const;

export default function ProductionNouvellePage() {
  const [params] = useSearchParams();
  const productionId = params.get("id");
  const navigate = useNavigate();

  const { data, isLoading, error } = useProduction(productionId ?? undefined);
  const updateProd = useUpdateProduction();

  if (!productionId) {
    return (
      <LaboShell title="Workflow production">
        <Alert>
          <AlertDescription>
            Aucun lot sélectionné. Démarre une production depuis la fiche d'une
            recette.
          </AlertDescription>
        </Alert>
        <Button asChild className="mt-4">
          <Link to="/v2/labo/recettes">Aller aux recettes</Link>
        </Button>
      </LaboShell>
    );
  }

  if (isLoading || !data) {
    return (
      <LaboShell title="Workflow production">
        <Skeleton className="h-12 w-1/3 bg-white mb-4" />
        <Skeleton className="h-96 bg-white" />
      </LaboShell>
    );
  }

  if (error) {
    return (
      <LaboShell title="Workflow production">
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      </LaboShell>
    );
  }

  const { production, inputs, outputs, couts_indirects } = data;

  const handleTerminer = async () => {
    try {
      await updateProd.mutateAsync({
        id: production.id,
        patch: { statut: "terminee" },
      });
      toast.success(`Production ${production.lot_numero} terminée ✓`);
      navigate(`/v2/labo/productions/${production.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Échec : ${msg}`);
    }
  };

  return (
    <LaboShell title={`Lot ${production.lot_numero}`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-[#0E3B2E] font-mono">
          {production.lot_numero ?? "Lot sans numéro"}
        </h2>
        <p className="text-sm text-[#0E3B2E]/70">
          Recette :{" "}
          <span className="font-medium">{production.recette?.nom ?? "—"}</span>
        </p>
      </div>

      <Tabs defaultValue="inputs" className="w-full">
        <TabsList className="grid grid-cols-2 sm:grid-cols-4 mb-6">
          <TabsTrigger value="inputs">
            <FlaskConical className="h-4 w-4 sm:mr-2" aria-hidden />
            <span className="hidden sm:inline">Matières</span>
          </TabsTrigger>
          <TabsTrigger value="outputs">
            <TrendingUp className="h-4 w-4 sm:mr-2" aria-hidden />
            <span className="hidden sm:inline">Sorties</span>
          </TabsTrigger>
          <TabsTrigger value="couts">
            <Receipt className="h-4 w-4 sm:mr-2" aria-hidden />
            <span className="hidden sm:inline">Coûts &amp; notes</span>
          </TabsTrigger>
          <TabsTrigger value="valider">
            <CheckCircle2 className="h-4 w-4 sm:mr-2" aria-hidden />
            <span className="hidden sm:inline">Valider</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inputs">
          <InputsStep productionId={production.id} inputs={inputs} />
        </TabsContent>
        <TabsContent value="outputs">
          <OutputsStep productionId={production.id} outputs={outputs} />
        </TabsContent>
        <TabsContent value="couts">
          <CoutsStep
            productionId={production.id}
            couts={couts_indirects}
            initialNotes={production.notes}
          />
        </TabsContent>
        <TabsContent value="valider">
          <ValiderStep
            production={production}
            inputs={inputs}
            outputs={outputs}
            couts={couts_indirects}
            onTerminer={handleTerminer}
            terminerEnCours={updateProd.isPending}
          />
        </TabsContent>
      </Tabs>
    </LaboShell>
  );
}

// ────── Étape 1 : Inputs (matières) ────────────────────────────────
const InputsStep = ({
  productionId,
  inputs,
}: {
  productionId: string;
  inputs: Array<{
    id: string;
    quantite_reelle_consommee: number;
    cout_unitaire_ht: number;
    cout_total: number | null;
    unite: string;
    produit: { id: string; name: string; unit: string } | null;
  }>;
}) => {
  const { data: products } = useProducts();
  const addInput = useAddProductionInput(productionId);
  const [productId, setProductId] = useState<string>("");
  const [quantite, setQuantite] = useState<string>("");
  const [prix, setPrix] = useState<string>("");

  const totalCout = useMemo(
    () =>
      inputs.reduce(
        (sum, i) =>
          sum +
          (i.cout_total ?? i.quantite_reelle_consommee * i.cout_unitaire_ht),
        0,
      ),
    [inputs],
  );

  const handleAdd = async () => {
    if (!productId || !quantite || !prix) {
      toast.error("Tous les champs requis");
      return;
    }
    const product = products?.find((p) => p.id === productId);
    if (!product) {
      toast.error("Produit introuvable");
      return;
    }
    try {
      await addInput.mutateAsync({
        production_id: productionId,
        produit_id: productId,
        quantite_reelle_consommee: Number(quantite),
        cout_unitaire_ht: Number(prix),
        unite: product.unit,
        scanne_at: new Date().toISOString(),
      });
      setProductId("");
      setQuantite("");
      setPrix("");
      toast.success("Matière ajoutée");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#0E3B2E]">
          Matières premières
        </CardTitle>
        <p className="text-xs text-[#0E3B2E]/60">
          Ajoute chaque entrée. Coût total : {formatEur(totalCout)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="sm:col-span-2">
              <SelectValue placeholder="Produit" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            step="0.001"
            placeholder="Qty"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
          />
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="PU (€)"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={addInput.isPending}
          className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90"
        >
          {addInput.isPending ? "Ajout…" : "Ajouter la matière"}
        </Button>

        {inputs.length > 0 && (
          <table className="w-full text-sm mt-2">
            <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10">
              <tr>
                <th className="text-left py-2 font-medium">Produit</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">PU</th>
                <th className="text-right py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0E3B2E]/8">
              {inputs.map((i) => (
                <tr key={i.id}>
                  <td className="py-2 text-[#0E3B2E]">
                    {i.produit?.name ?? "—"}
                  </td>
                  <td className="py-2 text-right text-[#0E3B2E]/70">
                    {formatQty(i.quantite_reelle_consommee)} {i.unite}
                  </td>
                  <td className="py-2 text-right text-[#0E3B2E]/70">
                    {formatEur(i.cout_unitaire_ht)}
                  </td>
                  <td className="py-2 text-right font-medium text-[#0E3B2E]">
                    {formatEur(
                      i.cout_total ??
                        i.quantite_reelle_consommee * i.cout_unitaire_ht,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};

// ────── Étape 2 : Outputs (sorties) ────────────────────────────────
const OutputsStep = ({
  productionId,
  outputs,
}: {
  productionId: string;
  outputs: Array<{
    id: string;
    quantite_reelle_produite: number;
    prix_vente_unitaire_ttc: number;
    unite: string;
    produit: { id: string; name: string; unit: string; tva_taux: number } | null;
  }>;
}) => {
  const { data: products } = useProducts();
  const addOutput = useAddProductionOutput(productionId);
  const [productId, setProductId] = useState<string>("");
  const [quantite, setQuantite] = useState<string>("");
  const [prix, setPrix] = useState<string>("");

  const totalCa = useMemo(
    () =>
      outputs.reduce(
        (sum, o) => sum + o.quantite_reelle_produite * o.prix_vente_unitaire_ttc,
        0,
      ),
    [outputs],
  );

  const handleAdd = async () => {
    if (!productId || !quantite || !prix) {
      toast.error("Tous les champs requis");
      return;
    }
    const product = products?.find((p) => p.id === productId);
    if (!product) {
      toast.error("Produit introuvable");
      return;
    }
    try {
      await addOutput.mutateAsync({
        production_id: productionId,
        produit_id: productId,
        quantite_reelle_produite: Number(quantite),
        prix_vente_unitaire_ttc: Number(prix),
        unite: product.unit,
      });
      setProductId("");
      setQuantite("");
      setPrix("");
      toast.success("Sortie ajoutée");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#0E3B2E]">
          Sorties (produits finis)
        </CardTitle>
        <p className="text-xs text-[#0E3B2E]/60">
          Pesées en sortie de production. CA potentiel TTC : {formatEur(totalCa)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="sm:col-span-2">
              <SelectValue placeholder="Produit fini" />
            </SelectTrigger>
            <SelectContent>
              {products?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            inputMode="decimal"
            step="0.001"
            placeholder="Qty"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
          />
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="PV TTC (€)"
            value={prix}
            onChange={(e) => setPrix(e.target.value)}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={addOutput.isPending}
          className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90"
        >
          {addOutput.isPending ? "Ajout…" : "Ajouter la sortie"}
        </Button>

        {outputs.length > 0 && (
          <table className="w-full text-sm mt-2">
            <thead className="text-xs uppercase tracking-wider text-[#0E3B2E]/50 border-b border-[#0E3B2E]/10">
              <tr>
                <th className="text-left py-2 font-medium">Produit</th>
                <th className="text-right py-2 font-medium">Qty</th>
                <th className="text-right py-2 font-medium">PV TTC</th>
                <th className="text-right py-2 font-medium">Total TTC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0E3B2E]/8">
              {outputs.map((o) => (
                <tr key={o.id}>
                  <td className="py-2 text-[#0E3B2E]">
                    {o.produit?.name ?? "—"}
                  </td>
                  <td className="py-2 text-right text-[#0E3B2E]/70">
                    {formatQty(o.quantite_reelle_produite)} {o.unite}
                  </td>
                  <td className="py-2 text-right text-[#0E3B2E]/70">
                    {formatEur(o.prix_vente_unitaire_ttc)}
                  </td>
                  <td className="py-2 text-right font-medium text-[#0E3B2E]">
                    {formatEur(
                      o.quantite_reelle_produite * o.prix_vente_unitaire_ttc,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
};

// ────── Étape 3 : Coûts indirects + notes ──────────────────────────
const CoutsStep = ({
  productionId,
  couts,
  initialNotes,
}: {
  productionId: string;
  couts: Array<{
    id: string;
    type: string;
    description: string | null;
    montant: number;
  }>;
  initialNotes: string | null;
}) => {
  const addCout = useAddProductionCoutIndirect(productionId);
  const updateProd = useUpdateProduction();
  const [coutType, setCoutType] = useState<string>(COUT_TYPES[0].value);
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");

  const total = useMemo(
    () => couts.reduce((sum, c) => sum + c.montant, 0),
    [couts],
  );

  const handleAdd = async () => {
    if (!coutType || !montant) {
      toast.error("Type et montant requis");
      return;
    }
    try {
      await addCout.mutateAsync({
        production_id: productionId,
        type: coutType,
        description: description || null,
        montant: Number(montant),
      });
      setDescription("");
      setMontant("");
      toast.success("Coût ajouté");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  const saveNotes = async () => {
    try {
      await updateProd.mutateAsync({
        id: productionId,
        patch: { notes: notes || null },
      });
      toast.success("Notes enregistrées");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#0E3B2E]">
          Coûts indirects &amp; notes
        </CardTitle>
        <p className="text-xs text-[#0E3B2E]/60">
          Énergie, emballage, MO sup, etc. Total : {formatEur(total)}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <Select value={coutType} onValueChange={setCoutType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="sm:col-span-2"
          />
          <Input
            type="number"
            inputMode="decimal"
            step="0.01"
            placeholder="Montant (€)"
            value={montant}
            onChange={(e) => setMontant(e.target.value)}
          />
        </div>
        <Button
          onClick={handleAdd}
          disabled={addCout.isPending}
          className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90"
        >
          {addCout.isPending ? "Ajout…" : "Ajouter le coût"}
        </Button>

        {couts.length > 0 && (
          <ul className="divide-y divide-[#0E3B2E]/8 mt-2">
            {couts.map((c) => (
              <li
                key={c.id}
                className="py-2 flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-[#0E3B2E]">
                  <span className="text-[10px] uppercase tracking-wider text-[#0E3B2E]/40 font-bold mr-2">
                    {c.type.replace(/_/g, " ")}
                  </span>
                  {c.description ?? "—"}
                </span>
                <span className="font-medium text-[#0E3B2E]">
                  {formatEur(c.montant)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Notes de production (champ texte stocké dans productions.notes) */}
        <div className="pt-4 border-t border-[#0E3B2E]/10">
          <Label htmlFor="notes" className="text-sm">
            Notes du lot (optionnel)
          </Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observations, conditions, qualité…"
            rows={4}
            className="mt-1.5"
          />
          <Button
            onClick={saveNotes}
            variant="outline"
            className="mt-2"
            disabled={updateProd.isPending}
          >
            Enregistrer les notes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ────── Étape 4 : Validation ────────────────────────────────────
const ValiderStep = ({
  production,
  inputs,
  outputs,
  couts,
  onTerminer,
  terminerEnCours,
}: {
  production: { lot_numero: string | null; statut: string };
  inputs: Array<{ quantite_reelle_consommee: number; cout_unitaire_ht: number }>;
  outputs: Array<{
    quantite_reelle_produite: number;
    prix_vente_unitaire_ttc: number;
  }>;
  couts: Array<{ montant: number }>;
  onTerminer: () => Promise<void>;
  terminerEnCours: boolean;
}) => {
  const coutMatieres = inputs.reduce(
    (s, i) => s + i.quantite_reelle_consommee * i.cout_unitaire_ht,
    0,
  );
  const coutIndirects = couts.reduce((s, c) => s + c.montant, 0);
  const coutTotal = coutMatieres + coutIndirects;
  const caTtc = outputs.reduce(
    (s, o) => s + o.quantite_reelle_produite * o.prix_vente_unitaire_ttc,
    0,
  );
  const margeApproxTtc = caTtc - coutTotal;

  const dejaTerminee = production.statut === "terminee";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-[#0E3B2E] flex items-center gap-2">
          <ListChecks className="h-4 w-4" aria-hidden />
          Récap &amp; validation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Matières" value={formatEur(coutMatieres)} />
          <Stat label="Coûts indirects" value={formatEur(coutIndirects)} />
          <Stat label="Coût total" value={formatEur(coutTotal)} />
          <Stat
            label="Marge approx. TTC"
            value={formatEur(margeApproxTtc)}
            accent={margeApproxTtc >= 0 ? "emerald" : "red"}
          />
        </div>
        <p className="text-xs text-[#0E3B2E]/60">
          La marge HT exacte sera calculée par la vue <code>v_productions_kpi</code>
          {" "}une fois la production passée à <strong>terminée</strong>.
        </p>

        {dejaTerminee ? (
          <Alert>
            <AlertDescription>
              Cette production est déjà <strong>terminée</strong>. Aucune
              modification possible.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              onClick={onTerminer}
              disabled={terminerEnCours}
              size="lg"
              className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90 flex-1"
            >
              <CheckCircle2 className="mr-2 h-5 w-5" aria-hidden />
              {terminerEnCours
                ? "Validation…"
                : `Terminer le lot ${production.lot_numero ?? "(sans numéro)"}`}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({
  label,
  value,
  accent = "primary",
}: {
  label: string;
  value: string;
  accent?: "primary" | "emerald" | "red";
}) => {
  const cls =
    accent === "emerald"
      ? "text-emerald-700"
      : accent === "red"
        ? "text-red-700"
        : "text-[#0E3B2E]";
  return (
    <div className="bg-[#FAF7EE]/40 rounded-lg p-3">
      <div className="text-xs uppercase tracking-wider text-[#0E3B2E]/60 mb-1">
        {label}
      </div>
      <div className={"text-lg font-bold " + cls}>{value}</div>
    </div>
  );
};
