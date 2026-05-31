/**
 * cdnImage — applique les transformations Supabase Storage CDN (resize +
 * quality) sur les URLs qui sont hébergées sur supabase.co/storage. Pour
 * les autres URLs (placeholders, R2, /products/*.png locaux, etc.), on
 * renvoie l'URL telle quelle sans toucher.
 *
 * Sans ça, le drive servait des PNG/WebP 1200×1200 pleine résolution
 * partout, y compris dans les vignettes panier (80×80). Le client iPhone
 * téléchargeait ~3 MB pour afficher l'équivalent de 250 KB max.
 *
 * Refs Supabase Storage Image Transformations :
 *   https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * Tailles recommandées par usage (côté composant) :
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

export function cdnImage(
  url: string | null | undefined,
  opts: CdnImageOptions,
): string {
  if (!url) return "";
  if (!SUPABASE_STORAGE_PATTERN.test(url)) return url;

  // Préserve les query params existants (ex : token signé) en append-only.
  const sep = url.includes("?") ? "&" : "?";
  const params = new URLSearchParams();
  params.set("width", String(Math.round(opts.width)));
  params.set("quality", String(opts.quality ?? 75));
  params.set("resize", "cover");
  return `${url}${sep}${params.toString()}`;
}
