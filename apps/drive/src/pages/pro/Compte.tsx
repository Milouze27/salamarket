// Mon compte Drive Pro. SIRET et raison_sociale en lecture seule
// (changement via support). Édition de adresse_livraison, telephone,
// email, mandat_sepa_id.

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { ProShell } from "@/components/pro/ProShell";
import { ProCompteActifGuard } from "@/components/pro/ProCompteActifGuard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

import { useComptePro, COMPTE_PRO_QUERY_KEY } from "@/hooks/useComptePro";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_CONDITIONS_PAIEMENT, type ConditionsPaiement } from "@/types/pro";
import { formatEur, formatDate } from "@/lib/format";

const PHONE_RE = /^(\+33|0)[1-9]\d{8}$/;

const Schema = z.object({
  adresse_livraison: z.string().max(500).optional().or(z.literal("")),
  delegue_telephone: z
    .string()
    .refine((v) => PHONE_RE.test(v.replace(/\s/g, "")), {
      message: "Téléphone FR invalide",
    }),
  delegue_email: z.string().email("Email invalide"),
  mandat_sepa_id: z.string().max(50).optional().or(z.literal("")),
});

type Values = z.infer<typeof Schema>;

function CompteInner() {
  const { compte, isLoading } = useComptePro();
  const queryClient = useQueryClient();

  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      adresse_livraison: "",
      delegue_telephone: "",
      delegue_email: "",
      mandat_sepa_id: "",
    },
  });

  useEffect(() => {
    if (!compte) return;
    form.reset({
      adresse_livraison: compte.adresse_livraison ?? "",
      delegue_telephone: compte.delegue_telephone,
      delegue_email: compte.delegue_email,
      mandat_sepa_id: compte.mandat_sepa_id ?? "",
    });
  }, [compte, form]);

  const onSubmit = async (values: Values) => {
    if (!compte) return;
    try {
      const { error } = await supabase
        .from("comptes_pro")
        .update({
          adresse_livraison: values.adresse_livraison || null,
          delegue_telephone: values.delegue_telephone.replace(/\s/g, ""),
          delegue_email: values.delegue_email.trim(),
          mandat_sepa_id: values.mandat_sepa_id || null,
        })
        .eq("id", compte.id);
      if (error) throw error;
      toast.success("Compte mis à jour.");
      queryClient.invalidateQueries({ queryKey: COMPTE_PRO_QUERY_KEY });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec : ${msg}`);
    }
  };

  if (isLoading || !compte) {
    return (
      <ProShell title="Mon compte">
        <div className="flex items-center justify-center py-12 text-ink-faint">
          <Loader2 className="animate-spin" aria-hidden />
        </div>
      </ProShell>
    );
  }

  const conditions =
    LABEL_CONDITIONS_PAIEMENT[compte.conditions_paiement as ConditionsPaiement] ??
    compte.conditions_paiement;

  return (
    <ProShell title="Mon compte">
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Infos entreprise (lecture seule) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entreprise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Info label="Raison sociale" value={compte.raison_sociale} />
            <Info label="SIRET" value={compte.siret} />
            {compte.forme_juridique && (
              <Info label="Forme" value={compte.forme_juridique} />
            )}
            {compte.tva_intracom && (
              <Info label="TVA intracom" value={compte.tva_intracom} />
            )}
            <Info label="Adresse facturation" value={compte.adresse_facturation} />
            <div className="rounded-md bg-cream border border-line p-3 text-xs text-ink-soft">
              Pour modifier la raison sociale, le SIRET ou l'adresse de
              facturation, contactez notre service commercial.
            </div>
          </CardContent>
        </Card>

        {/* Encours et conditions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conditions & encours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Info label="Conditions paiement" value={conditions} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs uppercase text-ink-soft">Encours actuel</dt>
                <dd className="text-lg font-bold text-ink">
                  {formatEur(compte.encours_actuel)}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-ink-soft">Encours max</dt>
                <dd className="text-lg font-bold text-ink">
                  {formatEur(compte.encours_max)}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-soft">Statut compte :</span>
              <Badge className="bg-emerald-600 hover:bg-emerald-600">
                Actif
              </Badge>
            </div>
            {compte.valide_at && (
              <Info
                label="Validé le"
                value={formatDate(compte.valide_at)}
              />
            )}
          </CardContent>
        </Card>

        {/* Édition délégué */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Délégué & livraison</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <Info label="Nom du délégué" value={compte.delegue_nom} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="delegue_telephone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Téléphone</FormLabel>
                        <FormControl>
                          <Input type="tel" autoComplete="tel" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="delegue_email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" autoComplete="email" {...field} />
                        </FormControl>
                        <FormDescription>
                          Email utilisé pour la connexion et les notifications.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="adresse_livraison"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adresse de livraison</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={2}
                          placeholder="Vide = retrait drive ou livraison à l'adresse de facturation"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="mandat_sepa_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Identifiant mandat SEPA (RUM)</FormLabel>
                      <FormControl>
                        <Input placeholder="Optionnel" {...field} />
                      </FormControl>
                      <FormDescription>
                        Référence Unique de Mandat communiquée lors de la
                        signature du prélèvement.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button
                    type="submit"
                    disabled={form.formState.isSubmitting || !form.formState.isDirty}
                    className="bg-sapin hover:bg-sapin-deep"
                  >
                    {form.formState.isSubmitting
                      ? "Enregistrement…"
                      : "Enregistrer"}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </ProShell>
  );
}

const Info = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs uppercase text-ink-soft tracking-wide">{label}</dt>
    <dd className="text-sm font-medium text-ink mt-0.5 whitespace-pre-line">
      {value}
    </dd>
  </div>
);

export default function ComptePro() {
  return (
    <ProCompteActifGuard>
      <CompteInner />
    </ProCompteActifGuard>
  );
}
