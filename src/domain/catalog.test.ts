import { describe, expect, it } from "vitest";

import { recipeCoverage, substitutesFromCollection } from "./catalog";
import { hexToLab } from "./color";
import { activeOnly } from "./tombstone";
import { DIFFICULTY, OWNERSHIP, PAINT_FAMILY, STEP_ROLE } from "./types";
import type { CollectionEntry, Paint, Recipe } from "./types";

/**
 * `recipeCoverage` y `substitutesFromCollection` son puras: reciben
 * `ownedCodes` ya calculado y no saben nada de `deletedAt`. Estas pruebas
 * ejercitan el requisito de verdad: parten de una colección con entradas
 * activas y borradas (`CollectionEntry`), derivan `ownedCodes` con
 * `activeOnly` —la misma regla de "Qué cuenta como activo" que usa el
 * Provider— y comprueban que el resultado ya ignora lo borrado. El cableado
 * real de ese filtrado ocurre en el Provider (fase 5); aquí se comprueba que
 * la combinación `activeOnly` + estas funciones produce el efecto correcto.
 */
function paint(code: string, hex: string): Paint {
  return { code, name: code, family: PAINT_FAMILY.STANDARD, hex, lab: hexToLab(hex) };
}

const UPDATED_AT = "2026-01-01T00:00:00.000Z";
const DELETED_AT = "2026-01-02T00:00:00.000Z";

const AK11179 = paint("AK11179", "#0000FF");
// El sustituto más cercano por color, pero su entrada de colección está borrada.
const AK11181 = paint("AK11181", "#0000EE");
const AK11190 = paint("AK11190", "#888888");

const RECIPE: Recipe = {
  id: "space-marine-azul",
  name: "Marine espacial azul",
  subject: "Infantería de ciencia ficción",
  summary: "Esquema básico.",
  difficulty: DIFFICULTY.BEGINNER,
  tags: [],
  zones: [{ name: "Armadura", steps: [{ role: STEP_ROLE.BASE, code: "AK11179" }] }],
};

/** Deriva `ownedCodes` como lo hace el Provider: activeOnly + status OWNED. */
function ownedCodesFrom(collection: readonly CollectionEntry[]): Set<string> {
  return new Set(
    activeOnly(collection)
      .filter((entry) => entry.status === OWNERSHIP.OWNED)
      .map((entry) => entry.code),
  );
}

describe("recipeCoverage con ownedCodes derivado de una colección con borrados", () => {
  it("cuenta como pendiente una referencia cuya única entrada de colección está borrada", () => {
    const collection: CollectionEntry[] = [
      {
        code: "AK11179",
        status: OWNERSHIP.OWNED,
        level: 3,
        updatedAt: UPDATED_AT,
        deletedAt: DELETED_AT,
      },
    ];

    const coverage = recipeCoverage(RECIPE, ownedCodesFrom(collection));

    expect(coverage.owned).toBe(0);
    expect(coverage.missing).toEqual(["AK11179"]);
  });

  it("cuenta como poseída una referencia con una entrada activa", () => {
    const collection: CollectionEntry[] = [
      { code: "AK11179", status: OWNERSHIP.OWNED, level: 3, updatedAt: UPDATED_AT },
    ];

    const coverage = recipeCoverage(RECIPE, ownedCodesFrom(collection));

    expect(coverage.owned).toBe(1);
    expect(coverage.missing).toEqual([]);
  });
});

describe("substitutesFromCollection con ownedCodes derivado de una colección con borrados", () => {
  it("no propone la referencia borrada aunque sea la más parecida por color", () => {
    const paints = [AK11179, AK11181, AK11190];
    const collection: CollectionEntry[] = [
      {
        code: "AK11181",
        status: OWNERSHIP.OWNED,
        level: 3,
        updatedAt: UPDATED_AT,
        deletedAt: DELETED_AT,
      },
      { code: "AK11190", status: OWNERSHIP.OWNED, level: 3, updatedAt: UPDATED_AT },
    ];

    const substitutes = substitutesFromCollection(
      paints,
      "AK11179",
      ownedCodesFrom(collection),
    );

    expect(substitutes.map((match) => match.paint.code)).toEqual(["AK11190"]);
  });

  it("no propone nada si la única referencia parecida tiene su entrada borrada", () => {
    const paints = [AK11179, AK11181];
    const collection: CollectionEntry[] = [
      {
        code: "AK11181",
        status: OWNERSHIP.OWNED,
        level: 3,
        updatedAt: UPDATED_AT,
        deletedAt: DELETED_AT,
      },
    ];

    expect(
      substitutesFromCollection(paints, "AK11179", ownedCodesFrom(collection)),
    ).toEqual([]);
  });
});
