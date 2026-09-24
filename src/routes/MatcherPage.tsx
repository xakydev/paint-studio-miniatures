import { useState } from "react";

import { FilterChips } from "../components/FilterChips";
import { PaintCard } from "../components/PaintCard";
import { useLibrary } from "../hooks/libraryContext";
import { AVAILABLE_LINES, describeDelta, findClosestPaints } from "../lib/catalog";
import { extractDominantColors, type DominantColor } from "../lib/imageColors";
import { readableTextOn } from "../lib/color";
import { PAINT_LINE_LABEL, type PaintLine } from "../types";

export function MatcherPage() {
  const { ownedCodes } = useLibrary();
  const [hex, setHex] = useState("#7A4231");
  const [lines, setLines] = useState<PaintLine[]>([]);
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [palette, setPalette] = useState<DominantColor[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);

  const matches = findClosestPaints(hex, {
    limit: 12,
    lines,
    codes: onlyOwned ? ownedCodes : undefined,
  });

  const handleImage = async (file: File) => {
    setIsReading(true);
    setImageError(null);
    try {
      const colors = await extractDominantColors(file, 6);
      setPalette(colors);
      // Arrancar por el color dominante ahorra un clic en el caso habitual.
      if (colors[0]) setHex(colors[0].hex);
    } catch (error) {
      setImageError(
        error instanceof Error ? error.message : "No se pudo leer la imagen.",
      );
    } finally {
      setIsReading(false);
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Buscar pintura por color</h1>
        <p className="max-w-2xl text-sm text-neutral-400">
          Elige un color o sube la foto de una miniatura y se comparan las 1.130
          referencias del catálogo en CIELAB con CIEDE2000, que ordena por
          parecido real al ojo y no por cercanía numérica en RGB.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-neutral-400">Color objetivo</span>
            <input
              type="color"
              value={hex}
              onChange={(event) => setHex(event.target.value.toUpperCase())}
              className="h-24 w-full cursor-pointer rounded-lg border border-white/15 bg-transparent md:w-40"
            />
          </label>

          <input
            type="text"
            value={hex}
            onChange={(event) => {
              const value = event.target.value.toUpperCase();
              setHex(value.startsWith("#") ? value : `#${value}`);
            }}
            spellCheck={false}
            className="rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-center font-mono text-sm outline-none focus:border-sky-500"
          />
        </div>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-neutral-400">
              …o saca los colores de una foto
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImage(file);
              }}
              className="text-sm text-neutral-400 file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-neutral-200 hover:file:bg-white/15"
            />
          </label>

          {isReading && (
            <p className="text-sm text-neutral-400">Analizando la imagen…</p>
          )}
          {imageError && <p className="text-sm text-rose-400">{imageError}</p>}

          {palette.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {palette.map((color) => (
                <button
                  key={color.hex}
                  type="button"
                  onClick={() => setHex(color.hex)}
                  style={{
                    backgroundColor: color.hex,
                    color: readableTextOn(color.hex),
                  }}
                  className={`rounded-lg border px-3 py-2 font-mono text-xs transition ${
                    hex === color.hex
                      ? "border-sky-400 ring-2 ring-sky-400/50"
                      : "border-white/20 hover:scale-105"
                  }`}
                  title={`${Math.round(color.share * 100)}% de la imagen`}
                >
                  {color.hex}
                </button>
              ))}
            </div>
          )}

          <FilterChips
            values={AVAILABLE_LINES}
            selected={lines}
            labels={PAINT_LINE_LABEL}
            onToggle={(value) =>
              setLines((current) =>
                current.includes(value)
                  ? current.filter((item) => item !== value)
                  : [...current, value],
              )
            }
          />

          <label className="flex w-fit items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={onlyOwned}
              onChange={(event) => setOnlyOwned(event.target.checked)}
              className="accent-emerald-500"
            />
            Buscar solo entre las que tengo
          </label>
        </div>
      </div>

      {matches.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
          No hay ninguna referencia con la que comparar. Quita filtros o añade
          pinturas a tu colección.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {matches.map((match) => (
            <PaintCard
              key={match.paint.code}
              paint={match.paint}
              delta={match.delta}
              deltaLabel={describeDelta(match.delta)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
