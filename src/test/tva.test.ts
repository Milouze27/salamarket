import { describe, expect, it } from "vitest";
import {
  round2,
  ttcFromHt,
  htFromTtc,
  tvaAmountFromHt,
  tvaAmountFromTtc,
  computeCartTotal,
  computeRemisePct,
  prixHtApresRemise,
} from "@/lib/tva";

describe("round2", () => {
  it("arrondit à 2 décimales (cas standards)", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24); // arrondi à la valeur supérieure
    expect(round2(1.999)).toBe(2);
    expect(round2(0)).toBe(0);
  });

  it("traite les négatifs", () => {
    expect(round2(-1.234)).toBe(-1.23);
  });
});

describe("ttcFromHt / htFromTtc", () => {
  it("convertit HT → TTC à 5,5% (alimentaire)", () => {
    expect(ttcFromHt(10, 5.5)).toBe(10.55);
    expect(ttcFromHt(100, 5.5)).toBe(105.5);
  });

  it("convertit HT → TTC à 20% (standard)", () => {
    expect(ttcFromHt(10, 20)).toBe(12);
    expect(ttcFromHt(100, 20)).toBe(120);
  });

  it("convertit TTC → HT et est réversible (à l'arrondi près)", () => {
    const ht = htFromTtc(120, 20);
    expect(ht).toBe(100);
    // Round trip 100€ × 20% TVA reste cohérent
    expect(ttcFromHt(ht, 20)).toBe(120);
  });

  it("gère le taux 0 (mention TVA non applicable)", () => {
    expect(ttcFromHt(50, 0)).toBe(50);
    expect(htFromTtc(50, 0)).toBe(50);
  });
});

describe("tvaAmountFromHt / tvaAmountFromTtc", () => {
  it("calcule le montant de TVA depuis le HT", () => {
    expect(tvaAmountFromHt(100, 20)).toBe(20);
    expect(tvaAmountFromHt(100, 5.5)).toBe(5.5);
  });

  it("calcule le montant de TVA depuis le TTC", () => {
    expect(tvaAmountFromTtc(120, 20)).toBe(20);
    expect(tvaAmountFromTtc(105.5, 5.5)).toBe(5.5);
  });
});

describe("computeCartTotal", () => {
  it("renvoie 0 sur panier vide", () => {
    expect(computeCartTotal([])).toEqual({ ht: 0, tva: 0, ttc: 0 });
  });

  it("agrège un panier mono-tva (5,5%)", () => {
    const total = computeCartTotal([
      { prix_ht: 10, tva_taux: 5.5 },
      { prix_ht: 20, tva_taux: 5.5 },
    ]);
    expect(total.ht).toBe(30);
    expect(total.tva).toBe(1.65);
    expect(total.ttc).toBe(31.65);
  });

  it("agrège un panier multi-tva (5,5% alimentaire + 20% boissons)", () => {
    const total = computeCartTotal([
      { prix_ht: 100, tva_taux: 5.5 },
      { prix_ht: 50, tva_taux: 20 },
    ]);
    expect(total.ht).toBe(150);
    // 5.5 + 10
    expect(total.tva).toBe(15.5);
    expect(total.ttc).toBe(165.5);
  });

  it("arrondit ligne par ligne (méthode commerciale FR)", () => {
    // 3 × 0.333 = 0.999 HT → arrondi à 1.00 HT par ligne ?
    // Non, 0.333 reste 0.333 ; mais 0.333 × 1.055 = 0.351315 → arrondi 0.35
    const total = computeCartTotal([
      { prix_ht: 0.333, tva_taux: 5.5 },
      { prix_ht: 0.333, tva_taux: 5.5 },
      { prix_ht: 0.333, tva_taux: 5.5 },
    ]);
    // chaque ligne: round2(0.333) = 0.33, tva = round2(0.33 * 5.5/100) = 0.02
    // ht = 0.33 + 0.33 + 0.33 = 0.99
    // tva = 0.02 + 0.02 + 0.02 = 0.06
    expect(total.ht).toBe(0.99);
    expect(total.tva).toBe(0.06);
    expect(total.ttc).toBe(1.05);
  });
});

describe("computeRemisePct (paliers volume Drive Pro)", () => {
  const paliers = {
    qty_palier_1: 10,
    remise_palier_1_pct: 5,
    qty_palier_2: 30,
    remise_palier_2_pct: 10,
  };

  it("renvoie 0 sous le premier palier", () => {
    expect(computeRemisePct(1, paliers)).toBe(0);
    expect(computeRemisePct(9, paliers)).toBe(0);
  });

  it("applique palier 1 entre palier_1 et palier_2", () => {
    expect(computeRemisePct(10, paliers)).toBe(5);
    expect(computeRemisePct(20, paliers)).toBe(5);
    expect(computeRemisePct(29, paliers)).toBe(5);
  });

  it("applique palier 2 au-dessus", () => {
    expect(computeRemisePct(30, paliers)).toBe(10);
    expect(computeRemisePct(100, paliers)).toBe(10);
  });

  it("gère les paliers null (catalogue sans dégressif)", () => {
    expect(
      computeRemisePct(50, {
        qty_palier_1: null,
        remise_palier_1_pct: null,
        qty_palier_2: null,
        remise_palier_2_pct: null,
      }),
    ).toBe(0);
  });

  it("gère un palier_1 seul (pas de palier_2)", () => {
    expect(
      computeRemisePct(15, {
        qty_palier_1: 10,
        remise_palier_1_pct: 5,
        qty_palier_2: null,
        remise_palier_2_pct: null,
      }),
    ).toBe(5);
  });
});

describe("prixHtApresRemise", () => {
  const paliers = {
    qty_palier_1: 10,
    remise_palier_1_pct: 5,
    qty_palier_2: 30,
    remise_palier_2_pct: 10,
  };

  it("ne touche pas au prix sous le palier", () => {
    expect(prixHtApresRemise(100, 5, paliers)).toBe(100);
  });

  it("applique 5% (palier 1)", () => {
    expect(prixHtApresRemise(100, 15, paliers)).toBe(95);
  });

  it("applique 10% (palier 2)", () => {
    expect(prixHtApresRemise(100, 50, paliers)).toBe(90);
  });

  it("arrondit au centime", () => {
    // 12.34 × 0.95 = 11.723 → arrondi 11.72
    expect(prixHtApresRemise(12.34, 15, paliers)).toBe(11.72);
  });
});
