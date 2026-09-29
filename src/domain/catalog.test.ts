import { describe, expect, it } from "vitest";

import { recipeCoverage, substitutesFromCollection } from "./catalog";
import { hexToLab } from "./color";
import { DIFFICULTY } from "./types";
import type { Paint, Recipe } from "./types";

/**
 * `recipeCoverage` y `substitutesFromCollection` son puras: reciben
 * `ownedCodes` ya calculado y no saben nada de `deletedAt`. Estas pruebas
 * confirman que, si quien las llama construye `ownedCodes` excluyendo los
 * registros borrados (regla de "Qué cuenta como activo"), el resultado ya
 * los ignora — sin que `catalog.ts` necesite conocer el borrado lógico. El
 * cableado real de ese filtrado ocurre en el Provider (fase 5).
 */
function paint(code: string, hex: string): Paint {
  return { code, name: code, family: "standard", hex, lab: hexToLab(hex) };
}

const AK11179 = paint("AK11179", "#0000FF");
// El sustituto más cercano por color, pero se simula borrado: no entra en ownedCodes.
const AK11181_DELETED = paint("AK11181", "#0000EE");
const AK11190_OWNED = paint("AK11190", "#888888");

const RECIPE: Recipe = {
  id: "space-marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [{ name: "Armadura", steps: [{ role: "base", code: "AK11179" }] }],
};

describe("recipeCoverage con ownedCodes que ya excluye lo borrado", () => {
  it("cuenta como pendiente una referencia cuya única entrada está borrada", () => {
    // El caller ya excluyó AK11179 de ownedCodes por estar borrada.
    const coverage = recipeCoverage(RECIPE, new Set());

    expect(coverage.owned).toBe(0);
    expect(coverage.missing).toEqual(["AK11179"]);
  });
});

describe("substitutesFromCollection con ownedCodes que ya excluye lo borrado", () => {
  it("no propone la referencia borrada aunque sea la más parecida por color", () => {
    const paints = [AK11179, AK11181_DELETED, AK11190_OWNED];
    const ownedCodes = new Set(["AK11190"]); // AK11181 quedó fuera: está borrada.

    const substitutes = substitutesFromCollection(paints, "AK11179", ownedCodes);

    expect(substitutes.map((match) => match.paint.code)).toEqual(["AK11190"]);
  });

  it("no propone nada si la única referencia parecida está borrada", () => {
    const paints = [AK11179, AK11181_DELETED];
    const ownedCodes = new Set<string>(); // AK11181 borrada: ownedCodes queda vacío.

    expect(substitutesFromCollection(paints, "AK11179", ownedCodes)).toEqual([]);
  });
});
