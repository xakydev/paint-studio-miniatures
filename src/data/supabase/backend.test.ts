import { afterEach, describe, expect, it, vi } from "vitest";

import { OWNERSHIP } from "../../domain/types";
import type { CollectionEntry } from "../../domain/types";
import { createSupabaseBackend } from "./backend";

const PUBLISHABLE_KEY = "sb_publishable_clave-de-prueba";

const ENTRY: CollectionEntry = {
  code: "AK11001",
  status: OWNERSHIP.OWNED,
  level: 3,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

let projectCounter = 0;

/**
 * Cada backend crea su cliente con la clave de almacenamiento por defecto,
 * que sale del host: un proyecto distinto por test evita el aviso de
 * auth-js por instancias múltiples.
 */
function envFor(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  projectCounter += 1;
  return {
    VITE_SUPABASE_URL: `https://proyecto-${projectCounter}.supabase.co`,
    VITE_SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("createSupabaseBackend", () => {
  it.each([
    ["falta la URL", { VITE_SUPABASE_URL: undefined }],
    ["falta la clave", { VITE_SUPABASE_PUBLISHABLE_KEY: undefined }],
    ["la URL está vacía", { VITE_SUPABASE_URL: "" }],
    ["la clave está vacía", { VITE_SUPABASE_PUBLISHABLE_KEY: "" }],
    ["la clave solo tiene espacios", { VITE_SUPABASE_PUBLISHABLE_KEY: "   " }],
    ["la URL no es texto", { VITE_SUPABASE_URL: 42 }],
  ])("devuelve null si %s: la app sigue en modo local", (_case, overrides) => {
    expect(createSupabaseBackend(envFor(overrides))).toBeNull();
  });

  it("devuelve null y avisa en consola si la URL no es válida: una errata no tumba la app", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(createSupabaseBackend(envFor({ VITE_SUPABASE_URL: "no-es-una-url" }))).toBeNull();
      expect(consoleError).toHaveBeenCalledOnce();
      // El aviso nombra la variable, pero nunca la clave.
      const logged = consoleError.mock.calls.flat().map(String).join(" ");
      expect(logged).toContain("VITE_SUPABASE_URL");
      expect(logged).not.toContain(String(envFor().VITE_SUPABASE_PUBLISHABLE_KEY));
    } finally {
      consoleError.mockRestore();
    }
  });

  it("con las dos variables devuelve un backend con el puerto de autenticación", () => {
    const backend = createSupabaseBackend(envFor());

    expect(backend).not.toBeNull();
    expect(typeof backend?.auth.onUserChange).toBe("function");
    expect(typeof backend?.auth.requestMagicLink).toBe("function");
    expect(typeof backend?.auth.signOut).toBe("function");
  });

  it("repositoriesFor devuelve la misma instancia para el mismo usuario", () => {
    const backend = createSupabaseBackend(envFor());

    const first = backend?.repositoriesFor("usuario-a");
    const again = backend?.repositoriesFor("usuario-a");

    expect(again).toBe(first);
    expect(again?.collection).toBe(first?.collection);
    expect(again?.recipes).toBe(first?.recipes);
  });

  it("repositoriesFor devuelve otra instancia para otro usuario", () => {
    const backend = createSupabaseBackend(envFor());

    expect(backend?.repositoriesFor("usuario-b")).not.toBe(backend?.repositoriesFor("usuario-a"));
  });

  it("los repositorios hablan con la URL configurada, con la clave publicable y filtrando por el usuario", async () => {
    const fetch = vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Range": "*/0" } }));
    vi.stubGlobal("fetch", fetch);
    const env = envFor();
    const backend = createSupabaseBackend(env);

    await backend?.repositoriesFor("usuario-a").collection.load();

    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(input);
    expect(url.origin).toBe(env.VITE_SUPABASE_URL);
    expect(url.pathname).toBe("/rest/v1/collection_entries");
    expect(url.searchParams.get("user_id")).toBe("eq.usuario-a");
    expect(new Headers(init.headers).get("apikey")).toBe(PUBLISHABLE_KEY);
  });

  it("una petición que no responde se aborta por tiempo y el guardado rechaza", async () => {
    vi.useFakeTimers();
    // Un fetch que nunca responde salvo que lo aborten, como una red colgada.
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const backend = createSupabaseBackend(envFor());

    const failure = backend?.repositoriesFor("usuario-a").collection.upsert([ENTRY]);
    const assertion = expect(failure).rejects.toThrow("No se pudo guardar tu colección en Supabase.");
    await vi.advanceTimersByTimeAsync(15_000);

    await assertion;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
