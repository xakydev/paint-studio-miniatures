import { describe, expect, it } from "vitest";

import { activeOnly, isActive } from "./tombstone";

const ACTIVE = { updatedAt: "2026-01-01T00:00:00.000Z" };
const DELETED = {
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: "2026-01-02T00:00:00.000Z",
};

describe("isActive", () => {
  it("es activo cuando no tiene deletedAt", () => {
    expect(isActive(ACTIVE)).toBe(true);
  });

  it("no es activo cuando tiene deletedAt", () => {
    expect(isActive(DELETED)).toBe(false);
  });
});

describe("activeOnly", () => {
  it("conserva solo los registros sin deletedAt", () => {
    expect(activeOnly([ACTIVE, DELETED])).toEqual([ACTIVE]);
  });

  it("devuelve una lista vacía si todo está borrado", () => {
    expect(activeOnly([DELETED])).toEqual([]);
  });

  it("devuelve todo si nada está borrado", () => {
    expect(activeOnly([ACTIVE, ACTIVE])).toEqual([ACTIVE, ACTIVE]);
  });
});
