"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Database,
  Send,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { V2Shell } from "@/components/v2/V2Shell";
import { BackButton } from "@/components/v2/BackButton";
import { PageAccentStripe } from "@/components/v2/PageAccentStripe";
import { askAssistant } from "@/lib/actions/assistant";
import { useV2 } from "@/lib/v2-store";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
  tools?: Array<{ name: string; input: unknown }>;
}

const SUGGESTIONS = [
  "Combien de merguez vendues cette semaine ?",
  "Quels produits sont en alerte stock ?",
  "Top 5 produits boucherie du mois",
  "Quelle est ma démarque actuelle ?",
  "Quels employés ont le score IA le plus bas ?",
];

// Traduit les noms de fonctions internes (jargon dev SQL-like) en libellés
// métier lisibles par un commerçant. L'écran ne doit jamais exposer
// « query_alertes(type) » : on affiche « Alertes », « Stock actuel », etc.
const TOOL_LABELS: Record<string, string> = {
  query_ventes_periode: "Ventes sur la période",
  query_stock_actuel: "Stock actuel",
  query_alertes: "Alertes",
  query_top_produits: "Top produits",
  query_employes_perf: "Performance équipe",
  query_demarque: "Démarque",
};

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/^query_/, "").replace(/_/g, " ");
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function md(text: string): string {
  // Sécurisé : escape HTML d'abord, PUIS appliquer les marqueurs markdown,
  // PUIS sanitize via DOMPurify (ceinture + bretelles contre XSS).
  // L'API IA renvoie du texte qu'on ne contrôle pas → toute injection
  // possible. Cf. sec-xss-assistant-ia-dangerouslysethtml.
  const escaped = escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br/>");
  // DOMPurify nécessite window → guard SSR. Le composant est "use client"
  // donc en pratique md() ne tourne que côté navigateur ; le guard évite
  // un crash si Next tente un static rendering.
  if (typeof window === "undefined") return escaped;
  return DOMPurify.sanitize(escaped, {
    ALLOWED_TAGS: ["b", "br", "strong", "em", "i"],
    ALLOWED_ATTR: [],
  });
}

export default function AssistantIAPage() {
  const router = useRouter();
  const prenom = useV2((s) => s.currentEmploye?.prenom);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [openTools, setOpenTools] = useState<Record<string, boolean>>({});
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || sending) return;
    setInput("");
    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: "user",
      content: q,
    };
    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setSending(true);
    try {
      // Server action — ajoute le header `x-internal-secret` côté serveur.
      // L'API route /api/assistant n'accepte plus de POST anonyme.
      const data = await askAssistant(
        nextMsgs.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      );
      if (data.error) {
        throw new Error(data.error);
      }
      setMessages((m) => [
        ...m,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: data.answer ?? "(pas de réponse)",
          tools: data.tool_calls,
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur assistant");
    } finally {
      setSending(false);
    }
  }

  return (
    <V2Shell hideNav>
      <PageAccentStripe accent="sapin-or" />
      <header className="px-5 pt-7 pb-3 border-b border-rule">
        <BackButton />
        <div className="mt-2 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-gold flex items-center justify-center shadow-card">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <p className="label-caps text-primary">Assistant Salam</p>
            <h1 className="text-[20px] font-extrabold text-text-primary leading-tight">
              IA business
            </h1>
          </div>
        </div>
      </header>

      {/* Chat zone — largeur alignée sur le composer ancré (cohérence desktop). */}
      <section className="mx-auto w-full max-w-[460px] lg:max-w-[760px] px-4 pt-5 pb-[200px]">
        {messages.length === 0 ? (
          <EmptyState prenom={prenom} onPick={(q) => void send(q)} />
        ) : (
          <div className="space-y-3.5">
            {messages.map((m) =>
              m.role === "user" ? (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div className="bg-primary text-white rounded-[22px] rounded-tr-lg px-4 py-2.5 max-w-[78%] shadow-card">
                    <p className="text-[14px] leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex gap-2"
                >
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-gold flex items-center justify-center shrink-0 shadow-card">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="lg rounded-[22px] rounded-tl-lg px-4 py-3">
                      <p
                        className="text-[14px] text-text-primary leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: md(m.content) }}
                      />
                    </div>
                    {m.tools && m.tools.length > 0 && (
                      <ToolBadges
                        tools={m.tools}
                        msgId={m.id}
                        open={openTools[m.id] ?? false}
                        onToggle={() =>
                          setOpenTools((s) => ({
                            ...s,
                            [m.id]: !s[m.id],
                          }))
                        }
                      />
                    )}
                  </div>
                </motion.div>
              ),
            )}

            {sending && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2 items-center"
              >
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-gold flex items-center justify-center shadow-card">
                  <Bot className="w-4 h-4" />
                </div>
                <div
                  className="lg rounded-[22px] rounded-tl-lg px-4 py-3"
                  aria-live="polite"
                  aria-label="L'assistant réfléchit"
                >
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce" />
                    <span
                      className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce"
                      style={{ animationDelay: "120ms" }}
                    />
                    <span
                      className="w-2 h-2 rounded-full bg-primary motion-safe:animate-bounce"
                      style={{ animationDelay: "240ms" }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={endRef} />
          </div>
        )}
      </section>

      {/* Composer — ancré en bas, CONTENU (largeur alignée sur la colonne de
          chat). L'outer fixed est transparent : le bg/blur/bordure vit sur le
          bloc centré, plus de bande floutée pleine largeur (fix desktop). */}
      <div className="bar-desktop fixed bottom-0 inset-x-0 z-30 pointer-events-none">
        <div className="mx-auto w-full max-w-[460px] lg:max-w-[760px] px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 pointer-events-auto">
          {messages.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto px-1 pb-2 scrollbar-hide">
              {SUGGESTIONS.slice(0, 3).map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  disabled={sending}
                  className="tap bg-[var(--surface-1)] border border-rule rounded-full px-3 py-1.5 text-[11.5px] font-bold text-text-primary shrink-0 disabled:opacity-50 shadow-card"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="glass-bar flex items-center gap-2 rounded-[24px] p-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pose une question à l'IA…"
              className="flex-1 bg-transparent border-0 outline-none px-3 text-[15px] text-text-primary placeholder:text-text-tertiary min-h-[44px]"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="tap shrink-0 bg-primary text-white w-11 h-11 rounded-2xl flex items-center justify-center shadow-card disabled:opacity-40"
              aria-label="Envoyer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </V2Shell>
  );
}

function EmptyState({
  prenom,
  onPick,
}: {
  prenom?: string | null;
  onPick: (q: string) => void;
}) {
  return (
    <div className="lg p-6">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-gold flex items-center justify-center shadow-card">
          <TrendingUp className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-[16px] font-extrabold text-text-primary">
            Bonjour{prenom ? ` ${prenom}` : ""}
          </h2>
          <p className="text-[12px] text-text-secondary">
            Pose-moi une question sur ton business.
          </p>
        </div>
      </div>
      <p className="label-caps text-text-tertiary mt-5 mb-2">Suggestions</p>
      <div className="space-y-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            style={{ ["--i" as string]: i }}
            className="tap rise-in w-full bg-[var(--surface-2)] border border-rule rounded-2xl p-3 text-left flex items-center gap-2.5 min-h-[44px]"
          >
            <Sparkles className="w-4 h-4 text-gold shrink-0" />
            <span className="text-[13px] font-bold text-text-primary">{s}</span>
          </button>
        ))}
      </div>
      <p className="text-[10.5px] text-text-tertiary text-center mt-5">
        L&apos;assistant analyse tes ventes, ton stock, tes alertes, tes top
        produits, ton équipe et ta démarque.
      </p>
    </div>
  );
}

function ToolBadges({
  tools,
  open,
  onToggle,
}: {
  tools: Array<{ name: string; input: unknown }>;
  msgId: string;
  open: boolean;
  onToggle: () => void;
}) {
  // Libellés métier dédupliqués (plusieurs appels d'une même source = 1 chip).
  const sources = Array.from(new Set(tools.map((t) => toolLabel(t.name))));
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="tap inline-flex items-center gap-1.5 min-h-[44px] text-[10.5px] font-bold uppercase tracking-wide text-text-tertiary"
      >
        <Database className="w-3 h-3" />
        {sources.length} source{sources.length > 1 ? "s" : ""} consultée
        {sources.length > 1 ? "s" : ""}
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sources.map((label) => (
                <span
                  key={label}
                  className="bg-[var(--surface-2)] border border-rule rounded-full px-2.5 py-1 text-[11px] font-bold text-text-secondary"
                >
                  {label}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
