import { activeOnly } from "./tombstone";
import type { Recipe } from "./types";

// Límites que reflejan los CHECK de `recipes` en
// supabase/migrations/20261001061555_esquema_inicial.sql.
const RECIPE_ID_MIN_LENGTH = 1;
const RECIPE_ID_MAX_LENGTH = 200;

/** Postgres valida el formato con `timestamptz`; aquí, que `Date.parse` no dé NaN. */
function isParsableDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

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

/**
 * Espejo de los CHECK de `recipes` en
 * supabase/migrations/20261001061555_esquema_inicial.sql: si cambia uno de
 * los dos, cambia el otro. La columna `data` guarda el resto de los campos
 * (todo menos `id`, `updatedAt` y `deletedAt`); como siempre es un objeto en
 * JS, lo único que el CHECK puede rechazar de verdad es que `zones` no sea un
 * array — el `coalesce` de la migración existe justo para que una receta sin
 * `zones` (que daría NULL) no cuele.
 */
export function isRecipeWithinDomainLimits(recipe: RecipeRecord): boolean {
  return (
    recipe.id.length >= RECIPE_ID_MIN_LENGTH &&
    recipe.id.length <= RECIPE_ID_MAX_LENGTH &&
    Array.isArray(recipe.zones) &&
    isParsableDate(recipe.updatedAt) &&
    (recipe.deletedAt === undefined || isParsableDate(recipe.deletedAt))
  );
}
