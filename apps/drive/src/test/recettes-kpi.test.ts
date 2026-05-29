import { describe, expect, it } from "vitest";
import {
  computeCoutMatieresTheorique,
  computeCoutMainOeuvreTheorique,
  type RecetteFull,
} from "@/hooks/useRecette";
import {
  aggregateKpiByRecette,
  type ProductionKpi,
} from "@/hooks/useProductionsKpi";

// ─────────────────────────────────────────────────────────────────────
// Helpers de test : factories minimales
// ─────────────────────────────────────────────────────────────────────

const makeIngredient = (
  overrides: Partial<RecetteFull["ingredients"][number]>,
): RecetteFull["ingredients"][number] => ({
  id: "ing-1",
  recette_id: "rec-1",
  produit_id: "prod-1",
  ingredient_libre: null,
  notes: null,
  quantite: 1,
  unite: "kg",
  ordre: 1,
  produit: {
    id: "prod-1",
    name: "Boeuf",
    price_cents: 1890, // 18.90 €
    unit: "kg",
  },
  ...overrides,
});

const makeMainOeuvre = (
  overrides: Partial<RecetteFull["main_oeuvre"][number]>,
): RecetteFull["main_oeuvre"][number] => ({
  id: "mo-1",
  recette_id: "rec-1",
  poste: "Découpe",
  duree_minutes: 60,
  taux_horaire_charge: 12,
  ...overrides,
});

const makeKpi = (overrides: Partial<ProductionKpi>): ProductionKpi => ({
  id: "k1",
  lot_numero: "L-001",
  date_production: "2026-05-10",
  recette: "Merguez",
  cout_matieres: 50,
  cout_indirects: 10,
  cout_total: 60,
  ca_potentiel_ttc: 100,
  ca_potentiel_ht: 95,
  input_total_qty: 10,
  output_total_qty: 9,
  rendement_pct: 90,
  marge_eur_ht: 35,
  marge_pct_ht: 36.8,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────

describe("computeCoutMatieresTheorique", () => {
  it("vide → 0", () => {
    expect(computeCoutMatieresTheorique([])).toBe(0);
  });

  it("1 ingrédient : quantite × prix_unitaire (prix vente product, EUR)", () => {
    const ings = [makeIngredient({ quantite: 2 })];
    // 2 × (1890/100) = 37.8
    expect(computeCoutMatieresTheorique(ings)).toBeCloseTo(37.8, 2);
  });

  it("plusieurs ingrédients additionnés", () => {
    const ings = [
      makeIngredient({
        quantite: 2,
        produit: { id: "a", name: "A", price_cents: 1000, unit: "kg" },
      }),
      makeIngredient({
        quantite: 3,
        produit: { id: "b", name: "B", price_cents: 500, unit: "kg" },
      }),
    ];
    // 2*10 + 3*5 = 35
    expect(computeCoutMatieresTheorique(ings)).toBe(35);
  });

  it("ignore les ingrédients sans produit (ingredient_libre seul ou ligne supprimée)", () => {
    const ings = [
      makeIngredient({ quantite: 2 }),
      makeIngredient({
        quantite: 10,
        produit: null,
        produit_id: null,
        ingredient_libre: "épices mystères",
      }),
    ];
    expect(computeCoutMatieresTheorique(ings)).toBeCloseTo(37.8, 2);
  });
});

describe("computeCoutMainOeuvreTheorique", () => {
  it("vide → 0", () => {
    expect(computeCoutMainOeuvreTheorique([])).toBe(0);
  });

  it("(duree_minutes / 60) × taux_horaire_charge", () => {
    const mo = [
      makeMainOeuvre({ duree_minutes: 60, taux_horaire_charge: 12 }),
    ];
    expect(computeCoutMainOeuvreTheorique(mo)).toBe(12);
  });

  it("agrège plusieurs lignes", () => {
    const mo = [
      makeMainOeuvre({ duree_minutes: 30, taux_horaire_charge: 12 }), // 6
      makeMainOeuvre({ duree_minutes: 60, taux_horaire_charge: 15 }), // 15
    ];
    expect(computeCoutMainOeuvreTheorique(mo)).toBe(21);
  });

  // Note : taux_horaire_charge est NOT NULL en DB, donc plus de cas "null".
});

describe("aggregateKpiByRecette", () => {
  it("vide → liste vide", () => {
    expect(aggregateKpiByRecette([])).toEqual([]);
  });

  it("groupe par recette et calcule moyennes/totaux", () => {
    const kpis = [
      makeKpi({ id: "1", recette: "Merguez", marge_pct_ht: 30, marge_eur_ht: 20, cout_total: 50 }),
      makeKpi({ id: "2", recette: "Merguez", marge_pct_ht: 40, marge_eur_ht: 40, cout_total: 60 }),
      makeKpi({ id: "3", recette: "Kefta", marge_pct_ht: 20, marge_eur_ht: 10, cout_total: 30 }),
    ];
    const agg = aggregateKpiByRecette(kpis);
    expect(agg).toHaveLength(2);
    // Tri par marge_pct_moy desc → Merguez d'abord (35) puis Kefta (20)
    expect(agg[0].recette).toBe("Merguez");
    expect(agg[0].count).toBe(2);
    expect(agg[0].marge_pct_moy).toBe(35);
    expect(agg[0].marge_eur_total).toBe(60);
    expect(agg[0].cout_total_moy).toBe(55);
    expect(agg[1].recette).toBe("Kefta");
    expect(agg[1].count).toBe(1);
    expect(agg[1].marge_pct_moy).toBe(20);
  });

  it("ignore les kpis sans recette (champ NULL)", () => {
    const kpis = [
      makeKpi({ id: "1", recette: null }),
      makeKpi({ id: "2", recette: "Merguez" }),
    ];
    const agg = aggregateKpiByRecette(kpis);
    expect(agg).toHaveLength(1);
    expect(agg[0].recette).toBe("Merguez");
  });

  it("gère les marges null sans casser la moyenne", () => {
    const kpis = [
      makeKpi({ id: "1", recette: "Merguez", marge_pct_ht: null, marge_eur_ht: null }),
      makeKpi({ id: "2", recette: "Merguez", marge_pct_ht: 40, marge_eur_ht: 50 }),
    ];
    const agg = aggregateKpiByRecette(kpis);
    expect(agg[0].count).toBe(2);
    // Seule la 2e ligne a une marge_pct_ht non nulle → moyenne = 40
    expect(agg[0].marge_pct_moy).toBe(40);
    expect(agg[0].marge_eur_total).toBe(50);
  });

  it("renvoie null pour marge_pct_moy si aucune ligne ne l'a", () => {
    const kpis = [
      makeKpi({ id: "1", recette: "Merguez", marge_pct_ht: null }),
    ];
    const agg = aggregateKpiByRecette(kpis);
    expect(agg[0].marge_pct_moy).toBeNull();
  });
});
