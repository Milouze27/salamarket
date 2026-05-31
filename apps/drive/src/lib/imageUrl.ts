/**
 * cdnImage — résout l'URL d'image en appliquant le resize CDN Supabase
 * lorsque l'Image Transformation est disponible côté tenant. Pour les
 * URLs externes (placeholders, R2, /products/*.png locaux, etc.) on
 * renvoie l'URL telle quelle.
 *
 * --- HISTORIQUE DU BUG ---
 *
 * Sans transformation, le drive servait des PNG/WebP 1200×1200 pleine
 * résolution partout, y compris dans les vignettes panier (80×80). Le
 * client iPhone téléchargeait ~3 MB pour afficher l'équivalent de
 * 250 KB max. PDP hero seul = ~8 MB sur certaines images denses.
 *
 * --- ÉTAT ACTUEL (vérifié 2026-05-31) ---
 *
 * Le tenant Supabase actuel (`tltmermqodelorthtbre`, plan Free) ne
 * supporte PAS les Image Transformations. Le endpoint
 * `/storage/v1/render/image/public/...` renvoie un 403 :
 *
 *   {"statusCode":"403","error":"FeatureNotEnabled",
 *    "message":"feature not enabled for this tenant"}
 *
 * Et l'ajout des query params `?width=&quality=&resize=` sur le endpoint
 * `/storage/v1/object/public/...` est silencieusement ignoré (même
 * content-length que l'original — vérifié curl HEAD).
 *
 * Refs Supabase Storage Image Transformations :
 *   https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * Le feature flag VITE_SUPABASE_IMAGE_TRANSFORM_ENABLED=true (env Vite)
 * permettra de réactiver le helper automatiquement dès qu'on passera
 * sur le plan Pro Supabase. Tant qu'il est absent / falsy, on renvoie
 * l'URL d'origine et on évite de polluer le cache CDN avec des query
 * params qui ne changent rien au payload.
 *
 * --- MITIGATION SANS TRANSFORM ---
 *
 * En attendant le passage Pro, le vrai gain vient :
 *   1. de l'upload d'images déjà optimisées (max 1200×1200 WebP q75
 *      depuis l'admin) — ce qui est l'état des images actuelles, déjà
 *      raisonnables (37-105 KB constatés).
 *   2. des attributs `loading="lazy"` / `decoding="async"` côté <img>.
 *   3. d'une <picture> avec sources multiples si on a vraiment plusieurs
 *      tailles uploadées (non fait — coût opérationnel disproportionné
 *      par rapport au gain au stock actuel).
 *
 * --- TAILLES PAR USAGE ---
 *
 * Tailles recommandées (utilisées comme width hint quand transform actif) :
 *   - ProductCard         → 600  (aspect-square dans grid mobile)
 *   - WeeklyPicks         → 800  (aspect-4/5 hero éditorial)
 *   - ProductDetail hero  → 1200 (max image, eager + fetchPriority high)
 *   - Cart line thumb     → 80   (vignette 80×80 dans la liste)
 *
 * Qualité par défaut 75 = sweet spot WebP : ~−40% vs 100 sans loss
 * visible sur les photos produits dominantes.
 */
export interface CdnImageOptions {
  /** Largeur cible en px. Le serveur upscale jamais (clamp à l'original). */
  width: number;
  /** Qualité WebP/JPEG 1–100. Défaut 75. */
  quality?: number;
}

const SUPABASE_STORAGE_PATTERN = /supabase\.co\/storage\//;

/**
 * Feature flag — n'active la transformation que si l'env explicite
 * `VITE_SUPABASE_IMAGE_TRANSFORM_ENABLED=true`. Évite d'envoyer des
 * params inutiles tant que le tenant est sur Free plan, et permet le
 * switch en une variable d'env le jour du passage Pro.
 */
const IMAGE_TRANSFORM_ENABLED =
  import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORM_ENABLED === "true";

export function cdnImage(
  url: string | null | undefined,
  opts: CdnImageOptions,
): string {
  if (!url) return "";
  if (!SUPABASE_STORAGE_PATTERN.test(url)) return url;
  if (!IMAGE_TRANSFORM_ENABLED) return url;

  // Tenant Pro : on bascule sur l'endpoint render/image qui supporte
  // vraiment les transformations (le endpoint /object/public/... ignore
  // ces params même en Pro). On remplace donc la portion d'URL.
  const transformed = url.replace(
    "/storage/v1/object/public/",
    "/storage/v1/render/image/public/",
  );

  // Préserve les query params existants (ex : token signé) en append-only.
  const sep = transformed.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  params.set("width", String(Math.round(opts.width)));
  params.set("quality", String(opts.quality ?? 75));
  params.set("resize", "cover");
  return `${transformed}${sep}${params.toString()}`;
}
