/**
 * Todo acceso a localStorage va envuelto: en ventana privada, con las cookies
 * bloqueadas o con la cuota llena, el simple `getItem` lanza y tumbaría el
 * render entero. Perder la persistencia es aceptable; perder la app no.
 */
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
  /**
   * `true` si `getItem` lanzó: no se pudo leer, que no es lo mismo que "no
   * había nada". Sirve para que quien escribe sepa que no debe fundir sobre
   * `items` vacío, porque no es lo que hay guardado de verdad.
   */
  unreadable?: true;
}

export function readArray(key: string): StoredArray {
  let text: string | null;
  try {
    text = localStorage.getItem(key);
  } catch {
    return { items: [], unreadable: true };
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
