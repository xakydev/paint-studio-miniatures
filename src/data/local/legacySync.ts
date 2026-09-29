/**
 * Puente temporal, solo para que `LibraryProvider` siga siendo síncrono en
 * esta fase. Sustituye a `lib/storage.ts` con el mismo comportamiento exacto:
 * las recetas propias siguen guardándose como `Recipe[]` planas, sin
 * `updatedAt`.
 *
 * Desaparece en la fase 5, cuando el Provider pase a cargar con
 * `localCollectionRepository`/`localRecipeRepository` (`load`/`upsert`,
 * asíncronos) y a manejar `RecipeRecord` en vez de `Recipe`.
 */
import { isCollectionEntry, isStoredRecipe } from "../../domain/guards";
import type { CollectionEntry, Ownership, Recipe } from "../../domain/types";
import { readJson, writeJson } from "./storageJson";

const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const RECIPES_KEY = "paint-studio-miniatures:recipes:v1";

export function loadCollectionSync(): CollectionEntry[] {
  const raw = readJson<unknown>(COLLECTION_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCollectionEntry);
}

export function saveCollectionSync(entries: CollectionEntry[]): void {
  writeJson(COLLECTION_KEY, entries);
}

export function loadCustomRecipesSync(): Recipe[] {
  const raw = readJson<unknown>(RECIPES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isStoredRecipe);
}

export function saveCustomRecipesSync(recipes: Recipe[]): void {
  writeJson(RECIPES_KEY, recipes);
}

export function makeEntry(code: string, status: Ownership, level = 3): CollectionEntry {
  return { code, status, level, updatedAt: new Date().toISOString() };
}
