// Inscription Drive Pro — formulaire en 3 étapes :
// 1. Entreprise (raison sociale, SIRET, forme juridique, adresses, TVA)
// 2. Délégué (nom, contact, mot de passe, conditions de paiement)
// 3. Validation (récap + CGV)
//
// Au submit final :
//   a) signUp Supabase Auth avec l'email du délégué
//   b) INSERT dans comptes_pro avec delegue_user_id = user.id, statut
//      "en_validation" (admin validera ensuite via /admin/comptes-pro)
//
// On reste défensif : si l'email existe déjà côté Auth, on essaie un
// signIn avant d'insérer dans comptes_pro (cas : utilisateur particulier
// qui crée son compte Pro a posteriori).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  User,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";

import { supabase } from "@/integrations/supabase/client";
import { translateAuthError } from "@/lib/authErrors";
import type { ConditionsPaiement, FormeJuridique } from "@/types/pro";

// ─────────────────────────────────────────────────────────────────────
// Schémas
// ─────────────────────────────────────────────────────────────────────

const SIRET_RE = /^\d{14}$/;
// Aligné sur Signup B2C (FR legacy + E.164) : la clientèle halal est
// souvent maghrébine, un délégué avec un mobile étranger (+212…) ne doit
// pas être bloqué en étape 2.
const PHONE_FR_RE = /^(\+33|0)[1-9]\d{8}$/;
const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;
const PHONE_RE = {
  test: (v: string) => PHONE_FR_RE.test(v) || PHONE_E164_RE.test(v),
};

const InscriptionSchema = z.object({
  // Étape 1
  raison_sociale: z.string().min(2, "Min. 2 caractères").max(160),
  siret: z.string().regex(SIRET_RE, "SIRET = 14 chiffres exactement"),
  forme_juridique: z.enum(["SARL", "SAS", "EI", "Association"]),
  tva_intracom: z.string().max(20).optional().or(z.literal("")),
  adresse_facturation: z.string().min(10, "Adresse complète attendue"),
  adresse_livraison: z.string().optional().or(z.literal("")),
  // Étape 2
  delegue_nom: z.string().min(2, "Min. 2 caractères").max(120),
  delegue_telephone: z
    .string()
    .refine((v) => PHONE_RE.test(v.replace(/\s/g, "")), {
      message: "Numéro invalide (ex : 0612345678 ou +212612345678)",
    }),
  delegue_email: z.string().email("Email invalide"),
  delegue_password: z.string().min(8, "Min. 8 caractères"),
  conditions_paiement: z.enum(["comptant", "30_jours", "45_jours_fin_mois"]),
  // Étape 3
  accept_cgv: z.literal(true, {
    errorMap: () => ({ message: "Vous devez accepter les CGV" }),
  }),
});

type InscriptionValues = z.infer<typeof InscriptionSchema>;

// ─────────────────────────────────────────────────────────────────────
// Stepper visuel
// ─────────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 0, label: "Entreprise", icon: Building2 },
  { id: 1, label: "Délégué", icon: User },
  { id: 2, label: "Validation", icon: CheckCircle2 },
] as const;

interface StepperProps {
  current: number;
}

const Stepper = ({ current }: StepperProps) => (
  <ol
    className="flex items-center justify-between mb-8"
    aria-label="Progression"
  >
    {STEPS.map((step, idx) => {
      const Icon = step.icon;
      const done = idx < current;
      const active = idx === current;
      return (
        <li key={step.id} className="flex items-center gap-2 flex-1">
          <div
            className={`flex items-center justify-center w-9 h-9 rounded-full border-2 shrink-0 transition-colors ${
              done
                ? "bg-gold border-gold text-sapin-deep"
                : active
                  ? "bg-sapin border-sapin text-gold-bright"
                  : "bg-white border-line-medium text-ink-faint"
            }`}
            aria-current={active ? "step" : undefined}
          >
            <Icon size={18} aria-hidden />
          </div>
          <span
            className={`text-xs sm:text-sm font-medium ${
              active ? "text-ink" : "text-ink-soft"
            }`}
          >
            {step.label}
          </span>
          {idx < STEPS.length - 1 && (
            <div
              className={`flex-1 h-px mx-2 ${
                done ? "bg-gold" : "bg-cream-300"
              }`}
              aria-hidden
            />
          )}
        </li>
      );
    })}
  </ol>
);

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

const FORMES: readonly FormeJuridique[] = ["SARL", "SAS", "EI", "Association"];
const CONDITIONS: { value: ConditionsPaiement; label: string; sub: string }[] =
  [
    {
      value: "comptant",
      label: "Comptant",
      sub: "À la commande (CB / virement)",
    },
    {
      value: "30_jours",
      label: "30 jours",
      sub: "Paiement à 30 jours date de facture",
    },
    {
      value: "45_jours_fin_mois",
      label: "45 jours fin de mois",
      sub: "Délai légal LME",
    },
  ];

export default function ProInscription() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<InscriptionValues>({
    resolver: zodResolver(InscriptionSchema),
    mode: "onBlur",
    defaultValues: {
      raison_sociale: "",
      siret: "",
      forme_juridique: "SARL",
      tva_intracom: "",
      adresse_facturation: "",
      adresse_livraison: "",
      delegue_nom: "",
      delegue_telephone: "",
      delegue_email: "",
      delegue_password: "",
      conditions_paiement: "comptant",
      // typage strict : on coche en runtime
      accept_cgv: undefined as unknown as true,
    },
  });

  const STEP_FIELDS: (keyof InscriptionValues)[][] = [
    [
      "raison_sociale",
      "siret",
      "forme_juridique",
      "tva_intracom",
      "adresse_facturation",
      "adresse_livraison",
    ],
    [
      "delegue_nom",
      "delegue_telephone",
      "delegue_email",
      "delegue_password",
      "conditions_paiement",
    ],
    ["accept_cgv"],
  ];

  const goNext = async () => {
    const ok = await form.trigger(STEP_FIELDS[step]);
    if (!ok) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const goPrev = () => setStep((s) => Math.max(0, s - 1));

  const onSubmit = async (values: InscriptionValues) => {
    setSubmitting(true);
    try {
      // 1. Crée l'utilisateur Auth (si l'email existe déjà, on essaie
      //    un signIn pour récupérer l'user.id et brancher comptes_pro
      //    sur le compte existant).
      let userId: string | null = null;
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: values.delegue_email.trim(),
          password: values.delegue_password,
          options: {
            emailRedirectTo: `${window.location.origin}/pro/login`,
            data: {
              full_name: values.delegue_nom,
              phone: values.delegue_telephone.replace(/\s/g, ""),
            },
          },
        });

      if (signUpError) {
        // Si l'utilisateur existe déjà, on tente un signIn.
        const code = (signUpError as { code?: string }).code ?? "";
        const isExisting =
          code === "user_already_exists" ||
          /already registered/i.test(signUpError.message);
        if (!isExisting) throw signUpError;
        const { data: signInData, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: values.delegue_email.trim(),
            password: values.delegue_password,
          });
        if (signInError) throw signInError;
        userId = signInData.user?.id ?? null;
      } else {
        userId = signUpData.user?.id ?? null;
      }

      if (!userId) {
        throw new Error(
          "Impossible de récupérer l'identifiant utilisateur après inscription.",
        );
      }

      // 2. INSERT comptes_pro
      const { error: insertError } = await supabase.from("comptes_pro").insert({
        raison_sociale: values.raison_sociale,
        siret: values.siret,
        forme_juridique: values.forme_juridique,
        tva_intracom: values.tva_intracom || null,
        adresse_facturation: values.adresse_facturation,
        adresse_livraison: values.adresse_livraison || null,
        delegue_nom: values.delegue_nom,
        delegue_email: values.delegue_email.trim(),
        delegue_telephone: values.delegue_telephone.replace(/\s/g, ""),
        delegue_user_id: userId,
        conditions_paiement: values.conditions_paiement,
        statut: "en_validation",
      });
      if (insertError) throw insertError;

      toast.success(
        "Demande envoyée ! Nous validons votre compte sous 24-48 h.",
      );
      navigate("/pro/login");
    } catch (err) {
      // Les erreurs Supabase Postgrest ne sont PAS des instances d'Error,
      // d'où la nécessité de regarder l'objet brut (message + code).
      console.error("[ProInscription] submit failed", err);
      const rawMessage =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : err instanceof Error
            ? err.message
            : "";
      const isRlsError = /row[- ]level security|violates.*policy/i.test(
        rawMessage,
      );
      const isComptesProError = /comptes_pro/i.test(rawMessage) || isRlsError;
      const message = isComptesProError
        ? "Création du compte Pro impossible. Votre compte connexion est créé : notre équipe finalisera votre inscription Pro sous 24-48 h."
        : translateAuthError(err);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const values = form.watch();

  return (
    <div className="min-h-dvh bg-cream">
      <header className="bg-sapin text-white border-b border-gold/30">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <span className="text-xs uppercase tracking-widest text-gold-bright font-semibold">
            Drive Pro
          </span>
          <h1 className="text-2xl font-bold mt-1">
            Créer un compte professionnel
          </h1>
          <p className="text-sm text-white/70 mt-1">
            Restaurants, boulangeries, traiteurs, collectivités. Validation sous
            24-48 h.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <Stepper current={step} />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Card>
              <CardContent className="pt-6 space-y-5">
                {/* ─── Étape 1 : Entreprise ───────────────────────── */}
                {step === 0 && (
                  <>
                    <FormField
                      control={form.control}
                      name="raison_sociale"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Raison sociale</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Ex : SARL Le Bistrot des Halles"
                              className="text-base md:text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="siret"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>SIRET</FormLabel>
                            <FormControl>
                              <Input
                                inputMode="numeric"
                                maxLength={14}
                                placeholder="14 chiffres"
                                className="text-base md:text-base"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="forme_juridique"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Forme juridique</FormLabel>
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
                                {FORMES.map((f) => (
                                  <SelectItem key={f} value={f}>
                                    {f}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="tva_intracom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            TVA intracommunautaire (optionnel)
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="FR12345678901"
                              className="text-base md:text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="adresse_facturation"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Adresse de facturation</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              placeholder="Rue, code postal, ville"
                              className="text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="adresse_livraison"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Adresse de livraison (si différente)
                          </FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              placeholder="Laissez vide pour livrer à l'adresse de facturation"
                              className="text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Le retrait au drive est possible sans adresse de
                            livraison.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* ─── Étape 2 : Délégué ──────────────────────────── */}
                {step === 1 && (
                  <>
                    <FormField
                      control={form.control}
                      name="delegue_nom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nom complet du délégué</FormLabel>
                          <FormControl>
                            <Input
                              autoComplete="name"
                              placeholder="Prénom et nom"
                              className="text-base md:text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="delegue_telephone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Téléphone</FormLabel>
                            <FormControl>
                              <Input
                                type="tel"
                                autoComplete="tel"
                                placeholder="0612345678 ou +212612345678"
                                className="text-base md:text-base"
                                {...field}
                              />
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
                            <FormLabel>Email professionnel</FormLabel>
                            <FormControl>
                              <Input
                                type="email"
                                autoComplete="email"
                                placeholder="contact@entreprise.fr"
                                className="text-base md:text-base"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="delegue_password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Mot de passe</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              autoComplete="new-password"
                              placeholder="Min. 8 caractères"
                              className="text-base md:text-base"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Sert à se connecter à l'espace Drive Pro.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="conditions_paiement"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Conditions de paiement souhaitées
                          </FormLabel>
                          <FormControl>
                            <RadioGroup
                              value={field.value}
                              onValueChange={field.onChange}
                              className="grid gap-2"
                            >
                              {CONDITIONS.map((c) => (
                                <Label
                                  key={c.value}
                                  htmlFor={`cond-${c.value}`}
                                  className="flex items-start gap-3 rounded-lg border border-line p-3 hover:bg-cream cursor-pointer has-[:checked]:border-gold has-[:checked]:bg-gold-soft/40"
                                >
                                  <RadioGroupItem
                                    id={`cond-${c.value}`}
                                    value={c.value}
                                    className="mt-0.5"
                                  />
                                  <div className="flex-1">
                                    <div className="font-medium text-ink">
                                      {c.label}
                                    </div>
                                    <div className="text-xs text-ink-soft">
                                      {c.sub}
                                    </div>
                                  </div>
                                </Label>
                              ))}
                            </RadioGroup>
                          </FormControl>
                          <FormDescription>
                            Sous réserve d'acceptation par notre service
                            commercial.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* ─── Étape 3 : Validation ───────────────────────── */}
                {step === 2 && (
                  <>
                    <h2 className="text-lg font-semibold text-ink">
                      Récapitulatif
                    </h2>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <SummaryRow
                        label="Raison sociale"
                        value={values.raison_sociale}
                      />
                      <SummaryRow label="SIRET" value={values.siret} />
                      <SummaryRow
                        label="Forme"
                        value={values.forme_juridique}
                      />
                      <SummaryRow
                        label="TVA intracom"
                        value={values.tva_intracom || "—"}
                      />
                      <SummaryRow
                        label="Adresse facturation"
                        value={values.adresse_facturation}
                        wide
                      />
                      <SummaryRow
                        label="Adresse livraison"
                        value={values.adresse_livraison || "Identique"}
                        wide
                      />
                      <SummaryRow label="Délégué" value={values.delegue_nom} />
                      <SummaryRow label="Email" value={values.delegue_email} />
                      <SummaryRow
                        label="Téléphone"
                        value={values.delegue_telephone}
                      />
                      <SummaryRow
                        label="Paiement"
                        value={
                          CONDITIONS.find(
                            (c) => c.value === values.conditions_paiement,
                          )?.label ?? values.conditions_paiement
                        }
                      />
                    </dl>

                    <FormField
                      control={form.control}
                      name="accept_cgv"
                      render={({ field }) => (
                        <FormItem className="rounded-lg border border-line p-4 bg-cream">
                          <div className="flex items-start gap-3">
                            <FormControl>
                              <Checkbox
                                checked={!!field.value}
                                onCheckedChange={(c) =>
                                  field.onChange(c === true ? true : undefined)
                                }
                                className="mt-0.5"
                              />
                            </FormControl>
                            <div className="text-sm text-ink-soft">
                              J'accepte les{" "}
                              <a
                                href="/cgv"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline font-medium"
                              >
                                conditions générales de vente Drive Pro
                              </a>{" "}
                              et certifie l'exactitude des informations
                              fournies.
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3 mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={goPrev}
                disabled={step === 0 || submitting}
              >
                <ArrowLeft size={16} className="mr-1" /> Précédent
              </Button>

              {step < STEPS.length - 1 ? (
                <Button type="button" onClick={goNext}>
                  Suivant <ArrowRight size={16} className="ml-1" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={submitting}
                  className="bg-gold text-sapin-deep hover:bg-gold-bright"
                >
                  {submitting ? "Envoi…" : "Envoyer ma demande"}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </main>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  wide?: boolean;
}
const SummaryRow = ({ label, value, wide }: SummaryRowProps) => (
  <div className={wide ? "sm:col-span-2" : ""}>
    <dt className="text-xs uppercase text-ink-soft">{label}</dt>
    <dd className="text-sm text-ink font-medium">{value}</dd>
  </div>
);
