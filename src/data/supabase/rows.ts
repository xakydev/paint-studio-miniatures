import { isCollectionEntry, isStoredRecipe } from "../../domain/guards";
import type { RecipeRecord } from "../../domain/recipes";
import type { CollectionEntry } from "../../domain/types";
import type { Json, TablesInsert } from "./database.types";

/**
 * Lo que se envía en un upsert. `user_id` no va nunca: lo pone el default
 * `auth.uid()` y la RLS lo comprueba, así que el cliente no puede escribir en
 * nombre de otro. `Required` obliga a mandar `note` y `deleted_at` aunque sean
 * `null`: postgrest-js calcula `columns` con la unión de las claves del lote,
 * y una fila sin `deleted_at` dejaría la columna sin tocar al reactivar.
 */
export type CollectionRowInsert = Required<Omit<TablesInsert<"collection_entries">, "user_id">>;
export type RecipeRowInsert = Required<Omit<TablesInsert<"recipes">, "user_id">>;

/** Campos de `RecipeRecord` que van en columnas propias y no dentro de `data`. */
const RECIPE_COLUMN_FIELDS: ReadonlySet<string> = new Set(["id", "updatedAt", "deletedAt"]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * PostgREST devuelve `timestamptz` como `+00:00`; el dominio guarda `Z`. Sin
 * normalizar, la misma fecha compararía distinto como texto. `undefined` si no
 * es una fecha legible.
 */
function toIsoTimestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

/**
 * `deleted_at` ausente o `null` es "activa". Uno presente pero ilegible
 * invalida la fila: leerlo como "activa" resucitaría un registro borrado.
 */
type DeletedAt = { ok: true; value: string | undefined } | { ok: false };

function readDeletedAt(value: unknown): DeletedAt {
  if (value === null || value === undefined) return { ok: true, value: undefined };
  const iso = toIsoTimestamp(value);
  return iso === undefined ? { ok: false } : { ok: true, value: iso };
}

export function toCollectionRow(entry: CollectionEntry): CollectionRowInsert {
  return {
    code: entry.code,
    status: entry.status,
    level: entry.level,
    note: entry.note ?? null,
    updated_at: entry.updatedAt,
    deleted_at: entry.deletedAt ?? null,
  };
}

/** Fila remota → entrada de dominio, o `null` si no pasa el guard del dominio. */
export function fromCollectionRow(row: unknown): CollectionEntry | null {
  if (!isPlainObject(row)) return null;
  const updatedAt = toIsoTimestamp(row.updated_at);
  const deletedAt = readDeletedAt(row.deleted_at);
  if (updatedAt === undefined || !deletedAt.ok) return null;
  // isCollectionEntry no mira `note`: aquí sí, porque la columna admite null.
  if (row.note !== null && row.note !== undefined && typeof row.note !== "string") return null;

  const candidate: Record<string, unknown> = {
    code: row.code,
    status: row.status,
    level: row.level,
    updatedAt,
  };
  if (typeof row.note === "string") candidate.note = row.note;
  if (deletedAt.value !== undefined) candidate.deletedAt = deletedAt.value;
  return isCollectionEntry(candidate) ? candidate : null;
}

export function toRecipeRow(recipe: RecipeRecord): RecipeRowInsert {
  const data = Object.fromEntries(
    Object.entries(recipe).filter(([field]) => !RECIPE_COLUMN_FIELDS.has(field)),
  );
  return {
    id: recipe.id,
    // Una receta solo contiene textos, números y arrays de objetos así: es
    // JSON por construcción. TypeScript no puede deducirlo porque las
    // interfaces del dominio no tienen firma de índice.
    data: data as Json,
    updated_at: recipe.updatedAt,
    deleted_at: recipe.deletedAt ?? null,
  };
}

/** Fila remota → receta de dominio, o `null` si no pasa el guard del dominio. */
export function fromRecipeRow(row: unknown): RecipeRecord | null {
  if (!isPlainObject(row) || !isPlainObject(row.data)) return null;
  const updatedAt = toIsoTimestamp(row.updated_at);
  const deletedAt = readDeletedAt(row.deleted_at);
  if (updatedAt === undefined || !deletedAt.ok) return null;

  // Las columnas mandan: si `data` trajera un `id` o un `deletedAt` propios,
  // no pueden pisar los de la fila.
  const candidate: Record<string, unknown> = Object.fromEntries(
    Object.entries(row.data).filter(([field]) => !RECIPE_COLUMN_FIELDS.has(field)),
  );
  candidate.id = row.id;
  candidate.updatedAt = updatedAt;
  if (deletedAt.value !== undefined) candidate.deletedAt = deletedAt.value;
  return isStoredRecipe(candidate) ? candidate : null;
}
