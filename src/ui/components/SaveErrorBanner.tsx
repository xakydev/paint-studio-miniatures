import { useLibrary } from "../hooks/libraryContext";

/**
 * Aviso de que el último guardado (o la carga) falló. Es una alerta para que
 * un lector de pantalla la anuncie. Cerrarla solo retira el aviso: no deshace
 * el cambio ni lo reintenta.
 */
export function SaveErrorBanner() {
  const { saveError, dismissSaveError } = useLibrary();
  if (saveError === null) return null;

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-rose-400/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100"
    >
      <p className="flex-1">{saveError}</p>
      <button
        type="button"
        onClick={dismissSaveError}
        className="rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10"
      >
        Cerrar aviso
      </button>
    </div>
  );
}
