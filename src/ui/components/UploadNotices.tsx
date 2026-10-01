import { useState } from "react";

import { useSession } from "../hooks/sessionContext";

const NEUTRAL_BUTTON =
  "rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10";

interface UploadFailedProps {
  /** El motivo, ya en español. */
  error: string | null;
  onRetry: () => void;
}

/**
 * El volcado del primer login falló. La sesión sigue abierta y no se
 * muestra ningún dato: ni lo local (no es el contenido de la cuenta) ni lo
 * remoto (aún no tiene lo de este dispositivo). Solo hay dos salidas.
 */
export function UploadFailed({ error, onRetry }: UploadFailedProps) {
  const { signOut } = useSession();
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

  return (
    <div className="mx-auto mt-10 flex max-w-md flex-col gap-3 px-4">
      <div
        role="alert"
        className="rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100"
      >
        <p className="font-medium">No se pudieron subir tus datos locales a tu cuenta.</p>
        {error !== null && <p className="mt-1 text-xs text-rose-200/80">{error}</p>}
        {signOutError !== null && <p className="mt-1 text-xs">{signOutError}</p>}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-100 transition hover:bg-emerald-500/25"
        >
          Reintentar
        </button>
        <button type="button" onClick={handleSignOut} className={NEUTRAL_BUTTON}>
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

interface UploadSkippedNoticeProps {
  count: number;
  onDismiss: () => void;
}

/**
 * Informativo, no un error: el volcado terminó bien y la app ya muestra lo
 * remoto. Las entradas saltadas siguen intactas en este dispositivo.
 */
export function UploadSkippedNotice({ count, onDismiss }: UploadSkippedNoticeProps) {
  const message =
    count === 1
      ? "1 entrada de este dispositivo no se ha subido a tu cuenta porque tiene datos fuera de rango. Sigue guardada aquí."
      : `${count} entradas de este dispositivo no se han subido a tu cuenta porque tienen datos fuera de rango. Siguen guardadas aquí.`;

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-300/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
      <p role="status" className="flex-1">
        {message}
      </p>
      <button type="button" onClick={onDismiss} className={NEUTRAL_BUTTON}>
        Cerrar aviso
      </button>
    </div>
  );
}
