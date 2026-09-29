import { beforeEach, describe, expect, it } from "vitest";

import { DIFFICULTY, OWNERSHIP } from "../../domain/types";
import type { CollectionEntry } from "../../domain/types";
import { LEGACY_UPDATED_AT } from "../../domain/recipes";
import type { RecipeRecord } from "../../domain/recipes";
import {
  localCollectionRepository,
  localRecipeRepository,
} from "./localRepositories";

const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const RECIPES_KEY = "paint-studio-miniatures:recipes:v1";

const OWNED: CollectionEntry = {
  code: "AK11001",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const WISHLISTED: CollectionEntry = {
  code: "AK11002",
  status: OWNERSHIP.WISHLIST,
  level: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const RECIPE: RecipeRecord = {
  id: "marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  localStorage.clear();
});

describe("localCollectionRepository", () => {
  it("carga vacío cuando no hay nada guardado", async () => {
    expect(await localCollectionRepository.load()).toEqual([]);
  });

  it("upsert fusiona por code sin eliminar registros existentes", async () => {
    await localCollectionRepository.upsert([OWNED, WISHLISTED]);
    await localCollectionRepository.upsert([{ ...OWNED, level: 1 }]);

    const loaded = await localCollectionRepository.load();
    expect(loaded).toContainEqual({ ...OWNED, level: 1 });
    expect(loaded).toContainEqual(WISHLISTED);
    expect(loaded).toHaveLength(2);
  });

  it("load no filtra los registros borrados", async () => {
    const deleted: CollectionEntry = {
      ...OWNED,
      deletedAt: "2026-01-02T00:00:00.000Z",
    };
    await localCollectionRepository.upsert([deleted]);

    expect(await localCollectionRepository.load()).toContainEqual(deleted);
  });

  it("guarda bajo la clave conocida paint-studio-miniatures:collection:v1", async () => {
    await localCollectionRepository.upsert([OWNED]);

    const raw = localStorage.getItem(COLLECTION_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "[]")).toContainEqual(OWNED);
  });

  it("subscribe devuelve un unsubscribe que se puede invocar sin error", () => {
    const unsubscribe = localCollectionRepository.subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("localRecipeRepository", () => {
  it("normaliza una receta legada sin updatedAt a LEGACY_UPDATED_AT", async () => {
    const legacy = {
      id: "marine-azul",
      name: "Marine espacial azul",
      subject: "Infantería de ciencia ficción",
      summary: "Esquema básico.",
      difficulty: DIFFICULTY.BEGINNER,
      tags: [],
      zones: [],
    };
    localStorage.setItem(RECIPES_KEY, JSON.stringify([legacy]));

    const loaded = await localRecipeRepository.load();
    expect(loaded).toEqual([{ ...legacy, updatedAt: LEGACY_UPDATED_AT }]);
  });

  it("upsert fusiona por id sin eliminar registros existentes", async () => {
    const other: RecipeRecord = { ...RECIPE, id: "orco-verde" };
    await localRecipeRepository.upsert([RECIPE, other]);
    await localRecipeRepository.upsert([
      { ...RECIPE, updatedAt: "2026-02-01T00:00:00.000Z" },
    ]);

    const loaded = await localRecipeRepository.load();
    expect(loaded).toContainEqual({
      ...RECIPE,
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(loaded).toContainEqual(other);
    expect(loaded).toHaveLength(2);
  });

  it("guarda bajo la clave conocida paint-studio-miniatures:recipes:v1", async () => {
    await localRecipeRepository.upsert([RECIPE]);

    const raw = localStorage.getItem(RECIPES_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? "[]")).toContainEqual(RECIPE);
  });

  it("subscribe devuelve un unsubscribe que se puede invocar sin error", () => {
    const unsubscribe = localRecipeRepository.subscribe(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("upsert nunca destruye lo que no entiende", () => {
  it("conserva en disco los registros que no pasan el type guard", async () => {
    // Un registro de una versión futura (estado desconocido) no se muestra,
    // pero tampoco se puede perder por el mero hecho de guardar otra cosa.
    const future = { code: "AK11003", status: "loaned", level: 2, updatedAt: "2027-01-01T00:00:00.000Z" };
    localStorage.setItem(COLLECTION_KEY, JSON.stringify([OWNED, future]));

    await localCollectionRepository.upsert([{ ...OWNED, level: 1 }]);

    const raw: unknown = JSON.parse(localStorage.getItem(COLLECTION_KEY)!);
    expect(raw).toContainEqual(future);
    expect(raw).toContainEqual({ ...OWNED, level: 1 });
    expect(await localCollectionRepository.load()).toEqual([{ ...OWNED, level: 1 }]);
  });

  it("aparta un valor corrupto a una clave de rescate antes de escribir", async () => {
    localStorage.setItem(COLLECTION_KEY, "{esto no es json");

    await localCollectionRepository.upsert([OWNED]);

    const rescue = Object.keys(localStorage).filter((k) =>
      k.startsWith(`${COLLECTION_KEY}:corrupt:`),
    );
    expect(rescue).toHaveLength(1);
    expect(localStorage.getItem(rescue[0]!)).toBe("{esto no es json");
    expect(await localCollectionRepository.load()).toEqual([OWNED]);
  });
});
