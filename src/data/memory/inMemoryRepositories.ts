import type { RecipeRecord } from "../../domain/recipes";
import type { CollectionEntry } from "../../domain/types";
import type { CollectionRepository } from "../ports/CollectionRepository";
import type { RecipeRepository } from "../ports/RecipeRepository";

export type Unsubscribe = () => void;

/**
 * Repositorio en memoria para tests del `LibraryProvider`: en vez del
 * adaptador de localStorage, el test pasa uno de estos por prop y controla
 * cuándo resuelve la carga y cuándo llega un cambio remoto.
 */
export interface InMemoryRepository<T> {
  load(): Promise<T[]>;
  upsert(records: readonly T[]): Promise<void>;
  subscribe(listener: (changed: readonly T[]) => void): Unsubscribe;
  /** Resuelve la promesa de `load` con estos registros: el test decide cuándo. */
  resolveLoad(records: readonly T[]): void;
  /** Rechaza la promesa de `load`, para probar el arranque con un fallo de lectura. */
  rejectLoad(error: unknown): void;
  /** Simula un cambio remoto notificando a quien esté suscrito. */
  emit(records: readonly T[]): void;
  /**
   * Hace que los siguientes `upsert` rechacen con este error (siguen
   * quedando registrados en `upserts`); `null` vuelve a aceptarlos.
   */
  failUpserts(error: Error | null): void;
  /**
   * Cada lote recibido por `upsert`, en orden. Es lo que permite comprobar
   * que no se escribe nada antes de terminar la carga, o qué se escribió.
   */
  readonly upserts: readonly (readonly T[])[];
  /** Cuántas veces se ha llamado a `load`: más de una delata un bucle de carga. */
  readonly loadCount: number;
  /** Suscriptores vivos: tras desmontar el Provider tiene que ser 0. */
  readonly listenerCount: number;
}

function createInMemoryRepository<T>(): InMemoryRepository<T> {
  let resolveLoad: ((records: T[]) => void) | undefined;
  let rejectLoad: ((error: unknown) => void) | undefined;
  const loaded = new Promise<T[]>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  const listeners = new Set<(changed: readonly T[]) => void>();
  const upserts: (readonly T[])[] = [];
  let loadCount = 0;
  let upsertError: Error | null = null;

  return {
    load: () => {
      loadCount += 1;
      return loaded;
    },
    // No persiste nada: el estado observable llega por `resolveLoad`/`emit`,
    // que controla el test. Solo se registra la llamada para poder
    // comprobarla.
    upsert: async (records) => {
      upserts.push([...records]);
      if (upsertError) throw upsertError;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    resolveLoad: (records) => resolveLoad?.([...records]),
    rejectLoad: (error) => rejectLoad?.(error),
    emit: (records) => {
      for (const listener of listeners) listener(records);
    },
    failUpserts: (error) => {
      upsertError = error;
    },
    upserts,
    get loadCount() {
      return loadCount;
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

export function createInMemoryCollectionRepository(): InMemoryRepository<CollectionEntry> &
  CollectionRepository {
  return createInMemoryRepository<CollectionEntry>();
}

export function createInMemoryRecipeRepository(): InMemoryRepository<RecipeRecord> &
  RecipeRepository {
  return createInMemoryRepository<RecipeRecord>();
}
