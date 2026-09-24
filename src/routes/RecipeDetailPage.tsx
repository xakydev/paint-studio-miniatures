import { Link, useParams } from "react-router-dom";

import { OwnershipControl } from "../components/OwnershipControl";
import { PaintSwatch } from "../components/PaintSwatch";
import { useLibrary } from "../hooks/libraryContext";
import {
  describeDelta,
  getPaint,
  recipeCoverage,
  substitutesFromCollection,
} from "../lib/catalog";
import {
  DIFFICULTY_LABEL,
  STEP_ROLE_LABEL,
  type RecipeStep,
} from "../types";

function StepRow({ step }: { step: RecipeStep }) {
  const { ownedCodes } = useLibrary();
  const paint = getPaint(step.code);

  if (!paint) {
    return (
      <li className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
        La receta pide la referencia {step.code}, que no está en el catálogo.
      </li>
    );
  }

  const isOwned = ownedCodes.has(paint.code);
  const substitutes = isOwned
    ? []
    : substitutesFromCollection(paint.code, ownedCodes, 2);

  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        isOwned
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-white/10 bg-neutral-900/60"
      }`}
    >
      <div className="flex items-start gap-3">
        <PaintSwatch hex={paint.hex} size="md" title={paint.name} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-neutral-300">
              {STEP_ROLE_LABEL[step.role]}
            </span>
            <span className="font-medium">{paint.name}</span>
            <span className="font-mono text-xs text-neutral-500">
              {paint.code}
            </span>
          </div>

          {step.note && (
            <p className="mt-1 text-sm text-neutral-400">{step.note}</p>
          )}
        </div>

        <div className="no-print shrink-0">
          <OwnershipControl code={paint.code} />
        </div>
      </div>

      {substitutes.length > 0 && (
        <p className="no-print pl-15 text-xs text-amber-200/80">
          No la tienes. Lo más parecido en tu armario:{" "}
          {substitutes
            .map((match) => {
              const label = `${match.paint.name} (${match.paint.code})`;
              return `${label} — ${describeDelta(match.delta)}, ΔE ${match.delta.toFixed(1)}`;
            })
            .join(" · ")}
        </p>
      )}
    </li>
  );
}

export function RecipeDetailPage() {
  const { id } = useParams();
  const { recipes, ownedCodes, addManyToWishlist } = useLibrary();

  const recipe = recipes.find((item) => item.id === id);

  if (!recipe) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-neutral-400">Esa receta no existe.</p>
        <Link to="/recetas" className="text-sm text-sky-400 hover:underline">
          Volver a las recetas
        </Link>
      </div>
    );
  }

  const coverage = recipeCoverage(recipe, ownedCodes);

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          to="/recetas"
          className="no-print w-fit text-sm text-sky-400 hover:underline"
        >
          ← Recetas
        </Link>

        <h1 className="text-2xl font-semibold">{recipe.name}</h1>
        <p className="text-sm text-neutral-400">
          {recipe.subject}
          {recipe.faction ? ` · ${recipe.faction}` : ""} ·{" "}
          {DIFFICULTY_LABEL[recipe.difficulty]}
        </p>
        <p className="max-w-2xl text-sm text-neutral-300">{recipe.summary}</p>
      </header>

      <section
        className={`flex flex-wrap items-center gap-3 rounded-xl border p-4 ${
          coverage.missing.length === 0
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-amber-500/30 bg-amber-500/10"
        }`}
      >
        <p className="flex-1 text-sm">
          {coverage.missing.length === 0
            ? `Tienes las ${coverage.total} referencias. Puedes empezar.`
            : `Te faltan ${coverage.missing.length} de ${coverage.total} referencias.`}
        </p>

        {coverage.missing.length > 0 && (
          <button
            type="button"
            onClick={() => addManyToWishlist(coverage.missing)}
            className="no-print rounded-lg border border-amber-400/50 bg-amber-400/20 px-3 py-1.5 text-sm font-medium text-amber-100 hover:bg-amber-400/30"
          >
            Añadir las que faltan a la lista de compra
          </button>
        )}
      </section>

      {recipe.zones.map((zone) => (
        <section key={zone.name} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{zone.name}</h2>
          <ol className="flex flex-col gap-2">
            {zone.steps.map((step, index) => (
              <StepRow key={`${step.code}-${step.role}-${index}`} step={step} />
            ))}
          </ol>
        </section>
      ))}

      <footer className="no-print flex flex-wrap gap-2 border-t border-white/10 pt-4">
        {recipe.tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-neutral-400"
          >
            {tag}
          </span>
        ))}
      </footer>
    </article>
  );
}
