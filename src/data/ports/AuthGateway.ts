export type Unsubscribe = () => void;

/**
 * Lo que la app necesita saber del usuario con sesión. Es un tipo propio, y
 * no el `User` del SDK, para que ni la UI ni sus tests dependan de él.
 */
export interface SessionUser {
  id: string;
  /** `null` si el proveedor no lo da: con enlace mágico siempre llega. */
  email: string | null;
}

export type SessionUserListener = (user: SessionUser | null) => void;

/**
 * Puerto de autenticación. El adaptador de Supabase lo implementa en
 * `data/supabase/auth.ts`; los tests de la UI usan uno falso.
 */
export interface AuthGateway {
  /**
   * Emite el usuario inicial (`null` si no hay sesión) y cada cambio de
   * usuario. Deduplica por `id`: un refresco del token del mismo usuario no
   * vuelve a avisar, porque eso recargaría los repositorios cada hora.
   */
  onUserChange(listener: SessionUserListener): Unsubscribe;
  /** Envía el enlace mágico a `email`. Rechaza con un `Error` en español. */
  requestMagicLink(email: string, redirectTo: string): Promise<void>;
  /** Cierra la sesión solo en este dispositivo. Rechaza con un `Error` en español. */
  signOut(): Promise<void>;
}
