import { describe, expect, it } from "vitest";

import { DIFFICULTY, OWNERSHIP } from "../domain/types";
import type { CollectionEntry } from "../domain/types";
import type { RecipeRecord } from "../domain/recipes";
import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "./memory/inMemoryRepositories";
import type { RepositoryPair } from "./ports/Backend";
import { uploadLocalSnapshotOnce } from "./uploadLocalSnapshot";
import type { UploadMarker } from "./ports/UploadMarker";

const VALID_ENTRY: CollectionEntry = {
  code: "AK11001",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DELETED_ENTRY: CollectionEntry = {
  code: "AK11002",
  status: OWNERSHIP.WISHLIST,
  level: 0,
  updatedAt: "2026-01-02T00:00:00.000Z",
  deletedAt: "2026-01-03T00:00:00.000Z",
};

const INVALID_ENTRY: CollectionEntry = {
  code: "AK11003",
  status: OWNERSHIP.OWNED,
  // Fuera de 0..3: violaría el CHECK de `level` en Postgres.
  level: 5,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const VALID_RECIPE: RecipeRecord = {
  id: "marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const INVALID_RECIPE = {
  ...VALID_RECIPE,
  id: "receta-rota",
  // `zones` no es un array: violaría el CHECK de `data` en Postgres.
  zones: undefined,
} as unknown as RecipeRecord;

/** Un marcador de prueba que registra las llamadas, sin tocar localStorage. */
function createMarker(initiallyDone = false): UploadMarker & { markDoneCalls: number } {
  let done = initiallyDone;
  let markDoneCalls = 0;
  return {
    isDone: () => done,
    markDone: () => {
      done = true;
      markDoneCalls += 1;
    },
    get markDoneCalls() {
      return markDoneCalls;
    },
  };
}

function localPair(): RepositoryPair & {
  collection: ReturnType<typeof createInMemoryCollectionRepository>;
  recipes: ReturnType<typeof createInMemoryRecipeRepository>;
} {
  return {
    collection: createInMemoryCollectionRepository(),
    recipes: createInMemoryRecipeRepository(),
  };
}

function remotePair(): RepositoryPair & {
  collection: ReturnType<typeof createInMemoryCollectionRepository>;
  recipes: ReturnType<typeof createInMemoryRecipeRepository>;
} {
  return {
    collection: createInMemoryCollectionRepository(),
    recipes: createInMemoryRecipeRepository(),
  };
}

describe("uploadLocalSnapshotOnce", () => {
  it("si la marca ya está hecha, no carga nada y devuelve skipped 0", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker(true);

    const result = await uploadLocalSnapshotOnce(from, to, marker);

    expect(result).toEqual({ skipped: 0 });
    expect(from.collection.loadCount).toBe(0);
    expect(from.recipes.loadCount).toBe(0);
    expect(to.collection.upserts).toHaveLength(0);
    expect(to.recipes.upserts).toHaveLength(0);
  });

  it("sube la colección y las recetas locales (tombstones incluidos) y marca hecho", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();

    from.collection.resolveLoad([VALID_ENTRY, DELETED_ENTRY]);
    from.recipes.resolveLoad([VALID_RECIPE]);

    const result = await uploadLocalSnapshotOnce(from, to, marker);

    expect(to.collection.upserts).toEqual([[VALID_ENTRY, DELETED_ENTRY]]);
    expect(to.recipes.upserts).toEqual([[VALID_RECIPE]]);
    expect(marker.markDoneCalls).toBe(1);
    expect(result).toEqual({ skipped: 0 });
  });

  it("nunca llama a upsert en los repositorios locales: la copia local no se toca", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();

    from.collection.resolveLoad([VALID_ENTRY]);
    from.recipes.resolveLoad([VALID_RECIPE]);

    await uploadLocalSnapshotOnce(from, to, marker);

    expect(from.collection.upserts).toHaveLength(0);
    expect(from.recipes.upserts).toHaveLength(0);
  });

  it("separa una entrada que viola un límite de dominio: solo sube la válida e informa de 1 saltada", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();

    from.collection.resolveLoad([VALID_ENTRY, INVALID_ENTRY]);
    from.recipes.resolveLoad([]);

    const result = await uploadLocalSnapshotOnce(from, to, marker);

    expect(to.collection.upserts).toEqual([[VALID_ENTRY]]);
    expect(result).toEqual({ skipped: 1 });
    expect(from.collection.upserts).toHaveLength(0);
  });

  it("separa una receta que viola un límite de dominio: solo sube la válida e informa de 1 saltada", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();

    from.collection.resolveLoad([]);
    from.recipes.resolveLoad([VALID_RECIPE, INVALID_RECIPE]);

    const result = await uploadLocalSnapshotOnce(from, to, marker);

    expect(to.recipes.upserts).toEqual([[VALID_RECIPE]]);
    expect(result).toEqual({ skipped: 1 });
  });

  it("no hace upsert remoto de una lista vacía cuando todo lo de ese tipo se separó", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();

    from.collection.resolveLoad([INVALID_ENTRY]);
    from.recipes.resolveLoad([]);

    const result = await uploadLocalSnapshotOnce(from, to, marker);

    expect(to.collection.upserts).toHaveLength(0);
    expect(result).toEqual({ skipped: 1 });
  });

  it("si falla el load de un repositorio local, rechaza sin marcar", async () => {
    const from = localPair();
    const to = remotePair();
    const marker = createMarker();
    const loadError = new Error("localStorage ilegible");

    from.collection.rejectLoad(loadError);
    from.recipes.resolveLoad([]);

    await expect(uploadLocalSnapshotOnce(from, to, marker)).rejects.toBe(loadError);
    expect(marker.markDoneCalls).toBe(0);
  });

  it("si la colección sube y las recetas fallan, rechaza sin marcar: repetir es seguro", async () => {
    const from = localPair();
    const marker = createMarker();
    const uploadError = new Error("el servidor remoto rechazó el lote");
    const to: RepositoryPair = {
      collection: remotePair().collection,
      recipes: {
        load: () => Promise.resolve([]),
        upsert: () => Promise.reject(uploadError),
        subscribe: () => () => {},
      },
    };

    from.collection.resolveLoad([VALID_ENTRY]);
    from.recipes.resolveLoad([VALID_RECIPE]);

    await expect(uploadLocalSnapshotOnce(from, to, marker)).rejects.toBe(uploadError);
    expect(marker.markDoneCalls).toBe(0);
    expect(from.collection.upserts).toHaveLength(0);
    expect(from.recipes.upserts).toHaveLength(0);
  });
});
