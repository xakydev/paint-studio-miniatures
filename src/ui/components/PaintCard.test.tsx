import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createManifestPaintImages } from "../../data/images/manifestPaintImages";
import {
  createInMemoryCollectionRepository,
  createInMemoryRecipeRepository,
} from "../../data/memory/inMemoryRepositories";
import type { PaintImages } from "../../data/ports/PaintImages";
import { getPaint } from "../../data/static/catalogSource";
import type { Paint } from "../../domain/types";
import { LibraryProvider } from "../hooks/LibraryProvider";
import { PaintImagesContext } from "../hooks/paintImagesContext";
import { PaintCard } from "./PaintCard";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const ULTRAMARINE = getPaint("AK11179") as Paint;

async function mount(card: ReactNode) {
  const collection = createInMemoryCollectionRepository();
  const recipes = createInMemoryRecipeRepository();
  await act(async () => {
    root.render(
      <LibraryProvider collectionRepository={collection} recipeRepository={recipes}>
        {card}
      </LibraryProvider>,
    );
  });
  await act(async () => {
    collection.resolveLoad([]);
    recipes.resolveLoad([]);
  });
}

function withImages(images: PaintImages, card: ReactNode) {
  return <PaintImagesContext value={images}>{card}</PaintImagesContext>;
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

describe("PaintCard y la foto local", () => {
  it("sin proveedor de fotos se ve como siempre: swatch con el hex", async () => {
    await mount(<PaintCard paint={ULTRAMARINE} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(ULTRAMARINE.hex);
  });

  it("si el puerto ofrece foto, la tarjeta la muestra", async () => {
    const images = createManifestPaintImages({ AK11179: "/paints/AK11179.webp" });
    await mount(withImages(images, <PaintCard paint={ULTRAMARINE} />));

    expect(container.querySelector("img")?.getAttribute("src")).toBe("/paints/AK11179.webp");
  });

  it("con el manifiesto vacío (lo que hay en producción) muestra el swatch y no pide ninguna imagen", async () => {
    await mount(withImages(createManifestPaintImages({}), <PaintCard paint={ULTRAMARINE} />));

    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain(ULTRAMARINE.hex);
  });

  it("la tarjeta solo atiende al puerto: si este dice que no hay foto, no hay foto", async () => {
    // Aunque la foto existiera en disco, la tarjeta no busca por su cuenta.
    const images: PaintImages = { photoUrl: () => null };
    await mount(withImages(images, <PaintCard paint={ULTRAMARINE} />));

    expect(container.querySelector("img")).toBeNull();
  });
});
