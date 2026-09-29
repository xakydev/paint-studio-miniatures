import { isCollectionEntry, isStoredRecipe } from "./guards";
import type { RecipeRecord } from "./recipes";
import type { CollectionEntry } from "./types";

/**
 * El formato del respaldo que el usuario exporta e importa. Es un contrato de
 * la app, no de localStorage: por eso vive en `domain` y no junto al
 * adaptador. Incluye los registros borrados con su `deletedAt`.
 */
export interface BackupFile {
  version: 1;
  exportedAt: string;
  collection: CollectionEntry[];
  recipes: RecipeRecord[];
}

export function buildBackup(
  collection: CollectionEntry[],
  recipes: RecipeRecord[],
): BackupFile {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    collection,
    recipes,
  };
}

export interface ParsedBackup {
  collection: CollectionEntry[];
  recipes: RecipeRecord[];
}

/** Lanza si el fichero no es un respaldo de esta app: el importador lo captura. */
export function parseBackup(json: string): ParsedBackup {
  const parsed: unknown = JSON.parse(json);

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("El fichero no contiene un respaldo válido.");
  }

  const backup = parsed as Partial<BackupFile>;
  if (!Array.isArray(backup.collection)) {
    throw new Error("Al respaldo le falta la lista de pinturas.");
  }

  return {
    collection: backup.collection.filter(isCollectionEntry),
    recipes: Array.isArray(backup.recipes)
      ? backup.recipes.filter(isStoredRecipe)
      : [],
  };
}
