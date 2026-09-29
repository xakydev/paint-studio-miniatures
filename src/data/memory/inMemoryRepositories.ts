import type { RecipeRecord } from "../../domain/recipes";
import type { CollectionEntry } from "../../domain/types";
import type { CollectionRepository } from "../ports/CollectionRepository";
import type { RecipeRepository } from "../ports/RecipeRepository";

export type Unsubscribe = () => void;

/**
 * Repositorio en memoria para tests del `LibraryProvider` (fase 5): en vez
 * del adaptador de localStorage, el test pasa uno de estos por prop y
 * controla cuándo resuelve la carga y cuándo llega un cambio remoto.
 */
export interface InMemoryRepository<T> {
  load(): Promise<T[]>;
  upsert(records: readonly T[]): Promise<void>;
  subscribe(listener: (changed: readonly T[]) => void): Unsubscribe;
  /** Resuelve la promesa de `load` con estos registros: el test decide cuándo. */
  resolveLoad(records: readonly T[]): void;
  /** Simula un cambio remoto notificando a quien esté suscrito. */
  emit(records: readonly T[]): void;
}

function createInMemoryRepository<T>(): InMemoryRepository<T> {
  let resolveLoad: ((records: T[]) => void) | undefined;
  const loaded = new Promise<T[]>((resolve) => {
    resolveLoad = resolve;
  });
  const listeners = new Set<(changed: readonly T[]) => void>();

  return {
    load: () => loaded,
    // El adaptador real persiste en `upsert`; el de memoria no necesita
    // guardar nada, porque el estado observable por los tests llega por
    // `resolveLoad`/`emit`, que el propio test controla.
    upsert: async () => {},
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    resolveLoad: (records) => resolveLoad?.([...records]),
    emit: (records) => {
      for (const listener of listeners) listener(records);
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
