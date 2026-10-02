import { useEffect, useState, type ReactNode } from "react";

import type { AuthGateway, SessionUser } from "../../data/ports/AuthGateway";
import { SESSION_STATUS, SessionContext, type SessionApi } from "./sessionContext";

export interface SessionProviderProps {
  children: ReactNode;
  /** `null` = sin backend: la app es local y no ofrece iniciar sesión. */
  auth: AuthGateway | null;
}

/** El último aviso recibido, junto al gateway que lo dio. */
interface UserSnapshot {
  gateway: AuthGateway;
  user: SessionUser | null;
}

/** Sin backend no hay a quién pedir nada: nadie debería llamar a esto. */
async function unavailable(): Promise<void> {
  throw new Error("No se puede iniciar sesión: la app funciona solo en local.");
}

/**
 * Un aviso de otro gateway no cuenta: si cambiara el backend, se vuelve a
 * RESOLVING hasta que hable el nuevo, sin fijar estado durante el render.
 */
function currentUser(
  auth: AuthGateway | null,
  snapshot: UserSnapshot | null,
): Pick<SessionApi, "status" | "user"> {
  if (auth === null) return { status: SESSION_STATUS.DISABLED, user: null };
  if (snapshot === null || snapshot.gateway !== auth) {
    return { status: SESSION_STATUS.RESOLVING, user: null };
  }
  return snapshot.user === null
    ? { status: SESSION_STATUS.SIGNED_OUT, user: null }
    : { status: SESSION_STATUS.SIGNED_IN, user: snapshot.user };
}

export function SessionProvider({ children, auth }: SessionProviderProps) {
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);

  useEffect(() => {
    if (auth === null) return;
    // El callback solo fija el estado, sin nada asíncrono: supabase-js marca
    // los callbacks async como «@deprecated Async callbacks can deadlock».
    // El volcado del primer login va en un efecto de useLibrarySource.
    return auth.onUserChange((user) => {
      setSnapshot({ gateway: auth, user });
    });
  }, [auth]);

  const api: SessionApi = {
    ...currentUser(auth, snapshot),
    // La vuelta del enlace es siempre la raíz: ahí BrowserRouter pinta el
    // catálogo y supabase-js recoge el `#access_token` al crear el cliente.
    requestMagicLink: auth
      ? (email) => auth.requestMagicLink(email, `${window.location.origin}/`)
      : unavailable,
    signOut: auth ? () => auth.signOut() : unavailable,
  };

  return <SessionContext value={api}>{children}</SessionContext>;
}
