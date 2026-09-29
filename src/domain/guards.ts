import { OWNERSHIP, type CollectionEntry } from "./types";
import type { RecipeRecord } from "./recipes";

/**
 * Valida datos externos (localStorage, un fichero de respaldo) antes de
 * tratarlos como `CollectionEntry`. `deletedAt` es opcional: su ausencia es
 * justo lo que distingue a una entrada guardada por una versión anterior.
 */
export function isCollectionEntry(value: unknown): value is CollectionEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<CollectionEntry>;
  return (
    typeof entry.code === "string" &&
    (entry.status === OWNERSHIP.OWNED || entry.status === OWNERSHIP.WISHLIST) &&
    typeof entry.level === "number" &&
    typeof entry.updatedAt === "string" &&
    (entry.deletedAt === undefined || typeof entry.deletedAt === "string")
  );
}

/**
 * Valida datos externos antes de tratarlos como `RecipeRecord`. Solo exige lo
 * mínimo estructural (`id` y `zones`), igual que el guard anterior: una
 * receta propia guardada sin `updatedAt` sigue siendo válida, y el adaptador
 * la normaliza con `LEGACY_UPDATED_AT` al cargarla.
 */
export function isStoredRecipe(value: unknown): value is RecipeRecord {
  if (typeof value !== "object" || value === null) return false;
  const recipe = value as Partial<RecipeRecord>;
  return (
    typeof recipe.id === "string" &&
    Array.isArray(recipe.zones) &&
    (recipe.updatedAt === undefined || typeof recipe.updatedAt === "string") &&
    (recipe.deletedAt === undefined || typeof recipe.deletedAt === "string")
  );
}
