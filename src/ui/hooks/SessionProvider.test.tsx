import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createFakeAuthGateway, type FakeAuthGateway } from "../../data/memory/inMemoryBackend";
import type { AuthGateway } from "../../data/ports/AuthGateway";
import { SESSION_STATUS, useSession, type SessionApi } from "./sessionContext";
import { SessionProvider } from "./SessionProvider";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ANA = { id: "user-ana", email: "ana@example.com" };

let container: HTMLDivElement;
let root: Root;
let auth: FakeAuthGateway;
let session: SessionApi | undefined;

function Probe() {
  const current = useSession();
  useEffect(() => {
    session = current;
  });
  return <p>{current.status}</p>;
}

async function mount(gateway: AuthGateway | null) {
  await act(async () => {
    root.render(
      <SessionProvider auth={gateway}>
        <Probe />
      </SessionProvider>,
    );
  });
}

function currentSession(): SessionApi {
  if (!session) throw new Error("El Provider aún no ha renderizado a sus hijos.");
  return session;
}

beforeEach(() => {
  session = undefined;
  auth = createFakeAuthGateway();
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

describe("SessionProvider", () => {
  it("sin backend está DISABLED y sin usuario", async () => {
    await mount(null);
    expect(currentSession().status).toBe(SESSION_STATUS.DISABLED);
    expect(currentSession().user).toBeNull();
  });

  it("con backend está RESOLVING hasta el primer aviso", async () => {
    await mount(auth);
    expect(currentSession().status).toBe(SESSION_STATUS.RESOLVING);
    expect(auth.listenerCount).toBe(1);
  });

  it("el primer aviso sin usuario pasa a SIGNED_OUT", async () => {
    await mount(auth);
    act(() => auth.emit(null));
    expect(currentSession().status).toBe(SESSION_STATUS.SIGNED_OUT);
    expect(currentSession().user).toBeNull();
  });

  it("un aviso con usuario pasa a SIGNED_IN, y cerrar sesión vuelve a SIGNED_OUT", async () => {
    await mount(auth);
    act(() => auth.emit(ANA));
    expect(currentSession().status).toBe(SESSION_STATUS.SIGNED_IN);
    expect(currentSession().user).toEqual(ANA);

    await act(async () => {
      await currentSession().signOut();
    });
    expect(auth.signOutCount).toBe(1);
    expect(currentSession().status).toBe(SESSION_STATUS.SIGNED_OUT);
    expect(currentSession().user).toBeNull();
  });

  it("pide el enlace con la raíz de la app como vuelta", async () => {
    await mount(auth);
    act(() => auth.emit(null));
    await act(async () => {
      await currentSession().requestMagicLink("ana@example.com");
    });
    expect(auth.magicLinkRequests).toEqual([
      { email: "ana@example.com", redirectTo: `${window.location.origin}/` },
    ]);
  });

  it("se desuscribe al desmontar", async () => {
    await mount(auth);
    act(() => {
      root.unmount();
    });
    expect(auth.listenerCount).toBe(0);
    root = createRoot(container);
  });
});
