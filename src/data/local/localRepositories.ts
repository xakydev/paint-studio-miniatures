import { isCollectionEntry, isStoredRecipe } from "../../domain/guards";
import { LEGACY_UPDATED_AT } from "../../domain/recipes";
import type { RecipeRecord } from "../../domain/recipes";
import type { CollectionEntry } from "../../domain/types";
import type { CollectionRepository } from "../ports/CollectionRepository";
import type { RecipeRepository } from "../ports/RecipeRepository";
import { localStorageStore } from "./localStorageStore";

/** Las claves `:v1` son un contrato con los datos ya guardados: no cambian. */
const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const RECIPES_KEY = "paint-studio-miniatures:recipes:v1";

export const localCollectionRepository: CollectionRepository = localStorageStore<CollectionEntry>(
  {
    key: COLLECTION_KEY,
    isRecord: isCollectionEntry,
    keyOf: (entry) => entry.code,
  },
);

export const localRecipeRepository: RecipeRepository = localStorageStore<RecipeRecord>({
  key: RECIPES_KEY,
  isRecord: isStoredRecipe,
  keyOf: (recipe) => recipe.id,
  // Los datos de una versión anterior no tienen `updatedAt`: se les asigna la
  // fecha más antigua posible, para que pierdan contra cualquier edición real.
  normalize: (recipe) => ({ ...recipe, updatedAt: recipe.updatedAt ?? LEGACY_UPDATED_AT }),
});
