import { describe, expect, it } from "vitest";

import {
  PAINTS,
  RECIPES,
  describeDelta,
  filterPaints,
  findClosestPaints,
  getPaint,
  recipeCodes,
  recipeCoverage,
  substitutesFromCollection,
} from "./catalog";
import { EMPTY_FILTERS } from "./catalog";

describe("catálogo", () => {
  it("no tiene referencias duplicadas", () => {
    const codes = PAINTS.map((paint) => paint.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("tiene un hex válido en cada referencia", () => {
    const invalid = PAINTS.filter((paint) => !/^#[0-9A-F]{6}$/.test(paint.hex));
    expect(invalid).toEqual([]);
  });

  it("asigna al menos una familia a cada referencia", () => {
    expect(PAINTS.every((paint) => paint.families.length > 0)).toBe(true);
  });
});

describe("recetas", () => {
  it("solo usa referencias que existen en el catálogo", () => {
    const missing = RECIPES.flatMap(recipeCodes).filter(
      (code) => getPaint(code) === undefined,
    );
    expect(missing).toEqual([]);
  });

  it("no repite id entre recetas", () => {
    const ids = RECIPES.map((recipe) => recipe.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("no lista dos veces la misma referencia en la lista de la compra", () => {
    for (const recipe of RECIPES) {
      const codes = recipeCodes(recipe);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });
});

describe("recipeCoverage", () => {
  const recipe = RECIPES[0]!;

  it("marca todo como pendiente cuando no tienes nada", () => {
    const coverage = recipeCoverage(recipe, new Set());
    expect(coverage.owned).toBe(0);
    expect(coverage.ratio).toBe(0);
    expect(coverage.missing).toHaveLength(coverage.total);
  });

  it("marca la receta completa cuando tienes todas", () => {
    const coverage = recipeCoverage(recipe, new Set(recipeCodes(recipe)));
    expect(coverage.missing).toEqual([]);
    expect(coverage.ratio).toBe(1);
  });
});

describe("findClosestPaints", () => {
  it("devuelve primero la referencia exacta", () => {
    const target = getPaint("AK11179")!;
    const [best] = findClosestPaints(target.hex, { limit: 5 });
    expect(best?.paint.code).toBe("AK11179");
    expect(best?.delta).toBeCloseTo(0, 6);
  });

  it("ordena por parecido creciente", () => {
    const deltas = findClosestPaints("#7A4231", { limit: 10 }).map((m) => m.delta);
    expect([...deltas].sort((a, b) => a - b)).toEqual(deltas);
  });

  it("respeta el filtro de referencias", () => {
    const pool = new Set(["AK11191", "AK11212"]);
    const matches = findClosestPaints("#FFFFFF", { limit: 10, codes: pool });
    expect(matches.map((m) => m.paint.code).sort()).toEqual(["AK11191", "AK11212"]);
  });

  it("no devuelve nada si el filtro deja el catálogo vacío", () => {
    expect(findClosestPaints("#FFFFFF", { codes: new Set() })).toEqual([]);
  });
});

describe("substitutesFromCollection", () => {
  it("propone lo más parecido de entre lo que tienes", () => {
    const owned = new Set(["AK11181", "AK11191", "AK11029"]);
    const [best] = substitutesFromCollection("AK11179", owned);
    // AK11179 Ultramarine contra un azul oscuro, un oro y un negro: gana el azul.
    expect(best?.paint.code).toBe("AK11181");
  });

  it("no propone nada si la colección está vacía", () => {
    expect(substitutesFromCollection("AK11179", new Set())).toEqual([]);
  });
});

describe("filterPaints", () => {
  it("encuentra por referencia exacta", () => {
    const results = filterPaints(PAINTS, { ...EMPTY_FILTERS, query: "AK11179" });
    expect(results.map((paint) => paint.code)).toContain("AK11179");
  });

  it("ignora las tildes en la búsqueda", () => {
    const withAccent = filterPaints(PAINTS, { ...EMPTY_FILTERS, query: "metálico" });
    const without = filterPaints(PAINTS, { ...EMPTY_FILTERS, query: "metalico" });
    expect(withAccent).toEqual(without);
  });

  it("exige que aparezcan todos los términos", () => {
    const results = filterPaints(PAINTS, { ...EMPTY_FILTERS, query: "deep blue" });
    expect(results.every((paint) => /deep/i.test(paint.name))).toBe(true);
    expect(results.map((paint) => paint.code)).toContain("AK11182");
  });

  it("filtra por línea", () => {
    const results = filterPaints(PAINTS, { ...EMPTY_FILTERS, lines: ["real-colors"] });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((paint) => paint.line === "real-colors")).toBe(true);
  });
});

describe("describeDelta", () => {
  it("traduce el ΔE a lenguaje llano", () => {
    expect(describeDelta(0.4)).toBe("Indistinguible");
    expect(describeDelta(2)).toBe("Prácticamente igual");
    expect(describeDelta(40)).toBe("Lejano");
  });
});
