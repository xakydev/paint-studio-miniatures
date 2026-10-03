import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { manifestPaintImages } from "./data/images/manifestPaintImages";
import type { Backend } from "./data/ports/Backend";
import { readSupabaseSettings } from "./data/supabase/settings";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Falta el nodo #root en index.html.");

/**
 * Raíz de composición: el único sitio que sabe que el backend es Supabase y
 * que las fotos salen del manifiesto local (en producción, siempre vacío).
 *
 * El SDK pesa más de 200 kB, así que solo se descarga si hay configuración:
 * quien usa la app en local no lo paga. Si al compilar no están las variables,
 * Vite sustituye `import.meta.env` por valores vacíos y esta rama ni siquiera
 * se ejecuta. Si el trozo no llega a cargar (sin conexión, despliegue a
 * medias), la app arranca en local en vez de quedarse en blanco.
 */
async function loadBackend(): Promise<Backend | null> {
  if (readSupabaseSettings(import.meta.env) === null) return null;
  try {
    const { createSupabaseBackend } = await import("./data/supabase/backend");
    // Al crearse, supabase-js recoge el `#access_token` con el que vuelve el
    // enlace mágico y limpia el hash. Se crea una vez, fuera de React, para
    // que StrictMode no lo duplique.
    return createSupabaseBackend(import.meta.env);
  } catch (error) {
    console.error("No se pudo cargar el módulo de Supabase: la app sigue en modo local.", error);
    return null;
  }
}

void loadBackend().then((backend) => {
  createRoot(container).render(
    <StrictMode>
      <App backend={backend} paintImages={manifestPaintImages} />
    </StrictMode>,
  );
});
