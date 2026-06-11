import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/lib/safe-storage";
import type { Product, ProductUnitType } from "@/types/product";
import {
  computeCartTotalsCents,
  computePrixEstime,
  getBrackets,
} from "@salamarket/shared";

// ─────────────────────────────────────────────────────────────────
// CartItem — modèle unifié, supporte 3 unit_types.
//   - unit            : quantity = nb d'unités (compat historique)
//   - weight          : quantity = 1 ligne ; quantiteKg = poids estimé
//   - weight_bracket  : quantity = nb de brackets achetés ;
//                       bracketIndex = quel bracket (défaut 0)
//
// Convention id de ligne : pour les types 'weight' et 'weight_bracket'
// chaque ajout crée une ligne distincte (lineId aléatoire), parce que
// le client peut commander 2 paquets de tailles différentes du même
// produit. Pour 'unit' on garde la fusion par product.id.
// ─────────────────────────────────────────────────────────────────

export interface CartItem {
  /** Identifiant unique de ligne — distinct de product.id pour permettre
   *  plusieurs lignes du même produit (cas weight/weight_bracket). */
  lineId: string;
  product: Product;
  quantity: number;
  unitType: ProductUnitType;
  /** Poids estimé en kg, présent uniquement pour unit_type='weight'. */
  quantiteKg?: number;
  /** Index du bracket choisi pour unit_type='weight_bracket'. */
  bracketIndex?: number;
  /** Prix unitaire remisé DLC (cents), capturé à l'ajout. Voir CartLineLike. */
  dlcUnitPriceCents?: number;
}

const MAX_QTY = 99;
const MAX_KG = 5;
const MIN_KG = 0.1;

// BUG-012 — clamp + round-to-1-decimal défensif. On parse depuis
// number OU string (le navigateur peut envoyer "1,2" en locale fr).
// parseFloat + replace gère "1,2" / "999,99" ; on coupe ensuite à
// [MIN_KG..MAX_KG] et on arrondit au dixième pour éviter les NaN
// flottants type 1.2300000000000002 qui pourrissent l'affichage.
const clampKg = (kg: number | string): number => {
  let n: number;
  if (typeof kg === "string") {
    n = parseFloat(kg.replace(",", "."));
  } else {
    n = kg;
  }
  if (!Number.isFinite(n)) return MIN_KG;
  const rounded = Math.round(n * 10) / 10;
  return Math.min(MAX_KG, Math.max(MIN_KG, rounded));
};

const makeLineId = (): string => {
  // crypto.randomUUID dispo sur tous les navigateurs cibles (>= iOS 15)
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const resolveUnitType = (product: Product): ProductUnitType =>
  product.unitType ?? "unit";

interface CartState {
  items: CartItem[];
  /** Ajoute un produit 'unit' (fusionne avec ligne existante) OU
   *  ajoute une nouvelle ligne weight/weight_bracket. */
  addItem: (
    product: Product,
    options?: {
      quantiteKg?: number;
      bracketIndex?: number;
      /** Prix unitaire remisé DLC (cents) capturé à l'ajout — lignes 'unit'. */
      dlcUnitPriceCents?: number;
    },
  ) => void;
  /** Supprime par lineId (canonique). */
  removeLine: (lineId: string) => void;
  /** Met à jour la quantité (unités OU nb de brackets). */
  updateQuantity: (lineId: string, qty: number) => void;
  /** Met à jour le poids estimé d'une ligne weight. */
  updateQuantiteKg: (lineId: string, kg: number) => void;
  /** Met à jour le bracket choisi d'une ligne weight_bracket. */
  updateBracket: (lineId: string, bracketIndex: number) => void;
  increment: (lineId: string) => void;
  decrement: (lineId: string) => void;
  clear: () => void;
  getCount: () => number;
  /** Total en centimes — estimé pour weight (price_per_kg × kg × 100). */
  getTotalCents: () => number;
  // ─────── Helpers compat (rétro-compatibilité pages existantes) ───────
  /** Quantité totale pour un product.id (toutes lignes confondues, unit). */
  getQuantity: (productId: string) => number;
  /** Supprime toutes les lignes d'un produit (compat legacy par product.id). */
  removeItem: (productId: string) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, options) => {
        // BUG-002 — refuse l'ajout au panier d'un produit en rupture.
        // Le filtre useProducts coupe normalement les OOS du catalogue,
        // mais on garde la garde côté store pour couvrir tous les chemins
        // d'appel (suggestions PDP, deep-link, panier persistant).
        if (!product.inStock) return;
        const unitType = resolveUnitType(product);

        if (unitType === "unit") {
          set((state) => {
            const existing = state.items.find(
              (i) => i.product.id === product.id && i.unitType === "unit",
            );
            if (existing) {
              return {
                items: state.items.map((i) =>
                  i.lineId === existing.lineId
                    ? {
                        ...i,
                        quantity: Math.min(MAX_QTY, i.quantity + 1),
                        // Rafraîchit la remise DLC capturée si une nouvelle est
                        // fournie (sinon conserve celle de la 1re mise au panier).
                        dlcUnitPriceCents:
                          options?.dlcUnitPriceCents ?? i.dlcUnitPriceCents,
                      }
                    : i,
                ),
              };
            }
            return {
              items: [
                ...state.items,
                {
                  lineId: makeLineId(),
                  product,
                  quantity: 1,
                  unitType: "unit",
                  dlcUnitPriceCents: options?.dlcUnitPriceCents,
                },
              ],
            };
          });
          return;
        }

        if (unitType === "weight") {
          // BUG-012 — default 1.0 kg si le client n'a pas saisi de poids.
          // On ne fallback PLUS sur product.estimatedWeightKg (qui pouvait
          // initialiser à 5kg, perçu comme excessif). L'estimation reste
          // proposée à l'utilisateur en UI (PDP KgStepper) mais le store
          // se cale toujours sur 1kg si rien n'est passé.
          const kg = clampKg(options?.quantiteKg ?? 1);
          set((state) => ({
            items: [
              ...state.items,
              {
                lineId: makeLineId(),
                product,
                quantity: 1,
                unitType: "weight",
                quantiteKg: kg,
              },
            ],
          }));
          return;
        }

        // weight_bracket
        const brackets = getBrackets(product);
        const idx = Math.max(
          0,
          Math.min(brackets.length - 1, options?.bracketIndex ?? 0),
        );
        set((state) => ({
          items: [
            ...state.items,
            {
              lineId: makeLineId(),
              product,
              quantity: 1,
              unitType: "weight_bracket",
              bracketIndex: idx,
            },
          ],
        }));
      },

      removeLine: (lineId) =>
        set((state) => ({
          items: state.items.filter((i) => i.lineId !== lineId),
        })),

      updateQuantity: (lineId, qty) =>
        set((state) => {
          if (qty <= 0) {
            return {
              items: state.items.filter((i) => i.lineId !== lineId),
            };
          }
          const clamped = Math.min(MAX_QTY, Math.max(1, Math.floor(qty)));
          return {
            items: state.items.map((i) =>
              i.lineId === lineId ? { ...i, quantity: clamped } : i,
            ),
          };
        }),

      updateQuantiteKg: (lineId, kg) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.lineId === lineId ? { ...i, quantiteKg: clampKg(kg) } : i,
          ),
        })),

      updateBracket: (lineId, bracketIndex) =>
        set((state) => ({
          items: state.items.map((i) => {
            if (i.lineId !== lineId) return i;
            const brackets = getBrackets(i.product);
            const idx = Math.max(
              0,
              Math.min(brackets.length - 1, bracketIndex),
            );
            return { ...i, bracketIndex: idx };
          }),
        })),

      increment: (lineId) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.lineId === lineId
              ? { ...i, quantity: Math.min(MAX_QTY, i.quantity + 1) }
              : i,
          ),
        })),

      decrement: (lineId) =>
        set((state) => {
          const item = state.items.find((i) => i.lineId === lineId);
          if (!item) return state;
          if (item.quantity <= 1) {
            return {
              items: state.items.filter((i) => i.lineId !== lineId),
            };
          }
          return {
            items: state.items.map((i) =>
              i.lineId === lineId ? { ...i, quantity: i.quantity - 1 } : i,
            ),
          };
        }),

      clear: () => set({ items: [] }),

      getCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      // Délègue à computeCartTotalsCents (source unique de vérité).
      // Garde computePrixEstime importé pour les autres usages (lignes
      // individuelles dans Cart.tsx, Checkout.tsx récap).
      getTotalCents: () => computeCartTotalsCents(get().items).totalCents,

      getQuantity: (productId) =>
        get()
          .items.filter((i) => i.product.id === productId)
          .reduce((sum, i) => sum + i.quantity, 0),

      removeItem: (productId) =>
        set((state) => ({
          items: state.items.filter((i) => i.product.id !== productId),
        })),
    }),
    {
      name: "salamarket-cart",
      // Storage défensif (createJSONStorage(safeStorage)) au lieu du
      // localStorage brut par défaut de zustand. Sur iOS Safari en
      // navigation privée / PWA standalone stricte / quota dépassé, un
      // accès localStorage brut THROW (SecurityError / QuotaExceeded) :
      // l'écriture du panier échoue silencieusement et, au reload, la
      // lecture peut throw aussi → panier perdu / valeur NULL. safeStorage
      // (déjà utilisé par le client supabase) intercepte chaque accès et
      // bascule sur une Map mémoire, donc le panier survit au reload dans
      // toutes les conditions de stockage au lieu d'être vidé.
      storage: createJSONStorage(() => safeStorage),
      // Bump version : on a migré le shape CartItem (ajout lineId,
      // unitType). On vide l'ancien panier pour éviter les crashs sur
      // lecture d'items legacy.
      version: 2,
      migrate: (persisted, version) => {
        if (version < 2) {
          // Drop legacy cart silently
          return { items: [] } as Partial<CartState>;
        }
        return persisted as Partial<CartState>;
      },
    },
  ),
);
