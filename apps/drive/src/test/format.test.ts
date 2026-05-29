import { describe, expect, it } from "vitest";
import {
  formatEur,
  formatPercent,
  formatDate,
  formatDateTime,
  formatQty,
} from "@/lib/format";

describe("formatEur", () => {
  it("formate en euros fr-FR avec 2 décimales", () => {
    // L'espace dans "1 234,56 €" est un NBSP (  en Intl récent ou  )
    const out = formatEur(1234.56);
    expect(out).toMatch(/1.234,56.€/);
  });

  it("renvoie '' sur null/undefined", () => {
    expect(formatEur(null)).toBe("");
    expect(formatEur(undefined)).toBe("");
  });

  it("formate 0 (pas comme null)", () => {
    expect(formatEur(0)).toMatch(/0,00.€/);
  });

  it("formate négatif (correction facture, avoir)", () => {
    expect(formatEur(-50)).toMatch(/-?.50,00.€/);
  });
});

describe("formatPercent", () => {
  it("formate avec virgule (15.5 → '15,5 %')", () => {
    const out = formatPercent(15.5);
    expect(out).toMatch(/15,5.%/);
  });

  it("renvoie '' sur null/undefined", () => {
    expect(formatPercent(null)).toBe("");
    expect(formatPercent(undefined)).toBe("");
  });

  it("traite 0 comme valeur réelle (pas null)", () => {
    expect(formatPercent(0)).toMatch(/0,0.%/);
  });

  it("accepte un pourcentage > 100 (cas rendement amélioré)", () => {
    expect(formatPercent(125)).toMatch(/125,0.%/);
  });
});

describe("formatDate", () => {
  it("formate une string ISO YYYY-MM-DD", () => {
    expect(formatDate("2026-05-14")).toBe("14/05/2026");
  });

  it("formate une Date", () => {
    expect(formatDate(new Date("2026-01-31T00:00:00Z"))).toBe("31/01/2026");
  });

  it("renvoie '' sur null/undefined/'' / date invalide", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("pas une date")).toBe("");
  });
});

describe("formatDateTime", () => {
  it("formate ISO datetime", () => {
    const out = formatDateTime("2026-05-14T15:30:00Z");
    // L'heure dépend du fuseau de la machine de test — on vérifie juste
    // la structure JJ/MM/AAAA HH:MM (séparateur peut varier)
    expect(out).toMatch(/14\/05\/2026.\d{2}:\d{2}/);
  });

  it("renvoie '' sur null/undefined", () => {
    expect(formatDateTime(null)).toBe("");
    expect(formatDateTime(undefined)).toBe("");
  });
});

describe("formatQty", () => {
  it("formate les quantités sans devise, jusqu'à 3 décimales", () => {
    expect(formatQty(1)).toBe("1");
    expect(formatQty(1.5)).toMatch(/1,5/);
    expect(formatQty(2.345)).toMatch(/2,345/);
  });

  it("tronque au-delà de 3 décimales", () => {
    // 2.3456 → "2,346" (round to 3 decimals)
    expect(formatQty(2.3456)).toMatch(/2,346/);
  });

  it("renvoie '' sur null/undefined", () => {
    expect(formatQty(null)).toBe("");
    expect(formatQty(undefined)).toBe("");
  });

  it("formate 0", () => {
    expect(formatQty(0)).toBe("0");
  });
});
