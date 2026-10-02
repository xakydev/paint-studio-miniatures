import { describe, expect, it } from "vitest";

import { DIFFICULTY, OWNERSHIP, STEP_ROLE } from "../../domain/types";
import type { CollectionEntry } from "../../domain/types";
import type { RecipeRecord } from "../../domain/recipes";
import { fromCollectionRow, fromRecipeRow, toCollectionRow, toRecipeRow } from "./rows";

const ACTIVE: CollectionEntry = {
  code: "AK11001",
  status: OWNERSHIP.OWNED,
  level: 2,
  note: "Casi vacío",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DELETED: CollectionEntry = {
  code: "AK11002",
  status: OWNERSHIP.WISHLIST,
  level: 3,
  updatedAt: "2026-01-02T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

const RECIPE: RecipeRecord = {
  id: "marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: ["sci-fi"],
  zones: [{ name: "Armadura", steps: [{ role: STEP_ROLE.BASE, code: "AK11001" }] }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("toCollectionRow", () => {
  it("traduce a snake_case y nunca incluye user_id", () => {
    expect(toCollectionRow(DELETED)).toEqual({
      code: "AK11002",
      status: "wishlist",
      level: 3,
      note: null,
      updated_at: "2026-01-02T00:00:00.000Z",
      deleted_at: "2026-01-02T00:00:00.000Z",
    });
  });

  it("lleva siempre las mismas claves, con null explícito, para que las columnas sean uniformes", () => {
    const row = toCollectionRow({ ...ACTIVE, note: undefined });
    expect(Object.keys(row).sort()).toEqual(
      ["code", "deleted_at", "level", "note", "status", "updated_at"].sort(),
    );
    expect(row.note).toBeNull();
    expect(row.deleted_at).toBeNull();
  });
});

describe("fromCollectionRow", () => {
  it("traduce a camelCase y omite note y deletedAt cuando llegan a null", () => {
    expect(
      fromCollectionRow({
        user_id: "u1",
        code: "AK11001",
        status: "owned",
        level: 2,
        note: null,
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      }),
    ).toEqual({ code: "AK11001", status: "owned", level: 2, updatedAt: "2026-01-01T00:00:00.000Z" });
  });

  it("normaliza +00:00 de PostgREST a Z", () => {
    const entry = fromCollectionRow({
      code: "AK11002",
      status: "wishlist",
      level: 3,
      note: null,
      updated_at: "2026-01-02T00:00:00+00:00",
      deleted_at: "2026-01-02T00:00:00.5+00:00",
    });
    expect(entry?.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(entry?.deletedAt).toBe("2026-01-02T00:00:00.500Z");
  });

  it("ida y vuelta conserva la entrada, borrada incluida", () => {
    expect(fromCollectionRow(toCollectionRow(ACTIVE))).toEqual(ACTIVE);
    expect(fromCollectionRow(toCollectionRow(DELETED))).toEqual(DELETED);
  });

  it.each([
    ["no es un objeto", "AK11001"],
    ["es null", null],
    ["tiene un status desconocido", { ...toCollectionRow(ACTIVE), status: "lent" }],
    ["no tiene code", { ...toCollectionRow(ACTIVE), code: undefined }],
    ["tiene una note que no es texto", { ...toCollectionRow(ACTIVE), note: 7 }],
    ["tiene un updated_at ilegible", { ...toCollectionRow(ACTIVE), updated_at: "ayer" }],
    // Un deleted_at ilegible no puede leerse como "no borrada": la resucitaría.
    ["tiene un deleted_at ilegible", { ...toCollectionRow(ACTIVE), deleted_at: "ayer" }],
  ])("descarta la fila si %s", (_case, row) => {
    expect(fromCollectionRow(row)).toBeNull();
  });
});

describe("toRecipeRow", () => {
  it("guarda en data todo menos id y las fechas", () => {
    expect(toRecipeRow({ ...RECIPE, deletedAt: "2026-01-03T00:00:00.000Z" })).toEqual({
      id: "marine-azul",
      data: {
        name: "Marine espacial azul",
        subject: "Infantería de ciencia ficción",
        summary: "Esquema básico.",
        difficulty: "iniciacion",
        tags: ["sci-fi"],
        zones: [{ name: "Armadura", steps: [{ role: "base", code: "AK11001" }] }],
      },
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: "2026-01-03T00:00:00.000Z",
    });
  });

  it("pone deleted_at a null explícito si la receta está activa", () => {
    expect(toRecipeRow(RECIPE).deleted_at).toBeNull();
  });
});

describe("fromRecipeRow", () => {
  it("ida y vuelta conserva la receta, borrada incluida", () => {
    expect(fromRecipeRow(toRecipeRow(RECIPE))).toEqual(RECIPE);
    const deleted = { ...RECIPE, deletedAt: "2026-01-03T00:00:00.000Z" };
    expect(fromRecipeRow(toRecipeRow(deleted))).toEqual(deleted);
  });

  it("las columnas mandan sobre claves homónimas dentro de data", () => {
    const { data, ...columns } = toRecipeRow(RECIPE);
    const row = {
      ...columns,
      data: { ...(data as Record<string, unknown>), id: "otro", deletedAt: "2026-01-09T00:00:00.000Z" },
    };
    expect(fromRecipeRow(row)).toEqual(RECIPE);
  });

  it("normaliza +00:00 a Z", () => {
    const recipe = fromRecipeRow({ ...toRecipeRow(RECIPE), updated_at: "2026-01-01T00:00:00+00:00" });
    expect(recipe?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it.each([
    ["no es un objeto", 3],
    ["data no es un objeto", { ...toRecipeRow(RECIPE), data: [] }],
    ["data no tiene zones", { ...toRecipeRow(RECIPE), data: { name: "x" } }],
    ["no tiene id", { ...toRecipeRow(RECIPE), id: null }],
    ["tiene un updated_at ilegible", { ...toRecipeRow(RECIPE), updated_at: 5 }],
    ["tiene un deleted_at ilegible", { ...toRecipeRow(RECIPE), deleted_at: "nunca" }],
  ])("descarta la fila si %s", (_case, row) => {
    expect(fromRecipeRow(row)).toBeNull();
  });
});
