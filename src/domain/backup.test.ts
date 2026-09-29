import { describe, expect, it } from "vitest";

import { buildBackup, parseBackup } from "./backup";
import { DIFFICULTY, OWNERSHIP } from "./types";
import type { CollectionEntry } from "./types";
import type { RecipeRecord } from "./recipes";

const ACTIVE_ENTRY: CollectionEntry = {
  code: "AK11001",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DELETED_ENTRY: CollectionEntry = {
  code: "AK11002",
  status: OWNERSHIP.OWNED,
  level: 0,
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

const DELETED_RECIPE: RecipeRecord = {
  id: "marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

describe("buildBackup", () => {
  it("incluye las entradas de colección borradas con su deletedAt", () => {
    const backup = buildBackup([ACTIVE_ENTRY, DELETED_ENTRY], []);
    expect(backup.collection).toContainEqual(DELETED_ENTRY);
  });

  it("incluye las recetas propias borradas con su deletedAt", () => {
    const backup = buildBackup([], [DELETED_RECIPE]);
    expect(backup.recipes).toContainEqual(DELETED_RECIPE);
  });
});

describe("parseBackup", () => {
  it("acepta una entrada de colección borrada y conserva su deletedAt", () => {
    const json = JSON.stringify(buildBackup([ACTIVE_ENTRY, DELETED_ENTRY], []));
    const parsed = parseBackup(json);
    expect(parsed.collection).toContainEqual(DELETED_ENTRY);
  });

  it("acepta una receta propia borrada y conserva su deletedAt", () => {
    const json = JSON.stringify(buildBackup([], [DELETED_RECIPE]));
    const parsed = parseBackup(json);
    expect(parsed.recipes).toContainEqual(DELETED_RECIPE);
  });

  it("lanza un error en español si falta la lista de pinturas", () => {
    expect(() => parseBackup(JSON.stringify({ version: 1 }))).toThrow(
      /pinturas/i,
    );
  });
});
