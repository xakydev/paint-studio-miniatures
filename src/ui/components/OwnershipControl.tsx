import { useId, useState } from "react";

import { getPaint } from "../../data/static/catalogSource";
import { OWNERSHIP } from "../../domain/types";
import { useLibrary } from "../hooks/libraryContext";

interface OwnershipControlProps {
  code: string;
  /** Compacto para listas densas; completo añade el nivel del bote. */
  variant?: "compact" | "full";
}

const LEVEL_LABEL = ["Vacío", "Queda poco", "Medio", "Lleno"] as const;

const NEUTRAL_BUTTON =
  "rounded-md border border-white/15 bg-white/5 px-2 py-1 text-xs font-medium text-neutral-300 transition hover:bg-white/10";

/**
 * El estado y las acciones van separados: una etiqueta dice qué es la pintura
 * para ti y los botones dicen qué va a pasar al pulsarlos. Antes el mismo
 * botón "La tengo" mostraba el estado y, pulsado otra vez, la quitaba.
 */
export function OwnershipControl({ code, variant = "compact" }: OwnershipControlProps) {
  const { statusOf, setStatus, entryOf, setLevel } = useLibrary();
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  const status = statusOf(code);
  const entry = entryOf(code);

  return (
    <div className="flex flex-col gap-2">
      {status === null && (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setStatus(code, OWNERSHIP.OWNED)}
            className={NEUTRAL_BUTTON}
          >
            La tengo
          </button>
          <button
            type="button"
            onClick={() => setStatus(code, OWNERSHIP.WISHLIST)}
            className={NEUTRAL_BUTTON}
          >
            Comprar
          </button>
        </div>
      )}

      {status === OWNERSHIP.OWNED && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-emerald-400 bg-emerald-500 px-2 py-1 text-xs font-medium text-emerald-950">
            ✓ En el armario
          </span>
          <button
            type="button"
            // Quitar algo del armario sí pierde información (nivel, nota):
            // se confirma, y se ofrece pasarlo a comprar, que suele ser lo
            // que se quiere cuando un bote se acaba.
            onClick={() => setConfirmingRemoval(true)}
            className={NEUTRAL_BUTTON}
          >
            Quitar
          </button>
        </div>
      )}

      {status === OWNERSHIP.WISHLIST && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="rounded-md border border-amber-300 bg-amber-400 px-2 py-1 text-xs font-medium text-amber-950">
            Por comprar
          </span>
          <button
            type="button"
            onClick={() => setStatus(code, OWNERSHIP.OWNED)}
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-500/25"
          >
            Ya la he comprado
          </button>
          <button
            type="button"
            // Sacarla de la lista de compra no toca el armario: sin diálogo.
            onClick={() => setStatus(code, null)}
            className={NEUTRAL_BUTTON}
          >
            Quitar
          </button>
        </div>
      )}

      {variant === "full" && status === OWNERSHIP.OWNED && entry && (
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="range"
            min={0}
            max={3}
            step={1}
            value={entry.level}
            onChange={(event) => setLevel(code, Number(event.target.value))}
            className="w-24 accent-emerald-500"
          />
          <span className={entry.level === 0 ? "text-rose-400" : undefined}>
            {LEVEL_LABEL[entry.level] ?? "Lleno"}
          </span>
        </label>
      )}

      {confirmingRemoval && (
        <RemoveOwnedDialog
          code={code}
          onMoveToWishlist={() => {
            setStatus(code, OWNERSHIP.WISHLIST);
            setConfirmingRemoval(false);
          }}
          onRemove={() => {
            setStatus(code, null);
            setConfirmingRemoval(false);
          }}
          onCancel={() => setConfirmingRemoval(false)}
        />
      )}
    </div>
  );
}

interface RemoveOwnedDialogProps {
  code: string;
  onMoveToWishlist: () => void;
  onRemove: () => void;
  onCancel: () => void;
}

/**
 * `window.confirm` solo sabe decir sí o no, y aquí hay tres salidas. Se pinta
 * dentro del propio control (no en un portal) para que quede junto a la
 * tarjeta en el árbol y los tests lo encuentren donde lo ve el usuario.
 */
function RemoveOwnedDialog({ code, onMoveToWishlist, onRemove, onCancel }: RemoveOwnedDialogProps) {
  const titleId = useId();
  const paint = getPaint(code);
  const label = paint ? `${paint.name} (${code})` : code;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
        className="flex w-full max-w-sm flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900 p-4 shadow-xl"
      >
        <h2 id={titleId} className="text-sm font-semibold text-neutral-100">
          ¿Quitar {label}?
        </h2>
        <p className="text-xs text-neutral-400">
          Si se te ha acabado, pásala a la lista de compra y no pierdes la referencia.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onMoveToWishlist}
            className="rounded-md border border-amber-300/40 bg-amber-400/15 px-3 py-2 text-sm font-medium text-amber-100 hover:bg-amber-400/25"
          >
            Pasar a comprar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-rose-400/40 bg-rose-500/15 px-3 py-2 text-sm font-medium text-rose-100 hover:bg-rose-500/25"
          >
            Quitar de la colección
          </button>
          <button
            type="button"
            // El foco empieza en la opción que no cambia nada.
            autoFocus
            onClick={onCancel}
            className="rounded-md border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/10"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
