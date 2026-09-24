import { useLibrary } from "../hooks/libraryContext";
import { OWNERSHIP, type Ownership } from "../types";

interface OwnershipControlProps {
  code: string;
  /** Compacto para listas densas; completo añade el nivel del bote. */
  variant?: "compact" | "full";
}

const BUTTONS: ReadonlyArray<{ status: Ownership; label: string; active: string }> = [
  {
    status: OWNERSHIP.OWNED,
    label: "La tengo",
    active: "bg-emerald-500 text-emerald-950 border-emerald-400",
  },
  {
    status: OWNERSHIP.WISHLIST,
    label: "Comprar",
    active: "bg-amber-400 text-amber-950 border-amber-300",
  },
];

const LEVEL_LABEL = ["Vacío", "Queda poco", "Medio", "Lleno"] as const;

export function OwnershipControl({ code, variant = "compact" }: OwnershipControlProps) {
  const { statusOf, setStatus, entryOf, setLevel } = useLibrary();
  const status = statusOf(code);
  const entry = entryOf(code);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1">
        {BUTTONS.map((button) => {
          const isActive = status === button.status;
          return (
            <button
              key={button.status}
              type="button"
              // Volver a pulsar el estado activo saca la pintura de la colección.
              onClick={() => setStatus(code, isActive ? null : button.status)}
              aria-pressed={isActive}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition ${
                isActive
                  ? button.active
                  : "border-white/15 bg-white/5 text-neutral-300 hover:bg-white/10"
              }`}
            >
              {button.label}
            </button>
          );
        })}
      </div>

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
    </div>
  );
}
