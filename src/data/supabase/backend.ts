import { createClient } from "@supabase/supabase-js";

import type { Backend, RepositoryPair } from "../ports/Backend";
import { createSupabaseAuthGateway } from "./auth";
import type { Database } from "./database.types";
import {
  createSupabaseCollectionRepository,
  createSupabaseRecipeRepository,
} from "./SupabaseRepository";

/** Las dos son públicas por diseño (viajan en el bundle): la seguridad la da la RLS. */
const URL_VARIABLE = "VITE_SUPABASE_URL";
const KEY_VARIABLE = "VITE_SUPABASE_PUBLISHABLE_KEY";

/**
 * `fetch` no tiene tiempo límite: con la red colgada, un guardado no acabaría
 * nunca y el usuario no vería el aviso de error. Pasado este plazo, PostgREST
 * aborta la petición y el repositorio rechaza.
 */
const REQUEST_TIMEOUT_MS = 15_000;

function readSetting(env: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Construye el backend desde las variables de entorno. `main.tsx` le pasa
 * `import.meta.env` y monta `<App backend={…} />`: así ni App ni sus tests
 * leen el entorno. `null` si falta o está vacía alguna de las dos variables,
 * y la app funciona como hasta ahora, en local y sin login.
 */
export function createSupabaseBackend(env: Readonly<Record<string, unknown>>): Backend | null {
  const url = readSetting(env, URL_VARIABLE);
  const key = readSetting(env, KEY_VARIABLE);
  if (url === null || key === null) return null;

  let client: ReturnType<typeof createClient<Database>>;
  try {
    client = createClient<Database>(url, key, { db: { timeout: REQUEST_TIMEOUT_MS } });
  } catch (error) {
    // Una errata en .env.local no puede dejar la app en blanco: se trata como
    // si no hubiera backend y se sigue en local. El aviso nombra la variable,
    // nunca su valor ni la clave.
    console.error(`${URL_VARIABLE} no es una URL válida: la app sigue en modo local.`, error);
    return null;
  }
  const repositoriesByUser = new Map<string, RepositoryPair>();

  return {
    auth: createSupabaseAuthGateway(client.auth),
    repositoriesFor(userId) {
      // TOKEN_REFRESHED trae una sesión nueva cada hora: si los repositorios
      // cambiaran de identidad con ella, el LibraryProvider lo leería como un
      // cambio de origen y recargaría todo. Solo cambian si cambia el usuario.
      let pair = repositoriesByUser.get(userId);
      if (pair === undefined) {
        pair = {
          collection: createSupabaseCollectionRepository(client, userId),
          recipes: createSupabaseRecipeRepository(client, userId),
        };
        repositoriesByUser.set(userId, pair);
      }
      return pair;
    },
  };
}
