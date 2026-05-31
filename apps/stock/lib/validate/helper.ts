/**
 * Helper de validation pour les routes API Next.js.
 *
 * Pattern d'usage dans une route :
 *
 *   const parsed = await validateBody(req, scanCartonSchema);
 *   if (!parsed.ok) return parsed.response;
 *   const body = parsed.data; // typé via z.infer
 *
 * En cas d'invalidité retourne une NextResponse 400 avec le détail des
 * erreurs Zod, prête à être renvoyée depuis le handler.
 */

import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";

export type ValidateResult<S extends ZodTypeAny> =
  | { ok: true; data: z.infer<S> }
  | { ok: false; response: NextResponse };

/**
 * Parse le body JSON d'une Request et valide contre un schema Zod.
 * Renvoie un résultat typé : ok=true + data, ou ok=false + response 400
 * formatée prête à renvoyer.
 */
export async function validateBody<S extends ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ValidateResult<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "invalid_json", detail: "Body JSON malformé" },
        { status: 400 },
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: "validation_failed",
          detail: "Body invalide",
          issues,
        },
        { status: 400 },
      ),
    };
  }

  return { ok: true, data: parsed.data };
}
