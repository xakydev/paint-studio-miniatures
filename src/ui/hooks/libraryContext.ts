import { createContext, use } from "react";

import type { BackupFile } from "../../domain/backup";
import type { CollectionEntry, Ownership, Recipe } from "../../domain/types";

/**
 * Fase de la carga inicial. Arranca directamente en `LOADING`: no hay un
 * `IDLE` previo porque el efecto de carga corre antes del primer pintado que
 * pueda depender de los datos. `LOADING` dura mientras resuelven los
 * repositorios; hasta `READY` no se pinta nada que dependa de los datos ni se
 * escribe nada.
 */
export const LOAD_STATUS = {
  LOADING: "loading",
  READY: "ready",
} as const;

export type LoadStatus = (typeof LOAD_STATUS)[keyof typeof LOAD_STATUS];

/**
 * Lo que ven las vistas. Todo lo que lista o cuenta registros ya viene sin
 * los borrados: el filtrado se hace una sola vez, en el Provider.
 */
export interface LibraryApi {
  status: LoadStatus;
  entries: CollectionEntry[];
  ownedCodes: ReadonlySet<string>;
  wishlistCodes: ReadonlySet<string>;
  /** Estado de una referencia, o null si no está en la colección. */
  statusOf: (code: string) => Ownership | null;
  entryOf: (code: string) => CollectionEntry | undefined;
  /** `null` saca la pintura de la colección (borrado lógico). */
  setStatus: (code: string, status: Ownership | null) => void;
  setLevel: (code: string, level: number) => void;
  setNote: (code: string, note: string) => void;
  /** Mete de golpe todo lo que falta de una receta en la lista de deseos. */
  addManyToWishlist: (codes: string[]) => void;
  /**
   * Restaura un respaldo: escribe lo importado y marca como borradas las
   * entradas activas que no vienen en él. Nada se elimina físicamente.
   */
  replaceCollection: (entries: CollectionEntry[]) => void;
  clearCollection: () => void;
  /** El respaldo completo, con los registros borrados y su `deletedAt`. */
  exportBackup: () => BackupFile;

  /** Semilla + recetas propias, ya combinadas. */
  recipes: Recipe[];
  customRecipes: Recipe[];
  saveRecipe: (recipe: Recipe) => void;
  deleteRecipe: (id: string) => void;
}

export const LibraryContext = createContext<LibraryApi | null>(null);

export function useLibrary(): LibraryApi {
  const api = use(LibraryContext);
  if (!api) {
    throw new Error("useLibrary necesita estar dentro de <LibraryProvider>.");
  }
  return api;
}
