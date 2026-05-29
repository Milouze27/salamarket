import imageCompression from "browser-image-compression";
import { supabase } from "@/integrations/supabase/client";

// Bucket Storage utilisé par le module Productions pour les photos de
// lots. Doit être créé manuellement (dashboard Supabase → Storage) :
//   nom: 'productions', public, policies INSERT/SELECT pour authenticated.
// Cf. NIGHT_QUESTIONS.md Q3.
export const PRODUCTIONS_BUCKET = "productions";

interface CompressOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

const DEFAULT_COMPRESS: Required<CompressOptions> = {
  maxSizeMB: 0.8, // photo lot, qualité moyenne suffit
  maxWidthOrHeight: 1600,
};

/**
 * Compresse une image côté navigateur (réduit la résolution + le poids)
 * avant upload. Évite d'envoyer un JPEG iPhone de 8 MB pour rien.
 */
export const compressImage = async (
  file: File,
  options: CompressOptions = {},
): Promise<File> => {
  const opts = { ...DEFAULT_COMPRESS, ...options };
  return imageCompression(file, {
    maxSizeMB: opts.maxSizeMB,
    maxWidthOrHeight: opts.maxWidthOrHeight,
    useWebWorker: true,
    fileType: "image/webp",
    initialQuality: 0.82,
  });
};

export interface UploadResult {
  /** Chemin dans le bucket, ex: "production/abc.webp" */
  path: string;
  /** URL publique (le bucket doit être public) */
  publicUrl: string;
}

/**
 * Upload une photo dans le bucket `productions`. Compresse d'abord.
 *
 * @throws Si le bucket n'existe pas (le toast d'erreur côté UI doit
 * inviter à le créer manuellement).
 */
export const uploadProductionPhoto = async (
  file: File,
  productionId: string,
): Promise<UploadResult> => {
  const compressed = await compressImage(file);
  const ext = "webp";
  const filename = `${productionId}-${Date.now()}.${ext}`;
  const path = `production/${filename}`;

  const { error } = await supabase.storage
    .from(PRODUCTIONS_BUCKET)
    .upload(path, compressed, {
      cacheControl: "3600",
      upsert: false,
      contentType: "image/webp",
    });

  if (error) {
    throw new Error(
      `Upload échoué (${error.message}). Vérifier que le bucket "${PRODUCTIONS_BUCKET}" existe sur Supabase Storage.`,
    );
  }

  const { data } = supabase.storage
    .from(PRODUCTIONS_BUCKET)
    .getPublicUrl(path);

  return { path, publicUrl: data.publicUrl };
};
