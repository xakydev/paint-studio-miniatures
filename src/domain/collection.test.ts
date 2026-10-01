import { describe, expect, it } from "vitest";

import { isEntryWithinDomainLimits, markStatus, removeEntry, restoreCollection } from "./collection";
import { OWNERSHIP } from "./types";
import type { CollectionEntry } from "./types";

describe("removeEntry", () => {
  it("marca deletedAt y updatedAt sin eliminar el registro", () => {
    const entry: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 2,
      note: "queda poco",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const now = "2026-01-05T00:00:00.000Z";

    const removed = removeEntry(entry, now);

    expect(removed.deletedAt).toBe(now);
    expect(removed.updatedAt).toBe(now);
    // El dato sigue siendo recuperable: no se pierde nada al borrar.
    expect(removed.code).toBe("AK11179");
    expect(removed.status).toBe(OWNERSHIP.OWNED);
    expect(removed.level).toBe(2);
    expect(removed.note).toBe("queda poco");
  });
});

describe("markStatus", () => {
  it("reactiva una entrada borrada: limpia deletedAt y la recrea con level 3 sin note", () => {
    const existing: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 1,
      note: "casi vacío",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-02T00:00:00.000Z",
    };
    const now = "2026-01-06T00:00:00.000Z";

    const reactivated = markStatus("AK11179", OWNERSHIP.WISHLIST, now, existing);

    expect(reactivated.deletedAt).toBeUndefined();
    expect(reactivated.status).toBe(OWNERSHIP.WISHLIST);
    expect(reactivated.updatedAt).toBe(now);
    expect(reactivated.level).toBe(3);
    expect(reactivated.note).toBeUndefined();
  });

  it("crea una entrada nueva con level 3 y sin note cuando no existía ninguna", () => {
    const now = "2026-01-06T00:00:00.000Z";

    const created = markStatus("AK11180", OWNERSHIP.OWNED, now);

    expect(created).toEqual({
      code: "AK11180",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: now,
    });
  });

  it("una entrada activa solo cambia de estado, sin recrearse", () => {
    const existing: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 1,
      note: "casi vacío",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const now = "2026-01-06T00:00:00.000Z";

    const updated = markStatus("AK11179", OWNERSHIP.WISHLIST, now, existing);

    expect(updated.status).toBe(OWNERSHIP.WISHLIST);
    expect(updated.updatedAt).toBe(now);
    expect(updated.level).toBe(1);
    expect(updated.note).toBe("casi vacío");
  });
});

describe("restoreCollection", () => {
  it("sella las entradas importadas con la hora de referencia", () => {
    const imported: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const now = "2026-01-01T00:00:00.000Z";

    const [result] = restoreCollection([], [imported], now);

    expect(result?.updatedAt).toBe(now);
  });

  it("conserva el deletedAt de una entrada importada que ya viene borrada", () => {
    const imported: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2020-01-01T00:00:00.000Z",
      deletedAt: "2020-06-01T00:00:00.000Z",
    };
    const now = "2026-01-01T00:00:00.000Z";

    const [result] = restoreCollection([], [imported], now);

    expect(result?.deletedAt).toBe("2020-06-01T00:00:00.000Z");
    expect(result?.updatedAt).toBe(now);
  });

  it("marca con deletedAt una entrada activa de current que no viene en lo importado", () => {
    const active: CollectionEntry = {
      code: "AK11181",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const imported: CollectionEntry = {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2020-01-01T00:00:00.000Z",
    };
    const now = "2026-02-01T00:00:00.000Z";

    const result = restoreCollection([active], [imported], now);

    const removed = result.find((entry) => entry.code === "AK11181");
    expect(removed?.deletedAt).toBe(now);
    expect(removed?.updatedAt).toBe(now);
    expect(result).toHaveLength(2);
  });

  it("no toca una entrada ya borrada de current que no viene en lo importado", () => {
    const alreadyDeleted: CollectionEntry = {
      code: "AK11181",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: "2026-01-01T00:00:00.000Z",
    };
    const now = "2026-02-01T00:00:00.000Z";

    const result = restoreCollection([alreadyDeleted], [], now);

    expect(result).toHaveLength(0);
  });
});

describe("isEntryWithinDomainLimits", () => {
  /**
   * Espejo de los CHECK de `collection_entries` en
   * supabase/migrations/20261001061555_esquema_inicial.sql: un caso límite
   * dentro y otro fuera por cada restricción.
   */
  function validEntry(overrides: Partial<CollectionEntry> = {}): CollectionEntry {
    return {
      code: "AK11179",
      status: OWNERSHIP.OWNED,
      level: 3,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("acepta una entrada dentro de todos los límites", () => {
    expect(isEntryWithinDomainLimits(validEntry())).toBe(true);
  });

  it("acepta code con longitud 1 y rechaza code vacío", () => {
    expect(isEntryWithinDomainLimits(validEntry({ code: "A" }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ code: "" }))).toBe(false);
  });

  it("acepta code con longitud 64 y rechaza code con longitud 65", () => {
    expect(isEntryWithinDomainLimits(validEntry({ code: "A".repeat(64) }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ code: "A".repeat(65) }))).toBe(false);
  });

  it("rechaza un status que no sea owned ni wishlist", () => {
    const entry = validEntry({ status: "owned" });
    expect(isEntryWithinDomainLimits(entry)).toBe(true);
    const invalid = { ...entry, status: "broken" } as unknown as CollectionEntry;
    expect(isEntryWithinDomainLimits(invalid)).toBe(false);
  });

  it("acepta level 0 y level 3, y rechaza level -1 y level 4", () => {
    expect(isEntryWithinDomainLimits(validEntry({ level: 0 }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ level: 3 }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ level: -1 }))).toBe(false);
    expect(isEntryWithinDomainLimits(validEntry({ level: 4 }))).toBe(false);
  });

  it("rechaza un level no entero: smallint no admite decimales", () => {
    expect(isEntryWithinDomainLimits(validEntry({ level: 2.5 }))).toBe(false);
  });

  it("acepta note ausente y note de 10000 caracteres, rechaza 10001", () => {
    expect(isEntryWithinDomainLimits(validEntry({ note: undefined }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ note: "a".repeat(10000) }))).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ note: "a".repeat(10001) }))).toBe(false);
  });

  it("rechaza updatedAt que no se pueda interpretar como fecha", () => {
    expect(isEntryWithinDomainLimits(validEntry({ updatedAt: "no-es-una-fecha" }))).toBe(false);
  });

  it("acepta deletedAt ausente o válido, y rechaza uno ilegible", () => {
    expect(isEntryWithinDomainLimits(validEntry({ deletedAt: undefined }))).toBe(true);
    expect(
      isEntryWithinDomainLimits(validEntry({ deletedAt: "2026-01-02T00:00:00.000Z" })),
    ).toBe(true);
    expect(isEntryWithinDomainLimits(validEntry({ deletedAt: "no-es-una-fecha" }))).toBe(false);
  });
});
