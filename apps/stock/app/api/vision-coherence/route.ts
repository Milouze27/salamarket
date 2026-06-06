/**
 * POST /api/vision-coherence
 * Body: { photo_data_url: string, type: string, produit_nom: string, quantite: number }
 * Returns: { coherence_score, produit_visible, defaut_visible, quantite_coherente, notes, hors_sujet, ia_unavailable }
 *
 * Vision Claude STRICTE pour contrôler une déclaration de sortie / casse :
 * l'IA vérifie que le produit DÉCLARÉ est réellement visible sur la photo et
 * que la photo correspond bien à une casse/sortie (et non un objet hors-sujet).
 *
 * Fail-closed : si la clé API est absente ou l'appel échoue, on renvoie un
 * score 0 + ia_unavailable:true. Jamais de mock complaisant qui ferait passer
 * une casse en silence (cf. bug « 80 % sur une photo de PC »).
 */

import { NextResponse } from "next/server";
import {
  callClaudeVision,
  extractJson,
  parseImageDataUrl,
} from "@/lib/ai/vision";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

interface CoherenceRequest {
  photo_data_url: string;
  type: string;
  produit_nom: string;
  quantite: number;
}

interface CoherenceResult {
  coherence_score: number;
  produit_visible: boolean;
  defaut_visible: boolean;
  quantite_coherente: boolean;
  notes: string;
  hors_sujet: boolean;
  ia_unavailable: boolean;
}

/** Réponse fail-closed : score 0 → déclenche systématiquement l'alerte admin. */
function failClosed(notes: string): CoherenceResult {
  return {
    coherence_score: 0,
    produit_visible: false,
    defaut_visible: false,
    quantite_coherente: false,
    notes,
    hors_sujet: false,
    ia_unavailable: true,
  };
}

export async function POST(req: Request) {
  // Rate-limit : route client-facing qui appelle l'API Claude (coûteuse) —
  // 20 req/min/IP suffit largement pour une saisie de casse manuelle et bloque
  // l'abus (burn quota / DoS).
  const rl = checkRateLimit(getClientIp(req), "vision-coherence", 20, 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: CoherenceRequest;
  try {
    body = (await req.json()) as CoherenceRequest;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const image = parseImageDataUrl(body?.photo_data_url);
  if (!image) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Fail-closed : score 0 → l'alerte admin se déclenche, pas de passage silencieux.
    return NextResponse.json(
      failClosed(
        "IA indisponible (clé non configurée) — contrôle humain requis.",
      ),
    );
  }

  const produitNom = (body.produit_nom ?? "").toString().slice(0, 200);
  const type = (body.type ?? "").toString().slice(0, 60);
  const quantite = Number(body.quantite) || 0;

  const system =
    "Tu es un contrôleur anti-fraude rigoureux pour les sorties de stock (casse, démarque, périmé) d'un magasin halal. " +
    "Tu compares une photo à une déclaration. Tu retournes STRICTEMENT du JSON valide, sans préambule ni markdown. " +
    "Tu pars du principe que la photo DOIT prouver la sortie déclarée : si le produit déclaré n'est pas reconnaissable " +
    "sur la photo, ou si la photo montre tout autre chose (un ordinateur, une personne, un décor, une photo vide ou floue), " +
    "alors la déclaration n'est PAS justifiée → coherence_score bas (≤ 0.2), produit_visible=false, hors_sujet=true.";

  const userText = [
    "Contexte : déclaration de sortie de stock à vérifier par la photo.",
    `Type de sortie déclaré : ${type}.`,
    `Produit déclaré : ${produitNom}.`,
    `Quantité déclarée : ${quantite}.`,
    "",
    "Vérifie que la photo prouve bien cette sortie. Réponds STRICTEMENT en JSON :",
    "{",
    '  "hors_sujet": <bool>,            // true si la photo ne montre pas le produit/un objet sans rapport',
    '  "produit_visible": <bool>,       // le produit déclaré est-il reconnaissable sur la photo ?',
    '  "defaut_visible": <bool>,        // un défaut/casse/dégât est-il visible ?',
    '  "quantite_coherente": <bool>,    // la quantité visible est-elle cohérente avec la déclaration ?',
    '  "coherence_score": <number 0..1>,// 0 = photo sans rapport, 1 = preuve parfaite',
    '  "notes": "<analyse courte 1-2 phrases en français>"',
    "}",
    "",
    "Règles :",
    "- hors_sujet=true UNIQUEMENT si la photo ne montre pas du tout le produit déclaré et montre autre chose sans rapport (ordinateur, mur, personne, animal, photo vide).",
    "- Si le produit déclaré est visible (même partiellement) et que la photo est cohérente avec le motif → produit_visible=true, hors_sujet=false.",
    "- Si hors_sujet=true OU produit_visible=false → coherence_score ≤ 0.2.",
  ].join("\n");

  const call = await callClaudeVision({
    apiKey: key,
    image,
    system,
    userText,
    maxTokens: 400,
  });

  if (!call.ok) {
    // Fail-closed : un échec IA ne doit pas faire passer une casse.
    return NextResponse.json(
      failClosed(`IA indisponible (${call.error}) — contrôle humain requis.`),
    );
  }

  const parsed = extractJson(call.text) as Partial<CoherenceResult>;

  // Réponse IA illisible (JSON non parsable) ⇒ fail-closed : on n'invente
  // pas un score, on force l'alerte admin pour contrôle humain.
  if (Object.keys(parsed).length === 0) {
    return NextResponse.json(
      failClosed("Réponse IA illisible — contrôle humain requis."),
    );
  }

  const horsSujet = parsed.hors_sujet === true;
  const produitVisible = parsed.produit_visible === true;
  let score =
    typeof parsed.coherence_score === "number"
      ? Math.max(0, Math.min(1, parsed.coherence_score))
      : 0;
  // Garde serveur : photo hors-sujet ou produit absent ⇒ score plafonné bas.
  if (horsSujet || !produitVisible) score = Math.min(score, 0.2);

  const result: CoherenceResult = {
    coherence_score: parseFloat(score.toFixed(2)),
    produit_visible: produitVisible,
    defaut_visible: parsed.defaut_visible === true,
    quantite_coherente: parsed.quantite_coherente !== false,
    notes:
      typeof parsed.notes === "string" && parsed.notes.trim()
        ? parsed.notes
        : call.text.slice(0, 200),
    hors_sujet: horsSujet,
    ia_unavailable: false,
  };
  return NextResponse.json(result);
}
