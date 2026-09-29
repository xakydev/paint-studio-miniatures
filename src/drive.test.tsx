import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

/** Async: el `act` asíncrono vacía la microtarea del `load` de los repositorios. */
async function render() {
  await act(async () => {
    root.render(<App />);
  });
}

const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const RECIPES_KEY = "paint-studio-miniatures:recipes:v1";
const DELETED_AT = "2026-01-02T00:00:00.000Z";

interface StoredEntry {
  code: string;
  status: string;
  level: number;
  updatedAt: string;
  deletedAt?: string;
}

function entry(code: string, status: string, deletedAt?: string): StoredEntry {
  return { code, status, level: 3, updatedAt: "2026-01-01T00:00:00.000Z", deletedAt };
}

function storeCollection(entries: StoredEntry[]) {
  localStorage.setItem(COLLECTION_KEY, JSON.stringify(entries));
}

function storedCollection(): StoredEntry[] {
  return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]") as StoredEntry[];
}

/** Desmonta y vuelve a montar la app: lo más parecido a recargar la página. */
async function remount() {
  act(() => {
    root.unmount();
  });
  root = createRoot(container);
  await render();
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
  it("busca una pintura en el catálogo y la marca como propia", async () => {
    await render();

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

  it("desde una receta manda lo que falta a la lista de compra", async () => {
    go("/recetas/space-marine-azul");
    await render();

    expect(container.textContent).toContain("Marine espacial azul");
    expect(container.textContent).toMatch(/Te faltan 20 de 20 referencias/);

    click(buttonWith("Añadir las que faltan a la lista de compra"));

    expect(container.textContent).toContain("20 por comprar");
  });

  it("propone un sustituto de tu armario cuando falta una referencia", async () => {
    // Ultramarine (AK11179) está en la receta; Dark Blue (AK11181) no, pero lo tienes.
    localStorage.setItem(
      "paint-studio-miniatures:collection:v1",
      JSON.stringify([
        { code: "AK11181", status: "owned", level: 3, updatedAt: new Date().toISOString() },
      ]),
    );
    go("/recetas/space-marine-azul");
    await render();

    expect(container.textContent).toContain("No la tienes");
    expect(container.textContent).toContain("Dark Blue (AK11181)");
  });

  it("la colección conserva lo marcado al navegar entre secciones", async () => {
    await render();

    const search = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    type(search, "AK11191");
    click(buttonWith("La tengo"));

    // Navegar como el usuario: pulsando el enlace, no reescribiendo la URL.
    click(linkWith("Mi colección"));

    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("Gold");
  });

  it("el buscador por color ordena por parecido real", async () => {
    go("/matcher");
    await render();

    const hex = container.querySelector<HTMLInputElement>('input[type="text"]')!;
    type(hex, "#1E357B");

    // Ese hex es exactamente AK11179: debe salir primero y con ΔE 0.
    expect(container.textContent).toContain("AK11179");
    expect(container.textContent).toContain("Indistinguible");
  });
});

describe("carga desde localStorage", () => {
  it("arranca con lo guardado, lo muestra y no lo pisa", async () => {
    const stored = [entry("AK11179", "owned"), entry("AK11191", "wishlist")];
    storeCollection(stored);
    go("/coleccion");

    await render();

    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("1 por comprar");
    expect(container.textContent).toContain("Ultramarine");
    // JSON ida y vuelta: `deletedAt: undefined` no se serializa.
    expect(storedCollection()).toEqual(JSON.parse(JSON.stringify(stored)));
  });
});

describe("registros borrados", () => {
  it("una pintura borrada no cuenta en el armario ni en la lista de compra", async () => {
    storeCollection([
      entry("AK11179", "owned", DELETED_AT),
      entry("AK11191", "wishlist", DELETED_AT),
    ]);
    go("/coleccion");
    await render();

    expect(container.textContent).toContain("0 en el armario");
    expect(container.textContent).toContain("0 por comprar");
    expect(container.textContent).not.toContain("Ultramarine");
  });

  it("una pintura borrada vuelve a faltar en la cobertura de la receta", async () => {
    storeCollection([entry("AK11179", "owned", DELETED_AT)]);
    go("/recetas/space-marine-azul");
    await render();

    expect(container.textContent).toMatch(/Te faltan 20 de 20 referencias/);
  });

  it("los sustitutos ignoran una pintura borrada del armario", async () => {
    // Gold sigue activa, así que hay sustitutos; Dark Blue está borrada.
    storeCollection([entry("AK11181", "owned", DELETED_AT), entry("AK11191", "owned")]);
    go("/recetas/space-marine-azul");
    await render();

    expect(container.textContent).toContain("No la tienes. Lo más parecido en tu armario");
    expect(container.textContent).not.toContain("Dark Blue (AK11181)");
  });

  it("borrar una receta propia que sustituía a una de semilla muestra la semilla", async () => {
    localStorage.setItem(
      RECIPES_KEY,
      JSON.stringify([
        {
          id: "space-marine-azul",
          name: "Marine propio",
          subject: "Infantería",
          summary: "Versión propia.",
          difficulty: "iniciacion",
          tags: [],
          zones: [],
          updatedAt: "2026-01-01T00:00:00.000Z",
          deletedAt: DELETED_AT,
        },
      ]),
    );
    go("/recetas");
    await render();

    expect(container.textContent).toContain("Marine espacial azul");
    expect(container.textContent).not.toContain("Marine propio");

    go("/recetas/space-marine-azul");
    await remount();
    expect(container.textContent).toContain("Marine espacial azul");
    expect(container.textContent).not.toContain("Esa receta no existe");
    expect(container.textContent).toContain("Armadura");
  });

  it("quitar una pintura la deja en localStorage con deletedAt", async () => {
    storeCollection([entry("AK11191", "wishlist")]);
    go("/coleccion");
    await render();

    click(buttonWith("Lista de compra"));
    click(buttonWith("Quitar"));

    expect(container.textContent).toContain("0 por comprar");
    const [stored] = storedCollection();
    expect(stored?.code).toBe("AK11191");
    expect(stored?.deletedAt).toBeDefined();
  });

  it("vaciar la colección y recargar deja el armario vacío y las entradas borradas", async () => {
    storeCollection([entry("AK11179", "owned"), entry("AK11181", "owned")]);
    go("/coleccion");
    await render();
    expect(container.textContent).toContain("2 en el armario");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    click(buttonWith("Vaciar"));
    confirm.mockRestore();

    await remount();

    expect(container.textContent).toContain("0 en el armario");
    const stored = storedCollection();
    expect(stored.map((e) => e.code).sort()).toEqual(["AK11179", "AK11181"]);
    expect(stored.every((e) => e.deletedAt !== undefined)).toBe(true);
  });

  it("importar un respaldo sin una pintura activa la marca como borrada", async () => {
    storeCollection([entry("AK11179", "owned"), entry("AK11181", "owned")]);
    go("/coleccion");
    await render();

    const backup = {
      version: 1,
      exportedAt: "2026-03-01T00:00:00.000Z",
      collection: [entry("AK11179", "owned")],
      recipes: [],
    };
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File([JSON.stringify(backup)], "respaldo.json", {
      type: "application/json",
    });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Importadas 1 pinturas.");
    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).not.toContain("Dark Blue");
    const removed = storedCollection().find((e) => e.code === "AK11181");
    expect(removed?.deletedAt).toBeDefined();

    // Y sigue así al recargar.
    await remount();
    expect(container.textContent).toContain("1 en el armario");
  });
});
