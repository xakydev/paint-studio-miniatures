import { isEntryWithinDomainLimits } from "../domain/collection";
import { isRecipeWithinDomainLimits } from "../domain/recipes";
import type { RepositoryPair } from "./ports/Backend";
import type { UploadMarker } from "./ports/UploadMarker";

export interface UploadResult {
  /** Entradas y recetas locales que no se subieron por violar un límite de dominio. */
  skipped: number;
}

/**
 * Sube una sola vez el snapshot local completo (colección y recetas propias,
 * tombstones incluidos) al origen remoto. Si la marca ya está hecha, no
 * carga ni sube nada. Las entradas o recetas que violarían una restricción
 * de dominio (un `level` fuera de 0..3, por ejemplo) se separan: no se suben
 * ni se tocan en local, y se cuentan en `skipped`. Nunca llama a `from.upsert`:
 * la copia local permanece intacta. Si falla cualquier `load` o `upsert`, la
 * promesa rechaza con el error original y la marca no se escribe — repetir
 * el intento es seguro porque la guardia LWW del servidor descarta lo que ya
 * esté subido.
 */
export async function uploadLocalSnapshotOnce(
  from: RepositoryPair,
  to: RepositoryPair,
  marker: UploadMarker,
): Promise<UploadResult> {
  if (marker.isDone()) {
    return { skipped: 0 };
  }

  const [entries, recipes] = await Promise.all([from.collection.load(), from.recipes.load()]);

  const validEntries = entries.filter(isEntryWithinDomainLimits);
  const validRecipes = recipes.filter(isRecipeWithinDomainLimits);
  const skipped = entries.length - validEntries.length + (recipes.length - validRecipes.length);

  if (validEntries.length > 0) {
    await to.collection.upsert(validEntries);
  }
  if (validRecipes.length > 0) {
    await to.recipes.upsert(validRecipes);
  }

  marker.markDone();
  return { skipped };
}
