// @vitest-environment node
/**
 * Núcleo puro del script de fotos de AK: parseo de sitemaps, emparejamiento
 * con el catálogo, cobertura, plan de descargas y reintentos de red. Nada de
 * I/O real aquí: `fetch` y `sleep` se inyectan, y el sistema de ficheros se
 * simula con funciones puras. La cáscara que hace las peticiones y escribe
 * en disco es `fetch-images.ts`.
 */
import { describe, expect, it, vi } from "vitest";

import {
  coverage,
  fetchWithRetry,
  isAkImagesFile,
  isLocalManifest,
  matchCatalog,
  MIN_COVERAGE,
  parseImageLocs,
  parseSitemapIndex,
  planDownloads,
  type LocalManifest,
} from "./paintImagesCore.ts";

describe("parseSitemapIndex", () => {
  const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap>
<loc>https://ak-interactive.com/product-sitemap1.xml</loc>
<lastmod>2026-03-01T00:00:00+00:00</lastmod>
</sitemap>
<sitemap>
<loc>https://ak-interactive.com/product-sitemap2.xml</loc>
<lastmod>2026-03-01T00:00:00+00:00</lastmod>
</sitemap>
<sitemap>
<loc>https://ak-interactive.com/page-sitemap.xml</loc>
<lastmod>2026-03-01T00:00:00+00:00</lastmod>
</sitemap>
<sitemap>
<loc>https://ak-interactive.com/category-sitemap.xml</loc>
<lastmod>2026-03-01T00:00:00+00:00</lastmod>
</sitemap>
</sitemapindex>`;

  it("solo devuelve los sitemaps de producto, filtrando el resto", () => {
    expect(parseSitemapIndex(sitemapIndex)).toEqual([
      "https://ak-interactive.com/product-sitemap1.xml",
      "https://ak-interactive.com/product-sitemap2.xml",
    ]);
  });

  it("decodifica entidades XML en la URL", () => {
    const xml = `<sitemapindex><sitemap><loc>https://ak-interactive.com/product-sitemap1.xml?a=1&amp;b=2</loc></sitemap></sitemapindex>`;

    expect(parseSitemapIndex(xml)).toEqual(["https://ak-interactive.com/product-sitemap1.xml?a=1&b=2"]);
  });

  it("admite CDATA en <loc>", () => {
    const xml = `<sitemapindex><sitemap><loc><![CDATA[https://ak-interactive.com/product-sitemap3.xml]]></loc></sitemap></sitemapindex>`;

    expect(parseSitemapIndex(xml)).toEqual(["https://ak-interactive.com/product-sitemap3.xml"]);
  });

  it("un índice sin sitemaps de producto devuelve una lista vacía", () => {
    const xml = `<sitemapindex><sitemap><loc>https://ak-interactive.com/page-sitemap.xml</loc></sitemap></sitemapindex>`;

    expect(parseSitemapIndex(xml)).toEqual([]);
  });
});

describe("parseImageLocs", () => {
  const productSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
<url>
<loc>https://ak-interactive.com/product/ultramarine/</loc>
<image:image>
<image:loc>https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg</image:loc>
</image:image>
</url>
<url>
<loc>https://ak-interactive.com/product/aluminium-2/</loc>
<image:image>
<image:loc>https://ak-interactive.com/wp-content/uploads/2026/03/RC820.jpg</image:loc>
</image:image>
</url>
</urlset>`;

  it("extrae solo los <image:loc>, no los <loc> de la página", () => {
    expect(parseImageLocs(productSitemap)).toEqual([
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg",
      "https://ak-interactive.com/wp-content/uploads/2026/03/RC820.jpg",
    ]);
  });

  it("decodifica entidades XML", () => {
    const xml = `<urlset><url><image:image><image:loc>https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg?v=1&amp;x=2</image:loc></image:image></url></urlset>`;

    expect(parseImageLocs(xml)).toEqual([
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg?v=1&x=2",
    ]);
  });

  it("admite CDATA en <image:loc>", () => {
    const xml = `<urlset><url><image:image><image:loc><![CDATA[https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg]]></image:loc></image:image></url></urlset>`;

    expect(parseImageLocs(xml)).toEqual(["https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg"]);
  });

  it("un sitemap sin imágenes devuelve una lista vacía", () => {
    expect(parseImageLocs("<urlset><url><loc>https://ak-interactive.com/product/x/</loc></url></urlset>")).toEqual(
      [],
    );
  });
});

describe("matchCatalog", () => {
  const codes = ["AK11179", "AK11194"];

  it("una imagen AK####.jpg de un código del catálogo entra en el mapa", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({ AK11179: "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg" });
  });

  it("un código RC se ignora", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2026/03/RC820.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("un código AK fuera del catálogo se ignora", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2026/03/AK99999.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("rechaza un host que no sea el oficial de AK", () => {
    const result = matchCatalog(
      ["https://evil.example.com/wp-content/uploads/2026/03/AK11179.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("rechaza las miniaturas generadas por WordPress (AK11179-300x300.jpg)", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2026/03/AK11179-300x300.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("ante duplicados, gana la URL lexicográficamente mayor y se avisa del conflicto", () => {
    const result = matchCatalog(
      [
        "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg",
        "https://ak-interactive.com/wp-content/uploads/2026/06/AK11179.jpg",
      ],
      codes,
      [],
    );

    expect(result.images.AK11179).toBe("https://ak-interactive.com/wp-content/uploads/2026/06/AK11179.jpg");
    expect(result.conflicts).toEqual([
      {
        code: "AK11179",
        urls: [
          "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg",
          "https://ak-interactive.com/wp-content/uploads/2026/06/AK11179.jpg",
        ],
      },
    ]);
  });

  // Casos reales encontrados en la ejecución contra AK: los barnices se
  // publican como AK11237_web.jpg y las imprimaciones como AK11245-1.jpg.
  it("acepta la variante _web del nombre (AK11179_web.jpg)", () => {
    const url = "https://ak-interactive.com/wp-content/uploads/2020/06/AK11179_web.jpg";

    expect(matchCatalog([url], codes, []).images).toEqual({ AK11179: url });
  });

  it("acepta la variante numerada de AK (AK11179-1.jpg)", () => {
    const url = "https://ak-interactive.com/wp-content/uploads/2021/06/AK11179-1.jpg";

    expect(matchCatalog([url], codes, []).images).toEqual({ AK11179: url });
  });

  it("sigue rechazando las miniaturas -WxH aunque acepte -N", () => {
    const result = matchCatalog(
      [
        "https://ak-interactive.com/wp-content/uploads/2021/06/AK11179-1-300x300.jpg",
        "https://ak-interactive.com/wp-content/uploads/2021/06/AK11179-1024x1024.jpg",
      ],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("rechaza otros sufijos que no son variantes de la foto (AK11179_02_Web.jpg)", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2021/06/AK11179_02_Web.jpg"],
      codes,
      [],
    );

    expect(result.images).toEqual({});
  });

  it("entre variantes prefiere el nombre exacto, luego _web y luego el -N más bajo", () => {
    const exact = "https://ak-interactive.com/wp-content/uploads/2020/01/AK11179.jpg";
    const web = "https://ak-interactive.com/wp-content/uploads/2026/01/AK11179_web.jpg";
    const two = "https://ak-interactive.com/wp-content/uploads/2026/01/AK11179-2.jpg";
    const one = "https://ak-interactive.com/wp-content/uploads/2026/01/AK11179-1.jpg";

    expect(matchCatalog([two, one, web, exact], codes, []).images.AK11179).toBe(exact);
    expect(matchCatalog([two, one, web], codes, []).images.AK11179).toBe(web);
    expect(matchCatalog([two, one], codes, []).images.AK11179).toBe(one);
  });

  it("la misma URL repetida (página en inglés y en español) no es un conflicto", () => {
    const url = "https://ak-interactive.com/wp-content/uploads/2020/06/AK11179_web.jpg";
    const result = matchCatalog([url, url], codes, []);

    expect(result.images).toEqual({ AK11179: url });
    expect(result.conflicts).toEqual([]);
  });

  it("los códigos del catálogo sin URL encontrada aparecen en missing", () => {
    const result = matchCatalog([], codes, []);

    expect(result.missing).toEqual(["AK11179", "AK11194"]);
  });

  it("devuelve staleExclusions para los códigos excluidos que ahora sí tienen foto", () => {
    const result = matchCatalog(
      ["https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg"],
      codes,
      ["AK11179"],
    );

    expect(result.staleExclusions).toEqual(["AK11179"]);
    // La exclusión ha caducado: la foto se usa igualmente.
    expect(result.images).toEqual({ AK11179: "https://ak-interactive.com/wp-content/uploads/2026/03/AK11179.jpg" });
  });

  it("un código excluido sin foto no aparece en staleExclusions", () => {
    const result = matchCatalog([], codes, ["AK11179"]);

    expect(result.staleExclusions).toEqual([]);
  });
});

describe("coverage", () => {
  it("96 % continúa: el ratio supera MIN_COVERAGE", () => {
    const ratio = coverage(96, 100);

    expect(ratio).toBeCloseTo(0.96);
    expect(ratio).toBeGreaterThanOrEqual(MIN_COVERAGE);
  });

  it("80 % sin exclusión aborta: el ratio queda por debajo de MIN_COVERAGE", () => {
    const ratio = coverage(80, 100);

    expect(ratio).toBeCloseTo(0.8);
    expect(ratio).toBeLessThan(MIN_COVERAGE);
  });

  it("270 encontrados + 16 excluidos sobre 286 da 100 %", () => {
    const expected = 286 - 16;
    const ratio = coverage(270, expected);

    expect(ratio).toBe(1);
  });

  it("el límite exacto del 95 % no aborta (no es estrictamente menor)", () => {
    const ratio = coverage(95, 100);

    expect(ratio).toBe(0.95);
    expect(ratio).toBeGreaterThanOrEqual(MIN_COVERAGE);
  });

  it("si no se espera ninguna imagen (todo excluido), la cobertura es 100 % sin dividir por cero", () => {
    expect(coverage(0, 0)).toBe(1);
  });
});

describe("isAkImagesFile", () => {
  it("acepta la forma válida", () => {
    expect(
      isAkImagesFile({
        images: { AK11179: "https://example.com/a.jpg" },
        excluded: { AK99999: "motivo" },
        missing: ["AK1"],
      }),
    ).toBe(true);
  });

  it("rechaza JSON corrupto: null, un array, un string", () => {
    expect(isAkImagesFile(null)).toBe(false);
    expect(isAkImagesFile([])).toBe(false);
    expect(isAkImagesFile("{}")).toBe(false);
  });

  it("rechaza una forma inválida: falta excluded, o missing no es un array de strings", () => {
    expect(isAkImagesFile({ images: {}, missing: [] })).toBe(false);
    expect(isAkImagesFile({ images: {}, excluded: {}, missing: [1, 2] })).toBe(false);
    expect(isAkImagesFile({ images: { AK1: 2 }, excluded: {}, missing: [] })).toBe(false);
  });
});

describe("isLocalManifest", () => {
  it("acepta la forma válida", () => {
    expect(
      isLocalManifest({
        version: 1,
        images: { AK11179: { file: "AK11179.webp", source: "https://example.com/a.jpg" } },
      }),
    ).toBe(true);
  });

  it("rechaza JSON corrupto: null, un array, un string", () => {
    expect(isLocalManifest(null)).toBe(false);
    expect(isLocalManifest([])).toBe(false);
    expect(isLocalManifest("{}")).toBe(false);
  });

  it("rechaza una forma inválida: version distinta de 1, o una entrada sin source", () => {
    expect(isLocalManifest({ version: 2, images: {} })).toBe(false);
    expect(isLocalManifest({ version: 1, images: { AK1: { file: "a.webp" } } })).toBe(false);
  });
});

describe("planDownloads", () => {
  const emptyManifest: LocalManifest = { version: 1, images: {} };

  it("un código con .webp ya en disco no entra en el plan", () => {
    const map = { AK11179: "https://example.com/AK11179.jpg", AK11194: "https://example.com/AK11194.jpg" };
    const manifest: LocalManifest = {
      version: 1,
      images: { AK11179: { file: "AK11179.webp", source: "https://example.com/AK11179.jpg" } },
    };
    const exists = (code: string): boolean => code === "AK11179";

    expect(planDownloads(map, manifest, exists)).toEqual(["AK11194"]);
  });

  it("un código sin entrada en el manifiesto entra en el plan aunque exists mienta", () => {
    const map = { AK11179: "https://example.com/AK11179.jpg" };

    expect(planDownloads(map, emptyManifest, () => true)).toEqual(["AK11179"]);
  });

  it("si la URL de origen cambió respecto al manifiesto, vuelve a entrar en el plan", () => {
    const map = { AK11179: "https://example.com/AK11179-nueva.jpg" };
    const manifest: LocalManifest = {
      version: 1,
      images: { AK11179: { file: "AK11179.webp", source: "https://example.com/AK11179-vieja.jpg" } },
    };

    expect(planDownloads(map, manifest, () => true)).toEqual(["AK11179"]);
  });

  it("un mapa vacío da un plan vacío", () => {
    expect(planDownloads({}, emptyManifest, () => false)).toEqual([]);
  });
});

describe("fetchWithRetry", () => {
  const userAgent = "paint-studio-miniatures/0.0.0 (uso personal; +https://github.com/xakydev/paint-studio-miniatures)";

  function okResponse(): Response {
    return new Response("ok", { status: 200 });
  }

  it("una respuesta 200 no reintenta y no duerme", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry(
      "https://ak-interactive.com/a.jpg",
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("cada petición lleva un User-Agent identificable, distinto del de un navegador", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());

    await fetchWithRetry("https://ak-interactive.com/a.jpg", { fetch: fetchMock, sleep: vi.fn() }, { userAgent });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe(userAgent);
    expect(headers.get("User-Agent")).not.toMatch(/Mozilla|Chrome|Safari/);
  });

  it("pasa una señal de cancelación con tope de tiempo en cada petición", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse());

    await fetchWithRetry("https://ak-interactive.com/a.jpg", { fetch: fetchMock, sleep: vi.fn() }, { userAgent });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("reintenta un 503 con backoff 2s/4s hasta que responde 200, sin esperar de verdad", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(okResponse());
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry(
      "https://ak-interactive.com/a.jpg",
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepMock.mock.calls.map((call) => call[0])).toEqual([2000, 4000]);
  });

  it("en un 429 respeta Retry-After en segundos en vez del backoff", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "7" } }))
      .mockResolvedValueOnce(okResponse());
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry("https://ak-interactive.com/a.jpg", { fetch: fetchMock, sleep: sleepMock }, { userAgent });

    expect(sleepMock).toHaveBeenCalledWith(7000);
  });

  it("en un 429 con Retry-After como fecha HTTP, espera la diferencia hasta esa fecha", async () => {
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const retryAt = new Date("2026-01-01T00:00:05.000Z").toUTCString();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": retryAt } }))
      .mockResolvedValueOnce(okResponse());
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await fetchWithRetry(
      "https://ak-interactive.com/a.jpg",
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent, now: () => now },
    );

    expect(sleepMock).toHaveBeenCalledWith(5000);
  });

  it("no reintenta otros 4xx: un 404 se devuelve tal cual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    const sleepMock = vi.fn();

    const response = await fetchWithRetry(
      "https://ak-interactive.com/a.jpg",
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("agota el tope de reintentos y devuelve la última respuesta fallida", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const response = await fetchWithRetry(
      "https://ak-interactive.com/a.jpg",
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent },
    );

    expect(response.status).toBe(503);
    // 1 intento inicial + 3 reintentos como tope.
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(sleepMock).toHaveBeenCalledTimes(3);
  });

  it("un error de red se reintenta y, si persiste hasta el tope, se propaga", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    await expect(
      fetchWithRetry("https://ak-interactive.com/a.jpg", { fetch: fetchMock, sleep: sleepMock }, { userAgent }),
    ).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
