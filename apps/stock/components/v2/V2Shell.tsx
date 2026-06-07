"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  Fingerprint,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Home,
  LayoutDashboard,
  LineChart,
  Loader2,
  MonitorPlay,
  MoreHorizontal,
  PackageSearch,
  QrCode,
  Receipt,
  Repeat2,
  ScanLine,
  Search,
  ShoppingBag,
  Sparkles,
  Tag,
  TrendingDown,
  Truck,
  X,
} from "lucide-react";
import { useV2 } from "@/lib/v2-store";
import { dataMode, countDlcAlerts } from "@/lib/db";
import { filterItemsForRole } from "@/lib/nav-roles";
import { DepotSwitcher } from "./DepotSwitcher";
import { V2Logo } from "./V2Logo";
import { AdminMenu } from "./AdminMenu";
import { AssistantFab } from "./AssistantFab";
import { CommandPalette } from "./CommandPalette";

interface NavItem {
  label: string;
  fullLabel?: string;
  desc?: string;
  href: string;
  icon: typeof Home;
  exact?: boolean;
}

const ITEMS: Record<string, NavItem> = {
  accueil: {
    label: "Accueil",
    href: "/v2",
    icon: Home,
    exact: true,
    desc: "Vue d'ensemble",
  },
  reception: {
    label: "Récep.",
    fullLabel: "Réception",
    href: "/v2/reception",
    icon: ArrowDownToLine,
    desc: "Scan carton/unité + photo",
  },
  sortie: {
    label: "Sortie",
    fullLabel: "Sortie de stock",
    href: "/v2/sortie",
    icon: ArrowUpRight,
    desc: "Casse, périmé, photo + IA",
  },
  transfert: {
    label: "Transf.",
    fullLabel: "Transfert inter-dépôt",
    href: "/v2/transfert",
    icon: Repeat2,
    desc: "Bouger du stock",
  },
  stock: {
    label: "Stock",
    fullLabel: "Stock",
    href: "/v2/stock",
    icon: PackageSearch,
    desc: "Catalogue produits du dépôt",
  },
  preparation: {
    label: "Prépa.",
    fullLabel: "Préparation drive",
    href: "/v2/preparation",
    icon: ShoppingBag,
    desc: "Commandes à préparer",
  },
  inventaire: {
    label: "Invent.",
    fullLabel: "Inventaire tournant",
    href: "/v2/inventaire",
    icon: ClipboardList,
    desc: "5–10 produits du jour",
  },
  etiquettes: {
    label: "Étiq.",
    fullLabel: "Étiquettes EAN-13",
    href: "/v2/etiquettes",
    icon: Tag,
    desc: "Imprimer codes-barres internes",
  },
  admin: {
    label: "Admin",
    fullLabel: "Dashboard admin",
    href: "/v2/admin",
    icon: LayoutDashboard,
    desc: "Vue 3 dépôts + alertes IA",
  },
  // Nouveaux hubs sprint démo Otmane
  cockpit: {
    label: "Cockpit",
    fullLabel: "Cockpit Otmane",
    href: "/v2/cockpit",
    icon: Gauge,
    desc: "Vue 30 sec : ventes, alertes, staff",
  },
  forecast: {
    label: "Prévis.",
    fullLabel: "Prévisions ruptures",
    href: "/v2/forecast",
    icon: LineChart,
    desc: "Stockouts prévus (hijri-aware)",
  },
  po: {
    label: "Cmd. fourn.",
    fullLabel: "Commandes fournisseurs",
    href: "/v2/po",
    icon: ClipboardList,
    desc: "PO auto-générés + suivi",
  },
  fournisseurs: {
    label: "Fourn.",
    fullLabel: "Fournisseurs",
    href: "/v2/fournisseurs",
    icon: Truck,
    desc: "Fiches + certif halal",
  },
  lots: {
    label: "Lots",
    fullLabel: "Traçabilité lots halal",
    href: "/v2/lots",
    icon: QrCode,
    desc: "QR public + certif AVS/ARGML",
  },
  counter: {
    label: "Comptoir",
    fullLabel: "Écran comptoir retrait",
    href: "/v2/counter",
    icon: MonitorPlay,
    desc: "TV/iPad - commandes prêtes",
  },
  alertesDlc: {
    label: "Alertes DLC",
    fullLabel: "Alertes DLC + démarque",
    href: "/v2/admin/alertes-dlc",
    icon: Compass,
    desc: "Lots courte date + remises auto",
  },
  // Routes admin/back-office — alignées sur ⌘K (mêmes destinations).
  alertes: {
    label: "Alertes",
    fullLabel: "Centre d'alertes",
    href: "/v2/admin/alertes",
    icon: AlertTriangle,
    desc: "Toutes les alertes stock + IA",
  },
  alertesSurplus: {
    label: "Surplus",
    fullLabel: "Alertes surplus",
    href: "/v2/admin/alertes-surplus",
    icon: Boxes,
    desc: "Surstock à écouler",
  },
  activite: {
    label: "Activité",
    fullLabel: "Journal d'activité",
    href: "/v2/admin/activite",
    icon: Activity,
    desc: "Flux des mouvements staff",
  },
  bonsReception: {
    label: "Bons récep.",
    fullLabel: "Bons de réception",
    href: "/v2/admin/bons-reception",
    icon: ArrowDownToLine,
    desc: "Archives BDL validés",
  },
  importCashmag: {
    label: "Import",
    fullLabel: "Import Cashmag",
    href: "/v2/admin/import-cashmag",
    icon: FileSpreadsheet,
    desc: "Sync caisse / ventes",
  },
  importStock: {
    label: "Import stock",
    fullLabel: "Importer le catalogue",
    href: "/v2/admin/import-stock",
    icon: FileSpreadsheet,
    desc: "CSV produits → stock",
  },
  recapFiscal: {
    label: "Récap fiscal",
    fullLabel: "Récap fiscal du jour",
    href: "/v2/admin/recap-fiscal",
    icon: FileSpreadsheet,
    desc: "TVA, ventes, ticket Z",
  },
  rapportMensuel: {
    label: "Rapport",
    fullLabel: "Rapport mensuel",
    href: "/v2/admin/rapport-mensuel",
    icon: BarChart3,
    desc: "Synthèse du mois",
  },
  assistantIa: {
    label: "Assistant IA",
    fullLabel: "Assistant IA",
    href: "/v2/admin/assistant-ia",
    icon: Sparkles,
    desc: "Copilote analyse stock",
  },
  inventaireHisto: {
    label: "Histo. invent.",
    fullLabel: "Historique inventaires",
    href: "/v2/inventaire/historique",
    icon: Clock,
    desc: "Comptages passés + écarts",
  },
  stockSansEan: {
    label: "Sans EAN",
    fullLabel: "Produits sans EAN",
    href: "/v2/stock/sans-ean",
    icon: ScanLine,
    desc: "À étiqueter en interne",
  },
  // Modules admin/manager only (absents des allowlists rôle → masqués pour
  // caisse/reception/preparation, source unique @/lib/nav-roles).
  labo: {
    label: "Labo",
    fullLabel: "Recettes & marges",
    href: "/v2/labo",
    icon: FlaskConical,
    desc: "Recettes, coûts, marges",
  },
  pointage: {
    label: "Pointage",
    fullLabel: "Pointage staff",
    href: "/v2/admin/pointage",
    icon: Fingerprint,
    desc: "Présences et heures staff",
  },
  casseAnomalies: {
    label: "Casse",
    fullLabel: "Anomalies casse",
    href: "/v2/admin/casse-anomalies",
    icon: TrendingDown,
    desc: "Surveillance casse & démarque",
  },
  // Espace Pro (B2B) — admin/manager only, absents des allowlists rôle.
  comptesPro: {
    label: "Comptes pro",
    fullLabel: "Comptes pro",
    href: "/v2/admin/comptes-pro",
    icon: Building2,
    desc: "Clients B2B + conditions",
  },
  commandesPro: {
    label: "Cmd. pro",
    fullLabel: "Commandes pro",
    href: "/v2/admin/commandes-pro",
    icon: ClipboardCheck,
    desc: "Commandes B2B à traiter",
  },
  facturesPro: {
    label: "Factures pro",
    fullLabel: "Factures pro",
    href: "/v2/admin/factures-pro",
    icon: Receipt,
    desc: "Facturation B2B + encours",
  },
};

/**
 * Choose primary nav items shown directly on the bar (max 4) per role.
 * Role-aware : le suivi drive (préparation) doit être accessible en 1 tap
 * pour qui en a besoin ; chaque rôle voit d'abord ses gestes du quotidien.
 */
function primaryFor(role: string): NavItem[] {
  switch (role) {
    case "preparation":
      return [ITEMS.accueil, ITEMS.preparation, ITEMS.sortie, ITEMS.stock];
    case "caisse":
      // La caisse gère le retrait au comptoir ; pas de réception/sortie.
      return [ITEMS.accueil, ITEMS.stock, ITEMS.preparation, ITEMS.counter];
    case "manager":
    case "admin":
      // Préparation épinglée = suivi drive en 1 tap, même pour l'admin.
      return [ITEMS.accueil, ITEMS.preparation, ITEMS.stock, ITEMS.admin];
    case "reception":
    default:
      return [ITEMS.accueil, ITEMS.reception, ITEMS.sortie, ITEMS.stock];
  }
}

/** ARCH-02 — un groupe de plan mental dans le Plus-sheet. */
interface SheetGroup {
  /** Heading affiché en eyebrow or-dim. */
  heading: string;
  items: NavItem[];
}

/**
 * Le Plus-sheet range tout sous 3 plans mentaux (même modèle que ⌘K) :
 *   OPÉRER     — les gestes terrain (sortie, réception, transfert, étiq, stock, prépa)
 *   PILOTER    — décider / surveiller (cockpit, forecast, alertes DLC, comptoir)
 *   ADMINISTRER— back-office (admin hub, fournisseurs, PO, lots, inventaire,
 *                alertes, activité, fiscal, rapports, import, assistant IA)
 *
 * L99 / ARCH — on applique le MÊME filtrage par rôle que la palette ⌘K
 * (filterItemsForRole, source unique `@/lib/nav-roles`) : un `caisse` ne voit
 * jamais /v2/reception ni le pilotage, et un `reception` ne voit pas le
 * back-office admin (hormis ses bons de réception). On filtre ensuite les
 * entrées déjà épinglées sur la bottom-bar (primary) pour éviter les doublons,
 * et on retire les groupes vides.
 */
function sheetGroupsFor(role: string, primaryHrefs: Set<string>): SheetGroup[] {
  const operer = [
    ITEMS.sortie,
    ITEMS.reception,
    ITEMS.transfert,
    ITEMS.etiquettes,
    ITEMS.stock,
    ITEMS.stockSansEan,
    ITEMS.preparation,
  ];
  const piloter = [
    ITEMS.accueil,
    ITEMS.cockpit,
    ITEMS.forecast,
    ITEMS.alertesDlc,
    ITEMS.casseAnomalies,
    ITEMS.counter,
  ];
  // Back-office complet, aligné sur le groupe ADMINISTRER de ⌘K. Le filtrage
  // par rôle se charge de masquer ce qui dépasse le périmètre (un `reception`
  // ne gardera ici que lots + inventaire + historique + bons de réception).
  const administrer = [
    ITEMS.admin,
    ITEMS.alertes,
    ITEMS.alertesSurplus,
    ITEMS.activite,
    ITEMS.comptesPro,
    ITEMS.commandesPro,
    ITEMS.facturesPro,
    ITEMS.fournisseurs,
    ITEMS.po,
    ITEMS.bonsReception,
    ITEMS.lots,
    ITEMS.labo,
    ITEMS.inventaire,
    ITEMS.inventaireHisto,
    ITEMS.pointage,
    ITEMS.recapFiscal,
    ITEMS.rapportMensuel,
    ITEMS.importCashmag,
    ITEMS.importStock,
    ITEMS.assistantIa,
  ];

  // 1) périmètre par rôle (cohérent ⌘K) puis 2) dédup avec la bottom-bar.
  const prepare = (items: NavItem[]) =>
    filterItemsForRole(role, items).filter((it) => !primaryHrefs.has(it.href));

  return [
    { heading: "Opérer", items: prepare(operer) },
    { heading: "Piloter", items: prepare(piloter) },
    { heading: "Administrer", items: prepare(administrer) },
  ].filter((g) => g.items.length > 0);
}

export function V2Shell({
  children,
  hideNav = false,
  className = "",
  wide = false,
}: {
  children: ReactNode;
  hideNav?: boolean;
  className?: string;
  /** Si true : le shell s'étend en max-w-7xl sur ≥md (cockpit / admin desktop). */
  wide?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const hydrated = useV2((s) => s.hydrated);
  const employe = useV2((s) => s.currentEmploye);
  const depot = useV2((s) => s.currentDepot);
  const logout = useV2((s) => s.logoutEmploye);
  const [mode, setMode] = useState<"supabase" | "local">("local");
  const [sheetOpen, setSheetOpen] = useState(false);
  // ARCH-12 — badge alertes DLC sur le bouton "Menu" (admin/manager +
  // préparation : eux agissent sur la démarque ou pickent les lots courts).
  // Résilient : 0 en démo locale ou si la vue est indisponible.
  const [dlcCount, setDlcCount] = useState(0);
  const [dlcLoading, setDlcLoading] = useState(false);

  useEffect(() => {
    setMode(dataMode());
  }, []);

  const role = employe?.role;
  useEffect(() => {
    // ARCH-12 — badge DLC pour qui agit sur la démarque : admin/manager
    // (décision) + préparation (un préparateur doit voir les DLC courtes
    // avant de picker). Les autres rôles terrain restent au calme.
    if (role !== "admin" && role !== "manager" && role !== "preparation") {
      setDlcCount(0);
      return;
    }
    let alive = true;
    setDlcLoading(true);
    void countDlcAlerts()
      .then((n) => {
        if (alive) setDlcCount(n);
      })
      .catch(() => {
        if (alive) setDlcCount(0);
      })
      .finally(() => {
        if (alive) setDlcLoading(false);
      });
    return () => {
      alive = false;
    };
    // Recompte au changement de dépôt (vue globale, mais on rafraîchit).
  }, [role, depot?.id]);

  useEffect(() => {
    if (hydrated && !employe) router.replace("/v2/login");
  }, [hydrated, employe, router]);

  // Close the sheet on route change AND on Escape key.
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  // Scroll en haut à chaque navigation. Next 14 le fait par défaut sur
  // <Link>, mais en PWA standalone iOS la position est parfois préservée
  // (et certains layouts intermédiaires retiennent le scroll). On force.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSheetOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // Long-press sur le logo → ouvre la palette ⌘K (fallback mobile).
  const longPressTimer = useRef<number | null>(null);
  const startLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      window.dispatchEvent(new Event("salam-stock-cmdk:open"));
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try {
          (navigator as Navigator).vibrate?.(12);
        } catch {
          /* noop */
        }
      }
    }, 450);
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  if (!hydrated) {
    return (
      <div className="min-h-[100dvh] bg-cream flex items-center justify-center">
        <div className="w-7 h-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!employe) return null;

  const primary = primaryFor(employe.role);
  const primaryHrefs = new Set(primary.map((it) => it.href));
  const sheetGroups = sheetGroupsFor(employe.role, primaryHrefs);

  // BUG-006 : cockpit/admin doivent respirer sur desktop/iPad. En mode wide,
  // on étend à une largeur tablette confortable (820px) ≥md, harmonisée avec
  // la bottom-nav et le Plus-sheet pour rester cohérent et centré.
  // min-h-[100dvh] : évite le saut de hauteur dû à la barre d'adresse iOS.
  const containerClass = wide
    ? "mx-auto w-full max-w-[460px] md:max-w-[820px] min-h-[100dvh] relative bg-cream"
    : "mx-auto w-full max-w-[460px] min-h-[100dvh] relative bg-cream";

  return (
    // DSN-04 : reducedMotion="user" => framer-motion neutralise les transforms
    // (translate/scale/x) sous reduce-motion OS, en gardant les fades d'opacité.
    <MotionConfig reducedMotion="user">
      <div className="min-h-[100dvh] bg-cream">
        <div className={containerClass}>
          {/* HEADER — refonte L99 : 3 zones (logo+identité / dépôt / actions admin),
            une ligne, breathing room, hiérarchie claire (logo-name-role). */}
          <header className="sticky top-0 z-30 bg-gradient-to-b from-[#0E3B2E] to-[#082A20] backdrop-blur-xl">
            <div className="flex items-center gap-2 px-4 pt-3 pb-3 safe-top">
              {/* Bloc identité — clickable vers accueil, long-press → ⌘K (fallback mobile) */}
              <Link
                href="/v2"
                className="flex items-center gap-2.5 min-w-0 flex-1 active:opacity-70 transition-opacity select-none"
                aria-label="Accueil Salam Stock — appui long pour ouvrir la palette ⌘K"
                onTouchStart={startLongPress}
                onTouchEnd={cancelLongPress}
                onTouchCancel={cancelLongPress}
                onTouchMove={cancelLongPress}
                onMouseDown={startLongPress}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
              >
                <V2Logo size={32} />
                <div className="min-w-0 leading-tight">
                  <p className="text-[14px] font-extrabold text-white tracking-tight truncate">
                    {employe.prenom}
                  </p>
                  <p className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-[#C9A227] truncate">
                    {employe.role === "admin"
                      ? "Admin"
                      : employe.role === "manager"
                        ? "Manager"
                        : employe.role}
                    {depot ? ` · ${depot.nom}` : ""}
                  </p>
                </div>
              </Link>

              {/* ARCH-11 — header épuré, 4 éléments max :
                identité (logo+profil) · recherche ⌘K · DepotSwitcher · menu(Plus).
                Les toggles thème/densité et le logout ont migré dans le drawer
                AdminMenu (répertoire unique « Compte & réglages »). */}

              {/* Recherche ⌘K — desktop affiche le hint, mobile une icône loupe.
                Le long-press logo reste le fallback tactile. */}
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new Event("salam-stock-cmdk:open"))
                }
                aria-label="Rechercher — palette de commandes (Cmd+K)"
                className="hidden [@media(pointer:fine)]:inline-flex items-center gap-1.5 text-[10.5px] font-semibold text-white/70 hover:text-white bg-white/10 border border-white/20 rounded-full px-2 py-1.5 active:scale-95 transition-all"
              >
                <Search className="w-3.5 h-3.5 opacity-80" strokeWidth={2.2} />
                <span className="opacity-80">Rechercher</span>
                <kbd className="font-bold bg-white/20 rounded px-1 py-px tracking-wider">
                  ⌘K
                </kbd>
              </button>
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(new Event("salam-stock-cmdk:open"))
                }
                aria-label="Rechercher (Cmd+K)"
                className="[@media(pointer:fine)]:hidden w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 hover:text-white active:scale-95 transition-all"
              >
                <Search className="w-4 h-4" strokeWidth={2.2} />
              </button>

              {/* DepotSwitcher discret */}
              <DepotSwitcher />

              {/* Menu / répertoire unique — toutes les pages groupées + compte&réglages.
                Disponible pour tous les rôles (logout vit dedans). */}
              <AdminMenu role={employe.role} onLogout={logout} />
            </div>
            {mode === "local" && process.env.NODE_ENV === "development" && (
              <div className="bg-warning-soft text-warning text-[10px] font-bold uppercase tracking-wider text-center py-1">
                MODE DÉMO LOCAL · Supabase non connecté
              </div>
            )}
          </header>

          {/* MAIN */}
          <motion.main
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            // BUG-008 / L99-iPad : la nav bottom flotte à TOUTES les tailles
            // (plus de md:hidden) → on garde pb-nav-stack y compris ≥md pour que
            // la pill flottante ne chevauche jamais le contenu utile. Quand la
            // nav est masquée (hideNav), on rabat sur le seul espace du CTA.
            className={`${className} ${hideNav ? "pb-cta-only md:pb-8" : "pb-nav-stack"} pt-2`}
          >
            {!depot && (
              <div className="px-5 pt-6">
                <div className="bg-warning-soft rounded-2xl p-4 text-warning text-sm font-semibold">
                  Sélectionnez un dépôt en haut à droite pour commencer.
                </div>
              </div>
            )}
            {depot && children}
          </motion.main>

          {/* BOTTOM NAV — DARK-08 glassmorphism : 4 primary + "Plus".
            Verre teinté sapin (--glass-nav, blur 20px) + border-top hairline.
            L'item actif est souligné d'un trait OR qui glow (accent, jamais
            un fill de surface). Lisible sur n'importe quel fond de page.
            L99-iPad : visible à toutes les tailles (plus de md:hidden) ; la pill
            flottante reste centrée et capée à 820px ≥md (cohérent avec le
            Plus-sheet), iPad/tablette gardent donc leur navigation. */}
          {!hideNav && (
            <nav
              className="fixed bottom-0 inset-x-0 z-40 pb-safe pointer-events-none"
              aria-label="Navigation principale"
            >
              <div className="mx-auto max-w-[460px] md:max-w-[820px] px-3 pb-2 pt-2 pointer-events-auto">
                <div
                  className="rounded-[24px] px-2 py-2 flex items-center gap-1"
                  style={{
                    background: "var(--glass-nav)",
                    backdropFilter: "var(--glass-nav-blur)",
                    WebkitBackdropFilter: "var(--glass-nav-blur)",
                    borderTop: "1px solid var(--border-hairline)",
                    border: "1px solid var(--border-card)",
                    boxShadow: "var(--shadow-elevated)",
                  }}
                >
                  {primary.map((it) => {
                    const Icon = it.icon;
                    const active = it.exact
                      ? pathname === it.href
                      : pathname.startsWith(it.href);
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        aria-label={it.fullLabel ?? it.label}
                        aria-current={active ? "page" : undefined}
                        className="relative flex flex-col items-center justify-center px-1 py-1.5 flex-1 min-w-0 min-h-[48px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary-ring)]"
                      >
                        {active && (
                          <span
                            className="absolute -top-1 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full"
                            style={{
                              background: "var(--accent-gold-bright)",
                              boxShadow: "var(--accent-gold-glow)",
                            }}
                          />
                        )}
                        <span
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
                            active ? "bg-[color:var(--accent-gold-soft)]" : ""
                          }`}
                        >
                          <Icon
                            className="w-[22px] h-[22px] transition-colors"
                            style={{
                              color: active
                                ? "var(--accent-gold-bright)"
                                : "var(--text-secondary)",
                            }}
                            strokeWidth={active ? 2.4 : 2}
                          />
                        </span>
                        <span
                          className="text-[10.5px] leading-tight mt-0.5 transition-colors whitespace-nowrap"
                          style={{
                            color: active
                              ? "var(--text-primary)"
                              : "var(--text-secondary)",
                            fontWeight: active ? 700 : 600,
                          }}
                        >
                          {it.label}
                        </span>
                      </Link>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setSheetOpen(true)}
                    aria-label={
                      dlcCount > 0
                        ? `Ouvrir le menu — ${dlcCount} alerte${dlcCount > 1 ? "s" : ""} DLC`
                        : "Ouvrir le menu"
                    }
                    aria-haspopup="dialog"
                    aria-expanded={sheetOpen}
                    className="relative flex flex-col items-center justify-center px-1 py-1.5 flex-1 min-w-0 min-h-[48px] rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary-ring)]"
                  >
                    {sheetOpen && (
                      <span
                        className="absolute -top-1 left-1/2 -translate-x-1/2 w-7 h-0.5 rounded-full"
                        style={{
                          background: "var(--accent-gold-bright)",
                          boxShadow: "var(--accent-gold-glow)",
                        }}
                      />
                    )}
                    <span className="relative inline-flex items-center justify-center w-9 h-9 rounded-full">
                      <MoreHorizontal
                        className="w-[22px] h-[22px]"
                        style={{
                          color: sheetOpen
                            ? "var(--accent-gold-bright)"
                            : "var(--text-secondary)",
                        }}
                        strokeWidth={2}
                      />
                      {/* Spinner discret pendant le 1er fetch du compteur DLC :
                          non bloquant, disparaît dès que le compte est connu. */}
                      {dlcLoading && dlcCount === 0 && (
                        <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center">
                          <Loader2
                            className="w-3 h-3 animate-spin"
                            style={{ color: "var(--accent-gold-dim)" }}
                            strokeWidth={2.4}
                          />
                        </span>
                      )}
                      {/* ARCH-12 — badge alertes DLC (or accent, jamais fill rouge
                          criard) : signale qu'il y a des décisions démarque qui
                          attendent dans le menu. */}
                      {dlcCount > 0 && (
                        <span
                          className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9.5px] font-extrabold tabular-nums"
                          style={{
                            background: "var(--accent-gold-bright)",
                            color: "var(--text-on-gold)",
                            boxShadow: "var(--accent-gold-glow)",
                          }}
                        >
                          {dlcCount > 9 ? "9+" : dlcCount}
                        </span>
                      )}
                    </span>
                    <span
                      className="text-[10.5px] leading-tight mt-0.5 whitespace-nowrap"
                      style={{
                        color: sheetOpen
                          ? "var(--text-primary)"
                          : "var(--text-secondary)",
                        fontWeight: sheetOpen ? 700 : 600,
                      }}
                    >
                      Menu
                    </span>
                  </button>
                </div>
              </div>
            </nav>
          )}

          {/* FAB Assistant IA — admin only, sticky au-dessus du nav */}
          <AssistantFab role={employe.role} hideOnNoNav={hideNav} />

          {/* ⌘K Command Palette — global, monté une fois ici, dispo partout */}
          <CommandPalette />

          {/* PLUS SHEET */}
          <AnimatePresence>
            {sheetOpen && (
              <>
                <motion.div
                  key="sheet-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  onClick={() => setSheetOpen(false)}
                  className="fixed inset-0 z-[60]"
                  style={{
                    background: "var(--glass-overlay)",
                    backdropFilter: "var(--glass-overlay-blur)",
                    WebkitBackdropFilter: "var(--glass-overlay-blur)",
                  }}
                />
                <motion.div
                  key="sheet-body"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%" }}
                  transition={{ type: "spring", damping: 32, stiffness: 320 }}
                  drag="y"
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.4 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.y > 90 || info.velocity.y > 500) {
                      setSheetOpen(false);
                    }
                  }}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Menu secondaire"
                  className="fixed inset-x-0 bottom-0 z-[61] mx-auto max-w-[460px] md:max-w-[820px] rounded-t-[28px] max-h-[78vh] flex flex-col"
                  style={{
                    background: "var(--surface-3)",
                    borderTop: "1px solid var(--border-card)",
                    boxShadow: "var(--shadow-elevated)",
                  }}
                >
                  <div className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing">
                    <span className="w-10 h-1 rounded-full bg-line-medium" />
                  </div>
                  <div className="px-5 pb-3 flex items-center justify-between">
                    <p className="text-base font-bold text-text-primary">
                      Toutes les actions
                    </p>
                    <button
                      onClick={() => setSheetOpen(false)}
                      aria-label="Fermer le menu"
                      className="w-9 h-9 rounded-full flex items-center justify-center text-text-secondary"
                      style={{ background: "var(--surface-1)" }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {/* ARCH-02 — 3 plans mentaux, headings en eyebrow or-dim. */}
                  <div className="overflow-y-auto px-3 pb-[calc(var(--safe-bottom)+16px)]">
                    {sheetGroups.map((group) => (
                      <div key={group.heading} className="mb-1.5 last:mb-0">
                        <p
                          className="px-3 pt-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.12em]"
                          style={{ color: "var(--accent-gold-dim)" }}
                        >
                          {group.heading}
                        </p>
                        {group.items.map((it) => {
                          const Icon = it.icon;
                          const active = it.exact
                            ? pathname === it.href
                            : pathname.startsWith(it.href);
                          return (
                            <Link
                              key={it.href}
                              href={it.href}
                              onClick={() => setSheetOpen(false)}
                              aria-current={active ? "page" : undefined}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors"
                              style={
                                active
                                  ? { background: "var(--surface-2)" }
                                  : undefined
                              }
                            >
                              <span
                                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                style={
                                  active
                                    ? {
                                        background: "var(--primary-green)",
                                        color: "var(--text-primary)",
                                      }
                                    : {
                                        background: "var(--surface-1)",
                                        color: "var(--primary-green)",
                                      }
                                }
                              >
                                <Icon className="w-5 h-5" strokeWidth={2.1} />
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-text-primary truncate">
                                  {it.fullLabel ?? it.label}
                                </p>
                                {it.desc && (
                                  <p className="text-[11px] text-text-tertiary truncate">
                                    {it.desc}
                                  </p>
                                )}
                              </div>
                              <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
                            </Link>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
