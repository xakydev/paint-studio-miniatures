import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeAuthGateway, type FakeAuthGateway } from "../../data/memory/inMemoryBackend";
import type { AuthGateway } from "../../data/ports/AuthGateway";
import { SessionProvider } from "../hooks/SessionProvider";
import { LoginForm } from "./LoginForm";
import { SessionMenu } from "./SessionMenu";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ANA = { id: "user-ana", email: "ana@example.com" };

let container: HTMLDivElement;
let root: Root;
let auth: FakeAuthGateway;

async function mount(content: ReactNode, gateway: AuthGateway | null = auth) {
  await act(async () => {
    root.render(<SessionProvider auth={gateway}>{content}</SessionProvider>);
  });
}

/** React ignora un `value` asignado a pelo: hay que pasar por el setter nativo. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")!
    .set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Async: espera a que termine lo que lance el clic (enviar, cerrar sesión). */
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function buttonWith(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`No hay botón con el texto "${text}"`);
  return found;
}

function emailInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="email"]');
  if (!input) throw new Error("No hay campo de correo");
  return input;
}

beforeEach(() => {
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
  vi.restoreAllMocks();
});

describe("LoginForm", () => {
  beforeEach(async () => {
    await mount(<LoginForm />);
    act(() => auth.emit(null));
  });

  it("un correo no válido no pide el enlace y lo explica", async () => {
    type(emailInput(), "ana-sin-arroba");
    await click(buttonWith("Enviar enlace"));

    expect(auth.magicLinkRequests).toEqual([]);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "Escribe un correo válido, como nombre@ejemplo.com.",
    );
  });

  it("pide el enlace con la raíz de la app, se bloquea mientras envía y luego dice que revises el correo", async () => {
    auth.holdMagicLinks();
    type(emailInput(), "  ana@example.com ");
    await click(buttonWith("Enviar enlace"));

    expect(auth.magicLinkRequests).toEqual([
      { email: "ana@example.com", redirectTo: `${window.location.origin}/` },
    ]);
    expect(emailInput().disabled).toBe(true);
    expect(buttonWith("Enviando…").disabled).toBe(true);

    await act(async () => auth.settleMagicLink());

    expect(container.textContent).toContain(
      "Te hemos enviado un enlace a ana@example.com. Revisa tu correo y ábrelo para entrar.",
    );
    // Ya no se puede volver a pedir mientras se espera.
    expect(container.querySelector("form")).toBeNull();
  });

  it("si el envío falla, muestra el error en español y deja reintentar", async () => {
    auth.holdMagicLinks();
    type(emailInput(), "ana@example.com");
    await click(buttonWith("Enviar enlace"));
    await act(async () => auth.settleMagicLink(new Error("No se pudo enviar el enlace de acceso.")));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "No se pudo enviar el enlace de acceso.",
    );
    expect(emailInput().disabled).toBe(false);
    expect(buttonWith("Enviar enlace").disabled).toBe(false);
  });
});

describe("SessionMenu", () => {
  it("sin backend no ofrece entrar ni cerrar sesión", async () => {
    await mount(<SessionMenu />, null);
    expect(container.textContent).toBe("");
  });

  it("mientras se resuelve la sesión no muestra nada", async () => {
    await mount(<SessionMenu />);
    expect(container.textContent).toBe("");
  });

  it("sin sesión ofrece «Entrar», que abre el formulario", async () => {
    await mount(<SessionMenu />);
    act(() => auth.emit(null));

    expect(container.textContent).not.toContain("Cerrar sesión");
    await click(buttonWith("Entrar"));
    expect(emailInput()).toBeTruthy();
  });

  it("con sesión muestra el correo y «Cerrar sesión», que la cierra", async () => {
    await mount(<SessionMenu />);
    act(() => auth.emit(ANA));

    expect(container.textContent).toContain("ana@example.com");
    expect(container.textContent).not.toContain("Entrar");

    await click(buttonWith("Cerrar sesión"));
    expect(auth.signOutCount).toBe(1);
    expect(buttonWith("Entrar")).toBeTruthy();
  });

  it("si cerrar sesión falla, lo dice sin perder la sesión", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    auth.failSignOut(new Error("No se pudo cerrar la sesión."));
    await mount(<SessionMenu />);
    act(() => auth.emit(ANA));

    await click(buttonWith("Cerrar sesión"));

    expect(container.querySelector('[role="alert"]')?.textContent).toBe(
      "No se pudo cerrar la sesión.",
    );
    expect(container.textContent).toContain("ana@example.com");
  });
});
