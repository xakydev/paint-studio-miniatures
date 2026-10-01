import { createContext, use } from "react";

import type { SessionUser } from "../../data/ports/AuthGateway";

/**
 * - `DISABLED`: no hay backend (faltan las variables de entorno). La app es
 *   local y no ofrece iniciar sesión.
 * - `RESOLVING`: hay backend, pero aún no ha llegado el primer aviso de
 *   sesión. No se sabe todavía qué datos mostrar.
 * - `SIGNED_OUT` / `SIGNED_IN`: el primer aviso ya llegó.
 */
export const SESSION_STATUS = {
  DISABLED: "disabled",
  RESOLVING: "resolving",
  SIGNED_OUT: "signed-out",
  SIGNED_IN: "signed-in",
} as const;

export type SessionStatus = (typeof SESSION_STATUS)[keyof typeof SESSION_STATUS];

export interface SessionApi {
  status: SessionStatus;
  /** Solo distinto de `null` en `SIGNED_IN`. */
  user: SessionUser | null;
  /** Rechaza con un `Error` en español. */
  requestMagicLink(email: string): Promise<void>;
  /** Rechaza con un `Error` en español. */
  signOut(): Promise<void>;
}

export const SessionContext = createContext<SessionApi | null>(null);

export function useSession(): SessionApi {
  const api = use(SessionContext);
  if (!api) {
    throw new Error("useSession necesita estar dentro de <SessionProvider>.");
  }
  return api;
}
