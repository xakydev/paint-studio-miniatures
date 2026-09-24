import { describe, expect, it } from "vitest";

import { ciede2000, hexToLab, hexToRgb, readableTextOn, rgbToHex } from "./color";
import type { Lab } from "./color";

/**
 * Vectores de referencia de Sharma, Wu & Dalal (2005), el juego de pruebas
 * canónico de CIEDE2000. Incluyen a propósito los casos que rompen las
 * implementaciones ingenuas: el cruce de tono por 0°/360° y los colores casi
 * neutros, donde el término de rotación RT cambia de signo.
 */
const SHARMA_CASES: ReadonlyArray<{ first: Lab; second: Lab; expected: number }> = [
  {
    first: { l: 50, a: 2.6772, b: -79.7751 },
    second: { l: 50, a: 0, b: -82.7485 },
    expected: 2.0425,
  },
  {
    first: { l: 50, a: 3.1571, b: -77.2803 },
    second: { l: 50, a: 0, b: -82.7485 },
    expected: 2.8615,
  },
  {
    first: { l: 50, a: 2.8361, b: -74.02 },
    second: { l: 50, a: 0, b: -82.7485 },
    expected: 3.4412,
  },
  {
    first: { l: 50, a: -1.3802, b: -84.2814 },
    second: { l: 50, a: 0, b: -82.7485 },
    expected: 1.0,
  },
  {
    first: { l: 50, a: 2.5, b: 0 },
    second: { l: 50, a: 0, b: -2.5 },
    expected: 4.3065,
  },
  {
    first: { l: 60.2574, a: -34.0099, b: 36.2677 },
    second: { l: 60.4626, a: -34.1751, b: 39.4387 },
    expected: 1.2644,
  },
  {
    first: { l: 2.0776, a: 0.0795, b: -1.135 },
    second: { l: 0.9033, a: -0.0636, b: -0.5514 },
    expected: 0.9082,
  },
  {
    first: { l: 22.7233, a: 20.0904, b: -46.694 },
    second: { l: 23.0331, a: 14.973, b: -42.5619 },
    expected: 2.0373,
  },
];

describe("ciede2000", () => {
  it.each(SHARMA_CASES)(
    "reproduce el vector de Sharma ΔE=$expected",
    ({ first, second, expected }) => {
      expect(ciede2000(first, second)).toBeCloseTo(expected, 3);
    },
  );

  it("da 0 para un color consigo mismo", () => {
    expect(ciede2000(hexToLab("#7A4231"), hexToLab("#7A4231"))).toBe(0);
  });

  it("es simétrico", () => {
    const a = hexToLab("#1E357B");
    const b = hexToLab("#4A5E53");
    expect(ciede2000(a, b)).toBeCloseTo(ciede2000(b, a), 10);
  });
});

describe("conversión hex", () => {
  it("va y vuelve sin perder el valor", () => {
    for (const hex of ["#FFFFFF", "#000000", "#7A4231", "#1E357B", "#A7A6A1"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
    }
  });

  it("acepta la forma corta de tres dígitos", () => {
    expect(hexToRgb("#F00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("rechaza lo que no es un color", () => {
    expect(() => hexToRgb("#ZZZZZZ")).toThrow();
    expect(() => hexToRgb("azul")).toThrow();
  });

  it("sitúa el blanco y el negro en los extremos de L*", () => {
    expect(hexToLab("#FFFFFF").l).toBeCloseTo(100, 2);
    expect(hexToLab("#000000").l).toBeCloseTo(0, 2);
  });
});

describe("readableTextOn", () => {
  it("elige el color que contrasta con el swatch", () => {
    expect(readableTextOn("#FFFFFF")).toBe("#000000");
    expect(readableTextOn("#101207")).toBe("#FFFFFF");
    expect(readableTextOn("#1E357B")).toBe("#FFFFFF");
    expect(readableTextOn("#FEEE8E")).toBe("#000000");
  });
});
