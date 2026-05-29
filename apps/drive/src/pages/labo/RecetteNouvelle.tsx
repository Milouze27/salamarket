import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { LaboShell } from "@/components/labo/LaboShell";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { useCreateRecette } from "@/hooks/useRecettes";

// Valeurs de statut alignées sur la convention DB (probable : draft/active/
// archived — depuis salam-stock/0024). Si la CHECK constraint réelle utilise
// d'autres valeurs, ajuster ici.
const RecetteSchema = z.object({
  nom: z.string().min(2, "Au moins 2 caractères").max(120),
  categorie: z.string().max(60).optional(),
  notes: z.string().max(2000).optional(),
  statut: z.enum(["draft", "active", "archived"]),
});

type RecetteFormValues = z.infer<typeof RecetteSchema>;

export default function RecetteNouvellePage() {
  const navigate = useNavigate();
  const createRecette = useCreateRecette();

  const form = useForm<RecetteFormValues>({
    resolver: zodResolver(RecetteSchema),
    defaultValues: {
      nom: "",
      categorie: "",
      notes: "",
      statut: "draft",
    },
  });

  const onSubmit = async (values: RecetteFormValues) => {
    try {
      const created = await createRecette.mutateAsync({
        nom: values.nom,
        categorie: values.categorie || null,
        notes: values.notes || null,
        statut: values.statut,
      });
      toast.success("Recette créée");
      navigate(`/v2/labo/recettes/${created.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Échec création : ${msg}`);
    }
  };

  return (
    <LaboShell title="Nouvelle recette">
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-xl text-[#0E3B2E]">
            Nouvelle recette
          </CardTitle>
          <p className="text-sm text-[#0E3B2E]/70">
            Les ingrédients, étapes et main d'œuvre s'ajoutent après création
            depuis la page détail.
          </p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom de la recette</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ex: Merguez maison"
                        autoFocus
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categorie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Catégorie</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="ex: charcuterie, plat préparé…"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Texte libre, utilisé pour le tri et la recherche.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (optionnel)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Particularités, allergènes, conseils de préparation…"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Le prix de vente est fixé par production (champ
                      <code className="mx-1">prix_vente_unitaire_ttc</code> sur
                      les sorties), pas sur la recette elle-même.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="statut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Brouillon</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="archived">Archivée</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex items-center justify-end gap-3 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => navigate("/v2/labo/recettes")}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={createRecette.isPending}
                  className="bg-[#0E3B2E] hover:bg-[#0E3B2E]/90"
                >
                  {createRecette.isPending ? "Création…" : "Créer la recette"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </LaboShell>
  );
}
