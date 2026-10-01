/**
 * Lectura de la configuración de Supabase, separada del adaptador a propósito:
 * este módulo no importa `@supabase/supabase-js`, así que `main.tsx` puede
 * decidir si hace falta el backend sin arrastrar el SDK al bundle principal.
 */

/** Las dos son públicas por diseño (viajan en el bundle): la seguridad la da la RLS. */
export const URL_VARIABLE = "VITE_SUPABASE_URL";
export const KEY_VARIABLE = "VITE_SUPABASE_PUBLISHABLE_KEY";

export interface SupabaseSettings {
  url: string;
  key: string;
}

function readSetting(env: Readonly<Record<string, unknown>>, name: string): string | null {
  const value = env[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** `null` si falta o está vacía alguna de las dos variables: la app va en local. */
export function readSupabaseSettings(
  env: Readonly<Record<string, unknown>>,
): SupabaseSettings | null {
  const url = readSetting(env, URL_VARIABLE);
  const key = readSetting(env, KEY_VARIABLE);
  return url === null || key === null ? null : { url, key };
}
