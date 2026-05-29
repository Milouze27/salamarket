"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  ClipboardList,
  Clock,
  Home,
  LayoutDashboard,
  PackageSearch,
  Repeat2,
  Search,
  ShoppingBag,
  Store,
  Sparkles,
  Tag,
  Warehouse,
  Building2,
  Bell,
  Boxes,
} from "lucide-react";
import { useV2 } from "@/lib/v2-store";
import { listDepots, searchProduits } from "@/lib/db";
import type { Depot, Produit } from "@/lib/types/db";

/**
 * CommandPalette — ⌘K Linear-grade pour Stock.
 *
 * Trigger : ⌘K / Ctrl+K depuis n'importe quelle page Stock. Sur mobile,
 * fallback long-press sur le logo S du header (géré dans V2Logo wrapper
 * de V2Shell).
 *
 * Sections : Navigation, Dépôts, Actions, Produits (live search).
 * Recent actions stockées dans localStorage (max 5).
 */

const RECENT_KEY = "salam-stock-cmdk-recent";
const RECENT_MAX = 5;

interface RecentAction {
  id: string;
  label: string;
  href: string;
  type: "nav" | "depot" | "action";
}

const NAV_ITEMS = [
  { id: "nav-home", label: "Accueil", href: "/v2", icon: Home, hint: "Vue d'ensemble" },
  { id: "nav-reception", label: "Réception", href: "/v2/reception", icon: ArrowDownToLine, hint: "Scan + photo + valid BDL" },
  { id: "nav-sortie", label: "Sortie de stock", href: "/v2/sortie", icon: ArrowUpRight, hint: "Casse, périmé, défaut" },
  { id: "nav-transfert", label: "Transfert inter-dépôt", href: "/v2/transfert", icon: Repeat2, hint: "Bouger du stock" },
  { id: "nav-stock", label: "Stock du dépôt", href: "/v2/stock", icon: PackageSearch, hint: "Catalogue produits" },
  { id: "nav-preparation", label: "Préparation drive", href: "/v2/preparation", icon: ShoppingBag, hint: "Commandes à préparer" },
  { id: "nav-inventaire", label: "Inventaire tournant", href: "/v2/inventaire", icon: ClipboardList, hint: "5–10 produits/jour" },
  { id: "nav-etiquettes", label: "Étiquettes EAN-13", href: "/v2/etiquettes", icon: Tag, hint: "Imprimer codes-barres" },
  { id: "nav-lots", label: "Lots & DLC", href: "/v2/lots", icon: Boxes, hint: "Suivi lots / péremption" },
  { id: "nav-admin", label: "Dashboard admin", href: "/v2/admin", icon: LayoutDashboard, hint: "Vue 3 dépôts + alertes IA" },
  { id: "nav-cockpit", label: "Cockpit", href: "/v2/cockpit", icon: Sparkles, hint: "KPI live" },
  { id: "nav-forecast", label: "Forecast", href: "/v2/forecast", icon: Clock, hint: "Prévision demande" },
] as const;

const QUICK_ACTIONS = [
  {
    id: "act-reception",
    label: "Nouvelle réception",
    href: "/v2/reception",
    icon: ArrowDownToLine,
    hint: "Démarrer un scan carton",
  },
  {
    id: "act-sortie",
    label: "Déclarer une sortie",
    href: "/v2/sortie",
    icon: ArrowUpRight,
    hint: "Casse / périmé / défaut",
  },
  {
    id: "act-dlc",
    label: "Voir les alertes DLC",
    href: "/v2/lots",
    icon: Bell,
    hint: "Lots qui périment bientôt",
  },
  {
    id: "act-transfert",
    label: "Nouveau transfert",
    href: "/v2/transfert",
    icon: Repeat2,
    hint: "Entre dépôts",
  },
] as const;

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

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [depots, setDepots] = useState<Depot[]>([]);
  const [products, setProducts] = useState<Produit[]>([]);
  const [recent, setRecent] = useState<RecentAction[]>([]);
  const currentDepot = useV2((s) => s.currentDepot);
  const setCurrentDepot = useV2((s) => s.setCurrentDepot);
  const searchSeq = useRef(0);

  // Charge dépôts une fois — ouverture rapide ensuite.
  useEffect(() => {
    void listDepots().then(setDepots).catch(() => setDepots([]));
  }, []);

  // ⌘K / Ctrl+K global.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const isShortcut = (isMac ? e.metaKey : e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isShortcut) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // Échap pendant ouverture géré par cmdk lui-même.
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
    return () => window.removeEventListener("salam-stock-cmdk:open", onOpen as EventListener);
  }, []);

  // Charge recent à l'ouverture.
  useEffect(() => {
    if (open) {
      setRecent(loadRecent());
      setQuery("");
    }
  }, [open]);

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
    (action: { id: string; label: string; href: string; type: RecentAction["type"] }) => {
      pushRecent({ id: action.id, label: action.label, href: action.href, type: action.type });
      setOpen(false);
      // microtask delay → laisse cmdk fermer son overlay proprement.
      window.setTimeout(() => router.push(action.href), 0);
    },
    [router]
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
    [setCurrentDepot]
  );

  const recentResolved = useMemo(() => {
    if (query.trim().length > 0) return [];
    return recent;
  }, [recent, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Palette de commandes"
    >
      {/* Backdrop sapin */}
      <button
        type="button"
        aria-label="Fermer la palette"
        onClick={() => setOpen(false)}
        className="absolute inset-0 bg-[#082A20]/72 backdrop-blur-[6px]"
      />

      {/* Modale */}
      <div className="relative w-full max-w-[640px] bg-white rounded-[20px] shadow-card-lg border border-rule overflow-hidden cmdk-root-wrap">
        <Command label="Recherche globale" className="cmdk-root" loop shouldFilter>
          <div className="flex items-center gap-3 px-4 pt-4 pb-3 border-b border-rule">
            <Search className="w-4 h-4 text-text-tertiary shrink-0" strokeWidth={2.2} />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Naviguer, switcher dépôt, chercher un produit…"
              className="flex-1 bg-transparent outline-none text-[15px] text-text-primary placeholder:text-text-tertiary font-medium"
            />
            <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-text-tertiary bg-cream border border-rule rounded-md px-1.5 py-0.5 tracking-wider">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto py-2">
            <Command.Empty className="px-4 py-8 text-center text-[13px] text-text-tertiary">
              Aucun résultat pour <span className="font-bold text-text-secondary">«&nbsp;{query}&nbsp;»</span>
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
                      handleSelect({ id: r.id, label: r.label, href: r.href, type: r.type });
                    }}
                    className="cmdk-item"
                  >
                    <Clock className="w-4 h-4 text-text-tertiary shrink-0" strokeWidth={2.2} />
                    <span className="flex-1 truncate font-semibold text-text-primary">{r.label}</span>
                    <span className="label-caps text-text-tertiary">{r.type === "depot" ? "Dépôt" : r.type === "action" ? "Action" : "Page"}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group heading="Navigation" className="cmdk-group">
              {NAV_ITEMS.map(({ id, label, href, icon: Icon, hint }) => (
                <Command.Item
                  key={id}
                  value={`nav ${label} ${hint}`}
                  onSelect={() => handleSelect({ id, label, href, type: "nav" })}
                  className="cmdk-item"
                >
                  <Icon className="w-4 h-4 text-primary shrink-0" strokeWidth={2.2} />
                  <span className="flex-1 truncate font-semibold text-text-primary">{label}</span>
                  <span className="text-[11px] text-text-tertiary truncate hidden sm:inline">{hint}</span>
                </Command.Item>
              ))}
            </Command.Group>

            {depots.length > 0 && (
              <Command.Group heading="Dépôts" className="cmdk-group">
                {depots.map((d) => {
                  const Icon = depotIcon(d);
                  const active = currentDepot?.id === d.id;
                  return (
                    <Command.Item
                      key={`depot-${d.id}`}
                      value={`depot ${d.nom} ${d.type ?? ""}`}
                      onSelect={() => handleSelectDepot(d)}
                      className="cmdk-item"
                    >
                      <Icon className="w-4 h-4 text-gold shrink-0" strokeWidth={2.2} />
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

            <Command.Group heading="Actions rapides" className="cmdk-group">
              {QUICK_ACTIONS.map(({ id, label, href, icon: Icon, hint }) => (
                <Command.Item
                  key={id}
                  value={`action ${label} ${hint}`}
                  onSelect={() => handleSelect({ id, label, href, type: "action" })}
                  className="cmdk-item"
                >
                  <Icon className="w-4 h-4 text-danger shrink-0" strokeWidth={2.2} />
                  <span className="flex-1 truncate font-semibold text-text-primary">{label}</span>
                  <span className="text-[11px] text-text-tertiary truncate hidden sm:inline">{hint}</span>
                </Command.Item>
              ))}
            </Command.Group>

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
                    <PackageSearch className="w-4 h-4 text-text-secondary shrink-0" strokeWidth={2.2} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-text-primary truncate">{p.nom}</p>
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

          <div className="border-t border-rule px-4 py-2 flex items-center justify-between text-[10.5px] text-text-tertiary bg-cream/60">
            <span className="inline-flex items-center gap-2">
              <kbd className="font-bold bg-white border border-rule rounded px-1.5 py-0.5">↑↓</kbd>
              Naviguer
              <kbd className="font-bold bg-white border border-rule rounded px-1.5 py-0.5 ml-2">↵</kbd>
              Sélectionner
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="font-bold bg-white border border-rule rounded px-1.5 py-0.5">⌘K</kbd>
              Salam Stock
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

export default CommandPalette;
