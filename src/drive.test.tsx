import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

// Sin esto React avisa de que el entorno no espera llamadas a act().
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** Conduce la app como lo haría una persona: teclea, pulsa y navega. */
let container: HTMLDivElement;
let root: Root;

const go = (path: string) => window.history.pushState({}, "", path);

function render() {
  act(() => {
    root.render(<App />);
  });
}

/** React ignora un `value` asignado a pelo: hay que pasar por el setter nativo. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  act(() => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(el: Element) {
  act(() => {
    // cancelable: si no, el preventDefault() de <Link> no surte efecto y jsdom
    // intenta seguir el href como una navegación de verdad.
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

function linkWith(text: string): HTMLAnchorElement {
  const found = [...container.querySelectorAll("a")].find(
    (a) => a.textContent?.trim() === text,
  );
  if (!found) throw new Error(`No hay enlace con el texto "${text}"`);
  return found;
}

function buttonWith(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  );
  if (!found) throw new Error(`No hay botón con el texto "${text}"`);
  return found;
}

beforeEach(() => {
  localStorage.clear();
  go("/");
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

describe("sesión de usuario", () => {
  it("busca una pintura en el catálogo y la marca como propia", () => {
    render();

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    type(search, "ultramarine");

    expect(container.textContent).toContain("Ultramarine");
    expect(container.textContent).toContain("AK11179");
    expect(container.textContent).toMatch(/1 de 286 referencias/);

    // El armario empieza vacío y la cabecera lo refleja.
    expect(container.textContent).toContain("0 en armario");

    click(buttonWith("La tengo"));
    expect(container.textContent).toContain("1 en armario");
  });

  it("desde una receta manda lo que falta a la lista de compra", () => {
    go("/recetas/space-marine-azul");
    render();

    expect(container.textContent).toContain("Marine espacial azul");
    expect(container.textContent).toMatch(/Te faltan 20 de 20 referencias/);

    click(buttonWith("Añadir las que faltan a la lista de compra"));

    expect(container.textContent).toContain("20 por comprar");
  });

  it("propone un sustituto de tu armario cuando falta una referencia", () => {
    // Ultramarine (AK11179) está en la receta; Dark Blue (AK11181) no, pero lo tienes.
    localStorage.setItem(
      "paint-studio-miniatures:collection:v1",
      JSON.stringify([
        { code: "AK11181", status: "owned", level: 3, updatedAt: new Date().toISOString() },
      ]),
    );
    go("/recetas/space-marine-azul");
    render();

    expect(container.textContent).toContain("No la tienes");
    expect(container.textContent).toContain("Dark Blue (AK11181)");
  });

  it("la colección conserva lo marcado al navegar entre secciones", () => {
    render();

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    type(search, "AK11191");
    click(buttonWith("La tengo"));

    // Navegar como el usuario: pulsando el enlace, no reescribiendo la URL.
    click(linkWith("Mi colección"));

    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("Gold");
  });

  it("el buscador por color ordena por parecido real", () => {
    go("/matcher");
    render();

    const hex = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    type(hex, "#1E357B");

    // Ese hex es exactamente AK11179: debe salir primero y con ΔE 0.
    expect(container.textContent).toContain("AK11179");
    expect(container.textContent).toContain("Indistinguible");
  });
});
