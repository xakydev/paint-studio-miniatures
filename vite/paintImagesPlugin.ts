/**
 * Plugin de Vite de las fotos locales de AK (`local-assets/paints/`).
 *
 * Hace dos cosas, y las dos dependen de que estemos en el dev server:
 * - expone `virtual:paint-images`, el mapa código → URL. En `serve` sale del
 *   manifiesto local; en `build` es SIEMPRE `{}` y ni siquiera se lee el disco,
 *   así que «el build no lleva fotos» se cumple por construcción.
 * - sirve `/paints/AK123.webp` con un middleware en `configureServer`, hook que
 *   Vite solo llama al crear el dev server: ni el build ni `vite preview`
 *   (que tiene su propio `configurePreviewServer`, aquí sin implementar) lo
 *   ejecutan, de modo que las fotos solo salen de la máquina hacia la LAN
 *   mientras corre `npm run dev`.
 *
 * Por eso el plugin no lleva `apply`: con `apply: 'serve'` el build no sabría
 * resolver el import del módulo virtual y fallaría.
 */
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { join, resolve, sep } from "node:path";

import type { Plugin } from "vite";

import { isLocalManifest, type LocalManifest } from "../scripts/paintImagesCore.ts";

const VIRTUAL_ID = "virtual:paint-images";
// El prefijo \0 es la convención de Rollup/Vite para ids virtuales: ningún
// otro plugin intenta resolverlos ni cargarlos del disco.
const RESOLVED_VIRTUAL_ID = `\0${VIRTUAL_ID}`;

const PAINTS_DIR = join("local-assets", "paints");
const MANIFEST_FILE = "manifest.json";
const URL_PREFIX = "/paints/";
/** Lista blanca: lo único que el middleware sirve. Sin `..`, sin otras extensiones. */
const PHOTO_ROUTE = /^\/paints\/(AK\d+)\.webp$/;
const PHOTO_CODE = /^AK\d+$/;

const EMPTY_MODULE = "export const paintImageUrls = {}";

/**
 * Código del módulo virtual. En `build` no mira el manifiesto: aunque lo
 * reciba con fotos, el bundle nunca debe conocer ninguna URL local.
 * En `serve` solo publica las entradas que el middleware sabría servir, para
 * no generar peticiones condenadas al 404.
 */
export function manifestModuleSource(command: "serve" | "build", manifest: LocalManifest | null): string {
  if (command === "build" || manifest === null) return EMPTY_MODULE;
  const urls: Record<string, string> = {};
  for (const [code, entry] of Object.entries(manifest.images)) {
    if (PHOTO_CODE.test(code) && entry.file === `${code}.webp`) {
      urls[code] = `${URL_PREFIX}${entry.file}`;
    }
  }
  return `export const paintImageUrls = ${JSON.stringify(urls)}`;
}

/**
 * Ruta en disco de la foto pedida, o `null` si la URL no es una foto nuestra.
 * Se decodifica ANTES de validar para que `%2e%2e%2f` no se cuele como texto
 * inocuo, y aun pasando la lista blanca se comprueba que la ruta resuelta queda
 * dentro de `local-assets/paints/` (defensa en profundidad).
 */
export function photoPathFor(root: string, url: string): string | null {
  const pathname = url.split("?", 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    // Secuencia % malformada: no es ninguna foto válida.
    return null;
  }
  const match = PHOTO_ROUTE.exec(decoded);
  if (match === null) return null;
  const dir = resolve(root, PAINTS_DIR);
  const file = resolve(dir, `${match[1]}.webp`);
  return file.startsWith(dir + sep) ? file : null;
}

/** Lo mínimo de `IncomingMessage` que el middleware usa; así se simula en los tests. */
export interface PhotoRequest {
  readonly url?: string | undefined;
  readonly method?: string | undefined;
  readonly headers: IncomingHttpHeaders;
}

/** Lo mínimo de `ServerResponse` que el middleware usa. */
export interface PhotoResponse {
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  end(chunk?: Buffer): unknown;
}

function weakEtag(size: number, mtimeMs: number): string {
  return `W/"${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}"`;
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (header === undefined) return false;
  return header.split(",").some((candidate) => {
    const value = candidate.trim();
    return value === "*" || value === etag;
  });
}

/** Respuesta vacía con el código dado: nada de `index.html` del fallback de la SPA. */
function endEmpty(res: PhotoResponse, status: number): void {
  res.statusCode = status;
  res.end();
}

/**
 * Middleware de las fotos. Todo lo que no empiece por `/paints/` sigue con
 * `next()`; lo que empiece por `/paints/` y no pase la lista blanca, o no
 * exista, recibe 404 aquí mismo. Nunca lanza: un error de disco se convierte
 * en una respuesta, no en un dev server caído.
 */
export function createPhotoMiddleware(root: string) {
  return async (req: PhotoRequest, res: PhotoResponse, next: () => void): Promise<void> => {
    const url = req.url ?? "/";
    if (!url.startsWith(URL_PREFIX)) {
      next();
      return;
    }
    const file = photoPathFor(root, url);
    if (file === null) {
      endEmpty(res, 404);
      return;
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) {
        endEmpty(res, 404);
        return;
      }
      const etag = weakEtag(info.size, info.mtimeMs);
      res.setHeader("Content-Type", "image/webp");
      // private: que ninguna caché compartida de la LAN guarde las fotos.
      // no-cache: el navegador revalida con el ETag y recibe un 304 barato.
      res.setHeader("Cache-Control", "private, no-cache");
      res.setHeader("ETag", etag);
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (etagMatches(req.headers["if-none-match"], etag)) {
        endEmpty(res, 304);
        return;
      }
      if (req.method === "HEAD") {
        res.setHeader("Content-Length", String(info.size));
        endEmpty(res, 200);
        return;
      }
      const body = await readFile(file);
      res.statusCode = 200;
      res.setHeader("Content-Length", String(body.length));
      res.end(body);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      endEmpty(res, code === "ENOENT" || code === "ENOTDIR" ? 404 : 500);
    }
  };
}

/** Lee y valida el manifiesto. Ausente o corrupto → `null` con aviso, nunca un error. */
async function readManifest(root: string, warn: (message: string) => void): Promise<LocalManifest | null> {
  const path = join(root, PAINTS_DIR, MANIFEST_FILE);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    // Lo normal en un clon sin fotos: la app se ve igual que sin el plugin.
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    warn(`[paint-images] ${path} no es JSON válido; la app sale sin fotos.`);
    return null;
  }
  if (!isLocalManifest(parsed)) {
    warn(`[paint-images] ${path} no tiene la forma esperada; la app sale sin fotos.`);
    return null;
  }
  // Una entrada cuyo fichero ya no está daría un 404 por cada tarjeta.
  const images = Object.fromEntries(
    Object.entries(parsed.images).filter(([, entry]) => existsSync(join(root, PAINTS_DIR, entry.file))),
  );
  return { version: 1, images };
}

export function paintImagesPlugin(options: { root?: string } = {}): Plugin {
  let command: "serve" | "build" = "build";
  let root = options.root ?? process.cwd();
  let warn: (message: string) => void = (message) => console.warn(message);

  return {
    name: "paint-images",
    configResolved(config) {
      command = config.command;
      root = options.root ?? config.root;
      warn = (message) => config.logger.warn(message);
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_VIRTUAL_ID : null;
    },
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      // En build no se toca el disco: el resultado es {} pase lo que pase.
      if (command === "build") return manifestModuleSource("build", null);
      return manifestModuleSource("serve", await readManifest(root, warn));
    },
    configureServer(server) {
      // Sin devolver función: se monta ANTES de los middlewares internos, así
      // el fallback de la SPA nunca contesta 200 con index.html a /paints/….
      const middleware = createPhotoMiddleware(root);
      server.middlewares.use((req, res, next) => {
        void middleware(req, res, next);
      });
    },
  };
}
