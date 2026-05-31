"use server";

/**
 * Server action wrapper pour /api/assistant.
 *
 * Permet à l'UI client (admin/assistant-ia/page.tsx) d'invoquer l'agent
 * Claude sans exposer la valeur de INTERNAL_API_SECRET.
 *
 * Le serveur lit le secret depuis l'env et l'injecte dans le header
 * `x-internal-secret` que la route /api/assistant vérifie pour bloquer
 * les appels publics (qui burnent la quota ANTHROPIC_API_KEY).
 */

import { headers } from "next/headers";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AssistantResponse {
  answer?: string;
  tool_calls?: Array<{ name: string; input: unknown }>;
  error?: string;
  mock?: boolean;
}

export async function askAssistant(
  messages: ChatMessage[],
): Promise<AssistantResponse> {
  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (!internalSecret) {
    return {
      error: "INTERNAL_API_SECRET non configuré côté serveur.",
    };
  }

  const h = await headers();
  const host =
    h.get("x-forwarded-host") ??
    h.get("host") ??
    process.env.VERCEL_URL ??
    "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/api/assistant`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ messages }),
    });
    const json = (await res.json().catch(() => ({}))) as AssistantResponse;
    if (!res.ok && !json.error) {
      return { error: `HTTP ${res.status}` };
    }
    return json;
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
