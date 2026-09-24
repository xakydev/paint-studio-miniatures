import { useState } from "react";
import { Link } from "react-router-dom";

import { PaintSwatch } from "../components/PaintSwatch";
import { useLibrary } from "../hooks/libraryContext";
import { getPaint, recipeCodes, recipeCoverage } from "../lib/catalog";
import { DIFFICULTY_LABEL, type Recipe } from "../types";

function matches(recipe: Recipe, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [
    recipe.name,
    recipe.subject,
    recipe.faction ?? "",
    recipe.summary,
    ...recipe.tags,
  ]
    .join(" ")
    .toLowerCase();

  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function RecipesPage() {
  const { ownedCodes, customRecipes, recipes } = useLibrary();
  const [query, setQuery] = useState("");

  const results = recipes.filter((recipe) => matches(recipe, query));

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Recetas</h1>
        <p className="text-sm text-neutral-400">
          Elige qué vas a pintar y la receta te dice las referencias AK por zona,
          marcando lo que ya tienes y lo que te falta.
        </p>

        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por miniatura, facción o etiqueta…"
          className="w-full rounded-lg border border-white/10 bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600 focus:border-sky-500"
        />
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {results.map((recipe) => {
          const coverage = recipeCoverage(recipe, ownedCodes);
          const isCustom = customRecipes.some((r) => r.id === recipe.id);

          return (
            <Link
              key={recipe.id}
              to={`/recetas/${recipe.id}`}
              className="flex flex-col gap-3 rounded-xl border border-white/10 bg-neutral-900/60 p-4 transition hover:border-sky-500/50 hover:bg-neutral-900"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-semibold">{recipe.name}</h2>
                  <p className="truncate text-xs text-neutral-500">
                    {recipe.subject}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-neutral-400">
                  {DIFFICULTY_LABEL[recipe.difficulty]}
                  {isCustom ? " · propia" : ""}
                </span>
              </div>

              <p className="line-clamp-2 text-sm text-neutral-400">
                {recipe.summary}
              </p>

              <div className="flex flex-wrap gap-1">
                {recipeCodes(recipe)
                  .slice(0, 12)
                  .map((code) => {
                    const paint = getPaint(code);
                    return paint ? (
                      <PaintSwatch
                        key={code}
                        hex={paint.hex}
                        size="sm"
                        title={`${paint.code} · ${paint.name}`}
                      />
                    ) : null;
                  })}
              </div>

              <div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-[width]"
                    style={{ width: `${Math.round(coverage.ratio * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-neutral-500">
                  Tienes {coverage.owned} de {coverage.total} referencias
                  {coverage.missing.length > 0 &&
                    ` · faltan ${coverage.missing.length}`}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {results.length === 0 && (
        <p className="rounded-lg border border-white/10 bg-neutral-900/50 p-6 text-sm text-neutral-400">
          Ninguna receta encaja con esa búsqueda.
        </p>
      )}
    </section>
  );
}
