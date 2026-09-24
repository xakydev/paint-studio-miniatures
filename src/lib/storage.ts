import type { CollectionEntry, Ownership, Recipe } from "../types";
import { OWNERSHIP } from "../types";

const COLLECTION_KEY = "paint-studio-miniatures:collection:v1";
const RECIPES_KEY = "paint-studio-miniatures:recipes:v1";

/**
 * Todo acceso a localStorage va envuelto: en ventana privada, con las cookies
 * bloqueadas o con la cuota llena, el simple `getItem` lanza y tumbaría el
 * render entero. Perder la persistencia es aceptable; perder la app no.
 */
function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin persistencia la sesión sigue siendo usable en memoria.
  }
}

function isCollectionEntry(value: unknown): value is CollectionEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<CollectionEntry>;
  return (
    typeof entry.code === "string" &&
    (entry.status === OWNERSHIP.OWNED || entry.status === OWNERSHIP.WISHLIST) &&
    typeof entry.level === "number" &&
    typeof entry.updatedAt === "string"
  );
}

export function loadCollection(): CollectionEntry[] {
  const raw = readJson<unknown>(COLLECTION_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCollectionEntry);
}

export function saveCollection(entries: CollectionEntry[]): void {
  writeJson(COLLECTION_KEY, entries);
}

export function loadCustomRecipes(): Recipe[] {
  const raw = readJson<unknown>(RECIPES_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (value): value is Recipe =>
      typeof value === "object" &&
      value !== null &&
      typeof (value as Recipe).id === "string" &&
      Array.isArray((value as Recipe).zones),
  );
}

export function saveCustomRecipes(recipes: Recipe[]): void {
  writeJson(RECIPES_KEY, recipes);
}

export interface BackupFile {
  version: 1;
  exportedAt: string;
  collection: CollectionEntry[];
  recipes: Recipe[];
}

export function buildBackup(
  collection: CollectionEntry[],
  recipes: Recipe[],
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
  recipes: Recipe[];
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
    recipes: Array.isArray(backup.recipes) ? backup.recipes : [],
  };
}

export function makeEntry(
  code: string,
  status: Ownership,
  level = 3,
): CollectionEntry {
  return { code, status, level, updatedAt: new Date().toISOString() };
}
