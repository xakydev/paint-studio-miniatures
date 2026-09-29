import { describe, expect, it } from "vitest";

import { markStatus, removeEntry } from "./collection";
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
