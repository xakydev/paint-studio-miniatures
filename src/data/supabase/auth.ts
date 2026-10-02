import type { Session, SupabaseClient } from "@supabase/supabase-js";

import type { AuthGateway, SessionUser } from "../ports/AuthGateway";
import type { Database } from "./database.types";

/** Lo único que el adaptador usa de `client.auth`. */
export type SupabaseAuthClient = Pick<
  SupabaseClient<Database>["auth"],
  "onAuthStateChange" | "signInWithOtp" | "signOut"
>;

function toSessionUser(session: Session | null): SessionUser | null {
  if (session === null) return null;
  return { id: session.user.id, email: session.user.email ?? null };
}

/**
 * Convierte el `{ error }` de auth-js (también cuando `fetch` falla) en un
 * rechazo con un mensaje fijo en español. El mensaje no lleva nada de la
 * petición (ni la clave ni el token); el detalle técnico va en `cause`.
 */
function throwIfError(message: string, error: unknown): void {
  if (error) throw new Error(message, { cause: error });
}

export function createSupabaseAuthGateway(auth: SupabaseAuthClient): AuthGateway {
  return {
    onUserChange(listener) {
      // `undefined` = aún no se ha avisado: el primer aviso, aunque sea null, siempre sale.
      let lastUserId: string | null | undefined;
      // El callback es síncrono a propósito: supabase-js marca los async como
      // «@deprecated Async callbacks can deadlock».
      const { data } = auth.onAuthStateChange((_event, session) => {
        const user = toSessionUser(session);
        const userId = user?.id ?? null;
        // Al arrancar con sesión llegan SIGNED_IN e INITIAL_SESSION, y cada
        // hora TOKEN_REFRESHED, todos con el mismo usuario. Avisar de cada uno
        // recargaría los repositorios sin motivo.
        if (userId === lastUserId) return;
        lastUserId = userId;
        listener(user);
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async requestMagicLink(email, redirectTo) {
      // Flujo implícito (el que trae supabase-js por defecto): con PKCE el
      // enlace solo funcionaría en el navegador que lo pidió.
      const { error } = await auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      throwIfError("No se pudo enviar el enlace de acceso.", error);
    },

    async signOut() {
      // `local`: cerrar sesión aquí no cierra los otros dispositivos.
      const { error } = await auth.signOut({ scope: "local" });
      throwIfError("No se pudo cerrar la sesión.", error);
    },
  };
}
