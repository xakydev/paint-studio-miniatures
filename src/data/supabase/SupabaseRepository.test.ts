import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DIFFICULTY, OWNERSHIP } from "../../domain/types";
import type { CollectionEntry } from "../../domain/types";
import type { RecipeRecord } from "../../domain/recipes";
import type { Database } from "./database.types";
import { toCollectionRow, toRecipeRow } from "./rows";
import {
  createSupabaseCollectionRepository,
  createSupabaseRecipeRepository,
} from "./SupabaseRepository";

const SUPABASE_URL = "http://127.0.0.1:54321";
// Clave inventada con el formato publicable: el SDK no avisa por formato desconocido.
const PUBLISHABLE_KEY = "sb_publishable_clave-de-prueba";
const USER_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

interface RecordedRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

/** Respuesta de un SELECT con `count=exact`: PostgREST manda el total en Content-Range. */
function pageResponse(rows: readonly unknown[], offset: number, total: number): Response {
  const range = rows.length === 0 ? `*/${total}` : `${offset}-${offset + rows.length - 1}/${total}`;
  return jsonResponse(rows, 200, { "Content-Range": range });
}

let storageKeyCounter = 0;

/**
 * supabase-js real con un `fetch` falso: lo que se comprueba es la petición
 * HTTP que de verdad sale, no el encadenado de la API fluida.
 */
function fakeBackend(responder: Responder) {
  const requests: RecordedRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      url: new URL(input instanceof Request ? input.url : input.toString()),
      headers: new Headers(init?.headers),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    return responder(request);
  });
  storageKeyCounter += 1;
  const client: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { fetch },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      // Una clave por cliente: con la misma, auth-js avisa de instancias múltiples.
      storageKey: `test-repo-${storageKeyCounter}`,
    },
  });
  return { client, fetch, requests };
}

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
  tags: [],
  zones: [],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** Fila tal como la devuelve PostgREST: con `user_id` y fechas en `+00:00`. */
function remoteCollectionRow(entry: CollectionEntry, code = entry.code) {
  const row = toCollectionRow({ ...entry, code });
  return {
    ...row,
    user_id: USER_ID,
    updated_at: row.updated_at.replace(".000Z", "+00:00"),
    deleted_at: row.deleted_at === null ? null : row.deleted_at.replace(".000Z", "+00:00"),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createSupabaseCollectionRepository · load", () => {
  it("pide las filas del usuario ordenadas por clave, con recuento y en una página", async () => {
    const { client, requests } = fakeBackend(() => pageResponse([], 0, 0));

    await createSupabaseCollectionRepository(client, USER_ID).load();

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("GET");
    expect(request?.url.pathname).toBe("/rest/v1/collection_entries");
    expect(request?.url.searchParams.get("select")).toBe("*");
    expect(request?.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
    expect(request?.url.searchParams.get("order")).toBe("code.asc");
    expect(request?.url.searchParams.get("offset")).toBe("0");
    expect(request?.url.searchParams.get("limit")).toBe("1000");
    expect(request?.headers.get("Prefer")).toBe("count=exact");
  });

  it("devuelve las activas y las borradas, traducidas a camelCase", async () => {
    const rows = [remoteCollectionRow(ACTIVE), remoteCollectionRow(DELETED)];
    const { client } = fakeBackend(() => pageResponse(rows, 0, 2));

    const loaded = await createSupabaseCollectionRepository(client, USER_ID).load();

    expect(loaded).toEqual([ACTIVE, DELETED]);
  });

  it("descarta sin rechazar las filas que no pasan el guard", async () => {
    const rows = [remoteCollectionRow(ACTIVE), { ...remoteCollectionRow(DELETED), status: "lent" }];
    const { client } = fakeBackend(() => pageResponse(rows, 0, 2));

    expect(await createSupabaseCollectionRepository(client, USER_ID).load()).toEqual([ACTIVE]);
  });

  it("con una página llena sigue pidiendo hasta agotar el total: nunca trunca en silencio", async () => {
    const total = 1001;
    const all = Array.from({ length: total }, (_, index) =>
      remoteCollectionRow(ACTIVE, `AK${String(index).padStart(5, "0")}`),
    );
    const { client, requests } = fakeBackend(({ url }) => {
      const offset = Number(url.searchParams.get("offset"));
      const limit = Number(url.searchParams.get("limit"));
      return pageResponse(all.slice(offset, offset + limit), offset, total);
    });

    const loaded = await createSupabaseCollectionRepository(client, USER_ID).load();

    expect(loaded).toHaveLength(total);
    expect(requests.map(({ url }) => url.searchParams.get("offset"))).toEqual(["0", "1000"]);
  });

  it("si el servidor corta por debajo de la página (max_rows menor), sigue desde lo recibido", async () => {
    const all = ["AK00001", "AK00002", "AK00003"].map((code) => remoteCollectionRow(ACTIVE, code));
    const maxRows = 2;
    const { client, requests } = fakeBackend(({ url }) => {
      const offset = Number(url.searchParams.get("offset"));
      return pageResponse(all.slice(offset, offset + maxRows), offset, all.length);
    });

    const loaded = await createSupabaseCollectionRepository(client, USER_ID).load();

    expect(loaded.map((entry) => entry.code)).toEqual(["AK00001", "AK00002", "AK00003"]);
    expect(requests.map(({ url }) => url.searchParams.get("offset"))).toEqual(["0", "2"]);
  });

  it("si una página llega vacía antes del total, para en vez de pedir sin fin", async () => {
    const { client, requests } = fakeBackend(({ url }) => {
      const offset = Number(url.searchParams.get("offset"));
      return offset === 0
        ? pageResponse([remoteCollectionRow(ACTIVE)], 0, 5)
        : pageResponse([], offset, 5);
    });

    expect(await createSupabaseCollectionRepository(client, USER_ID).load()).toEqual([ACTIVE]);
    expect(requests).toHaveLength(2);
  });

  it("rechaza con un Error en español si PostgREST responde con error, sin filtrar la clave", async () => {
    const { client } = fakeBackend(() =>
      jsonResponse({ code: "PGRST301", message: "JWT expired", details: null, hint: null }, 401),
    );

    const failure = createSupabaseCollectionRepository(client, USER_ID).load();

    await expect(failure).rejects.toThrow("No se pudo cargar tu colección desde Supabase.");
    const error: unknown = await failure.catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(PUBLISHABLE_KEY);
    expect((error as Error).cause).toMatchObject({ code: "PGRST301" });
  });

  it("rechaza si la red cae, después de los reintentos de una lectura", async () => {
    vi.useFakeTimers();
    const { client, fetch } = fakeBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    const failure = createSupabaseCollectionRepository(client, USER_ID).load();
    const assertion = expect(failure).rejects.toThrow("No se pudo cargar tu colección desde Supabase.");
    await vi.runAllTimersAsync();

    await assertion;
    // GET es idempotente: postgrest-js lo reintenta 3 veces antes de rendirse.
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("rechaza si la petición se aborta por tiempo", async () => {
    const { client } = fakeBackend(() => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });

    await expect(createSupabaseCollectionRepository(client, USER_ID).load()).rejects.toThrow(
      "No se pudo cargar tu colección desde Supabase.",
    );
  });
});

describe("createSupabaseCollectionRepository · upsert", () => {
  it("envía un POST con on_conflict, merge-duplicates, columnas uniformes y sin user_id", async () => {
    const { client, requests } = fakeBackend(() => new Response(null, { status: 201 }));

    await createSupabaseCollectionRepository(client, USER_ID).upsert([ACTIVE, DELETED]);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.method).toBe("POST");
    expect(request?.url.toString()).toBe(
      `${SUPABASE_URL}/rest/v1/collection_entries` +
        "?on_conflict=user_id%2Ccode" +
        "&columns=%22code%22%2C%22status%22%2C%22level%22%2C%22note%22%2C%22updated_at%22%2C%22deleted_at%22",
    );
    expect(request?.headers.get("Prefer")).toBe("resolution=merge-duplicates");
    expect(request?.headers.get("Content-Type")).toBe("application/json");
    expect(request?.body).toEqual([
      {
        code: "AK11001",
        status: "owned",
        level: 2,
        note: "Casi vacío",
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      {
        code: "AK11002",
        status: "wishlist",
        level: 3,
        note: null,
        updated_at: "2026-01-02T00:00:00.000Z",
        deleted_at: "2026-01-02T00:00:00.000Z",
      },
    ]);
  });

  it("con un lote vacío no hace ninguna petición", async () => {
    const { client, fetch } = fakeBackend(() => new Response(null, { status: 201 }));

    await createSupabaseCollectionRepository(client, USER_ID).upsert([]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("rechaza con un Error en español si PostgREST responde con error", async () => {
    const { client } = fakeBackend(() =>
      jsonResponse(
        { code: "23514", message: "new row violates check constraint", details: null, hint: null },
        400,
      ),
    );

    const failure = createSupabaseCollectionRepository(client, USER_ID).upsert([ACTIVE]);

    await expect(failure).rejects.toThrow("No se pudo guardar tu colección en Supabase.");
    await expect(failure).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("rechaza si la red cae (un POST no se reintenta)", async () => {
    const { client, fetch } = fakeBackend(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(createSupabaseCollectionRepository(client, USER_ID).upsert([ACTIVE])).rejects.toThrow(
      "No se pudo guardar tu colección en Supabase.",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("createSupabaseCollectionRepository · subscribe", () => {
  it("no notifica nada en esta fase y su cancelación no falla", async () => {
    const { client } = fakeBackend(() => new Response(null, { status: 201 }));
    const repository = createSupabaseCollectionRepository(client, USER_ID);
    const listener = vi.fn();

    const unsubscribe = repository.subscribe(listener);
    await repository.upsert([ACTIVE]);

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("createSupabaseRecipeRepository", () => {
  it("load pide las recetas del usuario ordenadas por id y descarta las inválidas", async () => {
    const deleted = { ...RECIPE, id: "orco-verde", deletedAt: "2026-01-03T00:00:00.000Z" };
    const rows = [
      { ...toRecipeRow(RECIPE), user_id: USER_ID, updated_at: "2026-01-01T00:00:00+00:00" },
      { ...toRecipeRow(deleted), user_id: USER_ID },
      { ...toRecipeRow(RECIPE), id: "rota", data: { name: "sin zonas" }, user_id: USER_ID },
    ];
    const { client, requests } = fakeBackend(() => pageResponse(rows, 0, 3));

    const loaded = await createSupabaseRecipeRepository(client, USER_ID).load();

    expect(loaded).toEqual([RECIPE, deleted]);
    expect(requests[0]?.url.pathname).toBe("/rest/v1/recipes");
    expect(requests[0]?.url.searchParams.get("user_id")).toBe(`eq.${USER_ID}`);
    expect(requests[0]?.url.searchParams.get("order")).toBe("id.asc");
  });

  it("upsert envía on_conflict=user_id,id y el resto de campos dentro de data", async () => {
    const { client, requests } = fakeBackend(() => new Response(null, { status: 201 }));

    await createSupabaseRecipeRepository(client, USER_ID).upsert([RECIPE]);

    const [request] = requests;
    expect(request?.url.toString()).toBe(
      `${SUPABASE_URL}/rest/v1/recipes` +
        "?on_conflict=user_id%2Cid" +
        "&columns=%22id%22%2C%22data%22%2C%22updated_at%22%2C%22deleted_at%22",
    );
    expect(request?.headers.get("Prefer")).toBe("resolution=merge-duplicates");
    expect(request?.body).toEqual([
      {
        id: "marine-azul",
        data: {
          name: "Marine espacial azul",
          subject: "Infantería de ciencia ficción",
          summary: "Esquema básico.",
          difficulty: "iniciacion",
          tags: [],
          zones: [],
        },
        updated_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    ]);
  });

  it("upsert con un lote vacío no hace ninguna petición", async () => {
    const { client, fetch } = fakeBackend(() => new Response(null, { status: 201 }));

    await createSupabaseRecipeRepository(client, USER_ID).upsert([]);

    expect(fetch).not.toHaveBeenCalled();
  });

  it("load y upsert rechazan con un Error en español si PostgREST responde con error", async () => {
    const { client } = fakeBackend(() =>
      jsonResponse({ code: "42501", message: "permission denied", details: null, hint: null }, 403),
    );
    const repository = createSupabaseRecipeRepository(client, USER_ID);

    await expect(repository.load()).rejects.toThrow("No se pudieron cargar tus recetas desde Supabase.");
    await expect(repository.upsert([RECIPE])).rejects.toThrow(
      "No se pudieron guardar tus recetas en Supabase.",
    );
  });

  it("subscribe no notifica nada y su cancelación no falla", () => {
    const { client } = fakeBackend(() => new Response(null, { status: 201 }));
    const unsubscribe = createSupabaseRecipeRepository(client, USER_ID).subscribe(vi.fn());

    expect(() => unsubscribe()).not.toThrow();
  });
});
