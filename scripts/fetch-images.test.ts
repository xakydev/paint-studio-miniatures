// @vitest-environment node
/**
 * Cáscara de I/O del script de fotos de AK: red, sharp y disco, todo
 * inyectado. Nada de estos tests toca la red real, el disco real ni la web
 * de AK — `fetch`, `sleep` y el sistema de ficheros se simulan; `sharp` solo
 * se usa de verdad en el test de integración marcado como tal, sobre una
 * imagen generada en memoria y un directorio temporal.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildUserAgent,
  convertToThumbnailWebp,
  createPacedFetch,
  fetchAllImageUrls,
  formatMissingReport,
  photoPath,
  runFetchImages,
  THUMBNAIL_SIZE,
  type FetchImagesDeps,
  type FetchImagesPaths,
  type FsPort,
} from "./fetch-images.ts";

// ---------------------------------------------------------------------------
// Infraestructura de test: un FsPort en memoria, nada de disco real.
// ---------------------------------------------------------------------------

function createInMemoryFs(
  initial: Readonly<Record<string, string>> = {},
  onRename?: (from: string, to: string) => void,
): FsPort & {
  readonly files: Map<string, Uint8Array | string>;
} {
  const files = new Map<string, Uint8Array | string>(Object.entries(initial));
  return {
    files,
    existsSync: (path) => files.has(path),
    readFileSync: (path) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return typeof value === "string" ? value : new TextDecoder().decode(value);
    },
    writeFileSync: (path, data) => {
      files.set(path, data);
    },
    renameSync: (from, to) => {
      const value = files.get(from);
      if (value === undefined) throw new Error(`ENOENT (rename desde): ${from}`);
      files.delete(from);
      files.set(to, value);
      onRename?.(from, to);
    },
    mkdirSync: () => {
      // El FsPort en memoria no modela directorios: basta con no lanzar.
    },
  };
}

const CATALOG_PATH = "/project/src/data/static/catalog.json";
const AK_IMAGES_PATH = "/project/data/ak-images.json";
const PAINTS_DIR = "/project/local-assets/paints";
const MANIFEST_PATH = "/project/local-assets/paints/manifest.json";
const SITEMAP_INDEX_URL = "https://ak-interactive.com/sitemap_index.xml";
const PRODUCT_SITEMAP_URL = "https://ak-interactive.com/product-sitemap1.xml";

const THREE_CODE_CATALOG = JSON.stringify([{ code: "AK1" }, { code: "AK2" }, { code: "AK3" }]);

function sitemapIndexXml(): string {
  return `<sitemapindex><sitemap><loc>${PRODUCT_SITEMAP_URL}</loc></sitemap></sitemapindex>`;
}

function productSitemapXml(codes: readonly string[]): string {
  const urls = codes
    .map(
      (code) =>
        `<url><image:image><image:loc>https://ak-interactive.com/wp-content/uploads/2026/03/${code}.jpg</image:loc></image:image></url>`,
    )
    .join("");
  return `<urlset>${urls}</urlset>`;
}

/** `fetch` simulado: resuelve por URL exacta contra un mapa de respuestas. */
function fakeFetch(responses: Readonly<Record<string, () => Response>>): FetchImagesDeps["fetch"] {
  return vi.fn(async (url: string, _init: RequestInit) => {
    const make = responses[url];
    if (make === undefined) throw new Error(`fetch inesperado: ${url}`);
    return make();
  });
}

function baseDeps(overrides: Partial<FetchImagesDeps> = {}): FetchImagesDeps {
  return {
    fetch: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    fs: createInMemoryFs(),
    convert: vi.fn(async () => new Uint8Array([1, 2, 3])),
    userAgent: buildUserAgent("0.0.0"),
    minIntervalMs: 1000,
    log: vi.fn(),
    logError: vi.fn(),
    ...overrides,
  };
}

const BASE_PATHS: FetchImagesPaths = {
  catalogFile: CATALOG_PATH,
  akImagesFile: AK_IMAGES_PATH,
  sitemapIndexUrl: SITEMAP_INDEX_URL,
  paintsDir: PAINTS_DIR,
  manifestFile: MANIFEST_PATH,
};

// ---------------------------------------------------------------------------
// buildUserAgent
// ---------------------------------------------------------------------------

describe("buildUserAgent", () => {
  it("identifica el proyecto y su repositorio, sin datos personales", () => {
    const userAgent = buildUserAgent("1.2.3");

    expect(userAgent).toBe(
      "paint-studio-miniatures/1.2.3 (uso personal; +https://github.com/xakydev/paint-studio-miniatures)",
    );
    expect(userAgent).not.toMatch(/@|gmail|chacon/i);
  });
});

// ---------------------------------------------------------------------------
// createPacedFetch: ritmo mínimo entre peticiones.
// ---------------------------------------------------------------------------

describe("createPacedFetch", () => {
  it("la segunda petición no se emite antes de que transcurra el intervalo mínimo desde la primera", async () => {
    let time = 0;
    const now = (): number => time;
    const sleepMock = vi.fn(async (ms: number) => {
      time += ms;
    });
    const fetchMock = vi.fn(async () => {
      time += 10;
      return new Response("ok", { status: 200 });
    });

    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent: "ua", now, minIntervalMs: 1000 },
    );

    await pacedFetch("https://ak-interactive.com/a");
    await pacedFetch("https://ak-interactive.com/b");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepMock).toHaveBeenCalledTimes(1);
    expect(sleepMock.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(990);
  });

  it("no espera antes de la primera petición", async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));

    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: sleepMock },
      { userAgent: "ua", minIntervalMs: 1000 },
    );
    await pacedFetch("https://ak-interactive.com/a");

    expect(sleepMock).not.toHaveBeenCalled();
  });

  it("cada petición lleva el User-Agent configurado", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: vi.fn().mockResolvedValue(undefined) },
      { userAgent: "paint-studio-miniatures/0.0.0 (uso personal; +https://github.com/x)" },
    );

    await pacedFetch("https://ak-interactive.com/a");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("User-Agent")).toBe("paint-studio-miniatures/0.0.0 (uso personal; +https://github.com/x)");
  });
});

// ---------------------------------------------------------------------------
// fetchAllImageUrls
// ---------------------------------------------------------------------------

describe("fetchAllImageUrls", () => {
  it("lee el índice y después cada sitemap de producto, acumulando las image:loc", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1", "AK2"]), { status: 200 }),
    });
    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: vi.fn().mockResolvedValue(undefined) },
      { userAgent: "ua", minIntervalMs: 0 },
    );

    const urls = await fetchAllImageUrls(pacedFetch, SITEMAP_INDEX_URL, vi.fn());

    expect(urls).toEqual([
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg",
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg",
    ]);
  });

  it("un 4xx en el índice hace fallar la función, sin seguir con los sitemaps de producto", async () => {
    const fetchMock = fakeFetch({ [SITEMAP_INDEX_URL]: () => new Response("", { status: 404 }) });
    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: vi.fn().mockResolvedValue(undefined) },
      { userAgent: "ua", minIntervalMs: 0 },
    );

    await expect(fetchAllImageUrls(pacedFetch, SITEMAP_INDEX_URL, vi.fn())).rejects.toThrow();
  });

  it("un 4xx en un sitemap de producto hace fallar la función", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response("", { status: 404 }),
    });
    const pacedFetch = createPacedFetch(
      { fetch: fetchMock, sleep: vi.fn().mockResolvedValue(undefined) },
      { userAgent: "ua", minIntervalMs: 0 },
    );

    await expect(fetchAllImageUrls(pacedFetch, SITEMAP_INDEX_URL, vi.fn())).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// formatMissingReport
// ---------------------------------------------------------------------------

describe("formatMissingReport", () => {
  it("lista los códigos sin foto, marcando los excluidos explícitamente", () => {
    const report = formatMissingReport(["AK2", "AK1"], { AK1: "AK no publica foto" });

    expect(report).toContain("AK1 (excluida: AK no publica foto)");
    expect(report).toContain("AK2");
    expect(report.indexOf("AK1")).toBeLessThan(report.indexOf("AK2"));
  });

  it("sin pendientes, lo dice explícitamente", () => {
    expect(formatMissingReport([], {})).toMatch(/sin referencias pendientes/i);
  });
});

// ---------------------------------------------------------------------------
// photoPath: la ruta de destino sale del código validado, nunca de la URL.
// ---------------------------------------------------------------------------

describe("photoPath", () => {
  it("construye la ruta dentro de paintsDir a partir del código", () => {
    expect(photoPath(PAINTS_DIR, "AK11179")).toBe(join(PAINTS_DIR, "AK11179.webp"));
  });

  it("rechaza un código que no cumple el patrón AK\\d+, aunque viniera de una URL rara", () => {
    expect(() => photoPath(PAINTS_DIR, "../../etc/passwd")).toThrow();
    expect(() => photoPath(PAINTS_DIR, "AK1/../../x")).toThrow();
    expect(() => photoPath(PAINTS_DIR, "RC820")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// runFetchImages: la orquestación completa, con todo inyectado.
// ---------------------------------------------------------------------------

describe("runFetchImages", () => {
  it("cobertura insuficiente aborta con código 1 sin escribir nada", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      // Solo AK1 tiene foto: 1/3 = 33 %, por debajo del mínimo.
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1"]), { status: 200 }),
    });
    const fs = createInMemoryFs({ [CATALOG_PATH]: THREE_CODE_CATALOG });
    const deps = baseDeps({ fetch: fetchMock, fs, sleep: vi.fn().mockResolvedValue(undefined) });

    const exitCode = await runFetchImages(deps, BASE_PATHS);

    expect(exitCode).toBe(1);
    expect(fs.files.has(AK_IMAGES_PATH)).toBe(false);
    expect(fs.files.has(MANIFEST_PATH)).toBe(false);
    // Ninguna descarga de imagen: solo las dos peticiones de sitemap.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cobertura suficiente escribe ak-images.json con claves ordenadas y conserva excluded", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK2", "AK1"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg": () =>
        new Response(new Uint8Array([1]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg": () =>
        new Response(new Uint8Array([2]), { status: 200 }),
    });
    const previousAkImages = JSON.stringify({ images: {}, excluded: { AK3: "AK no publica foto" }, missing: [] });
    const fs = createInMemoryFs({ [CATALOG_PATH]: THREE_CODE_CATALOG, [AK_IMAGES_PATH]: previousAkImages });
    const deps = baseDeps({ fetch: fetchMock, fs, sleep: vi.fn().mockResolvedValue(undefined) });

    const exitCode = await runFetchImages(deps, BASE_PATHS);

    expect(exitCode).toBe(0);
    const written = JSON.parse(fs.files.get(AK_IMAGES_PATH) as string) as {
      images: Record<string, string>;
      excluded: Record<string, string>;
      missing: string[];
    };
    expect(Object.keys(written.images)).toEqual(["AK1", "AK2"]);
    expect(written.excluded).toEqual({ AK3: "AK no publica foto" });
    expect(written.missing).toEqual(["AK3"]);
  });

  it("una miniatura ya presente en disco no se vuelve a pedir", async () => {
    const existingUrl = "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg";
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1", "AK2"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg": () =>
        new Response(new Uint8Array([9]), { status: 200 }),
    });
    const manifest = JSON.stringify({ version: 1, images: { AK1: { file: "AK1.webp", source: existingUrl } } });
    const fs = createInMemoryFs({
      [CATALOG_PATH]: JSON.stringify([{ code: "AK1" }, { code: "AK2" }]),
      [MANIFEST_PATH]: manifest,
      [photoPath(PAINTS_DIR, "AK1")]: "ya-existe",
    });
    const deps = baseDeps({ fetch: fetchMock, fs, sleep: vi.fn().mockResolvedValue(undefined) });

    await runFetchImages(deps, BASE_PATHS);

    expect(fetchMock).not.toHaveBeenCalledWith(existingUrl, expect.anything());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg",
      expect.anything(),
    );
  });

  it("tras descargar y convertir, solo queda el WebP: ningún JPEG llega a escribirse", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg": () =>
        new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    });
    const fs = createInMemoryFs({ [CATALOG_PATH]: JSON.stringify([{ code: "AK1" }]) });
    const convert = vi.fn(async () => new Uint8Array([9, 9, 9]));
    const deps = baseDeps({ fetch: fetchMock, fs, convert, sleep: vi.fn().mockResolvedValue(undefined) });

    const exitCode = await runFetchImages(deps, BASE_PATHS);

    expect(exitCode).toBe(0);
    expect(fs.files.has(photoPath(PAINTS_DIR, "AK1"))).toBe(true);
    for (const path of fs.files.keys()) {
      expect(path).not.toMatch(/\.jpe?g$/i);
    }
  });

  it("el manifiesto se reescribe tras cada foto, no solo al final", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1", "AK2"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg": () =>
        new Response(new Uint8Array([1]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg": () =>
        new Response(new Uint8Array([2]), { status: 200 }),
    });
    let manifestWrites = 0;
    const fs = createInMemoryFs({ [CATALOG_PATH]: JSON.stringify([{ code: "AK1" }, { code: "AK2" }]) }, (_from, to) => {
      if (to === MANIFEST_PATH) manifestWrites++;
    });
    const deps = baseDeps({ fetch: fetchMock, fs, sleep: vi.fn().mockResolvedValue(undefined) });

    await runFetchImages(deps, BASE_PATHS);

    expect(manifestWrites).toBe(2);
    const manifest = JSON.parse(fs.files.get(MANIFEST_PATH) as string) as {
      images: Record<string, { file: string; source: string }>;
    };
    expect(manifest.images.AK1?.source).toBe("https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg");
    expect(manifest.images.AK2?.source).toBe("https://ak-interactive.com/wp-content/uploads/2026/03/AK2.jpg");
  });

  it("el informe final lista lo que falta, marcando lo excluido", async () => {
    // 21 códigos: 19 con foto, 1 excluido (AK20) y 1 realmente ausente
    // (AK21), para que la cobertura (19/20 = 95 %) no aborte el script y el
    // informe final llegue a imprimirse.
    const allCodes = Array.from({ length: 21 }, (_, i) => `AK${i + 1}`);
    const foundCodes = allCodes.slice(0, 19);
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(foundCodes), { status: 200 }),
      ...Object.fromEntries(
        foundCodes.map((code) => [
          `https://ak-interactive.com/wp-content/uploads/2026/03/${code}.jpg`,
          () => new Response(new Uint8Array([1]), { status: 200 }),
        ]),
      ),
    });
    const previousAkImages = JSON.stringify({ images: {}, excluded: { AK20: "motivo" }, missing: [] });
    const fs = createInMemoryFs({
      [CATALOG_PATH]: JSON.stringify(allCodes.map((code) => ({ code }))),
      [AK_IMAGES_PATH]: previousAkImages,
    });
    const log = vi.fn();
    const deps = baseDeps({ fetch: fetchMock, fs, log, sleep: vi.fn().mockResolvedValue(undefined) });

    const exitCode = await runFetchImages(deps, BASE_PATHS);

    expect(exitCode).toBe(0);
    const output = log.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("AK21");
    expect(output).toContain("AK20 (excluida: motivo)");
  });

  it("si una descarga agota los reintentos, se informa, se sigue y el script termina con código 1", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg": () => new Response("", { status: 404 }),
    });
    const fs = createInMemoryFs({ [CATALOG_PATH]: JSON.stringify([{ code: "AK1" }]) });
    const logError = vi.fn();
    const deps = baseDeps({ fetch: fetchMock, fs, logError, sleep: vi.fn().mockResolvedValue(undefined) });

    const exitCode = await runFetchImages(deps, BASE_PATHS);

    expect(exitCode).toBe(1);
    expect(fs.files.has(photoPath(PAINTS_DIR, "AK1"))).toBe(false);
    expect(logError.mock.calls.some((call) => String(call[0]).includes("AK1"))).toBe(true);
  });

  it("un manifiesto corrupto en disco se ignora con un aviso, en vez de lanzar", async () => {
    const fetchMock = fakeFetch({
      [SITEMAP_INDEX_URL]: () => new Response(sitemapIndexXml(), { status: 200 }),
      [PRODUCT_SITEMAP_URL]: () => new Response(productSitemapXml(["AK1"]), { status: 200 }),
      "https://ak-interactive.com/wp-content/uploads/2026/03/AK1.jpg": () =>
        new Response(new Uint8Array([1]), { status: 200 }),
    });
    const fs = createInMemoryFs({ [CATALOG_PATH]: JSON.stringify([{ code: "AK1" }]), [MANIFEST_PATH]: "{ roto" });
    const deps = baseDeps({ fetch: fetchMock, fs, sleep: vi.fn().mockResolvedValue(undefined) });

    await expect(runFetchImages(deps, BASE_PATHS)).resolves.toBe(0);
  });
});

// ---------------------------------------------------------------------------
// convertToThumbnailWebp: integración ligera y real con sharp, sin fotos de AK.
// ---------------------------------------------------------------------------

describe("convertToThumbnailWebp (integración con sharp real)", () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir !== undefined) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it("convierte una imagen generada en memoria a WebP de como mucho 320 px", async () => {
    const { default: sharp } = await import("sharp");

    // Imagen de prueba generada en memoria: un rectángulo rojo opaco de
    // 800x600, nada que provenga de AK Interactive.
    const source = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 20, b: 20 } },
    })
      .png()
      .toBuffer();

    const webp = await convertToThumbnailWebp(new Uint8Array(source));

    tempDir = await mkdtemp(join(tmpdir(), "paint-images-test-"));
    const outPath = join(tempDir, "thumbnail.webp");
    await import("node:fs/promises").then(({ writeFile }) => writeFile(outPath, webp));

    const metadata = await sharp(await readFile(outPath)).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBeLessThanOrEqual(THUMBNAIL_SIZE);
    expect(metadata.height).toBeLessThanOrEqual(THUMBNAIL_SIZE);
  });
});
