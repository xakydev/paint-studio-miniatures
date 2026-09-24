import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { App } from "./App";

/**
 * Humo, no cobertura: comprueba que el árbol entero monta —proveedor, router y
 * las cuatro páginas— con datos reales. El build y los tests de lógica no
 * detectan un contexto mal enchufado o una ruta rota.
 */
let container: HTMLDivElement;
let root: Root;

function navigate(path: string) {
  window.history.pushState({}, "", path);
}

beforeEach(() => {
  localStorage.clear();
  navigate("/");
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

function render() {
  act(() => {
    root.render(<App />);
  });
}

describe("App", () => {
  it("monta el catálogo en la ruta raíz", () => {
    render();
    expect(container.textContent).toContain("Catálogo AK Interactive");
    expect(container.textContent).toContain("1130 referencias");
  });

  it("monta la lista de recetas", () => {
    navigate("/recetas");
    render();
    expect(container.textContent).toContain("Marine espacial azul");
  });

  it("monta el detalle de una receta con sus zonas", () => {
    navigate("/recetas/space-marine-azul");
    render();
    expect(container.textContent).toContain("Armadura");
    expect(container.textContent).toContain("Ultramarine");
    expect(container.textContent).toContain("Te faltan");
  });

  it("monta el buscador por color con su mejor coincidencia", () => {
    navigate("/matcher");
    render();
    expect(container.textContent).toContain("Buscar pintura por color");
    // El color inicial es exactamente el hex de AK11434 Red Brown.
    expect(container.textContent).toContain("AK11434");
  });

  it("monta la colección vacía con su mensaje de ayuda", () => {
    navigate("/coleccion");
    render();
    expect(container.textContent).toContain("0 en el armario");
    expect(container.textContent).toContain("Todavía no has marcado ninguna");
  });

  it("recupera de localStorage lo que ya estaba guardado", () => {
    localStorage.setItem(
      "paint-studio-miniatures:collection:v1",
      JSON.stringify([
        {
          code: "AK11179",
          status: "owned",
          level: 3,
          updatedAt: new Date().toISOString(),
        },
      ]),
    );

    navigate("/coleccion");
    render();
    expect(container.textContent).toContain("1 en el armario");
    expect(container.textContent).toContain("Ultramarine");
  });
});
