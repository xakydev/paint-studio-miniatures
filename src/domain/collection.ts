import type { CollectionEntry, Ownership } from "./types";

/** Nivel con el que se crea una entrada nueva, o una reactivada: bote lleno. */
const FRESH_LEVEL = 3;

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
