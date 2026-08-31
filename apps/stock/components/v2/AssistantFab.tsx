"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

/**
 * Bouton flottant style chatbot SAV qui amène sur /v2/admin/assistant-ia.
 * Visible uniquement pour les admins. Sticky bottom-right au-dessus de
 * la nav. Caché sur la page assistant elle-même (évite la redondance).
 */
interface Props {
  role: string | undefined;
  /** Cache si la nav est masquée (modes plein-écran type scan/réception). */
  hideOnNoNav?: boolean;
}

/**
 * Pages "geste" où des boutons d'action (CTA / actions de carte) occupent le
 * coin bas-droite : le FAB flottant chevaucherait leur bord droit. On le masque
 * ici — l'assistant reste accessible via l'onglet « Assistant IA » de la nav.
 */
const HIDE_FAB_ON: readonly string[] = ["/v2/preparation", "/v2/fournisseurs"];

export function AssistantFab({ role, hideOnNoNav = false }: Props) {
  const pathname = usePathname() ?? "";
  if (role !== "admin") return null;
  if (pathname.startsWith("/v2/admin/assistant-ia")) return null;
  if (HIDE_FAB_ON.some((p) => pathname.startsWith(p))) return null;
  if (hideOnNoNav) return null;

  return (
    <Link
      href="/v2/admin/assistant-ia"
      aria-label="Ouvrir l'assistant IA"
      /* DESKTOP 31/08/2026 — masqué au-dessus de 1024 px. Posé en `right-4`,
         il recouvrait la DERNIÈRE COLONNE des tableaux pleine largeur :
         mesuré sur /v2/labo à 1440 et 1920 px, il masquait la cellule
         « Coût MO » de la dernière ligne visible. Et il fait doublon : sur
         grand écran l'assistant a sa propre entrée dans la barre latérale
         (groupe « Outils »). Au téléphone, où il n'y a pas de barre
         latérale, il reste indispensable — rien ne change en dessous. */
      className="assistant-fab lg:hidden fixed z-[55] bottom-[calc(var(--nav-height,64px)+var(--safe-bottom,0px)+36px)] right-4 w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{
        background: "var(--hero-gradient)",
        border: "1px solid var(--border-premium)",
        boxShadow: "var(--glow-cta)",
      }}
    >
      {/* Halo doux DERRIÈRE le bouton (ne pulse plus l'opacité du centre :
          l'icône dorée disparaissait dans le halo doré au pic du pulse). */}
      <span
        aria-hidden
        className="absolute -inset-2 rounded-full pointer-events-none motion-safe:animate-pulse"
        style={{
          background:
            "radial-gradient(circle, var(--accent-gold-soft) 0%, transparent 65%)",
          opacity: 0.5,
          zIndex: -1,
        }}
      />
      {/* Icône BLANCHE : contraste maximal sur le vert, jamais avalée par le
          halo doré (correctif visibilité). Léger drop-shadow pour le relief. */}
      <Sparkles
        className="w-6 h-6 text-white relative"
        strokeWidth={2.4}
        style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}
      />
    </Link>
  );
}
