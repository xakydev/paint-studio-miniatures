import { describe, expect, it } from "vitest";

import { findAssetLeaks, type BundleFile } from "./assetLeaks.ts";

/** Un fichero de texto del bundle; los binarios llevan `text: null`. */
function text(path: string, content: string): BundleFile {
  return { path, text: content };
}

function binary(path: string): BundleFile {
  return { path, text: null };
}

describe("findAssetLeaks", () => {
  it("un dist limpio (JS, CSS, HTML y SVG) no tiene hallazgos", () => {
    const files = [
      text("index.html", "<!doctype html><div id=root></div>"),
      text("assets/index-abc.js", "console.log('hola')"),
      text("assets/index-abc.css", "body{color:red}"),
      text("favicon.svg", "<svg/>"),
    ];

    expect(findAssetLeaks(files)).toEqual([]);
  });

  it("cualquier imagen raster fuera de la lista blanca es una fuga, se llame como se llame", () => {
    // La lista blanca pilla también una foto renombrada: un patrón AK* no lo haría.
    const leaks = findAssetLeaks([binary("assets/bote-renombrado.webp"), binary("x.JPG")]);

    expect(leaks.map((leak) => leak.path)).toEqual(["assets/bote-renombrado.webp", "x.JPG"]);
  });

  it("detecta todos los formatos raster: webp, jpg, jpeg, png, avif y gif", () => {
    const files = ["a.webp", "b.jpg", "c.jpeg", "d.png", "e.avif", "f.gif"].map(binary);

    expect(findAssetLeaks(files)).toHaveLength(6);
  });

  it("un raster de la lista blanca no cuenta como fuga", () => {
    expect(findAssetLeaks([binary("icono.png")], ["icono.png"])).toEqual([]);
  });

  it("un nombre de fichero que empieza por AK seguido de dígito es una fuga, aunque no sea raster", () => {
    const leaks = findAssetLeaks([text("paints/AK11179.svg", "<svg/>")]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.path).toBe("paints/AK11179.svg");
  });

  it("un texto que menciona local-assets es una fuga: el bundle apunta a la carpeta privada", () => {
    const leaks = findAssetLeaks([text("assets/index.js", 'fetch("/local-assets/paints/x")')]);

    expect(leaks).toHaveLength(1);
    expect(leaks[0]?.reason).toContain("local-assets");
  });

  it("un texto que enlaza al CDN de imágenes de AK es una fuga", () => {
    const leaks = findAssetLeaks([
      text("assets/index.js", '"https://ak-interactive.com/wp-content/uploads/2026/03/AK11194.jpg"'),
    ]);

    expect(leaks).toHaveLength(1);
  });

  it("el motivo nombra el fichero y la causa, sin volcar el contenido", () => {
    const content = "x".repeat(10_000) + "local-assets";
    const [leak] = findAssetLeaks([text("assets/grande.js", content)]);

    expect(leak?.path).toBe("assets/grande.js");
    expect(leak?.reason.length).toBeLessThan(200);
  });

  it("un fichero con varias causas aparece una sola vez", () => {
    const leaks = findAssetLeaks([binary("AK1.webp")]);

    expect(leaks).toHaveLength(1);
  });
});
