import type { RecipeRecord } from "../../domain/recipes";

export type RecipeListener = (changed: readonly RecipeRecord[]) => void;
export type Unsubscribe = () => void;

/**
 * Puerto de persistencia de las recetas propias. Solo añade o sobrescribe: no
 * hay `delete`, así que el borrado físico no se puede expresar a través de él.
 */
export interface RecipeRepository {
  /** Todos los registros, borrados incluidos. Datos corruptos → se descartan, no rechaza. */
  load(): Promise<RecipeRecord[]>;
  /** Fusiona por `id`. Nunca elimina. */
  upsert(recipes: readonly RecipeRecord[]): Promise<void>;
  subscribe(listener: RecipeListener): Unsubscribe;
}
