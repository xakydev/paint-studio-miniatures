import type { PaintFilters } from "../../domain/catalog";
import { hexToLab } from "../../domain/color";
import {
  PAINT_FAMILY_ORDER,
  type Paint,
  type PaintFamily,
  type Recipe,
} from "../../domain/types";
import catalogJson from "./catalog.json";
import recipesJson from "./recipes.json";

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

/** Las familias que realmente aparecen en los datos, en orden de uso. */
export const AVAILABLE_FAMILIES: PaintFamily[] = PAINT_FAMILY_ORDER.filter(
  (family) => PAINTS.some((paint) => paint.family === family),
);

export const EMPTY_FILTERS: PaintFilters = {
  query: "",
  families: [],
};
