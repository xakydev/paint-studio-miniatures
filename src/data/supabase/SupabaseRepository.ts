import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipeRecord } from "../../domain/recipes";
import type { CollectionEntry } from "../../domain/types";
import type { CollectionRepository } from "../ports/CollectionRepository";
import type { RecipeRepository } from "../ports/RecipeRepository";
import type { Database } from "./database.types";
import { fromCollectionRow, fromRecipeRow, toCollectionRow, toRecipeRow } from "./rows";

/**
 * Filas por petición. Coincide con el `max_rows` por defecto de Supabase, que
 * corta la respuesta SIN error: por eso `load` pagina en vez de fiarse de una
 * sola petición. Hoy una colección no pasa de las 286 referencias del
 * catálogo, pero las recetas no tienen tope.
 */
const PAGE_SIZE = 1000;

/** Lo que `load` necesita de una respuesta de PostgREST con `count: "exact"`. */
interface PageResult {
  data: readonly unknown[] | null;
  error: unknown;
  count: number | null;
}

type PageQuery = (from: number, to: number) => PromiseLike<PageResult>;

/** Lo que `upsert` necesita de una respuesta de PostgREST. */
interface WriteResult {
  error: unknown;
}

/**
 * supabase-js no lanza: devuelve `{ error }`, también si `fetch` falla o se
 * aborta por tiempo. Aquí todo fallo, devuelto o lanzado, se convierte en un
 * rechazo con un mensaje fijo en español. El mensaje nunca lleva datos de la
 * petición (ni la clave ni el token); el detalle técnico va en `cause`.
 */
async function rejectOnError<T>(message: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    throw new Error(message, { cause });
  }
}

/**
 * Pide páginas consecutivas hasta tener el total que anuncia el servidor en
 * `Content-Range`. Avanza por lo recibido y no por `PAGE_SIZE`: si un
 * `max_rows` más bajo corta antes, la siguiente página sigue donde se quedó.
 * Una página vacía también corta, para no pedir sin fin si el total cambia.
 */
async function loadAllPages(query: PageQuery): Promise<unknown[]> {
  const rows: unknown[] = [];
  for (;;) {
    const { data, error, count } = await query(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page);
    // Sin recuento (no debería pasar: se pide siempre) queda la regla clásica
    // de "página incompleta = última".
    const exhausted =
      page.length === 0 || (count === null ? page.length < PAGE_SIZE : rows.length >= count);
    if (exhausted) return rows;
  }
}

function throwIfError({ error }: WriteResult): void {
  if (error) throw error;
}

/** Descarta las filas que no pasan el guard, igual que el adaptador local con datos corruptos. */
function keepValid<T>(rows: readonly unknown[], fromRow: (row: unknown) => T | null): T[] {
  return rows.flatMap((row) => {
    const record = fromRow(row);
    return record === null ? [] : [record];
  });
}

/** Realtime llega en la fase 3, con el sync. Hasta entonces nadie avisa de cambios remotos. */
function noRemoteChanges(): () => void {
  return () => {};
}

export function createSupabaseCollectionRepository(
  client: SupabaseClient<Database>,
  userId: string,
): CollectionRepository {
  return {
    load: () =>
      rejectOnError("No se pudo cargar tu colección desde Supabase.", async () => {
        // El filtro por user_id repite lo que ya impone la RLS: es la
        // recomendación de Supabase y deja el plan apoyado en la PK.
        const rows = await loadAllPages((from, to) =>
          client
            .from("collection_entries")
            .select("*", { count: "exact" })
            .eq("user_id", userId)
            .order("code")
            .range(from, to),
        );
        return keepValid<CollectionEntry>(rows, fromCollectionRow);
      }),

    upsert: async (entries) => {
      if (entries.length === 0) return;
      await rejectOnError("No se pudo guardar tu colección en Supabase.", async () => {
        throwIfError(
          await client
            .from("collection_entries")
            .upsert(entries.map(toCollectionRow), { onConflict: "user_id,code" }),
        );
      });
    },

    subscribe: noRemoteChanges,
  };
}

export function createSupabaseRecipeRepository(
  client: SupabaseClient<Database>,
  userId: string,
): RecipeRepository {
  return {
    load: () =>
      rejectOnError("No se pudieron cargar tus recetas desde Supabase.", async () => {
        const rows = await loadAllPages((from, to) =>
          client
            .from("recipes")
            .select("*", { count: "exact" })
            .eq("user_id", userId)
            .order("id")
            .range(from, to),
        );
        return keepValid<RecipeRecord>(rows, fromRecipeRow);
      }),

    upsert: async (recipes) => {
      if (recipes.length === 0) return;
      await rejectOnError("No se pudieron guardar tus recetas en Supabase.", async () => {
        throwIfError(
          await client.from("recipes").upsert(recipes.map(toRecipeRow), { onConflict: "user_id,id" }),
        );
      });
    },

    subscribe: noRemoteChanges,
  };
}
