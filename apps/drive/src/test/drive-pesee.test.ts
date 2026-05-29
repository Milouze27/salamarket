import { describe, expect, it } from "vitest";
import {
  computeCartTotalsCents,
  computePrixEstime,
  getBrackets,
  formatPriceWithUnit,
  formatKg,
  unitHint,
  type CartLineLike,
} from "@salamarket/shared";
import type { Product } from "@/types/product";

// ─────────────────────────────────────────────────────────────────────
// Factories — produits minimaux pour les 3 unit_type
// ─────────────────────────────────────────────────────────────────────

const makeUnit = (overrides: Partial<Product> = {}): Product => ({
  id: "p-unit",
  name: "Pack yaourts",
  description: "",
  priceCents: 599,
  unit: "pack",
  category: "frais",
  imageUrl: "/img.png",
  inStock: true,
  unitType: "unit",
  ...overrides,
});

const makeWeight = (overrides: Partial<Product> = {}): Product => ({
  id: "p-weight",
  name: "Merguez",
  description: "",
  priceCents: 0,
  unit: "kg",
  category: "boucherie",
  imageUrl: "/img.png",
  inStock: true,
  unitType: "weight",
  pricePerKg: 18,
  ...overrides,
});

const makeBracket = (overrides: Partial<Product> = {}): Product => ({
  id: "p-bracket",
  name: "Poulet fermier",
  description: "",
  priceCents: 1500, // 15 € pour le bracket
  unit: "piece",
  category: "boucherie",
  imageUrl: "/img.png",
  inStock: true,
  unitType: "weight_bracket",
  poidsMinKg: 1.2,
  poidsMaxKg: 1.5,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────

describe("computePrixEstime", () => {
  it("unit : prix_cents/100 × qty", () => {
    const p = makeUnit({ priceCents: 599 });
    expect(computePrixEstime(p, 3)).toBeCloseTo(17.97, 2);
  });

  it("weight : price_per_kg × kg", () => {
    const p = makeWeight({ pricePerKg: 18 });
    expect(computePrixEstime(p, 1.5)).toBeCloseTo(27, 2);
  });

  it("weight : qty négative est traitée comme 0 (clamp)", () => {
    const p = makeWeight({ pricePerKg: 18 });
    expect(computePrixEstime(p, -2)).toBe(0);
  });

  it("weight : price_per_kg null tombe sur 0", () => {
    const p = makeWeight({ pricePerKg: null });
    expect(computePrixEstime(p, 1)).toBe(0);
  });

  it("weight_bracket : prix forfaitaire du bracket choisi × qty", () => {
    const p = makeBracket({ priceCents: 1500 });
    // qty=1 → 15 €
    expect(computePrixEstime(p, 1)).toBe(15);
    // qty=2 → 30 €
    expect(computePrixEstime(p, 2)).toBe(30);
  });

  it("weight_bracket : pas de bracket défini → 0", () => {
    const p = makeBracket({ poidsMinKg: null, poidsMaxKg: null });
    expect(computePrixEstime(p, 1)).toBe(0);
  });

  it("unitType absent : fallback comportement 'unit'", () => {
    const p = makeUnit({ unitType: undefined as unknown as Product["unitType"] });
    expect(computePrixEstime(p, 2)).toBeCloseTo(11.98, 2);
  });
});

describe("getBrackets", () => {
  it("renvoie [] pour unit", () => {
    expect(getBrackets(makeUnit())).toEqual([]);
  });

  it("renvoie [] pour weight (pas un bracket)", () => {
    expect(getBrackets(makeWeight())).toEqual([]);
  });

  it("renvoie [] pour weight_bracket sans min/max", () => {
    expect(
      getBrackets(makeBracket({ poidsMinKg: null, poidsMaxKg: null })),
    ).toEqual([]);
  });

  it("renvoie 1 bracket avec label 'min - max kg' et prix EUR", () => {
    const brackets = getBrackets(makeBracket());
    expect(brackets).toHaveLength(1);
    const [b] = brackets;
    expect(b.min).toBe(1.2);
    expect(b.max).toBe(1.5);
    expect(b.prix).toBe(15);
    expect(b.label).toMatch(/1,2.kg.-.1,5.kg/);
  });
});

describe("formatPriceWithUnit", () => {
  it("unit : '5,99 €'", () => {
    expect(formatPriceWithUnit(makeUnit({ priceCents: 599 }))).toMatch(/5,99.€/);
  });

  it("weight : '18,00 €/kg'", () => {
    expect(formatPriceWithUnit(makeWeight({ pricePerKg: 18 }))).toMatch(
      /18,00.€\/kg/,
    );
  });

  it("weight_bracket : 'à partir de X € · min - max kg'", () => {
    const out = formatPriceWithUnit(makeBracket());
    expect(out).toMatch(/à partir de.*15,00.€/);
    expect(out).toMatch(/1,2.kg.-.1,5.kg/);
  });

  it("weight sans pricePerKg : fallback prix unité (priceCents)", () => {
    const p = makeWeight({ pricePerKg: null, priceCents: 200 });
    expect(formatPriceWithUnit(p)).toMatch(/2,00.€/);
  });

  it("weight_bracket sans min/max : fallback prix unité (priceCents)", () => {
    const p = makeBracket({
      poidsMinKg: null,
      poidsMaxKg: null,
      priceCents: 200,
    });
    expect(formatPriceWithUnit(p)).toMatch(/2,00.€/);
  });
});

describe("formatKg", () => {
  it("affiche en fr-FR avec virgule, max 2 décimales", () => {
    expect(formatKg(1)).toBe("1 kg");
    expect(formatKg(1.5)).toMatch(/1,5.kg/);
    expect(formatKg(1.456)).toMatch(/1,46.kg/);
  });

  it("entier reste sans décimale", () => {
    expect(formatKg(2)).toBe("2 kg");
  });
});

// ─────────────────────────────────────────────────────────────────────
// computeCartTotalsCents — régression bug 2026-05-16
// (panier multi-lignes weight + bracket : total affichait 15 € au lieu
//  de 84,20 € car priceCents=0 sur les weight lines en DB)
// ─────────────────────────────────────────────────────────────────────

describe("computeCartTotalsCents", () => {
  it("panier vide → tout à 0", () => {
    const r = computeCartTotalsCents([]);
    expect(r).toEqual({
      totalCents: 0,
      weightCents: 0,
      otherCents: 0,
      autoriseCents: 0,
      hasWeightLine: false,
    });
  });

  it("BUG 2026-05-16 — panier exact reproduit du rapport user", () => {
    // Reproduction du panier qui affichait 15 € de total au lieu de 84,20 €
    // - Merguez Salam Maison · 2,2 kg estimés · 48,40 €
    // - 1 × Poulet fermier entier (bracket) · 15,00 €
    // - Brochettes Poulet Marinées · 1,3 kg estimés · 20,80 €
    const merguez = makeWeight({
      id: "p-merguez",
      pricePerKg: 22,
    });
    const brochettes = makeWeight({
      id: "p-brochettes",
      pricePerKg: 16,
    });
    const poulet = makeBracket({
      id: "p-poulet",
      priceCents: 1500,
    });

    const items: CartLineLike[] = [
      {
        product: merguez,
        quantity: 1,
        unitType: "weight",
        quantiteKg: 2.2,
      },
      {
        product: poulet,
        quantity: 1,
        unitType: "weight_bracket",
        bracketIndex: 0,
      },
      {
        product: brochettes,
        quantity: 1,
        unitType: "weight",
        quantiteKg: 1.3,
      },
    ];

    const r = computeCartTotalsCents(items);

    // Total estimé attendu : 48.40 + 15 + 20.80 = 84.20 €
    expect(r.totalCents).toBe(8420);
    // Sous-total weight : 48.40 + 20.80 = 69.20 €
    expect(r.weightCents).toBe(6920);
    // Sous-total non-weight (= bracket ici) : 15 €
    expect(r.otherCents).toBe(1500);
    // Marge 20% UNIQUEMENT sur weight, bracket passe tel quel
    // ceil(6920 * 1.20) + 1500 = ceil(8304) + 1500 = 9804 cts = 98.04 €
    expect(r.autoriseCents).toBe(9804);
    expect(r.hasWeightLine).toBe(true);
  });

  it("panier 100% unit : autorise == total (pas de marge)", () => {
    const yaourt = makeUnit({ id: "p-y", priceCents: 599 });
    const r = computeCartTotalsCents([
      { product: yaourt, quantity: 3, unitType: "unit" },
    ]);
    expect(r.totalCents).toBe(1797);
    expect(r.weightCents).toBe(0);
    expect(r.otherCents).toBe(1797);
    expect(r.autoriseCents).toBe(1797);
    expect(r.hasWeightLine).toBe(false);
  });

  it("panier 100% weight_bracket : autorise == total (pas de marge)", () => {
    const poulet = makeBracket({ priceCents: 1500 });
    const r = computeCartTotalsCents([
      {
        product: poulet,
        quantity: 2,
        unitType: "weight_bracket",
        bracketIndex: 0,
      },
    ]);
    expect(r.totalCents).toBe(3000);
    expect(r.otherCents).toBe(3000);
    expect(r.autoriseCents).toBe(3000);
    expect(r.hasWeightLine).toBe(false); // bracket n'est PAS weight
  });

  it("panier 1 ligne weight : autorise = ceil(weight * 1.20)", () => {
    const merguez = makeWeight({ pricePerKg: 18 });
    const r = computeCartTotalsCents([
      { product: merguez, quantity: 1, unitType: "weight", quantiteKg: 1 },
    ]);
    // 18 € weight → 21,60 € autorise
    expect(r.totalCents).toBe(1800);
    expect(r.autoriseCents).toBe(2160);
    expect(r.hasWeightLine).toBe(true);
  });

  it("ceil au centime supérieur (ne sous-couvre jamais)", () => {
    // 0,01 € de weight → ceil(1 * 1.20) = 2 cts (pas 1.2 cts)
    const m = makeWeight({ pricePerKg: 1 }); // 1 €/kg
    const r = computeCartTotalsCents([
      { product: m, quantity: 1, unitType: "weight", quantiteKg: 0.01 },
    ]);
    // 0.01 kg × 1 €/kg = 0.01 €  → ceil(1 * 1.20) = 2 cts
    expect(r.totalCents).toBe(1);
    expect(r.autoriseCents).toBe(2);
  });

  it("panier mixte unit + weight : marge SEULEMENT sur weight", () => {
    const m = makeWeight({ pricePerKg: 18 });
    const y = makeUnit({ priceCents: 200 });
    const r = computeCartTotalsCents([
      { product: m, quantity: 1, unitType: "weight", quantiteKg: 1 },
      { product: y, quantity: 2, unitType: "unit" },
    ]);
    // weight 1800 cts + unit 400 cts = 2200 cts
    expect(r.totalCents).toBe(2200);
    expect(r.weightCents).toBe(1800);
    expect(r.otherCents).toBe(400);
    // ceil(1800 * 1.20) + 400 = 2160 + 400 = 2560 cts
    expect(r.autoriseCents).toBe(2560);
    expect(r.hasWeightLine).toBe(true);
  });

  it("plusieurs lignes weight du même produit : agrège", () => {
    const m = makeWeight({ pricePerKg: 22 });
    const r = computeCartTotalsCents([
      { product: m, quantity: 1, unitType: "weight", quantiteKg: 0.5 },
      { product: m, quantity: 1, unitType: "weight", quantiteKg: 0.8 },
    ]);
    // 0.5 × 22 + 0.8 × 22 = 11 + 17.6 = 28.6 € = 2860 cts
    expect(r.totalCents).toBe(2860);
    // ceil(2860 * 1.20) = 3432 cts
    expect(r.autoriseCents).toBe(3432);
  });
});

describe("unitHint", () => {
  it("renvoie null pour unit", () => {
    expect(unitHint(makeUnit())).toBeNull();
  });

  it("renvoie phrase explicative pour weight", () => {
    expect(unitHint(makeWeight())).toMatch(/poids.réel/i);
  });

  it("renvoie phrase explicative pour weight_bracket", () => {
    expect(unitHint(makeBracket())).toMatch(/taille.au.choix/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mirror tests des helpers Stripe côté salam-stock
// (salam-stock n'a pas Vitest installé — on duplique le test ici en
// inlinant les helpers pour ne pas casser la mission compute si l'un
// d'eux régressait. Synchronisation manuelle.)
// ─────────────────────────────────────────────────────────────────────

function computeMontantAutorise(estimeTtc: number): number {
  return Math.ceil(estimeTtc * 1.2 * 100) / 100;
}

function computeEcartPct(estime: number, reel: number | null): number {
  if (reel == null || estime === 0) return 0;
  return ((reel - estime) / estime) * 100;
}

type EcartAction =
  | "auto_accept"
  | "preparator_decision"
  | "client_notify"
  | "client_validation_required";

function determineEcartAction(ecartPct: number, ecartEur: number): EcartAction {
  const abs = Math.abs(ecartPct);
  if (abs < 10) return "auto_accept";
  if (abs > 20) return "client_validation_required";
  return Math.abs(ecartEur) >= 5 ? "client_notify" : "preparator_decision";
}

describe("computeMontantAutorise (mirror salam-stock)", () => {
  it("estimé × 1.20 arrondi centime sup", () => {
    expect(computeMontantAutorise(18)).toBe(21.6);
    expect(computeMontantAutorise(100)).toBe(120);
  });

  it("arrondi au centime supérieur (ne sous-couvre jamais)", () => {
    // 17.99 × 1.20 = 21.588 → 21.59 (ceil au centime)
    expect(computeMontantAutorise(17.99)).toBe(21.59);
  });

  it("zéro → zéro", () => {
    expect(computeMontantAutorise(0)).toBe(0);
  });
});

describe("computeEcartPct (mirror salam-stock)", () => {
  it("réel null → 0", () => {
    expect(computeEcartPct(100, null)).toBe(0);
  });

  it("estimé 0 → 0 (évite division par zéro)", () => {
    expect(computeEcartPct(0, 50)).toBe(0);
  });

  it("réel = estimé → 0 %", () => {
    expect(computeEcartPct(100, 100)).toBe(0);
  });

  it("réel > estimé → positif (le client doit plus)", () => {
    expect(computeEcartPct(100, 107)).toBeCloseTo(7, 5);
  });

  it("réel < estimé → négatif (refund partiel)", () => {
    expect(computeEcartPct(100, 93)).toBeCloseTo(-7, 5);
  });
});

describe("determineEcartAction (mirror salam-stock)", () => {
  it("écart < 10% → auto_accept (toujours, peu importe l'euro)", () => {
    expect(determineEcartAction(5, 100)).toBe("auto_accept");
    expect(determineEcartAction(-9.9, 100)).toBe("auto_accept");
    expect(determineEcartAction(0, 0)).toBe("auto_accept");
  });

  it("écart > 20% → client_validation_required (peu importe l'euro)", () => {
    expect(determineEcartAction(25, 1)).toBe("client_validation_required");
    expect(determineEcartAction(-30, 1000)).toBe("client_validation_required");
  });

  it("écart 10-20% ET |ecartEur| < 5€ → preparator_decision", () => {
    expect(determineEcartAction(15, 4.99)).toBe("preparator_decision");
    expect(determineEcartAction(-12, 3)).toBe("preparator_decision");
  });

  it("écart 10-20% ET |ecartEur| >= 5€ → client_notify", () => {
    expect(determineEcartAction(15, 5)).toBe("client_notify");
    expect(determineEcartAction(20, 50)).toBe("client_notify");
    expect(determineEcartAction(-18, 8)).toBe("client_notify");
  });

  it("seuil exact 10% : >= 10 entre dans la zone 10-20", () => {
    // 10% pile : abs >= 10 et < 20 → entre dans la branche 10-20
    expect(determineEcartAction(10, 2)).toBe("preparator_decision");
    expect(determineEcartAction(10, 5)).toBe("client_notify");
  });
});
