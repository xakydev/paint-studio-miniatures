import { useRef, useState } from "react";

import { PaintCard } from "../components/PaintCard";
import { PaintSwatch } from "../components/PaintSwatch";
import { useLibrary } from "../hooks/libraryContext";
import { PAINTS, filterPaints, getPaint } from "../lib/catalog";
import { buildBackup, parseBackup } from "../lib/storage";
import { OWNERSHIP, type Paint } from "../types";

const TAB = {
  OWNED: "owned",
  WISHLIST: "wishlist",
  ADD: "add",
} as const;

type Tab = (typeof TAB)[keyof typeof TAB];

const TAB_LABEL: Record<Tab, string> = {
  [TAB.OWNED]: "Las que tengo",
  [TAB.WISHLIST]: "Lista de compra",
  [TAB.ADD]: "Añadir",
};

function sortedPaints(codes: ReadonlySet<string>): Paint[] {
  return [...codes]
    .map(getPaint)
    .filter((paint): paint is Paint => paint !== undefined)
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

export function CollectionPage() {
  const {
    entries,
    ownedCodes,
    wishlistCodes,
    customRecipes,
    replaceCollection,
    clearCollection,
    setStatus,
  } = useLibrary();

  const [tab, setTab] = useState<Tab>(TAB.OWNED);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const owned = sortedPaints(ownedCodes);
  const wishlist = sortedPaints(wishlistCodes);
  const runningLow = entries.filter(
    (entry) => entry.status === OWNERSHIP.OWNED && entry.level <= 1,
  );

  const exportBackup = () => {
    const backup = buildBackup(entries, customRecipes);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `paint-studio-miniatures-${backup.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = async (file: File) => {
    try {
      const parsed = parseBackup(await file.text());
      replaceCollection(parsed.collection);
      setNotice(`Importadas ${parsed.collection.length} pinturas.`);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "No se pudo leer el respaldo.",
      );
    }
  };

  // En la pestaña de añadir se busca sobre todo el catálogo; en las otras, solo
  // sobre lo que ya está en la colección.
  const addResults =
    query.trim().length === 0
      ? []
      : filterPaints(PAINTS, { query, lines: [], families: [] }).slice(0, 40);

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Mi colección</h1>

        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
            {owned.length} en el armario
          </span>
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5">
            {wishlist.length} por comprar
          </span>
          {runningLow.length > 0 && (
            <span className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5">
              {runningLow.length} a punto de acabarse
            </span>
          )}
        </div>

        <nav className="flex gap-1">
          {(Object.values(TAB) as Tab[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={`rounded-md px-3 py-1.5 text-sm transition ${
                tab === value
                  ? "bg-white/10 font-medium text-white"
                  : "text-neutral-400 hover:bg-white/5"
              }`}
            >
              {TAB_LABEL[value]}
            </button>
          ))}
        </nav>
      </header>

      {tab === TAB.ADD && (
        <div className="flex flex-col gap-3">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Busca la referencia o el nombre del bote que quieres añadir…"
            className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-sky-500"
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {addResults.map((paint) => (
              <PaintCard key={paint.code} paint={paint} />
            ))}
          </div>

          {query.trim().length > 0 && addResults.length === 0 && (
            <p className="text-sm text-neutral-400">Sin resultados.</p>
          )}
        </div>
      )}

      {tab === TAB.OWNED &&
        (owned.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
            Todavía no has marcado ninguna pintura. Ve a «Añadir» o marca «La
            tengo» desde el catálogo.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {owned.map((paint) => (
              <PaintCard key={paint.code} paint={paint} />
            ))}
          </div>
        ))}

      {tab === TAB.WISHLIST &&
        (wishlist.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
            La lista de compra está vacía. Abre una receta y añade lo que te
            falte.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {wishlist.map((paint) => (
              <li
                key={paint.code}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-neutral-900/60 p-3"
              >
                <PaintSwatch hex={paint.hex} size="md" title={paint.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{paint.name}</p>
                  <p className="font-mono text-xs text-neutral-500">
                    {paint.code} · {paint.hex}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStatus(paint.code, OWNERSHIP.OWNED)}
                  className="no-print rounded-md border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-500/25"
                >
                  Ya la he comprado
                </button>
                <button
                  type="button"
                  onClick={() => setStatus(paint.code, null)}
                  className="no-print rounded-md border border-white/15 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        ))}

      <footer className="no-print flex flex-col gap-3 border-t border-white/10 pt-4">
        <h2 className="text-sm font-semibold text-neutral-300">
          Respaldo de la colección
        </h2>
        <p className="text-xs text-neutral-500">
          Los datos viven solo en este navegador. Exporta si vas a cambiar de
          equipo o a limpiar el historial.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportBackup}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Exportar
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
          >
            Importar
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
            }}
          />

          <button
            type="button"
            onClick={() => {
              // Borrar la colección entera no tiene deshacer: se confirma.
              if (window.confirm("¿Vaciar toda la colección? No se puede deshacer.")) {
                clearCollection();
                setNotice("Colección vaciada.");
              }
            }}
            className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-sm text-rose-200 hover:bg-rose-500/20"
          >
            Vaciar
          </button>
        </div>

        {notice && <p className="text-sm text-sky-300">{notice}</p>}
      </footer>
    </section>
  );
}
