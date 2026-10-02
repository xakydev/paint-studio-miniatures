/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * La clave secreta de Supabase no debe llegar nunca al código fuente: desde
 * ahí viajaría al bundle y cualquiera podría leerla con las herramientas del
 * navegador. Este test recorre `src/` entero (node_modules y dist quedan
 * fuera por construcción: ninguno de los dos vive dentro de `src/`) buscando
 * el rol administrador de Postgres y el prefijo de esa clave, los dos
 * definidos justo debajo.
 *
 * Los dos patrones se arman en piezas sueltas, partidas por un `join`, para
 * que este mismo fichero no se dispare a sí mismo al hacer la búsqueda
 * textual: en el código fuente de este test los literales nunca quedan
 * escritos de corrido.
 */
const SERVICE_ROLE_PATTERN = ["service", "role"].join("_");
const SECRET_KEY_PREFIX = ["sb", "secret", ""].join("_");

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("la clave secreta de Supabase no llega al código fuente", () => {
  it("ningún fichero de src/ contiene el rol administrador ni el prefijo de la clave secreta", () => {
    const pattern = new RegExp(`${SERVICE_ROLE_PATTERN}|${SECRET_KEY_PREFIX}`);
    const offenders = listFiles(SRC_DIR)
      .filter((path) => pattern.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(SRC_DIR.length + 1));

    expect(offenders).toEqual([]);
  });
});
