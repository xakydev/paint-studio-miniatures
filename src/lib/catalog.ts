import catalogJson from "../data/catalog.json";
import recipesJson from "../data/recipes.json";
import {
  type Paint,
  type PaintFamily,
  type PaintLine,
  type Recipe,
  type RecipeStep,
} from "../types";
import { ciede2000, hexToLab } from "./color";

export const PAINTS: Paint[] = catalogJson.map((record) => ({
  ...record,
  lab: hexToLab(record.hex),
}));
export const RECIPES: Recipe[] = recipesJson;

export const PAINT_BY_CODE: ReadonlyMap<string, Paint> = new Map(
  PAINTS.map((paint) => [paint.code, paint]),
);

export function getPaint(code: string): Paint | undefined {
  return PAINT_BY_CODE.get(code);
}

/** Las líneas y familias que realmente aparecen en los datos, ya ordenadas. */
export const AVAILABLE_LINES: PaintLine[] = [
  ...new Set(PAINTS.map((paint) => paint.line)),
].sort();

export const AVAILABLE_FAMILIES: PaintFamily[] = [
  ...new Set(PAINTS.flatMap((paint) => paint.families)),
].sort();

export interface PaintFilters {
  query: string;
  lines: PaintLine[];
  families: PaintFamily[];
  /** Restringe a estas referencias; se usa para ver solo lo que tienes. */
  codes?: ReadonlySet<string>;
}

export const EMPTY_FILTERS: PaintFilters = {
  query: "",
  lines: [],
  families: [],
};

/**
 * Busca por nombre, referencia o gama. Se normaliza el texto para que "marrón"
 * encuentre "Marron" y al revés: media web de miniaturas escribe sin tildes.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function filterPaints(paints: Paint[], filters: PaintFilters): Paint[] {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);

  return paints.filter((paint) => {
    if (filters.codes && !filters.codes.has(paint.code)) return false;
    if (filters.lines.length > 0 && !filters.lines.includes(paint.line)) {
      return false;
    }
    if (
      filters.families.length > 0 &&
      !paint.families.some((family) => filters.families.includes(family))
    ) {
      return false;
    }
    if (terms.length === 0) return true;

    const haystack = normalize(
      `${paint.code} ${paint.name} ${paint.sets.join(" ")}`,
    );
    return terms.every((term) => haystack.includes(term));
  });
}

export interface PaintMatch {
  paint: Paint;
  /** ΔE CIEDE2000 respecto al color buscado. Menor es más parecido. */
  delta: number;
}

export interface MatchOptions {
  limit?: number;
  lines?: PaintLine[];
  families?: PaintFamily[];
  /** Si se pasa, solo se compara contra estas referencias. */
  codes?: ReadonlySet<string>;
}

export function findClosestPaints(
  hex: string,
  { limit = 8, lines, families, codes }: MatchOptions = {},
): PaintMatch[] {
  const target = hexToLab(hex);

  const pool = PAINTS.filter((paint) => {
    if (codes && !codes.has(paint.code)) return false;
    if (lines && lines.length > 0 && !lines.includes(paint.line)) return false;
    if (
      families &&
      families.length > 0 &&
      !paint.families.some((family) => families.includes(family))
    ) {
      return false;
    }
    return true;
  });

  return pool
    .map((paint) => ({ paint, delta: ciede2000(target, paint.lab) }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, limit);
}

/** Traduce el ΔE a algo accionable delante del bote. */
export function describeDelta(delta: number): string {
  if (delta < 1) return "Indistinguible";
  if (delta < 2.3) return "Prácticamente igual";
  if (delta < 5) return "Muy parecido";
  if (delta < 10) return "Parecido";
  if (delta < 20) return "Aproximado";
  return "Lejano";
}

/** Todas las referencias que pide una receta, sin repetir y en orden de uso. */
export function recipeCodes(recipe: Recipe): string[] {
  const seen = new Set<string>();
  const codes: string[] = [];

  for (const zone of recipe.zones) {
    for (const step of zone.steps) {
      if (seen.has(step.code)) continue;
      seen.add(step.code);
      codes.push(step.code);
    }
  }

  return codes;
}

export interface RecipeCoverage {
  total: number;
  owned: number;
  missing: string[];
  /** 0–1. Para la barra de progreso de la tarjeta de receta. */
  ratio: number;
}

export function recipeCoverage(
  recipe: Recipe,
  ownedCodes: ReadonlySet<string>,
): RecipeCoverage {
  const codes = recipeCodes(recipe);
  const missing = codes.filter((code) => !ownedCodes.has(code));
  const owned = codes.length - missing.length;

  return {
    total: codes.length,
    owned,
    missing,
    ratio: codes.length === 0 ? 1 : owned / codes.length,
  };
}

/**
 * Para una referencia que falta, propone lo más parecido de entre lo que ya
 * tienes. Es la pregunta real en la mesa: "no tengo esta, ¿con cuál tiro?".
 */
export function substitutesFromCollection(
  code: string,
  ownedCodes: ReadonlySet<string>,
  limit = 3,
): PaintMatch[] {
  const paint = getPaint(code);
  if (!paint || ownedCodes.size === 0) return [];

  return findClosestPaints(paint.hex, { limit, codes: ownedCodes });
}

export function stepsOf(recipe: Recipe): RecipeStep[] {
  return recipe.zones.flatMap((zone) => zone.steps);
}
