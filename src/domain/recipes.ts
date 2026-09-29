import { activeOnly } from "./tombstone";
import type { Recipe } from "./types";

/**
 * `updatedAt` sintética para recetas propias guardadas por una versión
 * anterior, que no tenía ese campo. Es la fecha más antigua posible, así que
 * pierde contra cualquier edición real en una resolución LWW (last write
 * wins).
 */
export const LEGACY_UPDATED_AT = "1970-01-01T00:00:00.000Z";

/**
 * Lo que se persiste bajo la clave `:recipes:v1`: una receta propia, plana,
 * con metadatos de sincronización. `Recipe` (el tipo de dominio de la receta)
 * no lleva estos campos: los usa solo la persistencia.
 */
export interface RecipeRecord extends Recipe {
  /** ISO 8601. */
  updatedAt: string;
  /** ISO 8601. Presente si la receta propia está borrada lógicamente. */
  deletedAt?: string;
}

/**
 * Combina las recetas propias activas con las de semilla: una propia
 * sustituye a la de semilla con el mismo `id`. Al borrar (lógicamente) una
 * propia, `activeOnly` la excluye y la de semilla vuelve a verse si
 * existía; si no existía ninguna, desaparece. Se listan antes las propias y
 * después las semillas no sustituidas, igual que hacía el Provider.
 */
export function mergeRecipes(
  customRecipes: readonly RecipeRecord[],
  seedRecipes: readonly Recipe[],
): Recipe[] {
  const active = activeOnly(customRecipes);
  const activeIds = new Set(active.map((recipe) => recipe.id));

  return [
    ...active,
    ...seedRecipes.filter((seed) => !activeIds.has(seed.id)),
  ];
}
