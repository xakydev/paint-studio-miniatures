import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getPaint } from "../../data/static/catalogSource";
import type { Paint } from "../../domain/types";
import { PaintPhoto } from "./PaintPhoto";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const ULTRAMARINE = getPaint("AK11179") as Paint;

function render(url: string | null) {
  act(() => {
    root.render(<PaintPhoto paint={ULTRAMARINE} url={url} />);
  });
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("PaintPhoto", () => {
  it("con URL pinta la foto con carga diferida, tamaño fijo y texto alternativo", () => {
    render("/paints/AK11179.webp");

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("/paints/AK11179.webp");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
    // Ancho y alto fijos: el hueco se reserva antes de que llegue la imagen y
    // la cuadrícula del catálogo no salta.
    expect(img?.getAttribute("width")).toBe("320");
    expect(img?.getAttribute("height")).toBe("320");
    expect(img?.getAttribute("alt")).toBe("Bote de Ultramarine (AK11179)");
  });

  it("con foto no pinta además el swatch de color", () => {
    render("/paints/AK11179.webp");

    expect(container.querySelector('[style*="background-color"]')).toBeNull();
  });

  it("sin URL pinta el swatch de siempre, con el hex de la pintura", () => {
    render(null);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(ULTRAMARINE.hex);
  });

  it("si la imagen falla al cargar vuelve al swatch", () => {
    render("/paints/AK11179.webp");
    const img = container.querySelector("img");

    act(() => {
      img?.dispatchEvent(new Event("error"));
    });

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(ULTRAMARINE.hex);
  });
});
