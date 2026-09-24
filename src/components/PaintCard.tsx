import { useLibrary } from "../hooks/libraryContext";
import { PAINT_FAMILY_LABEL, PAINT_LINE_LABEL, type Paint } from "../types";
import { OwnershipControl } from "./OwnershipControl";
import { PaintSwatch } from "./PaintSwatch";

interface PaintCardProps {
  paint: Paint;
  /** ΔE frente al color buscado, cuando la tarjeta sale del matcher. */
  delta?: number;
  deltaLabel?: string;
}

export function PaintCard({ paint, delta, deltaLabel }: PaintCardProps) {
  const { statusOf, entryOf } = useLibrary();
  const status = statusOf(paint.code);
  const entry = entryOf(paint.code);
  const isRunningLow = status === "owned" && entry !== undefined && entry.level <= 1;

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900/60 p-3">
      <PaintSwatch hex={paint.hex} label={paint.hex} size="lg" title={paint.name} />

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="truncate text-sm font-semibold" title={paint.name}>
            {paint.name}
          </h3>
          <span className="shrink-0 font-mono text-xs text-neutral-400">
            {paint.code}
          </span>
        </div>

        <p className="mt-1 truncate text-xs text-neutral-500">
          {PAINT_LINE_LABEL[paint.line]} ·{" "}
          {paint.families.map((family) => PAINT_FAMILY_LABEL[family]).join(", ")}
        </p>

        {delta !== undefined && (
          <p className="mt-1 text-xs text-sky-300">
            ΔE {delta.toFixed(1)}
            {deltaLabel ? ` · ${deltaLabel}` : ""}
          </p>
        )}

        {isRunningLow && (
          <p className="mt-1 text-xs text-rose-400">Queda poco en el bote</p>
        )}
      </div>

      <OwnershipControl code={paint.code} variant="full" />
    </article>
  );
}
