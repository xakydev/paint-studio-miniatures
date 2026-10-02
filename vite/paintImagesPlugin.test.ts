// @vitest-environment node
/**
 * Plugin de Vite de las fotos locales: el código del módulo virtual según el
 * comando, la lista blanca de rutas y el middleware que las sirve. El
 * middleware se prueba contra un directorio temporal con `req`/`res` simulados;
 * el comportamiento en el dev server real se verifica a mano (tasks 4.6-4.8).
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LocalManifest } from "../scripts/paintImagesCore.ts";
import {
  createPhotoMiddleware,
  manifestModuleSource,
  photoPathFor,
  type PhotoRequest,
  type PhotoResponse,
} from "./paintImagesPlugin.ts";

const MANIFEST: LocalManifest = {
  version: 1,
  images: {
    AK11001: { file: "AK11001.webp", source: "https://ak-interactive.com/wp-content/uploads/AK11001.jpg" },
    AK11002: { file: "AK11002.webp", source: "https://ak-interactive.com/wp-content/uploads/AK11002.jpg" },
  },
};

/** Evalúa el código del módulo virtual como lo haría Vite y devuelve su export. */
async function evaluateModule(source: string): Promise<unknown> {
  const url = `data:text/javascript,${encodeURIComponent(source)}`;
  const mod: unknown = await import(/* @vite-ignore */ url);
  return (mod as { paintImageUrls?: unknown }).paintImageUrls;
}

describe("manifestModuleSource", () => {
  it("en build devuelve siempre un mapa vacío, aunque haya manifiesto con fotos", () => {
    expect(manifestModuleSource("build", MANIFEST)).toBe("export const paintImageUrls = {}");
  });

  it("en build sin manifiesto también devuelve el mapa vacío", () => {
    expect(manifestModuleSource("build", null)).toBe("export const paintImageUrls = {}");
  });

  it("en serve expone cada código con su URL servida por el middleware", async () => {
    expect(await evaluateModule(manifestModuleSource("serve", MANIFEST))).toEqual({
      AK11001: "/paints/AK11001.webp",
      AK11002: "/paints/AK11002.webp",
    });
  });

  it("en serve sin manifiesto exporta un mapa vacío", async () => {
    expect(await evaluateModule(manifestModuleSource("serve", null))).toEqual({});
  });

  it("descarta entradas cuyo código o fichero no pasarían la lista blanca del middleware", async () => {
    const odd: LocalManifest = {
      version: 1,
      images: {
        AK11001: { file: "AK11001.webp", source: "s" },
        RC820: { file: "RC820.webp", source: "s" },
        AK11003: { file: "../secreto.webp", source: "s" },
      },
    };
    expect(await evaluateModule(manifestModuleSource("serve", odd))).toEqual({
      AK11001: "/paints/AK11001.webp",
    });
  });
});

describe("photoPathFor", () => {
  const root = "/proyecto";

  it("acepta /paints/AK<dígitos>.webp y la resuelve dentro de local-assets/paints", () => {
    expect(photoPathFor(root, "/paints/AK11001.webp")).toBe(
      join(root, "local-assets", "paints", "AK11001.webp"),
    );
  });

  it("ignora la query string", () => {
    expect(photoPathFor(root, "/paints/AK11001.webp?v=3")).toBe(
      join(root, "local-assets", "paints", "AK11001.webp"),
    );
  });

  it("decodifica antes de validar: un %2e que solo forma «.webp» es la misma foto", () => {
    expect(photoPathFor(root, "/paints/AK11001%2ewebp")).toBe(
      join(root, "local-assets", "paints", "AK11001.webp"),
    );
  });

  it.each([
    "/paints/../package.json",
    "/paints/%2e%2e/package.json",
    "/paints/%2e%2e%2fpackage.json",
    "/paints/%2E%2E%2Fpackage.json",
    "/paints/AK1.jpg",
    "/paints/x",
    "/paints/",
    "/paints/ak11001.webp",
    "/paints/AK.webp",
    "/paints/AK11001.webp/extra",
    "/paints/%E0%A4%A",
    "/otra/AK11001.webp",
    "/",
  ])("rechaza %s", (url) => {
    expect(photoPathFor(root, url)).toBeNull();
  });
});

interface FakeResponse extends PhotoResponse {
  readonly headers: Record<string, string>;
  body: Buffer | undefined;
  ended: boolean;
}

function fakeResponse(): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name: string, value: string) {
      res.headers[name.toLowerCase()] = value;
    },
    end(chunk?: Buffer) {
      res.body = chunk;
      res.ended = true;
    },
  };
  return res;
}

function fakeRequest(url: string, headers: Record<string, string> = {}, method = "GET"): PhotoRequest {
  return { url, method, headers };
}

describe("createPhotoMiddleware", () => {
  let root: string;
  const photo = Buffer.from("RIFF....WEBPVP8 falso");

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "paint-images-plugin-"));
    await mkdir(join(root, "local-assets", "paints"), { recursive: true });
    await writeFile(join(root, "local-assets", "paints", "AK11001.webp"), photo);
    await writeFile(join(root, "package.json"), "{}");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function run(req: PhotoRequest): Promise<{ res: FakeResponse; next: ReturnType<typeof vi.fn> }> {
    const res = fakeResponse();
    const next = vi.fn();
    await createPhotoMiddleware(root)(req, res, next);
    return { res, next };
  }

  it("sirve una foto existente con 200, image/webp y las cabeceras de caché privada", async () => {
    const { res, next } = await run(fakeRequest("/paints/AK11001.webp"));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["cache-control"]).toBe("private, no-cache");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["etag"]).toMatch(/^W\/"[0-9a-f]+-[0-9a-f]+"$/);
    expect(res.body?.equals(photo)).toBe(true);
  });

  it("responde 304 sin cuerpo si el ETag coincide", async () => {
    const first = await run(fakeRequest("/paints/AK11001.webp"));
    const etag = first.res.headers["etag"] ?? "";
    const { res } = await run(fakeRequest("/paints/AK11001.webp", { "if-none-match": etag }));
    expect(res.statusCode).toBe(304);
    expect(res.body).toBeUndefined();
    expect(res.ended).toBe(true);
  });

  it("en HEAD responde las cabeceras sin cuerpo", async () => {
    const { res } = await run(fakeRequest("/paints/AK11001.webp", {}, "HEAD"));
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.body).toBeUndefined();
  });

  it("da 404 con cuerpo vacío para un código sin fichero", async () => {
    const { res, next } = await run(fakeRequest("/paints/AK99999.webp"));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toBeUndefined();
    expect(res.ended).toBe(true);
  });

  it("da 404 si la ruta es un directorio, no un fichero", async () => {
    await mkdir(join(root, "local-assets", "paints", "AK22222.webp"));
    const { res } = await run(fakeRequest("/paints/AK22222.webp"));
    expect(res.statusCode).toBe(404);
  });

  it.each(["/paints/../package.json", "/paints/%2e%2e%2fpackage.json", "/paints/AK1.jpg", "/paints/x"])(
    "da 404 (no next) a %s, para que el fallback de la SPA no conteste 200",
    async (url) => {
      const { res, next } = await run(fakeRequest(url));
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(404);
      expect(res.body).toBeUndefined();
    },
  );

  it.each(["/", "/src/main.tsx", "/paintsX/AK11001.webp", "/package.json"])(
    "deja pasar %s al siguiente middleware",
    async (url) => {
      const { res, next } = await run(fakeRequest(url));
      expect(next).toHaveBeenCalledOnce();
      expect(res.ended).toBe(false);
    },
  );

  it("sin local-assets/ en absoluto responde 404 sin lanzar", async () => {
    await rm(join(root, "local-assets"), { recursive: true, force: true });
    const { res } = await run(fakeRequest("/paints/AK11001.webp"));
    expect(res.statusCode).toBe(404);
  });
});
