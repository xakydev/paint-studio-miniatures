/**
 * Núcleo puro del script de fotos de AK Interactive: parsea los sitemaps de
 * Yoast, empareja las URLs con el catálogo, calcula la cobertura, planifica
 * qué falta descargar y reintenta las peticiones con ritmo limitado. Nada de
 * red ni de disco aquí (`fetch` y `sleep` se inyectan, la existencia de un
 * fichero se consulta a través de una función); la cáscara que hace las
 * peticiones de verdad y escribe en disco es `fetch-images.ts`.
 */

// ---------------------------------------------------------------------------
// Parseo de los sitemaps de Yoast (regex, sin parser XML: ver design.md).
// ---------------------------------------------------------------------------

/** Las cinco entidades XML básicas; es lo único que un sitemap de Yoast usa. */
const XML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXmlEntities(text: string): string {
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&apos;/g, (entity) => XML_ENTITIES[entity] ?? entity);
}

/** Si el contenido de la etiqueta viene envuelto en CDATA, se desenvuelve; si no, se decodifican entidades. */
function unwrapLocText(raw: string): string {
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  if (cdata?.[1] !== undefined) return cdata[1].trim();
  return decodeXmlEntities(raw.trim());
}

/** Extrae el texto de todas las apariciones de `<tag>…</tag>`, en orden. */
function extractTagTexts(xml: string, tag: string): string[] {
  const pattern = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "g");
  const texts: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    const content = match[1];
    if (content !== undefined) texts.push(unwrapLocText(content));
  }
  return texts;
}

/** Nombre de los sitemaps de producto generados por Yoast: `product-sitemap1.xml`, `product-sitemap24.xml`… */
const PRODUCT_SITEMAP = /\/product-sitemap\d*\.xml$/i;

/** Se compara contra la ruta, no la URL entera: una query string no debe descartar un sitemap válido. */
function isProductSitemapUrl(url: string): boolean {
  try {
    return PRODUCT_SITEMAP.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

/**
 * De `sitemap_index.xml`, las URLs `<loc>` cuyo nombre de fichero es un
 * sitemap de producto. El resto (páginas, categorías…) se descarta: así no
 * hace falta fijar en el código cuántos sitemaps de producto hay.
 */
export function parseSitemapIndex(xml: string): string[] {
  return extractTagTexts(xml, "loc").filter(isProductSitemapUrl);
}

/** De un sitemap de producto, las URLs `<image:loc>` (no el `<loc>` de la página). */
export function parseImageLocs(xml: string): string[] {
  return extractTagTexts(xml, "image:loc");
}

// ---------------------------------------------------------------------------
// Emparejamiento con el catálogo.
// ---------------------------------------------------------------------------

/**
 * Host real de las fotos de producto de AK Interactive (confirmado en
 * explore.md: `ak-interactive.com/wp-content/uploads/…`). Cualquier otro
 * host se rechaza, aunque el nombre de fichero parezca válido.
 */
const AK_HOST = "ak-interactive.com";

/**
 * Nombre de fichero de una foto de producto, tal como la publica AK:
 * - `AK11179.jpg`, el caso general;
 * - `AK11237_web.jpg`, como publica los barnices;
 * - `AK11245-1.jpg`, como publica las imprimaciones (variantes numeradas).
 *
 * Deliberadamente NO matchea `AK11179-300x300.jpg` ni `AK11245-1-300x300.jpg`:
 * el sufijo `-WxH` es un recorte que genera WordPress, no la foto original.
 * Tampoco otros sufijos (`AK8273_02_Web.jpg` son fotos secundarias del mismo
 * producto, no el bote).
 */
const PRODUCT_IMAGE_FILENAME = /^(AK\d+)(?:(_web)|-(\d+))?\.(?:jpe?g|png|webp)$/i;

interface ImageCandidate {
  readonly url: string;
  /** Menor es mejor: 0 nombre exacto, 1 `_web`, 2 + N para `-N`. */
  readonly rank: number;
}

/** Prefiere la foto canónica: exacta, luego `_web`, luego la variante `-N` más baja. */
function rankOf(match: RegExpExecArray): number {
  if (match[2] !== undefined) return 1;
  if (match[3] !== undefined) return 2 + Number(match[3]);
  return 0;
}

function fileNameOf(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    return pathname.slice(pathname.lastIndexOf("/") + 1);
  } catch {
    return null;
  }
}

function isOfficialAkHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === AK_HOST;
  } catch {
    return false;
  }
}

export interface CatalogConflict {
  readonly code: string;
  /** Todas las URLs en conflicto, en el orden en que llegaron; la elegida es la última tras ordenar. */
  readonly urls: readonly string[];
}

export interface CatalogMatch {
  /** Código → URL elegida. */
  readonly images: Readonly<Record<string, string>>;
  /** Códigos del catálogo sin ninguna URL encontrada (excluidos o no). */
  readonly missing: readonly string[];
  /** Un código con más de una URL candidata: gana la más canónica (ver `rankOf`). */
  readonly conflicts: readonly CatalogConflict[];
  /** Códigos excluidos que sí aparecen en los sitemaps: la exclusión ha caducado. */
  readonly staleExclusions: readonly string[];
}

/**
 * Construye el mapa código→URL a partir de las `image:loc` de todos los
 * sitemaps de producto, aceptando solo fotos del host oficial cuyo nombre de
 * fichero sea `AK<código>.<ext>` (o sus variantes `_web` y `-N`) y cuyo
 * código exista en el catálogo.
 *
 * @param urls URLs de imagen tal como aparecen en los sitemaps (sin deduplicar).
 * @param codes Códigos del catálogo (p. ej. `catalog.json` mapeado a `code`).
 * @param excluded Códigos marcados como excluidos en `data/ak-images.json`.
 */
export function matchCatalog(
  urls: readonly string[],
  codes: readonly string[],
  excluded: readonly string[],
): CatalogMatch {
  const catalogCodes = new Set(codes);
  const excludedCodes = new Set(excluded);
  const candidates = new Map<string, ImageCandidate[]>();

  // La misma foto aparece una vez por idioma (página en inglés y en español):
  // repetida no es un conflicto.
  for (const url of new Set(urls)) {
    if (!isOfficialAkHost(url)) continue;
    const fileName = fileNameOf(url);
    if (fileName === null) continue;
    const match = PRODUCT_IMAGE_FILENAME.exec(fileName);
    if (match === null) continue;
    const code = match[1]?.toUpperCase();
    if (code === undefined || !catalogCodes.has(code)) continue;

    const candidate: ImageCandidate = { url, rank: rankOf(match) };
    const existing = candidates.get(code);
    if (existing === undefined) candidates.set(code, [candidate]);
    else existing.push(candidate);
  }

  const images: Record<string, string> = {};
  const conflicts: CatalogConflict[] = [];
  const staleExclusions: string[] = [];

  for (const [code, codeCandidates] of candidates) {
    // Primero la variante más canónica; a igualdad, la URL lexicográficamente
    // mayor, que en WordPress es la subida más reciente (`uploads/AAAA/MM/`).
    const best = Math.min(...codeCandidates.map((candidate) => candidate.rank));
    const sorted = codeCandidates
      .filter((candidate) => candidate.rank === best)
      .map((candidate) => candidate.url)
      .sort();
    const chosen = sorted[sorted.length - 1];
    if (chosen === undefined) continue;
    images[code] = chosen;
    if (codeCandidates.length > 1) {
      conflicts.push({ code, urls: codeCandidates.map((candidate) => candidate.url) });
    }
    if (excludedCodes.has(code)) staleExclusions.push(code);
  }

  const missing = codes.filter((code) => !(code in images));

  return {
    images,
    missing,
    conflicts: conflicts.sort((a, b) => a.code.localeCompare(b.code)),
    staleExclusions: staleExclusions.sort(),
  };
}

// ---------------------------------------------------------------------------
// Cobertura.
// ---------------------------------------------------------------------------

/** Por debajo de esto, el script aborta sin descargar nada (decisión del usuario, ver design.md). */
export const MIN_COVERAGE = 0.95;

/**
 * Proporción de códigos cubiertos sobre los esperados. `expected` es
 * `|catálogo| − |excluidos|`: los excluidos no cuentan en contra. Si no se
 * espera ninguna imagen (todo está excluido), la cobertura es del 100 %, no
 * una división por cero.
 */
export function coverage(found: number, expected: number): number {
  if (expected <= 0) return 1;
  return found / expected;
}

// ---------------------------------------------------------------------------
// Guards de los JSON (núcleo y manifiesto local).
// ---------------------------------------------------------------------------

export interface AkImagesFile {
  readonly images: Readonly<Record<string, string>>;
  readonly excluded: Readonly<Record<string, string>>;
  readonly missing: readonly string[];
}

export interface LocalManifestEntry {
  readonly file: string;
  readonly source: string;
}

export interface LocalManifest {
  readonly version: 1;
  readonly images: Readonly<Record<string, LocalManifestEntry>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Guarda de `data/ak-images.json`: rechaza cualquier forma que no sea exactamente la esperada. */
export function isAkImagesFile(value: unknown): value is AkImagesFile {
  if (!isRecord(value)) return false;
  return (
    isStringRecord(value.images) &&
    isStringRecord(value.excluded) &&
    isStringArray(value.missing)
  );
}

function isLocalManifestEntry(value: unknown): value is LocalManifestEntry {
  return isRecord(value) && typeof value.file === "string" && typeof value.source === "string";
}

/** Guarda de `local-assets/paints/manifest.json`. Un manifiesto corrupto no debe lanzar, solo fallar el guard. */
export function isLocalManifest(value: unknown): value is LocalManifest {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (!isRecord(value.images)) return false;
  return Object.values(value.images).every(isLocalManifestEntry);
}

// ---------------------------------------------------------------------------
// Plan de descargas (idempotencia).
// ---------------------------------------------------------------------------

/**
 * Códigos pendientes de descargar: los que faltan en el manifiesto, los que
 * ya no coinciden con la `source` registrada (AK cambió la URL) y los que el
 * manifiesto dice tener pero el fichero ya no existe en disco.
 *
 * `exists` es la única puerta de entrada al sistema de ficheros real; aquí
 * se recibe ya inyectada para mantener la función pura y comprobable sin disco.
 */
export function planDownloads(
  map: Readonly<Record<string, string>>,
  manifest: LocalManifest,
  exists: (code: string) => boolean,
): string[] {
  const pending: string[] = [];
  for (const code of Object.keys(map)) {
    const entry = manifest.images[code];
    const sourceChanged = entry !== undefined && entry.source !== map[code];
    if (entry === undefined || sourceChanged || !exists(code)) {
      pending.push(code);
    }
  }
  return pending;
}

// ---------------------------------------------------------------------------
// Descarga con reintentos, ritmo limitado y User-Agent identificable.
// ---------------------------------------------------------------------------

export interface FetchDeps {
  /** Inyectado para no golpear la red en los tests; en producción es el `fetch` global. */
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Inyectado para no esperar de verdad en los tests; en producción, un `setTimeout` prometizado. */
  readonly sleep: (ms: number) => Promise<void>;
}

export interface FetchWithRetryOptions {
  readonly userAgent: string;
  /** Milisegundos antes de abortar una petición individual. Por defecto 30 s. */
  readonly timeoutMs?: number;
  /** Reintentos como mucho, sin contar el intento inicial. Por defecto 3. */
  readonly maxRetries?: number;
  /** Backoff en ms por intento de reintento, si no hay `Retry-After`. Por defecto 2 s / 4 s / 8 s. */
  readonly backoffMs?: readonly number[];
  /** Reloj inyectable, solo para poder probar `Retry-After` en formato fecha HTTP sin esperar de verdad. */
  readonly now?: () => number;
}

const DEFAULT_BACKOFF_MS: readonly number[] = [2000, 4000, 8000];

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** `Retry-After` en segundos, o como fecha HTTP (RFC 7231 §7.1.3). `null` si no hay cabecera o no se entiende. */
function retryAfterMs(response: Response, now: number): number | null {
  const header = response.headers.get("Retry-After");
  if (header === null) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) return Math.max(0, asDate - now);

  return null;
}

/**
 * Pide `url` con el `User-Agent` del script y un tope de tiempo por
 * petición. Reintenta, con el backoff indicado (o `Retry-After` en un 429),
 * un error de red, un 5xx o un 429; cualquier otro 4xx se devuelve tal cual,
 * sin reintentar. Al agotar los reintentos: si el fallo fue una respuesta
 * (no un error de red), se devuelve esa última respuesta para que la cáscara
 * decida; si fue un error de red, se propaga.
 */
export async function fetchWithRetry(
  url: string,
  deps: FetchDeps,
  opts: FetchWithRetryOptions,
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const now = opts.now ?? Date.now;

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await deps.fetch(url, {
        headers: { "User-Agent": opts.userAgent },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      await deps.sleep(backoff[attempt] ?? backoff[backoff.length - 1] ?? 0);
      continue;
    }

    if (response.ok || !isRetryableStatus(response.status) || attempt >= maxRetries) {
      return response;
    }

    const waitMs = retryAfterMs(response, now()) ?? backoff[attempt] ?? backoff[backoff.length - 1] ?? 0;
    await deps.sleep(waitMs);
  }
}
