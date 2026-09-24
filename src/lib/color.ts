/**
 * Conversión de color y distancia perceptual.
 *
 * El matcher compara pinturas en CIELAB con CIEDE2000 en vez de distancia RGB:
 * en RGB dos verdes muy distintos al ojo pueden quedar más cerca que un verde y
 * un verde oliva casi idénticos, y el resultado del buscador sale mal ordenado.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

/** Blanco de referencia D65, grados 2 — el que asume sRGB. */
const WHITE_POINT_D65 = { x: 95.047, y: 100, z: 108.883 } as const;

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Hex inválido: ${hex}`);
  }

  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`.toUpperCase();
}

/** Deshace la curva gamma de sRGB para poder trabajar en luz lineal. */
function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab({ r, g, b }: Rgb): Lab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) * 100;
  const y = (lr * 0.2126 + lg * 0.7152 + lb * 0.0722) * 100;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) * 100;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

  const fx = f(x / WHITE_POINT_D65.x);
  const fy = f(y / WHITE_POINT_D65.y);
  const fz = f(z / WHITE_POINT_D65.z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;
const toDegrees = (rad: number) => (rad * 180) / Math.PI;

/**
 * CIEDE2000. Devuelve ΔE: 0 es idéntico, <1 imperceptible, <2.3 el umbral
 * "just noticeable difference", >10 colores claramente distintos.
 */
export function ciede2000(first: Lab, second: Lab): number {
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const cBar = (c1 + c2) / 2;

  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));

  const a1Prime = first.a * (1 + g);
  const a2Prime = second.a * (1 + g);

  const c1Prime = Math.hypot(a1Prime, first.b);
  const c2Prime = Math.hypot(a2Prime, second.b);

  const hPrime = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const angle = toDegrees(Math.atan2(b, a));
    return angle >= 0 ? angle : angle + 360;
  };

  const h1Prime = hPrime(a1Prime, first.b);
  const h2Prime = hPrime(a2Prime, second.b);

  const deltaLPrime = second.l - first.l;
  const deltaCPrime = c2Prime - c1Prime;

  let deltahPrime = 0;
  if (c1Prime * c2Prime !== 0) {
    const diff = h2Prime - h1Prime;
    if (Math.abs(diff) <= 180) deltahPrime = diff;
    else if (diff > 180) deltahPrime = diff - 360;
    else deltahPrime = diff + 360;
  }

  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(toRadians(deltahPrime) / 2);

  const lBarPrime = (first.l + second.l) / 2;
  const cBarPrime = (c1Prime + c2Prime) / 2;

  let hBarPrime: number;
  if (c1Prime * c2Prime === 0) {
    hBarPrime = h1Prime + h2Prime;
  } else if (Math.abs(h1Prime - h2Prime) <= 180) {
    hBarPrime = (h1Prime + h2Prime) / 2;
  } else if (h1Prime + h2Prime < 360) {
    hBarPrime = (h1Prime + h2Prime + 360) / 2;
  } else {
    hBarPrime = (h1Prime + h2Prime - 360) / 2;
  }

  const t =
    1 -
    0.17 * Math.cos(toRadians(hBarPrime - 30)) +
    0.24 * Math.cos(toRadians(2 * hBarPrime)) +
    0.32 * Math.cos(toRadians(3 * hBarPrime + 6)) -
    0.2 * Math.cos(toRadians(4 * hBarPrime - 63));

  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const rC = 2 * Math.sqrt(cBarPrime ** 7 / (cBarPrime ** 7 + 25 ** 7));
  const rT = -rC * Math.sin(2 * toRadians(deltaTheta));

  const sL =
    1 + (0.015 * (lBarPrime - 50) ** 2) / Math.sqrt(20 + (lBarPrime - 50) ** 2);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;

  const lTerm = deltaLPrime / (kL * sL);
  const cTerm = deltaCPrime / (kC * sC);
  const hTerm = deltaHPrime / (kH * sH);

  return Math.sqrt(lTerm ** 2 + cTerm ** 2 + hTerm ** 2 + rT * cTerm * hTerm);
}

/** Texto negro o blanco según lo que contraste mejor sobre el swatch. */
export function readableTextOn(hex: string): "#000000" | "#FFFFFF" {
  const { r, g, b } = hexToRgb(hex);
  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
  return luminance > 0.36 ? "#000000" : "#FFFFFF";
}
