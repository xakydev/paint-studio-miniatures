import { useState } from "react";

import { SESSION_STATUS, useSession } from "../hooks/sessionContext";
import { LoginForm } from "./LoginForm";

const NEUTRAL_BUTTON =
  "rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10";

/**
 * La sesión en la cabecera: «Entrar» sin sesión, el correo y «Cerrar sesión»
 * con ella. Sin backend (o aún resolviendo) no pinta nada: la app es local.
 */
export function SessionMenu() {
  const { status, user, signOut } = useSession();
  const [loginOpen, setLoginOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSignOutError(null);
    try {
      await signOut();
    } catch (reason) {
      console.error("No se pudo cerrar la sesión.", reason);
      setSignOutError(reason instanceof Error ? reason.message : "No se pudo cerrar la sesión.");
    }
  };

  if (status === SESSION_STATUS.SIGNED_IN) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-neutral-400">
          {user?.email ?? "Sesión iniciada"}
        </span>
        <button type="button" onClick={handleSignOut} className={NEUTRAL_BUTTON}>
          Cerrar sesión
        </button>
        {signOutError !== null && (
          <p role="alert" className="text-xs text-rose-300">
            {signOutError}
          </p>
        )}
      </div>
    );
  }

  if (status !== SESSION_STATUS.SIGNED_OUT) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={loginOpen}
        onClick={() => setLoginOpen((open) => !open)}
        className={NEUTRAL_BUTTON}
      >
        Entrar
      </button>
      {loginOpen && (
        <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-xl border border-white/10 bg-neutral-900 p-4 shadow-xl">
          <LoginForm />
        </div>
      )}
    </div>
  );
}
