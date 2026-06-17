"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Building2,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Compass,
  CornerDownLeft,
  Fingerprint,
  FileSpreadsheet,
  Gauge,
  Home,
  LayoutDashboard,
  LineChart,
  PackageSearch,
  Printer,
  Receipt,
  Repeat2,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
  Zap,
} from "lucide-react";
import { useV2 } from "@/lib/v2-store";
import { listDepots, searchProduits } from "@/lib/db";
import type { Depot, Produit } from "@/lib/types/db";
import { filterItemsForRole } from "@/lib/nav-roles";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
import { useDialogA11y } from "@/lib/hooks/useDialogA11y";

/**
 * CommandPalette — ⌘K, l'autoroute universelle de Stock (ARCH-04).
 *
 * Trigger : ⌘K / Ctrl+K depuis n'importe quelle page Stock. Sur mobile,
 * la loupe du header (et le long-press du logo S) émettent l'évènement
 * `salam-stock-cmdk:open` capté ici.
 *
 * Quatre familles de résultats :
 *   1. ACTIONS  — verbes terrain ("Déclarer une casse", "Imprimer une
 *      étiquette", "Lancer le forecast"…) : on commence par le geste, pas
 *      par la destination.
 *   2. NAVIGATION — les 32 routes /v2, rangées sous 3 plans mentaux
 *      OPÉRER / PILOTER / ADMINISTRER (même modèle que le Plus-sheet).
 *   3. DÉPÔTS    — bascule du dépôt courant.
 *   4. PRODUITS  — recherche live (debounce) dans le catalogue.
 *
 * Recherche fuzzy : chaque entrée embarque des SYNONYMES dans son `value`
 * (ex. "demarque/perte" trouvent DLC/casse) pour que le langage du terrain
 * trouve toujours la bonne porte. Recent dans localStorage (max 5).
 */

const RECENT_KEY = "salam-stock-cmdk-recent";
const RECENT_MAX = 5;

interface RecentAction {
  id: string;
  label: string;
  href: string;
  type: "nav" | "depot" | "action";
}

/**
 * ARCH-02 / ARCH-04 — 3 plans mentaux. La palette ⌘K (comme le Plus-sheet)
 * range toutes les destinations sous : OPÉRER (gestes terrain) / PILOTER
 * (décider, surveiller) / ADMINISTRER (back-office, fiscal, IA). Un seul
 * modèle mental, réutilisé partout.
 */
type PaletteItem = {
  id: string;
  label: string;
  href: string;
  icon: typeof Home;
  hint: string;
  /** Mots-clés / synonymes terrain pour la recherche fuzzy. */
  keywords?: string;
};

/** ACTIONS — on commence par le verbe, pas par la page. */
const ACTIONS: PaletteItem[] = [
  {
    id: "act-reception",
    label: "Nouvelle réception",
    href: "/v2/reception",
    icon: ArrowDownToLine,
    hint: "Scanner un BDL fournisseur",
    keywords:
      "recevoir livraison bdl bon de livraison arrivage carton scan entree marchandise",
  },
  {
    id: "act-casse",
    label: "Déclarer une casse",
    href: "/v2/sortie",
    icon: ArrowUpRight,
    hint: "Casse, périmé, vol, défaut",
    keywords:
      "perte casse perdu casser brise jeter poubelle perime peremption defaut vol demarque sortie retrait deteriore",
  },
  {
    id: "act-etiquette",
    label: "Imprimer une étiquette",
    href: "/v2/etiquettes",
    icon: Printer,
    hint: "Code-barres EAN-13 interne",
    keywords:
      "etiquette imprimer label code barre ean13 ean prix gencod tag impression",
  },
  {
    id: "act-transfert",
    label: "Transférer du stock",
    href: "/v2/transfert",
    icon: Repeat2,
    hint: "Bouger entre dépôts",
    keywords:
      "transfert deplacer bouger entre depot inter-depot mouvement migrer",
  },
  {
    id: "act-forecast",
    label: "Lancer le forecast",
    href: "/v2/forecast",
    icon: TrendingUp,
    hint: "Prévisions ruptures (hijri)",
    keywords:
      "forecast prevision prevoir rupture stockout commander anticiper aid ramadan hijri demande pic",
  },
  {
    id: "act-ruptures",
    label: "Voir les ruptures du jour",
    href: "/v2/cockpit",
    icon: AlertTriangle,
    hint: "Cockpit — alertes terrain",
    keywords:
      "rupture manque vide zero alerte urgent critique cockpit stockout dispo",
  },
  {
    id: "act-dlc",
    label: "Voir les alertes DLC",
    href: "/v2/admin/alertes-dlc",
    icon: Zap,
    hint: "Lots courte date + remise",
    keywords:
      "dlc demarque remise solde courte date peremption perime ddm date limite lot bradage promo",
  },
  {
    id: "act-inventaire",
    label: "Compter l'inventaire du jour",
    href: "/v2/inventaire",
    icon: ClipboardList,
    hint: "5–10 produits tournants",
    keywords:
      "inventaire compter comptage recompte tournant ecart verifier stock physique",
  },
  {
    id: "act-prepa",
    label: "Préparer une commande drive",
    href: "/v2/preparation",
    icon: ShoppingBag,
    hint: "Picking commandes client",
    keywords:
      "preparation preparer picking commande drive client panier prep colis",
  },
];

const OPERER: PaletteItem[] = [
  {
    id: "nav-sortie",
    label: "Sortie de stock",
    href: "/v2/sortie",
    icon: ArrowUpRight,
    hint: "Casse, périmé, défaut",
    keywords: "perte casse perime demarque retrait vol defaut",
  },
  {
    id: "nav-reception",
    label: "Réception",
    href: "/v2/reception",
    icon: ArrowDownToLine,
    hint: "Scan + photo + valid BDL",
    keywords: "recevoir livraison bdl arrivage entree",
  },
  {
    id: "nav-transfert",
    label: "Transfert inter-dépôt",
    href: "/v2/transfert",
    icon: Repeat2,
    hint: "Bouger du stock",
    keywords: "deplacer bouger entre depot mouvement",
  },
  {
    id: "nav-etiquettes",
    label: "Étiquettes EAN-13",
    href: "/v2/etiquettes",
    icon: Tag,
    hint: "Imprimer codes-barres",
    keywords: "etiquette label code barre prix impression",
  },
  {
    id: "nav-stock",
    label: "Stock du dépôt",
    href: "/v2/stock",
    icon: PackageSearch,
    hint: "Catalogue produits",
    keywords: "catalogue produits articles references inventaire quantite",
  },
  {
    id: "nav-preparation",
    label: "Préparation drive",
    href: "/v2/preparation",
    icon: ShoppingBag,
    hint: "Commandes à préparer",
    keywords: "picking preparer commande client drive panier",
  },
];

const PILOTER: PaletteItem[] = [
  {
    id: "nav-accueil",
    label: "Accueil",
    href: "/v2",
    icon: Home,
    hint: "Vue d'ensemble",
    keywords: "home menu dashboard tableau de bord depart",
  },
  {
    id: "nav-cockpit",
    label: "Cockpit",
    href: "/v2/cockpit",
    icon: Gauge,
    hint: "Vue 30 sec : ventes, alertes, staff",
    keywords: "cockpit pilotage live temps reel ventes alertes equipe rupture",
  },
  {
    id: "nav-forecast",
    label: "Prévisions ruptures",
    href: "/v2/forecast",
    icon: LineChart,
    hint: "Ruptures à venir (calendrier hijri)",
    keywords:
      "forecast prevision rupture stockout commander aid ramadan pic demande",
  },
  {
    id: "nav-dlc",
    label: "Alertes DLC",
    href: "/v2/admin/alertes-dlc",
    icon: Compass,
    hint: "Lots courte date + remises auto",
    keywords:
      "dlc demarque remise courte date peremption perime solde promo bradage",
  },
  {
    id: "nav-casse-anomalies",
    label: "Anomalies casse",
    href: "/v2/admin/casse-anomalies",
    icon: TrendingDown,
    hint: "Surveillance casse & démarque",
    keywords:
      "casse anomalie demarque perte vol perime ecart surveillance suivi fuite manquant",
  },
];

const ADMINISTRER: PaletteItem[] = [
  {
    id: "nav-admin",
    label: "Dashboard admin",
    href: "/v2/admin",
    icon: LayoutDashboard,
    hint: "Vue 3 dépôts + alertes IA",
    keywords: "admin direction patron dashboard global multi depot",
  },
  {
    id: "nav-fournisseurs",
    label: "Fournisseurs",
    href: "/v2/fournisseurs",
    icon: Truck,
    hint: "Fiches + certif halal",
    keywords: "fournisseur supplier certificat halal avs argml contact fiche",
  },
  {
    id: "nav-po",
    label: "Commandes fournisseurs",
    href: "/v2/po",
    icon: ClipboardList,
    hint: "PO auto-générés + suivi",
    keywords:
      "po purchase order commande fournisseur achat reassort approvisionnement",
  },
  {
    id: "nav-comptes-pro",
    label: "Comptes pro",
    href: "/v2/admin/comptes-pro",
    icon: Building2,
    hint: "Clients B2B + conditions",
    keywords:
      "compte pro client b2b professionnel entreprise restaurant grossiste delegue conditions tarif siret tva intracom",
  },
  {
    id: "nav-commandes-pro",
    label: "Commandes pro",
    href: "/v2/admin/commandes-pro",
    icon: ClipboardCheck,
    hint: "Commandes B2B à traiter",
    keywords:
      "commande pro b2b professionnel client entreprise bon de commande preparer livrer grossiste vente comptoir",
  },
  {
    id: "nav-factures-pro",
    label: "Factures pro",
    href: "/v2/admin/factures-pro",
    icon: Receipt,
    hint: "Facturation B2B + encours",
    keywords:
      "facture pro b2b professionnel facturation encours impaye paiement reglement avoir tva client entreprise comptable",
  },
  {
    id: "nav-lots",
    label: "Lots & DLC",
    href: "/v2/lots",
    icon: Boxes,
    hint: "Traçabilité lots halal",
    keywords: "lot tracabilite qr code halal certif numero lot batch",
  },
  {
    id: "nav-inventaire",
    label: "Inventaire tournant",
    href: "/v2/inventaire",
    icon: ClipboardList,
    hint: "5–10 produits/jour",
    keywords: "inventaire comptage tournant ecart recompte verifier",
  },
  {
    id: "nav-inventaire-histo",
    label: "Historique inventaires",
    href: "/v2/inventaire/historique",
    icon: Clock,
    hint: "Comptages passés + écarts",
    keywords: "historique inventaire passe ecart archive journal comptage",
  },
  {
    id: "nav-pointage",
    label: "Pointage staff",
    href: "/v2/admin/pointage",
    icon: Fingerprint,
    hint: "Présences et heures staff",
    keywords:
      "pointage staff presence heures badge horaire planning employe equipe entree sortie temps travail",
  },
  {
    id: "nav-rapport",
    label: "Rapport comptable",
    href: "/v2/admin/rapport-mensuel",
    icon: BarChart3,
    hint: "Mensuel + récap fiscal (Z)",
    keywords:
      "rapport mensuel mois synthese bilan ca chiffre affaire comptable export recap fiscal tva ticket z cloture journee",
  },
  {
    id: "nav-activite",
    label: "Journal d'activité",
    href: "/v2/admin/activite",
    icon: Activity,
    hint: "Flux des mouvements staff",
    keywords:
      "activite journal log historique mouvements staff audit trace qui quoi",
  },
  {
    id: "nav-alertes",
    label: "Centre d'alertes",
    href: "/v2/admin/alertes",
    icon: AlertTriangle,
    hint: "Toutes les alertes stock",
    keywords: "alertes centre notifications urgent stock seuil ia",
  },
  {
    id: "nav-bons",
    label: "Bons de réception",
    href: "/v2/admin/bons-reception",
    icon: ArrowDownToLine,
    hint: "Archives BDL validés",
    keywords: "bon reception bdl archive validation livraison historique",
  },
  {
    id: "nav-import",
    label: "Imports (ventes + catalogue)",
    href: "/v2/admin/import",
    icon: FileSpreadsheet,
    hint: "Cashmag (ventes) + catalogue stock",
    keywords:
      "import cashmag caisse ventes sync csv export pos integration stock catalogue produits ean onboarding initialiser prix",
  },
  {
    id: "nav-assistant",
    label: "Assistant IA",
    href: "/v2/admin/assistant-ia",
    icon: Sparkles,
    hint: "Copilote analyse stock",
    keywords:
      "assistant ia ai copilote question chat analyse intelligence aide",
  },
];

/**
 * Filtrage par rôle : centralisé dans `@/lib/nav-roles` (ROLE_ALLOWED +
 * filterItemsForRole), partagé avec le Plus-sheet de V2Shell pour garantir le
 * MÊME périmètre par rôle sur toutes les surfaces de navigation.
 */

function depotIcon(d: Depot) {
  if (d.type === "entrepot") return Warehouse;
  if (d.nom === "Professionnel") return Building2;
  return Store;
}

function loadRecent(): RecentAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function pushRecent(action: RecentAction) {
  if (typeof window === "undefined") return;
  try {
    const current = loadRecent().filter((a) => a.id !== action.id);
    const next = [action, ...current].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* noop */
  }
}

/** Rangée nav réutilisable — même rendu pour OPÉRER/PILOTER/ADMINISTRER. */
function NavRow({
  item,
  prefix,
  type,
  onPick,
}: {
  item: PaletteItem;
  prefix: string;
  type: RecentAction["type"];
  onPick: (a: {
    id: string;
    label: string;
    href: string;
    type: RecentAction["type"];
  }) => void;
}) {
  const Icon = item.icon;
  return (
    <Command.Item
      value={`${prefix} ${item.label} ${item.hint} ${item.keywords ?? ""}`}
      onSelect={() =>
        onPick({ id: item.id, label: item.label, href: item.href, type })
      }
      className="cmdk-item"
    >
      <Icon className="w-4 h-4 text-primary shrink-0" strokeWidth={2.2} />
      <span className="flex-1 truncate font-semibold text-text-primary">
        {item.label}
      </span>
      <span className="text-[11px] text-text-tertiary truncate hidden sm:inline">
        {item.hint}
      </span>
    </Command.Item>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [depots, setDepots] = useState<Depot[]>([]);
  const [products, setProducts] = useState<Produit[]>([]);
  const [recent, setRecent] = useState<RecentAction[]>([]);
  const currentDepot = useV2((s) => s.currentDepot);
  const setCurrentDepot = useV2((s) => s.setCurrentDepot);
  const role = useV2((s) => s.currentEmploye?.role);
  const searchSeq = useRef(0);

  // Listes filtrées par rôle (caisse/reception masquent le hors-périmètre).
  const actions = useMemo(() => filterItemsForRole(role, ACTIONS), [role]);
  const operer = useMemo(() => filterItemsForRole(role, OPERER), [role]);
  const piloter = useMemo(() => filterItemsForRole(role, PILOTER), [role]);
  const administrer = useMemo(
    () => filterItemsForRole(role, ADMINISTRER),
    [role],
  );

  // Charge dépôts une fois — ouverture rapide ensuite.
  useEffect(() => {
    void listDepots()
      .then(setDepots)
      .catch(() => setDepots([]));
  }, []);

  // ⌘K / Ctrl+K global.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const isShortcut =
        (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isShortcut) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Escape pendant l'ouverture est géré par useDialogA11y (focus-trap +
      // close), branché plus bas sur le conteneur de la palette.
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Évènement custom pour ouverture programmée (V2Logo long-press, FAB, etc.).
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("salam-stock-cmdk:open", onOpen as EventListener);
    return () =>
      window.removeEventListener(
        "salam-stock-cmdk:open",
        onOpen as EventListener,
      );
  }, []);

  // Charge recent à l'ouverture.
  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setQuery("");
    }
  }, [open]);

  // Scroll-lock iOS quand la palette est ouverte (anti scroll-leak body).
  useBodyScrollLock(open);

  // a11y (A11Y-01/A11Y-02) : Escape ferme la palette (le badge « ESC » le
  // promettait sans le faire — cmdk ne capte Escape qu'en Radix Dialog),
  // focus-trap réel (Tab borné) et retour du focus au déclencheur.
  const close = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogA11y<HTMLDivElement>(open, close);

  // Live search produits (debounce 180ms).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setProducts([]);
      return;
    }
    const mySeq = ++searchSeq.current;
    const t = window.setTimeout(() => {
      void searchProduits(q)
        .then((r) => {
          if (mySeq === searchSeq.current) setProducts(r.slice(0, 8));
        })
        .catch(() => {
          if (mySeq === searchSeq.current) setProducts([]);
        });
    }, 180);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const handleSelect = useCallback(
    (action: {
      id: string;
      label: string;
      href: string;
      type: RecentAction["type"];
    }) => {
      pushRecent({
        id: action.id,
        label: action.label,
        href: action.href,
        type: action.type,
      });
      setOpen(false);
      // microtask delay → laisse cmdk fermer son overlay proprement.
      window.setTimeout(() => router.push(action.href), 0);
    },
    [router],
  );

  const handleSelectDepot = useCallback(
    (d: Depot) => {
      setCurrentDepot(d);
      pushRecent({
        id: `depot-${d.id}`,
        label: `Dépôt · ${d.nom}`,
        href: "/v2",
        type: "depot",
      });
      setOpen(false);
    },
    [setCurrentDepot],
  );

  const recentResolved = useMemo(() => {
    if (query.trim().length > 0) return [];
    // Même périmètre rôle que les listes statiques : sans ça un item « Récent »
    // poussé par un manager (localStorage partagé entre employés d'un poste)
    // reste cliquable pour un caisse/réception/prépa et le mène hors périmètre.
    return filterItemsForRole(role, recent);
  }, [recent, query, role]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
    >
      {/* DARK-08 — backdrop verre teinté sapin (glass-overlay) */}
      <button
        type="button"
        aria-label="Fermer la palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0"
        style={{
          background: "var(--glass-overlay)",
          backdropFilter: "var(--glass-overlay-blur)",
          WebkitBackdropFilter: "var(--glass-overlay-blur)",
        }}
      />

      {/* Modale — surface-3 (popover/palette) via .cmdk-root-wrap en dark.
          Liseré or premium en haut (accent, jamais fill). */}
      <div
        className="relative w-full max-w-[640px] bg-white rounded-[20px] border border-rule overflow-hidden cmdk-root-wrap"
        style={{ boxShadow: "var(--shadow-elevated)" }}
      >
        <Command
          label="Recherche globale"
          className="cmdk-root"
          loop
          shouldFilter
        >
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-rule">
            <Search
              className="w-4 h-4 text-text-tertiary shrink-0"
              strokeWidth={2.2}
            />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Que veux-tu faire ? casse, étiquette, forecast, produit…"
              className="flex-1 bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-tertiary font-medium"
            />
            <kbd className="hidden [@media(pointer:fine)]:inline-flex items-center gap-1 text-[10px] font-bold text-text-tertiary bg-cream border border-rule rounded-md px-1.5 py-0.5 tracking-wider">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-center text-[13px] text-text-tertiary">
              Aucun résultat pour{" "}
              <span className="font-bold text-text-secondary">
                «&nbsp;{query}&nbsp;»
              </span>
            </Command.Empty>

            {recentResolved.length > 0 && (
              <Command.Group heading="Récent" className="cmdk-group">
                {recentResolved.map((r) => (
                  <Command.Item
                    key={`recent-${r.id}`}
                    value={`recent ${r.label}`}
                    onSelect={() => {
                      if (r.type === "depot") {
                        const d = depots.find((x) => `depot-${x.id}` === r.id);
                        if (d) handleSelectDepot(d);
                        return;
                      }
                      handleSelect({
                        id: r.id,
                        label: r.label,
                        href: r.href,
                        type: r.type,
                      });
                    }}
                    className="cmdk-item"
                  >
                    <Clock
                      className="w-4 h-4 text-text-tertiary shrink-0"
                      strokeWidth={2.2}
                    />
                    <span className="flex-1 truncate font-semibold text-text-primary">
                      {r.label}
                    </span>
                    <span className="label-caps text-text-tertiary">
                      {r.type === "depot"
                        ? "Dépôt"
                        : r.type === "action"
                          ? "Action"
                          : "Page"}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* ACTIONS — on commence par le verbe terrain. Liseré or-accent. */}
            {actions.length > 0 && (
              <Command.Group heading="Actions" className="cmdk-group">
                {actions.map(
                  ({ id, label, href, icon: Icon, hint, keywords }) => (
                    <Command.Item
                      key={id}
                      value={`action ${label} ${hint} ${keywords ?? ""}`}
                      onSelect={() =>
                        handleSelect({ id, label, href, type: "action" })
                      }
                      className="cmdk-item"
                    >
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                        style={{
                          background: "var(--accent-gold-soft)",
                          boxShadow:
                            "inset 0 0 0 1px var(--accent-gold-hairline)",
                        }}
                      >
                        <Icon
                          className="w-3.5 h-3.5 text-gold"
                          strokeWidth={2.3}
                        />
                      </span>
                      <span className="flex-1 truncate font-semibold text-text-primary">
                        {label}
                      </span>
                      <span className="text-[11px] text-text-tertiary truncate hidden sm:inline">
                        {hint}
                      </span>
                    </Command.Item>
                  ),
                )}
              </Command.Group>
            )}

            {operer.length > 0 && (
              <Command.Group heading="Opérer" className="cmdk-group">
                {operer.map((item) => (
                  <NavRow
                    key={item.id}
                    item={item}
                    prefix="operer"
                    type="nav"
                    onPick={handleSelect}
                  />
                ))}
              </Command.Group>
            )}

            {piloter.length > 0 && (
              <Command.Group heading="Piloter" className="cmdk-group">
                {piloter.map((item) => (
                  <NavRow
                    key={item.id}
                    item={item}
                    prefix="piloter"
                    type="nav"
                    onPick={handleSelect}
                  />
                ))}
              </Command.Group>
            )}

            {depots.length > 0 && (
              <Command.Group heading="Dépôts" className="cmdk-group">
                {depots.map((d) => {
                  const Icon = depotIcon(d);
                  const active = currentDepot?.id === d.id;
                  return (
                    <Command.Item
                      key={`depot-${d.id}`}
                      value={`depot basculer changer ${d.nom} ${d.type ?? ""}`}
                      onSelect={() => handleSelectDepot(d)}
                      className="cmdk-item"
                    >
                      <Icon
                        className="w-4 h-4 text-gold shrink-0"
                        strokeWidth={2.2}
                      />
                      <span className="flex-1 truncate font-semibold text-text-primary">
                        Basculer sur {d.nom}
                      </span>
                      {active && (
                        <span className="text-[10px] font-bold text-primary bg-gold-soft px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Actif
                        </span>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {administrer.length > 0 && (
              <Command.Group heading="Administrer" className="cmdk-group">
                {administrer.map((item) => (
                  <NavRow
                    key={item.id}
                    item={item}
                    prefix="administrer"
                    type="nav"
                    onPick={handleSelect}
                  />
                ))}
              </Command.Group>
            )}

            {products.length > 0 && (
              <Command.Group heading="Produits" className="cmdk-group">
                {products.map((p) => (
                  <Command.Item
                    key={`prod-${p.id}`}
                    value={`product ${p.nom} ${p.marque ?? ""} ${p.ean ?? ""}`}
                    onSelect={() =>
                      handleSelect({
                        id: `prod-${p.id}`,
                        label: p.nom,
                        href: `/v2/stock?q=${encodeURIComponent(p.nom)}`,
                        type: "action",
                      })
                    }
                    className="cmdk-item"
                  >
                    <PackageSearch
                      className="w-4 h-4 text-text-secondary shrink-0"
                      strokeWidth={2.2}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary truncate">
                        {p.nom}
                      </p>
                      <p className="text-[11px] text-text-tertiary truncate">
                        {p.marque ? `${p.marque} · ` : ""}
                        {p.categorie ?? "—"}
                        {p.ean ? ` · ${p.ean}` : ""}
                      </p>
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>

          <div className="border-t border-rule px-4 py-2 hidden [@media(pointer:fine)]:flex items-center justify-between text-[10.5px] text-text-tertiary bg-cream/60">
            <span className="inline-flex items-center gap-2">
              <kbd className="font-bold bg-white border border-rule rounded px-1.5 py-0.5">
                ↑↓
              </kbd>
              Naviguer
              <kbd className="font-bold bg-white border border-rule rounded px-1.5 py-0.5 ml-2 inline-flex items-center gap-0.5">
                <CornerDownLeft className="w-2.5 h-2.5" strokeWidth={2.5} />
              </kbd>
              Ouvrir
            </span>
            <span className="inline-flex items-center gap-1 font-bold">
              Salam Stock
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
