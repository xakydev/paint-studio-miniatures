/**
 * Red de seguridad nº 2 contra la fuga de fotos de AK: aunque alguien se
 * salte el hook de `pre-commit` (con `--no-verify`, por ejemplo), este test
 * falla en cuanto `local-assets/` tenga algo seguido por git. No se mockea
 * `git`: se invoca de verdad sobre el propio repositorio, así que si `git`
 * falla (por ejemplo, porque no hay `.git`), el test falla también, nunca
 * se da por bueno en silencio.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Separado por NUL (`-z`) para no romperse con nombres con espacios o saltos de línea. */
function trackedUnder(path: string): string[] {
  const output = execFileSync("git", ["ls-files", "-z", path], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
  });
  return output.split("\0").filter((entry) => entry.length > 0);
}

describe("git no sigue nada bajo local-assets/", () => {
  it("git ls-files local-assets/ no devuelve ningún fichero", () => {
    expect(trackedUnder("local-assets/")).toEqual([]);
  });
});
