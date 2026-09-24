import { useState } from "react";

import { FilterChips } from "../components/FilterChips";
import { PaintCard } from "../components/PaintCard";
import { useLibrary } from "../hooks/libraryContext";
import {
  AVAILABLE_FAMILIES,
  AVAILABLE_LINES,
  PAINTS,
  filterPaints,
} from "../lib/catalog";
import {
  PAINT_FAMILY_LABEL,
  PAINT_LINE_LABEL,
  type PaintFamily,
  type PaintLine,
} from "../types";

/** Cuántas tarjetas se pintan de golpe. Mil swatches a la vez van lentos. */
const PAGE_SIZE = 60;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function CatalogPage() {
  const { ownedCodes } = useLibrary();
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<PaintLine[]>([]);
  const [families, setFamilies] = useState<PaintFamily[]>([]);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [visible, setVisible] = useState(PAGE_SIZE);

  const results = filterPaints(PAINTS, {
    query,
    lines,
    families,
    codes: onlyOwned ? ownedCodes : undefined,
  });

  // Cualquier cambio de filtro vuelve a la primera página.
  const resetPaging = () => setVisible(PAGE_SIZE);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Catálogo AK Interactive</h1>

        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            resetPaging();
          }}
          placeholder="Buscar por nombre, referencia o gama…"
          className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-sky-500"
        />

        <FilterChips
          values={AVAILABLE_LINES}
          selected={lines}
          labels={PAINT_LINE_LABEL}
          onToggle={(value) => {
            setLines((current) => toggle(current, value));
            resetPaging();
          }}
        />

        <FilterChips
          values={AVAILABLE_FAMILIES}
          selected={families}
          labels={PAINT_FAMILY_LABEL}
          onToggle={(value) => {
            setFamilies((current) => toggle(current, value));
            resetPaging();
          }}
        />

        <label className="flex w-fit items-center gap-2 text-sm text-neutral-400">
          <input
            type="checkbox"
            checked={onlyOwned}
            onChange={(event) => {
              setOnlyOwned(event.target.checked);
              resetPaging();
            }}
            className="accent-emerald-500"
          />
          Solo las que tengo
        </label>

        <p className="text-xs text-neutral-500">
          {results.length} de {PAINTS.length} referencias
        </p>
      </header>

      {results.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
          Ninguna referencia encaja con esos filtros.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {results.slice(0, visible).map((paint) => (
              <PaintCard key={paint.code} paint={paint} />
            ))}
          </div>

          {visible < results.length && (
            <button
              type="button"
              onClick={() => setVisible((current) => current + PAGE_SIZE)}
              className="mx-auto rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Ver {Math.min(PAGE_SIZE, results.length - visible)} más
            </button>
          )}
        </>
      )}
    </section>
  );
}
