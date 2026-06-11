import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/upload";

// Bucket Storage pour les photos de réclamation SAV. Doit être créé
// manuellement (dashboard Supabase → Storage) : nom `reclamations`,
// public, policy INSERT pour authenticated. Si absent, l'upload échoue
// proprement et la réclamation part SANS photo (fallback gracieux).
const RECLAMATIONS_BUCKET = "reclamations";

type LigneSimple = {
  product_id: string;
  name: string;
};

const MOTIFS: { value: string; label: string }[] = [
  { value: "produit_manquant", label: "Produit manquant" },
  { value: "produit_abime", label: "Produit abîmé" },
  { value: "erreur_produit", label: "Erreur de produit" },
  { value: "qualite", label: "Problème de qualité" },
  { value: "autre", label: "Autre" },
];

const Schema = z.object({
  motif: z.enum([
    "produit_manquant",
    "produit_abime",
    "erreur_produit",
    "qualite",
    "autre",
  ]),
  produit_id: z.string().optional().or(z.literal("")),
  commentaire: z
    .string()
    .trim()
    .min(5, "Décrivez le problème (5 caractères min.)")
    .max(2000, "Description trop longue (2000 max.)"),
});

type Values = z.infer<typeof Schema>;

interface Props {
  open: boolean;
  onClose: () => void;
  commandeId: string;
  lignes: LigneSimple[];
}

export function SignalerProbleme({
  open,
  onClose,
  commandeId,
  lignes,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { motif: "produit_manquant", produit_id: "", commentaire: "" },
  });

  // Scroll-lock iOS : body position:fixed (restauration instant).
  useEffect(() => {
    if (!open) return;
    const scrollY = window.scrollY;
    const body = document.body;
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    return () => {
      body.style.position = "";
      body.style.top = "";
      body.style.left = "";
      body.style.right = "";
      body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [open]);

  // Reset complet à chaque ouverture/fermeture.
  useEffect(() => {
    if (open) return;
    setDone(false);
    setSubmitting(false);
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    reset({ motif: "produit_manquant", produit_id: "", commentaire: "" });
  }, [open, reset]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  if (!open) return null;

  const handlePhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez une image.");
      return;
    }
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  };

  const clearPhoto = () => {
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Reconnectez-vous pour signaler un problème.");
        setSubmitting(false);
        return;
      }

      // Upload photo (best-effort : si le bucket manque ou échoue, on
      // continue sans photo plutôt que de bloquer la réclamation).
      let photoUrl: string | null = null;
      if (photo) {
        try {
          const compressed = await compressImage(photo, {
            maxSizeMB: 0.6,
            maxWidthOrHeight: 1400,
          });
          const path = `${user.id}/${commandeId}-${Date.now()}.webp`;
          const { error: upErr } = await supabase.storage
            .from(RECLAMATIONS_BUCKET)
            .upload(path, compressed, {
              cacheControl: "3600",
              upsert: false,
              contentType: "image/webp",
            });
          if (!upErr) {
            const { data } = supabase.storage
              .from(RECLAMATIONS_BUCKET)
              .getPublicUrl(path);
            photoUrl = data.publicUrl;
          } else {
            console.warn("[sav] upload photo échoué:", upErr.message);
          }
        } catch (err) {
          console.warn("[sav] compression/upload photo échoué:", err);
        }
      }

      const ligne = values.produit_id
        ? lignes.find((l) => l.product_id === values.produit_id)
        : null;

      const { error } = await supabase.from("reclamations").insert({
        user_id: user.id,
        client_email: user.email ?? null,
        commande_id: commandeId,
        motif: values.motif,
        produit_id: ligne?.product_id ?? null,
        produit_nom: ligne?.name ?? null,
        commentaire: values.commentaire.trim(),
        photo_url: photoUrl,
      });

      if (error) {
        // Fallback gracieux si la table n'est pas encore migrée.
        if (/relation .*reclamations.* does not exist/i.test(error.message)) {
          toast.error(
            "Le service SAV est en cours d'activation. Réessayez plus tard.",
          );
        } else {
          toast.error(`Échec de l'envoi : ${error.message}`);
        }
        setSubmitting(false);
        return;
      }

      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Échec de l'envoi : ${msg}`);
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sav-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92dvh] overflow-y-auto"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
        }}
      >
        {done ? (
          <div className="p-6">
            <div className="flex items-center gap-3">
              <span
                className="w-10 h-10 rounded-full bg-sapin/10 text-sapin flex items-center justify-center shrink-0"
                aria-hidden
              >
                <AlertTriangle size={18} strokeWidth={2.25} />
              </span>
              <h3 id="sav-title" className="text-[18px] font-bold text-sapin">
                Signalement envoyé
              </h3>
            </div>
            <p className="mt-3 text-[14px] leading-relaxed text-ink/75">
              Merci, nous avons bien reçu votre signalement. Notre équipe revient
              vers vous au plus vite.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full min-h-[48px] rounded-xl bg-sapin text-white font-semibold active:scale-[0.99] transition-all"
            >
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="p-6 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"
                  aria-hidden
                >
                  <AlertTriangle size={18} strokeWidth={2.25} />
                </span>
                <h3
                  id="sav-title"
                  className="text-[18px] font-bold text-sapin truncate"
                >
                  Signaler un problème
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Fermer"
                className="w-9 h-9 -mr-1 rounded-full flex items-center justify-center text-muted hover:bg-cream-200 shrink-0 disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            {/* Motif */}
            <div>
              <label
                htmlFor="sav-motif"
                className="block text-[13px] font-semibold text-ink/75 mb-1.5"
              >
                Quel est le problème ?
              </label>
              <select
                id="sav-motif"
                {...register("motif")}
                className="w-full min-h-[48px] rounded-xl border border-border bg-white px-3 text-[16px] text-text font-medium focus:outline-none focus:border-sapin focus:ring-2 focus:ring-sapin/15"
              >
                {MOTIFS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Ligne concernée (optionnel) */}
            {lignes.length > 0 && (
              <div>
                <label
                  htmlFor="sav-produit"
                  className="block text-[13px] font-semibold text-ink/75 mb-1.5"
                >
                  Produit concerné{" "}
                  <span className="font-normal text-muted">(optionnel)</span>
                </label>
                <select
                  id="sav-produit"
                  {...register("produit_id")}
                  className="w-full min-h-[48px] rounded-xl border border-border bg-white px-3 text-[16px] text-text font-medium focus:outline-none focus:border-sapin focus:ring-2 focus:ring-sapin/15"
                >
                  <option value="">Toute la commande</option>
                  {lignes.map((l) => (
                    <option key={l.product_id} value={l.product_id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Commentaire */}
            <div>
              <label
                htmlFor="sav-commentaire"
                className="block text-[13px] font-semibold text-ink/75 mb-1.5"
              >
                Détails
              </label>
              <textarea
                id="sav-commentaire"
                rows={4}
                placeholder="Décrivez ce qui ne va pas…"
                {...register("commentaire")}
                className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[16px] text-text leading-snug resize-none focus:outline-none focus:border-sapin focus:ring-2 focus:ring-sapin/15"
              />
              {errors.commentaire && (
                <p className="mt-1 text-[12px] text-red-600" role="alert">
                  {errors.commentaire.message}
                </p>
              )}
            </div>

            {/* Photo optionnelle */}
            <div>
              <span className="block text-[13px] font-semibold text-ink/75 mb-1.5">
                Photo <span className="font-normal text-muted">(optionnel)</span>
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoPick}
                className="hidden"
              />
              {photoPreview ? (
                <div className="relative w-full h-40 rounded-xl overflow-hidden border border-border">
                  <img
                    src={photoPreview}
                    alt="Aperçu du problème signalé"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={clearPhoto}
                    aria-label="Retirer la photo"
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-ink/60 text-white flex items-center justify-center backdrop-blur-sm active:scale-95"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full min-h-[48px] rounded-xl border border-dashed border-border px-4 flex items-center justify-center gap-2 text-ink/70 font-medium hover:border-sapin/40 hover:bg-cream/60 active:scale-[0.99] transition-all"
                >
                  <ImagePlus size={18} className="text-sapin shrink-0" aria-hidden />
                  Ajouter une photo
                </button>
              )}
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-1 w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-sapin to-sapin-deep text-white font-bold text-base shadow-lg shadow-sapin/25 active:scale-[0.99] disabled:opacity-60 transition-all inline-flex items-center justify-center gap-2"
            >
              {submitting && (
                <Loader2 size={17} className="animate-spin" aria-hidden />
              )}
              {submitting ? "Envoi…" : "Envoyer le signalement"}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
