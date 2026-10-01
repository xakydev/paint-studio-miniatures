import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUploadMarker } from "./uploadMarker";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createUploadMarker", () => {
  it("isDone es false cuando no hay nada guardado todavía", () => {
    const marker = createUploadMarker("usuario-a");

    expect(marker.isDone()).toBe(false);
  });

  it("markDone hace que isDone pase a true", () => {
    const marker = createUploadMarker("usuario-a");

    marker.markDone();

    expect(marker.isDone()).toBe(true);
  });

  it("la marca es por usuario: marcar uno no afecta al otro", () => {
    const markerA = createUploadMarker("usuario-a");
    const markerB = createUploadMarker("usuario-b");

    markerA.markDone();

    expect(markerA.isDone()).toBe(true);
    expect(markerB.isDone()).toBe(false);
  });

  it("la marca persiste en localStorage bajo una clave por usuario", () => {
    const marker = createUploadMarker("usuario-a");

    marker.markDone();

    expect(localStorage.getItem("paint-studio-miniatures:uploaded:v1:usuario-a")).not.toBeNull();
  });

  it("isDone cuenta como 'no hecho' si localStorage.getItem lanza", () => {
    const marker = createUploadMarker("usuario-a");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloqueado");
    });

    expect(marker.isDone()).toBe(false);
  });

  it("markDone no lanza si localStorage.setItem falla, y deja constancia con console.error sin datos personales", () => {
    const marker = createUploadMarker("usuario-a");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("cuota llena");
    });

    expect(() => marker.markDone()).not.toThrow();
    expect(consoleError).toHaveBeenCalledOnce();
    const logged = consoleError.mock.calls.flat().map(String).join(" ");
    expect(logged).not.toContain("usuario-a");
  });
});
