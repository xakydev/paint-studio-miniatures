import { createContext, use } from "react";

import type { CollectionEntry, Ownership, Recipe } from "../types";

export interface LibraryApi {
  entries: CollectionEntry[];
  ownedCodes: ReadonlySet<string>;
  wishlistCodes: ReadonlySet<string>;
  /** Estado de una referencia, o null si no está en la colección. */
  statusOf: (code: string) => Ownership | null;
  entryOf: (code: string) => CollectionEntry | undefined;
  /** `null` saca la pintura de la colección. */
  setStatus: (code: string, status: Ownership | null) => void;
  setLevel: (code: string, level: number) => void;
  setNote: (code: string, note: string) => void;
  /** Mete de golpe todo lo que falta de una receta en la lista de deseos. */
  addManyToWishlist: (codes: string[]) => void;
  replaceCollection: (entries: CollectionEntry[]) => void;
  clearCollection: () => void;

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
