/**
 * Cáscara de I/O del script de fotos de AK Interactive: hace las peticiones
 * de red, convierte con sharp y escribe en disco. La lógica pura — parseo de
 * sitemaps, emparejamiento con el catálogo, cobertura, plan de descargas y
 * reintentos — vive en `paintImagesCore.ts` y se reutiliza tal cual.
 *
 * Todas las dependencias de I/O (`fetch`, `sleep`, el sistema de ficheros y
 * el conversor de imagen) se inyectan, así que `runFetchImages` se prueba
 * sin tocar la red ni el disco real; `main()` es lo único que las cablea de
 * verdad y es lo único que se ejecuta al invocar `node scripts/fetch-images.ts`.
 *
 * Uso: npm run fetch:images
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  type AkImagesFile,
  type FetchDeps,
  type FetchWithRetryOptions,
  type LocalManifest,
} from "./paintImagesCore.ts";

// ---------------------------------------------------------------------------
// User-Agent: identifica el script y el repositorio público, sin datos
// personales (ver design.md: «ritmo, User-Agent y reintentos»).
// ---------------------------------------------------------------------------

export function buildUserAgent(version: string): string {
  return `paint-studio-miniatures/${version} (uso personal; +https://github.com/xakydev/paint-studio-miniatures)`;
}

// ---------------------------------------------------------------------------
// Ritmo: al menos `minIntervalMs` entre el inicio de una petición y el de la
// siguiente, se trate de un sitemap o de la descarga de una foto. Envuelve
// `fetchWithRetry` del núcleo; aquí solo se añade la espera previa.
// ---------------------------------------------------------------------------

const DEFAULT_MIN_INTERVAL_MS = 1000;

export function createPacedFetch(
  deps: FetchDeps,
  opts: FetchWithRetryOptions & { readonly minIntervalMs?: number },
): (url: string) => Promise<Response> {
  const minIntervalMs = opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = opts.now ?? Date.now;
  let lastStartedAt: number | null = null;

  return async (url: string): Promise<Response> => {
    if (lastStartedAt !== null) {
      const elapsed = now() - lastStartedAt;
      const wait = minIntervalMs - elapsed;
      if (wait > 0) await deps.sleep(wait);
    }
    lastStartedAt = now();
    return fetchWithRetry(url, deps, opts);
  };
}

// ---------------------------------------------------------------------------
// Sitemaps: el índice y luego cada sitemap de producto, a ritmo. Un 4xx en
// cualquiera de los dos aborta la lectura entera (ver design.md: «Manejo de
// errores», 0 sitemaps o un sitemap con 4xx abortan sin escribir nada).
// ---------------------------------------------------------------------------

export async function fetchAllImageUrls(
  pacedFetch: (url: string) => Promise<Response>,
  sitemapIndexUrl: string,
  log: (message: string) => void,
): Promise<string[]> {
  const indexResponse = await pacedFetch(sitemapIndexUrl);
  if (!indexResponse.ok) {
    throw new Error(`${sitemapIndexUrl}: HTTP ${indexResponse.status}`);
  }
  const productSitemaps = parseSitemapIndex(await indexResponse.text());
  log(`índice de sitemaps: ${productSitemaps.length} sitemap(s) de producto`);

  const urls: string[] = [];
  for (const sitemapUrl of productSitemaps) {
    const response = await pacedFetch(sitemapUrl);
    if (!response.ok) {
      throw new Error(`${sitemapUrl}: HTTP ${response.status}`);
    }
    urls.push(...parseImageLocs(await response.text()));
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Informe: qué códigos quedaron sin foto, distinguiendo los excluidos.
// ---------------------------------------------------------------------------

export function formatMissingReport(
  missing: readonly string[],
  excluded: Readonly<Record<string, string>>,
): string {
  if (missing.length === 0) {
    return "Sin referencias pendientes: todas tienen foto o están excluidas explícitamente.";
  }
  const lines = [...missing]
    .sort()
    .map((code) => {
      const reason = excluded[code];
      return reason !== undefined ? `  ${code} (excluida: ${reason})` : `  ${code}`;
    });
  return [`Referencias sin foto (${missing.length}):`, ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Ruta de destino: SIEMPRE a partir del código ya validado por matchCatalog
// (forma `AK<dígitos>`), nunca de la URL. Así ninguna URL rara puede escribir
// fuera de `local-assets/paints/`.
// ---------------------------------------------------------------------------

const SAFE_CODE = /^AK\d+$/;

export function photoPath(paintsDir: string, code: string): string {
  if (!SAFE_CODE.test(code)) {
    throw new Error(`código inválido para construir la ruta de la foto: ${code}`);
  }
  return join(paintsDir, `${code}.webp`);
}

// ---------------------------------------------------------------------------
// Conversión con sharp: una única miniatura WebP de hasta 320 px, sin
// conservar el JPEG original. `sharp` se importa de forma dinámica, solo
// cuando de verdad hay algo que convertir (ver design.md: «miniatura con
// sharp» y el riesgo de instalación documentado en design.md).
// ---------------------------------------------------------------------------

export const THUMBNAIL_SIZE = 320;

export type ImageConverter = (original: Uint8Array) => Promise<Uint8Array>;

export async function convertToThumbnailWebp(original: Uint8Array): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const buffer = await sharp(original)
    .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return new Uint8Array(buffer);
}

// ---------------------------------------------------------------------------
// Sistema de ficheros inyectado: lo mínimo que la cáscara necesita, con la
// misma forma que las funciones de `node:fs` para que cablear la versión
// real en `main()` sea trivial.
// ---------------------------------------------------------------------------

export interface FsPort {
  readonly existsSync: (path: string) => boolean;
  readonly readFileSync: (path: string) => string;
  readonly writeFileSync: (path: string, data: Uint8Array | string) => void;
  readonly renameSync: (from: string, to: string) => void;
  readonly mkdirSync: (path: string) => void;
}

function writeAtomic(fs: FsPort, path: string, data: Uint8Array | string): void {
  const tmp = `${path}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, path);
}

function writeJsonAtomic(fs: FsPort, path: string, value: unknown): void {
  writeAtomic(fs, path, `${JSON.stringify(value, null, 2)}\n`);
}

function sortRecord(record: Readonly<Record<string, string>>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(record).sort()) {
    const value = record[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
}

interface CatalogEntry {
  readonly code: string;
}

function isCatalogEntry(value: unknown): value is CatalogEntry {
  return typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).code === "string";
}

function readCatalogCodes(fs: FsPort, path: string): string[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(path));
  if (!Array.isArray(parsed)) {
    throw new Error(`${path}: se esperaba un array de referencias`);
  }
  return parsed.filter(isCatalogEntry).map((entry) => entry.code);
}

const EMPTY_AK_IMAGES_FILE: AkImagesFile = { images: {}, excluded: {}, missing: [] };
const EMPTY_LOCAL_MANIFEST: LocalManifest = { version: 1, images: {} };

/** Un `data/ak-images.json` ausente o corrupto nunca lanza: se parte de vacío, con aviso. */
function readAkImagesFile(fs: FsPort, path: string, log: (message: string) => void): AkImagesFile {
  if (!fs.existsSync(path)) return EMPTY_AK_IMAGES_FILE;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path));
  } catch {
    log(`aviso: ${path} no es JSON válido; se ignora`);
    return EMPTY_AK_IMAGES_FILE;
  }
  if (!isAkImagesFile(parsed)) {
    log(`aviso: ${path} tiene una forma inesperada; se ignora`);
    return EMPTY_AK_IMAGES_FILE;
  }
  return parsed;
}

/** Igual que arriba, para el manifiesto local (ver design.md: «el manifiesto local es el registro de idempotencia»). */
function readLocalManifest(fs: FsPort, path: string, log: (message: string) => void): LocalManifest {
  if (!fs.existsSync(path)) return EMPTY_LOCAL_MANIFEST;
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(path));
  } catch {
    log(`aviso: ${path} no es JSON válido; se ignora`);
    return EMPTY_LOCAL_MANIFEST;
  }
  if (!isLocalManifest(parsed)) {
    log(`aviso: ${path} tiene una forma inesperada; se ignora`);
    return EMPTY_LOCAL_MANIFEST;
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Orquestación: el orden descrito en design.md, con todo inyectado.
// ---------------------------------------------------------------------------

export interface FetchImagesDeps {
  readonly fetch: FetchDeps["fetch"];
  readonly sleep: FetchDeps["sleep"];
  readonly fs: FsPort;
  readonly convert: ImageConverter;
  readonly userAgent: string;
  readonly minIntervalMs?: number;
  readonly now?: () => number;
  readonly log?: (message: string) => void;
  readonly logError?: (message: string) => void;
}

export interface FetchImagesPaths {
  readonly catalogFile: string;
  readonly akImagesFile: string;
  readonly sitemapIndexUrl: string;
  readonly paintsDir: string;
  readonly manifestFile: string;
}

/**
 * Hace todo el trabajo y devuelve el código de salida: 0 si todo fue bien,
 * 1 si la cobertura fue insuficiente, los sitemaps fallaron, o quedó alguna
 * foto sin descargar tras agotar los reintentos.
 */
export async function runFetchImages(deps: FetchImagesDeps, paths: FetchImagesPaths): Promise<number> {
  const log = deps.log ?? console.log;
  const logError = deps.logError ?? console.error;

  // 1. El catálogo, ya generado por build-catalog.ts.
  const codes = readCatalogCodes(deps.fs, paths.catalogFile);

  // 2. data/ak-images.json previo, solo para conservar `excluded`.
  const previous = readAkImagesFile(deps.fs, paths.akImagesFile, log);
  const excluded = previous.excluded;

  // 3. Índice de sitemaps y cada sitemap de producto, a ritmo.
  const pacedFetch = createPacedFetch(
    { fetch: deps.fetch, sleep: deps.sleep },
    { userAgent: deps.userAgent, now: deps.now, minIntervalMs: deps.minIntervalMs },
  );

  let imageUrls: string[];
  try {
    imageUrls = await fetchAllImageUrls(pacedFetch, paths.sitemapIndexUrl, log);
  } catch (error) {
    logError(`No se pudieron leer los sitemaps: ${(error as Error).message}`);
    logError("Abortando sin escribir nada.");
    return 1;
  }

  // 4. Emparejamiento con el catálogo.
  const match = matchCatalog(imageUrls, codes, Object.keys(excluded));
  for (const conflict of match.conflicts) {
    log(`aviso: ${conflict.code} tiene ${conflict.urls.length} URLs candidatas; se usa la más reciente`);
  }
  for (const stale of match.staleExclusions) {
    log(`aviso: ${stale} estaba excluido pero el sitemap ya trae foto; la exclusión ha caducado y se usa`);
  }

  // 5. Umbral de cobertura: por debajo, se aborta sin escribir nada.
  const expected = codes.length - Object.keys(excluded).length;
  const ratio = coverage(Object.keys(match.images).length, expected);
  if (ratio < MIN_COVERAGE) {
    logError(
      `Cobertura insuficiente: ${(ratio * 100).toFixed(1)}% ` +
        `(mínimo ${(MIN_COVERAGE * 100).toFixed(0)}%). Abortando sin escribir nada.`,
    );
    logError(formatMissingReport(match.missing, excluded));
    return 1;
  }

  // 6. data/ak-images.json, con claves ordenadas y `excluded` conservado.
  const akImagesFile: AkImagesFile = {
    images: sortRecord(match.images),
    excluded: sortRecord(excluded),
    missing: [...match.missing].sort(),
  };
  writeJsonAtomic(deps.fs, paths.akImagesFile, akImagesFile);

  // 7. Plan de descargas, sobre el manifiesto local existente.
  deps.fs.mkdirSync(paths.paintsDir);
  let manifest = readLocalManifest(deps.fs, paths.manifestFile, log);
  const exists = (code: string): boolean => deps.fs.existsSync(photoPath(paths.paintsDir, code));
  const pending = planDownloads(match.images, manifest, exists);

  // 8. Descarga, conversión y escritura atómica; el manifiesto se reescribe
  //    tras cada foto, así una interrupción a medias no pierde lo ya hecho.
  let failures = 0;
  for (const code of pending) {
    const url = match.images[code];
    if (url === undefined) continue;
    try {
      const response = await pacedFetch(url);
      if (!response.ok) {
        logError(`${code}: descarga falló con HTTP ${response.status}`);
        failures++;
        continue;
      }
      const original = new Uint8Array(await response.arrayBuffer());
      const webp = await deps.convert(original);
      writeAtomic(deps.fs, photoPath(paths.paintsDir, code), webp);

      manifest = {
        version: 1,
        images: { ...manifest.images, [code]: { file: `${code}.webp`, source: url } },
      };
      writeJsonAtomic(deps.fs, paths.manifestFile, manifest);
      log(`${code}: descargada y convertida a WebP`);
    } catch (error) {
      logError(`${code}: ${(error as Error).message}`);
      failures++;
    }
  }

  // 9. Informe final.
  log(formatMissingReport(match.missing, excluded));
  log(
    `Cobertura ${(ratio * 100).toFixed(1)}% · ${pending.length - failures}/${pending.length} descargas nuevas` +
      (failures > 0 ? ` · ${failures} fallida(s)` : ""),
  );

  return failures > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// main(): la única parte que cablea las dependencias reales. Se ejecuta solo
// cuando este fichero es el punto de entrada (`node scripts/fetch-images.ts`),
// nunca al importarlo desde un test.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  const pkg: unknown = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
  const version =
    typeof pkg === "object" && pkg !== null && typeof (pkg as Record<string, unknown>).version === "string"
      ? ((pkg as Record<string, unknown>).version as string)
      : "0.0.0";

  const fs: FsPort = {
    existsSync,
    readFileSync: (path) => readFileSync(path, "utf8"),
    writeFileSync: (path, data) => {
      writeFileSync(path, data);
    },
    renameSync,
    mkdirSync: (path) => {
      mkdirSync(path, { recursive: true });
    },
  };

  const deps: FetchImagesDeps = {
    fetch: (url, init) => fetch(url, init),
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    fs,
    convert: convertToThumbnailWebp,
    userAgent: buildUserAgent(version),
  };

  const paths: FetchImagesPaths = {
    catalogFile: resolve(projectRoot, "src/data/static/catalog.json"),
    akImagesFile: resolve(projectRoot, "data/ak-images.json"),
    sitemapIndexUrl: "https://ak-interactive.com/sitemap_index.xml",
    paintsDir: resolve(projectRoot, "local-assets/paints"),
    manifestFile: resolve(projectRoot, "local-assets/paints/manifest.json"),
  };

  const exitCode = await runFetchImages(deps, paths);
  if (exitCode === 0) {
    console.log("\nListo. Reinicia `npm run dev` para ver las fotos nuevas.");
  }
  process.exitCode = exitCode;
}

const isMainModule =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
