import { describe, expect, it } from "vitest";

import { createManifestPaintImages, manifestPaintImages } from "./manifestPaintImages";

describe("createManifestPaintImages", () => {
  it("devuelve la URL de un código con foto", () => {
    const images = createManifestPaintImages({ AK11179: "/paints/AK11179.webp" });

    expect(images.photoUrl("AK11179")).toBe("/paints/AK11179.webp");
  });

  it("devuelve null para un código del catálogo sin foto", () => {
    const images = createManifestPaintImages({ AK11179: "/paints/AK11179.webp" });

    expect(images.photoUrl("AK11001")).toBeNull();
  });

  it("con el manifiesto vacío no hay foto de nada, y no lanza", () => {
    const images = createManifestPaintImages({});

    expect(images.photoUrl("AK11179")).toBeNull();
    expect(images.photoUrl("")).toBeNull();
  });

  it("ignora un código que no está en el catálogo, aunque el manifiesto lo traiga", () => {
    const images = createManifestPaintImages({ AK99999: "/paints/AK99999.webp" });

    expect(images.photoUrl("AK99999")).toBeNull();
  });

  it("ignora una URL que el servidor de fotos no serviría", () => {
    // Misma lista blanca que el middleware: si no casa, sería un 404 seguro.
    const images = createManifestPaintImages({
      AK11179: "https://ak-interactive.com/wp-content/uploads/AK11179.jpg",
      AK11001: "/paints/AK11002.webp",
    });

    expect(images.photoUrl("AK11179")).toBeNull();
    expect(images.photoUrl("AK11001")).toBeNull();
  });

  it("no confunde una clave heredada del prototipo con una foto", () => {
    const images = createManifestPaintImages({});

    expect(images.photoUrl("toString")).toBeNull();
    expect(images.photoUrl("__proto__")).toBeNull();
  });
});

describe("manifestPaintImages", () => {
  it("en los tests (alias al manifiesto vacío) no ofrece ninguna foto", () => {
    expect(manifestPaintImages.photoUrl("AK11179")).toBeNull();
  });
});
