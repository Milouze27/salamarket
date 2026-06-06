/**
 * POST /api/vision-product-recognition
 * Body : { photo_data_url: string }
 * Réponse : JSON structuré décrivant le produit d'épicerie sur le carton.
 *
 * Vision Claude STRICTE : si la photo n'est PAS un produit d'épicerie/alimentaire
 * (ex. photo d'un ordinateur, d'une personne, d'un document, d'un décor), l'IA
 * DOIT refuser (produit_reconnu: false, confiance: 0). Aucun mock complaisant :
 * sans clé API on échoue explicitement (fail-closed) plutôt que d'inventer un score.
 */

import { NextResponse } from "next/server";
import {
  callClaudeVision,
  extractJson,
  parseImageDataUrl,
} from "@/lib/ai/vision";

interface RecognitionBody {
  photo_data_url: string;
}

interface RecognitionResult {
  produit_reconnu: boolean;
  nom_suggere: string;
  marque_suggeree: string;
  categorie_suggeree: string;
  sous_categorie_suggeree: string;
  description_courte: string;
  quantite_carton_estimee: number;
  confiance: number;
  /** true si la photo ne montre pas un produit d'épicerie exploitable. */
  hors_sujet?: boolean;
}

const CATEGORIES = [
  "Épicerie sèche",
  "Boissons",
  "Surgelés",
  "Frais",
  "Maghreb",
  "Boucherie",
  "Hygiène",
  "Autre",
] as const;

export async function POST(req: Request) {
  let body: RecognitionBody;
  try {
    body = (await req.json()) as RecognitionBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const image = parseImageDataUrl(body?.photo_data_url);
  if (!image) {
    return NextResponse.json(
      { error: "invalid_image_format" },
      { status: 400 },
    );
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    // Fail-closed : pas de mock. L'UI affiche un état d'erreur clair.
    return NextResponse.json({ error: "ia_unavailable" }, { status: 503 });
  }

  const system =
    "Tu es un expert en reconnaissance de produits d'épicerie et alimentaires pour un magasin halal en France. " +
    "Tu analyses la photo d'un carton/produit en réception et tu retournes STRICTEMENT du JSON valide, sans préambule, sans bloc markdown. " +
    "Tu es RIGOUREUX : si la photo ne montre pas un produit d'épicerie/alimentaire/hygiène vendu en magasin " +
    "(ex. un ordinateur, un téléphone, une personne, un animal, un document, un meuble, un décor, une photo floue ou vide), " +
    "tu REFUSES en mettant est_produit_epicerie=false, produit_reconnu=false et confiance=0. " +
    "Tu n'inventes JAMAIS un produit qui n'est pas visible. " +
    "IMPORTANT : les produits halal et maghrébins sont parfaitement VALIDES — conserves marocaines/tunisiennes, " +
    "huiles d'olive, dattes, semoules, thé, épices, produits avec étiquettes en arabe ou packaging maghrébin " +
    "sont de vrais produits d'épicerie (est_produit_epicerie=true). Ne les rejette jamais pour cette raison.";

  const userText = [
    "Analyse cette photo et identifie le produit d'épicerie qu'elle montre.",
    "Retourne UNIQUEMENT un JSON avec cette structure exacte :",
    "{",
    '  "est_produit_epicerie": bool,   // false si la photo n\'est pas un produit vendable en épicerie',
    '  "produit_reconnu": bool,',
    '  "nom_suggere": "...",',
    '  "marque_suggeree": "...",',
    `  "categorie_suggeree": "${CATEGORIES.join("|")}",`,
    '  "sous_categorie_suggeree": "...",',
    '  "description_courte": "... (si hors-sujet, décris ce que tu vois réellement)",',
    '  "quantite_carton_estimee": int,',
    '  "confiance": float entre 0 et 1',
    "}",
    "",
    "Règles STRICTES :",
    "- Si la photo n'est PAS un produit d'épicerie/alimentaire/hygiène → est_produit_epicerie=false, produit_reconnu=false, confiance=0, et décris l'objet réel dans description_courte.",
    "- Une simple étiquette ou un code-barres seul (sans produit/emballage identifiable) → est_produit_epicerie=false.",
    "- Si une personne ou une main tient le produit : analyse le PRODUIT seul, ignore le contexte humain.",
    "- Si c'est bien un produit mais que tu n'es pas certain de l'identifier → produit_reconnu=false, confiance<0.5.",
    "- N'invente jamais un nom ou une marque non visibles.",
  ].join("\n");

  const call = await callClaudeVision({
    apiKey: key,
    image,
    system,
    userText,
    maxTokens: 600,
  });

  if (!call.ok) {
    return NextResponse.json(
      { error: call.error, status: call.status },
      { status: 502 },
    );
  }

  const parsed = extractJson(call.text) as Partial<RecognitionResult> & {
    est_produit_epicerie?: boolean;
  };

  // Garde serveur : si l'IA juge la photo hors-sujet, on force le refus,
  // quoi que les autres champs disent (défense en profondeur).
  const horsSujet = parsed.est_produit_epicerie === false;

  if (horsSujet) {
    return NextResponse.json({
      produit_reconnu: false,
      nom_suggere: "",
      marque_suggeree: "",
      categorie_suggeree: "Autre",
      sous_categorie_suggeree: "",
      description_courte:
        typeof parsed.description_courte === "string" &&
        parsed.description_courte.trim()
          ? parsed.description_courte
          : "Cette photo ne montre pas un produit d'épicerie identifiable.",
      quantite_carton_estimee: 0,
      confiance: 0,
      hors_sujet: true,
    } satisfies RecognitionResult);
  }

  const produitReconnu = Boolean(parsed.produit_reconnu);
  let confiance =
    typeof parsed.confiance === "number"
      ? Math.max(0, Math.min(1, parsed.confiance))
      : 0;
  // Garde serveur : un produit non identifié ne doit jamais s'afficher en
  // "bonne confiance" (seuil UI 0.6). On plafonne pour éviter qu'un score
  // élevé sur un produit non reconnu n'incite l'employé à valider à tort.
  if (!produitReconnu) confiance = Math.min(confiance, 0.4);

  const result: RecognitionResult = {
    produit_reconnu: produitReconnu,
    nom_suggere:
      typeof parsed.nom_suggere === "string" ? parsed.nom_suggere : "",
    marque_suggeree:
      typeof parsed.marque_suggeree === "string" ? parsed.marque_suggeree : "",
    categorie_suggeree:
      typeof parsed.categorie_suggeree === "string"
        ? parsed.categorie_suggeree
        : "Autre",
    sous_categorie_suggeree:
      typeof parsed.sous_categorie_suggeree === "string"
        ? parsed.sous_categorie_suggeree
        : "",
    description_courte:
      typeof parsed.description_courte === "string"
        ? parsed.description_courte
        : "",
    quantite_carton_estimee:
      typeof parsed.quantite_carton_estimee === "number"
        ? Math.max(0, Math.round(parsed.quantite_carton_estimee))
        : 0,
    confiance,
    hors_sujet: false,
  };

  return NextResponse.json(result);
}
