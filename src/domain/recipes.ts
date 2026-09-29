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
