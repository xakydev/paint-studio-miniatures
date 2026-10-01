import { OWNERSHIP, type CollectionEntry, type Ownership } from "./types";

/** Nivel con el que se crea una entrada nueva, o una reactivada: bote lleno. */
const FRESH_LEVEL = 3;

// Límites que reflejan los CHECK de `collection_entries` en
// supabase/migrations/20261001061555_esquema_inicial.sql.
const CODE_MIN_LENGTH = 1;
const CODE_MAX_LENGTH = 64;
const LEVEL_MIN = 0;
const LEVEL_MAX = 3;
const NOTE_MAX_LENGTH = 10000;

/** Postgres valida el formato con `timestamptz`; aquí, que `Date.parse` no dé NaN. */
function isParsableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Quita una referencia de la colección. El borrado es lógico: los puertos
 * nunca eliminan filas, así que la entrada se conserva y se marca
 * `deletedAt`/`updatedAt` con `now`. `status`, `level` y `note` no se tocan:
 * son el dato recuperable si se reactiva más tarde.
 */
export function removeEntry(entry: CollectionEntry, now: string): CollectionEntry {
  return { ...entry, deletedAt: now, updatedAt: now };
}

/**
 * Marca una referencia con un estado ("owned"/"wishlist"). Si ya hay una
 * entrada activa (`existing` sin `deletedAt`), solo cambia su estado. Si no
 * hay entrada, o la que hay está borrada, se recrea desde cero: `level` 3,
 * sin `note` y sin `deletedAt` — igual que una pintura marcada por primera vez.
 */
export function markStatus(
  code: string,
  status: Ownership,
  now: string,
  existing?: CollectionEntry,
): CollectionEntry {
  if (existing !== undefined && existing.deletedAt === undefined) {
    return { ...existing, status, updatedAt: now };
  }

  return { code, status, level: FRESH_LEVEL, updatedAt: now };
}

/** Fusiona dos listas por una clave: lo nuevo sustituye a lo que la comparte. */
export function upsertByKey<T>(
  current: readonly T[],
  changed: readonly T[],
  keyOf: (item: T) => string,
): T[] {
  const byKey = new Map(current.map((item) => [keyOf(item), item]));
  for (const item of changed) {
    byKey.set(keyOf(item), item);
  }
  return [...byKey.values()];
}

/**
 * Calcula los registros cambiados al restaurar una colección desde un
 * respaldo: lo importado, con `updatedAt` sellado a `now` (para que gane en
 * una resolución LWW frente a lo que ya hubiera, sin importar el `updatedAt`
 * que trajera el fichero) conservando su `deletedAt` si lo trae, más un
 * `removeEntry` por cada entrada ACTIVA de `current` que no venga en lo
 * importado. No se devuelve la colección completa: solo lo que el Provider
 * tiene que pasar a `commitEntries`, igual que hacía la lógica inline que
 * sustituye.
 */
export function restoreCollection(
  current: readonly CollectionEntry[],
  imported: readonly CollectionEntry[],
  now: string,
): CollectionEntry[] {
  const importedCodes = new Set(imported.map((entry) => entry.code));
  return [
    ...imported.map((entry) => ({ ...entry, updatedAt: now })),
    ...current
      .filter((entry) => entry.deletedAt === undefined && !importedCodes.has(entry.code))
      .map((entry) => removeEntry(entry, now)),
  ];
}

/**
 * Espejo de los CHECK de `collection_entries` en
 * supabase/migrations/20261001061555_esquema_inicial.sql: si cambia uno de
 * los dos, cambia el otro. Antes de subir una entrada a Supabase hace falta
 * saber si pasaría sus restricciones, porque un solo CHECK violado aborta la
 * sentencia entera (y con ella el lote completo del volcado).
 */
export function isEntryWithinDomainLimits(entry: CollectionEntry): boolean {
  return (
    entry.code.length >= CODE_MIN_LENGTH &&
    entry.code.length <= CODE_MAX_LENGTH &&
    (entry.status === OWNERSHIP.OWNED || entry.status === OWNERSHIP.WISHLIST) &&
    // smallint no admite decimales: un level 2.5 no cabría en la columna.
    Number.isInteger(entry.level) &&
    entry.level >= LEVEL_MIN &&
    entry.level <= LEVEL_MAX &&
    (entry.note === undefined || entry.note.length <= NOTE_MAX_LENGTH) &&
    isParsableDate(entry.updatedAt) &&
    (entry.deletedAt === undefined || isParsableDate(entry.deletedAt))
  );
}
