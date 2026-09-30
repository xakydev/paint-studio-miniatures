import { describe, expect, it } from "vitest";

import { isCollectionEntry, isStoredRecipe } from "./guards";
import { DIFFICULTY, OWNERSHIP } from "./types";

describe("isCollectionEntry", () => {
  it("acepta una entrada válida sin deletedAt", () => {
    expect(
      isCollectionEntry({
        code: "AK11001",
        status: OWNERSHIP.OWNED,
        level: 3,
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("acepta una entrada válida con deletedAt", () => {
    expect(
      isCollectionEntry({
        code: "AK11001",
        status: OWNERSHIP.WISHLIST,
        level: 0,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("rechaza una entrada con deletedAt de tipo incorrecto", () => {
    expect(
      isCollectionEntry({
        code: "AK11001",
        status: OWNERSHIP.OWNED,
        level: 3,
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: 12345,
      }),
    ).toBe(false);
  });

  it("rechaza una entrada sin updatedAt", () => {
    expect(
      isCollectionEntry({ code: "AK11001", status: OWNERSHIP.OWNED, level: 3 }),
    ).toBe(false);
  });

  it("rechaza valores que no son objetos", () => {
    expect(isCollectionEntry(null)).toBe(false);
    expect(isCollectionEntry("AK11001")).toBe(false);
  });
});

describe("isStoredRecipe", () => {
  it("acepta una receta legada sin updatedAt", () => {
    expect(
      isStoredRecipe({
        id: "marine-azul",
        name: "Marine espacial azul",
        subject: "Infantería de ciencia ficción",
        summary: "Esquema básico.",
        difficulty: DIFFICULTY.BEGINNER,
        tags: [],
        zones: [],
      }),
    ).toBe(true);
  });

  it("acepta una receta con updatedAt y deletedAt", () => {
    expect(
      isStoredRecipe({
        id: "marine-azul",
        name: "Marine espacial azul",
        subject: "Infantería de ciencia ficción",
        summary: "Esquema básico.",
        difficulty: DIFFICULTY.BEGINNER,
        tags: [],
        zones: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: "2026-01-02T00:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("rechaza un valor sin id", () => {
    expect(isStoredRecipe({ zones: [] })).toBe(false);
  });

  it("rechaza un valor sin zones", () => {
    expect(isStoredRecipe({ id: "marine-azul" })).toBe(false);
  });
});
