import { readArray, writeJson, writeText } from "./storageJson";

export type Unsubscribe = () => void;

export interface LocalStoreOptions<T> {
  /** Clave de localStorage. Estable: no cambia entre versiones. */
  key: string;
  /** Valida cada elemento leído; lo que no pasa se descarta en silencio. */
  isRecord: (value: unknown) => value is T;
  /** Clave de negocio del registro (`code`, `id`...), usada por `upsert`. */
  keyOf: (record: T) => string;
  /** Completa campos que una versión anterior no escribía (p. ej. `updatedAt`). */
  normalize?: (record: T) => T;
}

/**
 * Adaptador genérico sobre localStorage: valida con `isRecord` al leer, funde
 * por `keyOf` en `upsert` (nunca elimina, ni siquiera lo que no sabe leer) y expone un `subscribe` no-op, porque
 * escuchar cambios de otras pestañas queda fuera de alcance por ahora.
 * `localStorageStore` es un detalle de implementación: los puertos
 * (`data/ports`) son la interfaz pública que usa el resto de la app.
 */
export function localStorageStore<T>(options: LocalStoreOptions<T>) {
  const { key, isRecord, keyOf, normalize } = options;

  function readAll(): T[] {
    const valid = readArray(key).items.filter(isRecord);
    return normalize ? valid.map(normalize) : valid;
  }

  return {
    async load(): Promise<T[]> {
      return readAll();
    },
    async upsert(records: readonly T[]): Promise<void> {
      // Se funde sobre lo guardado en bruto, no sobre lo validado: un registro
      // que el guard no entiende (datos de otra versión, un campo nuevo) no se
      // muestra, pero reescribir la clave no puede borrarlo. Nada se pierde.
      const stored = readArray(key);
      if (stored.unreadable) {
        // No se pudo leer lo que había: escribir ahora lo pisaría sin haberlo
        // leído primero, y eso sí podría perder datos. Mejor no escribir.
        throw new Error(
          `No se pudo leer "${key}" de localStorage antes de guardar: no se escriben los cambios para no perder lo que ya hubiera.`,
        );
      }
      if (stored.corrupt !== undefined) {
        // Ilegible no es lo mismo que irrecuperable: se aparta a mano antes de
        // escribir encima, para poder rescatarlo desde las DevTools.
        writeText(`${key}:corrupt:${new Date().toISOString()}`, stored.corrupt);
      }

      const pending = new Map(records.map((record) => [keyOf(record), record]));
      const next = stored.items.map((item) => {
        if (!isRecord(item)) return item;
        const replacement = pending.get(keyOf(item));
        if (replacement === undefined) return item;
        pending.delete(keyOf(item));
        return replacement;
      });
      writeJson(key, [...next, ...pending.values()]);
    },
    subscribe(): Unsubscribe {
      return () => {};
    },
  };
}
