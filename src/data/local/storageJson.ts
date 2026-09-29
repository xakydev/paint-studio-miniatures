/**
 * Todo acceso a localStorage va envuelto: en ventana privada, con las cookies
 * bloqueadas o con la cuota llena, el simple `getItem` lanza y tumbaría el
 * render entero. Perder la persistencia es aceptable; perder la app no.
 */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin persistencia la sesión sigue siendo usable en memoria.
  }
}

/** Lo que hay guardado bajo una clave, sin interpretar más allá de "¿es un array?". */
export interface StoredArray {
  items: unknown[];
  /** Texto original si existía pero no era un array JSON válido. */
  corrupt?: string;
}

export function readArray(key: string): StoredArray {
  let text: string | null;
  try {
    text = localStorage.getItem(key);
  } catch {
    return { items: [] };
  }
  if (!text) return { items: [] };
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed)) return { items: parsed };
  } catch {
    // Cae al caso corrupto.
  }
  return { items: [], corrupt: text };
}

export function writeText(key: string, text: string): void {
  try {
    localStorage.setItem(key, text);
  } catch {
    // Mismo criterio que writeJson: sin persistencia, pero sin romper la app.
  }
}
