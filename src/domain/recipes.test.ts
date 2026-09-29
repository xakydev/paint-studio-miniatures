import { describe, expect, it } from "vitest";

import { mergeRecipes } from "./recipes";
import type { RecipeRecord } from "./recipes";
import { DIFFICULTY } from "./types";
import type { Recipe } from "./types";

const SEED: Recipe = {
  id: "space-marine-azul",
  name: "Marine espacial azul (semilla)",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema de fábrica.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [],
};

function customRecord(overrides: Partial<RecipeRecord> = {}): RecipeRecord {
  return {
    id: "space-marine-azul",
    name: "Marine espacial azul (mío)",
    subject: "Infantería de ciencia ficción",
    summary: "Mi variante.",
    difficulty: DIFFICULTY.INTERMEDIATE,
    tags: [],
    zones: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("mergeRecipes", () => {
  it("una receta propia activa sustituye a la de semilla con el mismo id", () => {
    const custom = customRecord();

    const merged = mergeRecipes([custom], [SEED]);

    const found = merged.find((recipe) => recipe.id === "space-marine-azul");
    expect(found).toEqual(custom);
    expect(merged).toHaveLength(1);
  });

  it("borrar la propia que sustituía a una de semilla restaura la semilla", () => {
    const custom = customRecord({ deletedAt: "2026-01-02T00:00:00.000Z" });

    const merged = mergeRecipes([custom], [SEED]);

    expect(merged).toEqual([SEED]);
  });

  it("borrar una propia sin equivalente en semilla la hace desaparecer", () => {
    const custom = customRecord({
      id: "mi-receta-custom",
      deletedAt: "2026-01-02T00:00:00.000Z",
    });

    const merged = mergeRecipes([custom], [SEED]);

    expect(merged.find((recipe) => recipe.id === "mi-receta-custom")).toBeUndefined();
    expect(merged).toEqual([SEED]);
  });

  it("mantiene primero las propias y después las semillas no sustituidas", () => {
    const custom = customRecord({ id: "mi-receta-custom" });

    const merged = mergeRecipes([custom], [SEED]);

    expect(merged.map((recipe) => recipe.id)).toEqual([
      "mi-receta-custom",
      "space-marine-azul",
    ]);
  });
});
