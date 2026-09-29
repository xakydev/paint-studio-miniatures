import type { CollectionEntry } from "../../domain/types";

export type CollectionListener = (changed: readonly CollectionEntry[]) => void;
export type Unsubscribe = () => void;

/**
 * Puerto de persistencia de la colección. Solo añade o sobrescribe: no hay
 * `delete`, así que el borrado físico no se puede expresar a través de él.
 */
export interface CollectionRepository {
  /** Todos los registros, borrados incluidos. Datos corruptos → se descartan, no rechaza. */
  load(): Promise<CollectionEntry[]>;
  /** Fusiona por `code`. Nunca elimina. */
  upsert(entries: readonly CollectionEntry[]): Promise<void>;
  subscribe(listener: CollectionListener): Unsubscribe;
}
