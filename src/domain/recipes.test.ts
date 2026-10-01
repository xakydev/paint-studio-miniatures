import { describe, expect, it } from "vitest";

import { isRecipeWithinDomainLimits, mergeRecipes } from "./recipes";
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

describe("isRecipeWithinDomainLimits", () => {
  /**
   * Espejo de los CHECK de `recipes` en
   * supabase/migrations/20261001061555_esquema_inicial.sql: un caso límite
   * dentro y otro fuera por cada restricción.
   */
  it("acepta una receta dentro de todos los límites", () => {
    expect(isRecipeWithinDomainLimits(customRecord())).toBe(true);
  });

  it("acepta id con longitud 1 y 200, rechaza id vacío y de 201", () => {
    expect(isRecipeWithinDomainLimits(customRecord({ id: "a" }))).toBe(true);
    expect(isRecipeWithinDomainLimits(customRecord({ id: "a".repeat(200) }))).toBe(true);
    expect(isRecipeWithinDomainLimits(customRecord({ id: "" }))).toBe(false);
    expect(isRecipeWithinDomainLimits(customRecord({ id: "a".repeat(201) }))).toBe(false);
  });

  it("rechaza una receta sin zones como array: el CHECK usa coalesce para que NULL falle", () => {
    const broken = { ...customRecord(), zones: undefined } as unknown as RecipeRecord;
    expect(isRecipeWithinDomainLimits(broken)).toBe(false);
  });

  it("rechaza updatedAt que no se pueda interpretar como fecha", () => {
    expect(isRecipeWithinDomainLimits(customRecord({ updatedAt: "no-es-una-fecha" }))).toBe(
      false,
    );
  });

  it("acepta deletedAt ausente o válido, y rechaza uno ilegible", () => {
    expect(isRecipeWithinDomainLimits(customRecord({ deletedAt: undefined }))).toBe(true);
    expect(
      isRecipeWithinDomainLimits(customRecord({ deletedAt: "2026-01-02T00:00:00.000Z" })),
    ).toBe(true);
    expect(isRecipeWithinDomainLimits(customRecord({ deletedAt: "no-es-una-fecha" }))).toBe(
      false,
    );
  });
});
