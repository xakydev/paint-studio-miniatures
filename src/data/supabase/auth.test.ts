import { createClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../ports/AuthGateway";
import type { Database } from "./database.types";
import { createSupabaseAuthGateway } from "./auth";

const SUPABASE_URL = "http://127.0.0.1:54321";
const PUBLISHABLE_KEY = "sb_publishable_clave-de-prueba";
const ACCESS_TOKEN = "token-de-acceso-de-prueba";
const ALICE = { id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", email: "alice@example.com" };

interface RecordedRequest {
  method: string;
  url: URL;
  body: unknown;
}

type Responder = (request: RecordedRequest) => Response | Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Sesión con la forma que guarda auth-js; caduca dentro de una hora. */
function sessionFor(user: { id: string; email: string }, accessToken = ACCESS_TOKEN) {
  return {
    access_token: accessToken,
    refresh_token: `refresco-${accessToken}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: user.id,
      email: user.email,
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

let storageKeyCounter = 0;

/**
 * supabase-js real con un `fetch` falso y localStorage de jsdom. `withSession`
 * deja guardada una sesión antes de crear el cliente, como tras volver del
 * enlace mágico y recargar.
 */
function fakeAuth(responder: Responder, withSession?: ReturnType<typeof sessionFor>) {
  storageKeyCounter += 1;
  const storageKey = `test-auth-${storageKeyCounter}`;
  if (withSession) localStorage.setItem(storageKey, JSON.stringify(withSession));

  const requests: RecordedRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request: RecordedRequest = {
      method: init?.method ?? "GET",
      url: new URL(input instanceof Request ? input.url : input.toString()),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    requests.push(request);
    return responder(request);
  });
  const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY, {
    global: { fetch },
    auth: { storageKey, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { client, gateway: createSupabaseAuthGateway(client.auth), fetch, requests };
}

/** Recoge lo que emite `onUserChange` y espera a que llegue el n-ésimo aviso. */
function collectUsers() {
  const users: (SessionUser | null)[] = [];
  const listener = vi.fn((user: SessionUser | null) => {
    users.push(user);
  });
  return { users, listener };
}

afterEach(() => {
  localStorage.clear();
});

describe("createSupabaseAuthGateway · onUserChange", () => {
  it("sin sesión guardada emite null una vez", async () => {
    const { gateway } = fakeAuth(() => jsonResponse({}));
    const { users, listener } = collectUsers();

    gateway.onUserChange(listener);

    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(users).toEqual([null]);
  });

  it("con sesión guardada emite el usuario una sola vez aunque lleguen SIGNED_IN e INITIAL_SESSION", async () => {
    const { client, gateway } = fakeAuth(() => jsonResponse({}), sessionFor(ALICE));
    const events: string[] = [];
    client.auth.onAuthStateChange((event) => {
      events.push(event);
    });
    const { users, listener } = collectUsers();

    gateway.onUserChange(listener);

    await vi.waitFor(() => expect(events).toContain("INITIAL_SESSION"));
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());
    expect(users).toEqual([ALICE]);
  });

  it("un refresco del token del mismo usuario no vuelve a avisar", async () => {
    const refreshed = sessionFor(ALICE, "token-refrescado");
    const { client, gateway, requests } = fakeAuth(() => jsonResponse(refreshed), sessionFor(ALICE));
    const events: string[] = [];
    client.auth.onAuthStateChange((event) => {
      events.push(event);
    });
    const { users, listener } = collectUsers();
    gateway.onUserChange(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    const { error } = await client.auth.refreshSession();

    expect(error).toBeNull();
    expect(requests.at(-1)?.url.searchParams.get("grant_type")).toBe("refresh_token");
    await vi.waitFor(() => expect(events).toContain("TOKEN_REFRESHED"));
    expect(users).toEqual([ALICE]);
  });

  it("al cerrar sesión emite null, y tras cancelar la suscripción ya no avisa", async () => {
    const { gateway } = fakeAuth(() => new Response(null, { status: 204 }), sessionFor(ALICE));
    const { users, listener } = collectUsers();
    const unsubscribe = gateway.onUserChange(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    await gateway.signOut();
    await vi.waitFor(() => expect(users).toEqual([ALICE, null]));

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  it("tras cancelar la suscripción no avisa de un cierre de sesión", async () => {
    const { gateway } = fakeAuth(() => new Response(null, { status: 204 }), sessionFor(ALICE));
    const { users, listener } = collectUsers();
    const unsubscribe = gateway.onUserChange(listener);
    await vi.waitFor(() => expect(listener).toHaveBeenCalled());

    unsubscribe();
    await gateway.signOut();

    expect(users).toEqual([ALICE]);
  });
});

describe("createSupabaseAuthGateway · requestMagicLink", () => {
  it("pide el OTP por correo con la URL de vuelta que recibe", async () => {
    const { gateway, requests } = fakeAuth(() => jsonResponse({}));

    await gateway.requestMagicLink("alice@example.com", "http://localhost:5173/");

    const otp = requests.find(({ url }) => url.pathname === "/auth/v1/otp");
    expect(otp?.method).toBe("POST");
    expect(otp?.url.searchParams.get("redirect_to")).toBe("http://localhost:5173/");
    expect(otp?.body).toMatchObject({
      email: "alice@example.com",
      create_user: true,
      // Flujo implícito: sin PKCE, el enlace funciona abierto en otro navegador.
      code_challenge: null,
    });
  });

  it("rechaza con un Error en español si Supabase responde con error, sin filtrar la clave", async () => {
    const { gateway } = fakeAuth(() =>
      jsonResponse({ code: 429, error_code: "over_email_send_rate_limit", msg: "rate limit" }, 429),
    );

    const failure = gateway.requestMagicLink("alice@example.com", "http://localhost:5173/");

    await expect(failure).rejects.toThrow("No se pudo enviar el enlace de acceso.");
    const error: unknown = await failure.catch((reason: unknown) => reason);
    expect((error as Error).message).not.toContain(PUBLISHABLE_KEY);
    expect((error as Error).cause).toBeDefined();
  });

  it("rechaza si la red cae", async () => {
    const { gateway } = fakeAuth(() => {
      throw new TypeError("Failed to fetch");
    });

    await expect(
      gateway.requestMagicLink("alice@example.com", "http://localhost:5173/"),
    ).rejects.toThrow("No se pudo enviar el enlace de acceso.");
  });
});

describe("createSupabaseAuthGateway · signOut", () => {
  it("cierra la sesión solo en este dispositivo (scope=local)", async () => {
    const { gateway, requests } = fakeAuth(() => new Response(null, { status: 204 }), sessionFor(ALICE));

    await gateway.signOut();

    const logout = requests.find(({ url }) => url.pathname === "/auth/v1/logout");
    expect(logout?.method).toBe("POST");
    expect(logout?.url.searchParams.get("scope")).toBe("local");
  });

  it("rechaza con un Error en español si el servidor falla, sin filtrar el token", async () => {
    const { gateway } = fakeAuth(
      () => jsonResponse({ code: 500, msg: "boom" }, 500),
      sessionFor(ALICE),
    );

    const failure = gateway.signOut();

    await expect(failure).rejects.toThrow("No se pudo cerrar la sesión.");
    const error: unknown = await failure.catch((reason: unknown) => reason);
    expect((error as Error).message).not.toContain(ACCESS_TOKEN);
  });
});
