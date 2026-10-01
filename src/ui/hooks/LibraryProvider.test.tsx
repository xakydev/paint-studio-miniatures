import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "../../data/memory/inMemoryRepositories";
import type { RecipeRecord } from "../../domain/recipes";
import { DIFFICULTY, OWNERSHIP, type CollectionEntry } from "../../domain/types";
import { LOAD_STATUS, useLibrary, type LibraryApi } from "./libraryContext";
import { LibraryProvider } from "./LibraryProvider";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const OWNED: CollectionEntry = {
  code: "AK11179",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DELETED: CollectionEntry = {
  code: "AK11181",
  status: OWNERSHIP.OWNED,
  level: 2,
  updatedAt: "2026-01-02T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

/** Sustituye a la receta de semilla "space-marine-azul", pero está borrada. */
const DELETED_OVERRIDE: RecipeRecord = {
  id: "space-marine-azul",
  name: "Marine propio",
  subject: "Infantería",
  summary: "Versión propia.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [],
  updatedAt: "2026-01-02T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;
let collection: ReturnType<typeof createInMemoryCollectionRepository>;
let recipes: ReturnType<typeof createInMemoryRecipeRepository>;
/** La API que ve un consumidor, capturada tras cada render del Probe. */
let api: LibraryApi | undefined;

function Probe() {
  const library = useLibrary();
  // En un efecto y no durante el render: asignar fuera del componente al
  // renderizar es un efecto secundario.
  useEffect(() => {
    api = library;
  });
  return <p>armario: {[...library.ownedCodes].join(",")}</p>;
}

function tree(collectionRepository = collection, recipeRepository = recipes) {
  return (
    <LibraryProvider
      collectionRepository={collectionRepository}
      recipeRepository={recipeRepository}
    >
      <Probe />
    </LibraryProvider>
  );
}

async function mount() {
  await act(async () => {
    root.render(tree());
  });
}

async function resolveLoads(
  entries: readonly CollectionEntry[] = [],
  recipeRecords: readonly RecipeRecord[] = [],
) {
  await act(async () => {
    collection.resolveLoad(entries);
    recipes.resolveLoad(recipeRecords);
  });
}

function currentApi(): LibraryApi {
  if (!api) throw new Error("El Provider aún no ha renderizado a sus hijos.");
  return api;
}

beforeEach(() => {
  api = undefined;
  collection = createInMemoryCollectionRepository();
  recipes = createInMemoryRecipeRepository();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

describe("LibraryProvider: carga inicial", () => {
  it("muestra el estado de carga hasta que resuelven los dos repositorios", async () => {
    await mount();

    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toBe("Cargando tu colección…");
    expect(api).toBeUndefined();

    await act(async () => {
      collection.resolveLoad([OWNED]);
    });
    // Falta la de recetas: sigue cargando.
    expect(container.querySelector('[role="status"]')).not.toBeNull();

    await act(async () => {
      recipes.resolveLoad([]);
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("armario: AK11179");
    expect(currentApi().status).toBe(LOAD_STATUS.READY);
  });

  it("no llama a upsert al montar con datos precargados", async () => {
    await mount();
    expect(collection.upserts).toHaveLength(0);
    expect(recipes.upserts).toHaveLength(0);

    await resolveLoads([OWNED], [DELETED_OVERRIDE]);

    // Cargar no es cambiar: tampoco se escribe al terminar la carga.
    expect(collection.upserts).toHaveLength(0);
    expect(recipes.upserts).toHaveLength(0);
    expect(currentApi().entries).toEqual([OWNED]);
  });

  it("hace un solo load por repositorio aunque el Provider se vuelva a renderizar", async () => {
    await mount();
    await resolveLoads([OWNED]);
    await act(async () => {
      root.render(tree());
    });

    expect(collection.loadCount).toBe(1);
    expect(recipes.loadCount).toBe(1);
  });

  it("si cambian los repositorios, vuelve a cargar antes de mostrar o escribir", async () => {
    await mount();
    await resolveLoads([OWNED]);

    const nextCollection = createInMemoryCollectionRepository();
    const nextRecipes = createInMemoryRecipeRepository();
    await act(async () => {
      root.render(tree(nextCollection, nextRecipes));
    });

    expect(container.querySelector('[role="status"]')).not.toBeNull();
    expect(collection.listenerCount).toBe(0);

    await act(async () => {
      nextCollection.resolveLoad([]);
      nextRecipes.resolveLoad([]);
    });
    // Lo cargado del repositorio anterior no se arrastra al nuevo.
    expect(currentApi().entries).toEqual([]);
    expect(nextCollection.upserts).toHaveLength(0);
  });

  it("si la carga falla, arranca vacío en vez de quedarse cargando", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount();

    await act(async () => {
      collection.rejectLoad(new Error("sin acceso"));
      recipes.resolveLoad([]);
    });

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(currentApi().entries).toEqual([]);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("LibraryProvider: suscripción", () => {
  it("funde lo que llega por subscribe con lo cargado", async () => {
    await mount();
    await resolveLoads([OWNED]);

    const remote: CollectionEntry = {
      code: "AK11191",
      status: OWNERSHIP.WISHLIST,
      level: 3,
      updatedAt: "2026-01-03T00:00:00.000Z",
    };
    await act(async () => {
      collection.emit([remote]);
    });

    expect(currentApi().ownedCodes).toEqual(new Set(["AK11179"]));
    expect(currentApi().wishlistCodes).toEqual(new Set(["AK11191"]));
    // Un cambio remoto ya está persistido en su origen: no se reescribe.
    expect(collection.upserts).toHaveLength(0);
  });

  it("no pierde un cambio que llega mientras la carga está en curso", async () => {
    await mount();
    const remote: CollectionEntry = { ...OWNED, level: 1, updatedAt: "2026-01-05T00:00:00.000Z" };
    await act(async () => {
      collection.emit([remote]);
    });
    await resolveLoads([OWNED]);

    expect(currentApi().entryOf("AK11179")?.level).toBe(1);
  });

  it("se desuscribe de los dos repositorios al desmontar", async () => {
    await mount();
    await resolveLoads();
    expect(collection.listenerCount).toBe(1);
    expect(recipes.listenerCount).toBe(1);

    act(() => {
      root.unmount();
    });
    // afterEach vuelve a desmontar: un root nuevo evita desmontar dos veces.
    root = createRoot(container);

    expect(collection.listenerCount).toBe(0);
    expect(recipes.listenerCount).toBe(0);
  });
});

describe("LibraryProvider: registros borrados", () => {
  it("la API no expone entradas ni recetas borradas", async () => {
    await mount();
    await resolveLoads([OWNED, DELETED], [DELETED_OVERRIDE]);

    const library = currentApi();
    expect(library.entries).toEqual([OWNED]);
    expect(library.ownedCodes.has("AK11181")).toBe(false);
    expect(library.statusOf("AK11181")).toBeNull();
    expect(library.entryOf("AK11181")).toBeUndefined();
    expect(library.customRecipes).toEqual([]);
    // La receta propia borrada deja ver otra vez la de semilla.
    expect(library.recipes.find((r) => r.id === "space-marine-azul")?.name).toBe(
      "Marine espacial azul",
    );
  });

  it("exportBackup incluye los registros borrados", async () => {
    await mount();
    await resolveLoads([OWNED, DELETED], [DELETED_OVERRIDE]);

    const backup = currentApi().exportBackup();
    expect(backup.collection).toEqual([OWNED, DELETED]);
    expect(backup.recipes).toEqual([DELETED_OVERRIDE]);
    expect(Number.isNaN(Date.parse(backup.exportedAt))).toBe(false);
  });
});

describe("LibraryProvider: acciones", () => {
  it("quitar una pintura escribe su entrada con deletedAt, sin eliminarla", async () => {
    await mount();
    await resolveLoads([OWNED]);

    await act(async () => {
      currentApi().setStatus("AK11179", null);
    });

    expect(currentApi().ownedCodes.size).toBe(0);
    expect(collection.upserts).toHaveLength(1);
    const [written] = collection.upserts[0] ?? [];
    expect(written?.code).toBe("AK11179");
    expect(written?.deletedAt).toBeDefined();
  });

  it("marcar una pintura borrada la reactiva desde cero", async () => {
    await mount();
    await resolveLoads([DELETED]);

    await act(async () => {
      currentApi().setStatus("AK11181", OWNERSHIP.WISHLIST);
    });

    const entry = currentApi().entryOf("AK11181");
    expect(entry?.status).toBe(OWNERSHIP.WISHLIST);
    expect(entry?.level).toBe(3);
    expect(entry?.deletedAt).toBeUndefined();
  });

  it("addManyToWishlist solo escribe los códigos sin entrada activa", async () => {
    await mount();
    await resolveLoads([OWNED, DELETED]);

    await act(async () => {
      currentApi().addManyToWishlist(["AK11179", "AK11181", "AK11191"]);
    });

    expect(collection.upserts).toHaveLength(1);
    expect(collection.upserts[0]?.map((e) => e.code)).toEqual(["AK11181", "AK11191"]);
    expect(currentApi().statusOf("AK11179")).toBe(OWNERSHIP.OWNED);
  });

  it("vaciar marca con deletedAt todas las entradas activas", async () => {
    await mount();
    await resolveLoads([OWNED, DELETED]);

    await act(async () => {
      currentApi().clearCollection();
    });

    expect(currentApi().entries).toEqual([]);
    expect(collection.upserts).toHaveLength(1);
    const written = collection.upserts[0] ?? [];
    // Solo la activa: la ya borrada no se toca.
    expect(written.map((e) => e.code)).toEqual(["AK11179"]);
    expect(written[0]?.deletedAt).toBeDefined();
  });

  it("importar restaura: escribe lo importado y borra las activas ausentes", async () => {
    await mount();
    await resolveLoads([OWNED]);

    const imported: CollectionEntry = {
      code: "AK11191",
      status: OWNERSHIP.OWNED,
      level: 2,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    await act(async () => {
      currentApi().replaceCollection([imported]);
    });

    // El updatedAt importado se sella con la hora de la importación, no con
    // el que traía el fichero: así gana en una resolución LWW.
    const [result] = currentApi().entries;
    expect(result).toMatchObject({ code: "AK11191", status: OWNERSHIP.OWNED, level: 2 });
    expect(result?.updatedAt).not.toBe("2026-02-01T00:00:00.000Z");
    const written = collection.upserts[0] ?? [];
    expect(written.map((e) => e.code).sort()).toEqual(["AK11179", "AK11191"]);
    expect(written.find((e) => e.code === "AK11179")?.deletedAt).toBeDefined();
  });

  it("guardar y borrar una receta propia escribe RecipeRecord con updatedAt", async () => {
    await mount();
    await resolveLoads();

    const { updatedAt: _updatedAt, deletedAt: _deletedAt, ...recipe } = DELETED_OVERRIDE;
    await act(async () => {
      currentApi().saveRecipe(recipe);
    });
    expect(currentApi().recipes.find((r) => r.id === recipe.id)?.name).toBe("Marine propio");
    expect(recipes.upserts[0]?.[0]?.updatedAt).toBeDefined();
    expect(recipes.upserts[0]?.[0]?.deletedAt).toBeUndefined();

    await act(async () => {
      currentApi().deleteRecipe(recipe.id);
    });
    expect(currentApi().recipes.find((r) => r.id === recipe.id)?.name).toBe(
      "Marine espacial azul",
    );
    expect(recipes.upserts[1]?.[0]?.deletedAt).toBeDefined();
  });
});
