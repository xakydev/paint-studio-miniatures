import type { Lab } from "./color";

/**
 * Subgama de AK 3rd Generation a la que pertenece el bote.
 *
 * El catálogo se limita a 3rd Generation, así que no hay una dimensión "línea"
 * por encima de esto: sería una constante. Si algún día entran Quick Gen o los
 * Washes, esa dimensión vuelve — pero hasta entonces solo estorbaría.
 */
export const PAINT_FAMILY = {
  STANDARD: "standard",
  FIGURES: "figures",
  METALLIC: "metallic",
  INK: "ink",
  INTENSE: "intense",
  PASTEL: "pastel",
  PRIMER: "primer",
  AUXILIARY: "auxiliary",
} as const;

export type PaintFamily = (typeof PAINT_FAMILY)[keyof typeof PAINT_FAMILY];

export const PAINT_FAMILY_LABEL: Record<PaintFamily, string> = {
  [PAINT_FAMILY.STANDARD]: "Estándar",
  [PAINT_FAMILY.FIGURES]: "Figuras",
  [PAINT_FAMILY.METALLIC]: "Metálicos",
  [PAINT_FAMILY.INK]: "The Inks",
  [PAINT_FAMILY.INTENSE]: "Intense",
  [PAINT_FAMILY.PASTEL]: "Pastel",
  [PAINT_FAMILY.PRIMER]: "Imprimaciones",
  [PAINT_FAMILY.AUXILIARY]: "Auxiliares",
};

/** Orden en que se muestran las familias: de lo más usado a lo más accesorio. */
export const PAINT_FAMILY_ORDER: readonly PaintFamily[] = [
  PAINT_FAMILY.STANDARD,
  PAINT_FAMILY.FIGURES,
  PAINT_FAMILY.METALLIC,
  PAINT_FAMILY.INK,
  PAINT_FAMILY.INTENSE,
  PAINT_FAMILY.PASTEL,
  PAINT_FAMILY.PRIMER,
  PAINT_FAMILY.AUXILIARY,
];

/** Lo que se serializa en `catalog.json`. */
export interface PaintRecord {
  /** Referencia AK, p. ej. "AK11001". Única en todo el catálogo. */
  code: string;
  name: string;
  family: PaintFamily;
  hex: string;
}

/**
 * El registro más su color en CIELAB. El Lab no se guarda en el JSON —son
 * kilobytes de decimales— sino que se calcula una sola vez al cargar.
 */
export interface Paint extends PaintRecord {
  lab: Lab;
}

/** Qué papel juega la pintura dentro de una zona de la miniatura. */
export const STEP_ROLE = {
  PRIMER: "imprimacion",
  BASE: "base",
  SHADE: "sombra",
  WASH: "lavado",
  LAYER: "capa",
  HIGHLIGHT: "luz",
  EDGE: "filo",
  GLAZE: "veladura",
  DETAIL: "detalle",
} as const;

export type StepRole = (typeof STEP_ROLE)[keyof typeof STEP_ROLE];

export const STEP_ROLE_LABEL: Record<StepRole, string> = {
  [STEP_ROLE.PRIMER]: "Imprimación",
  [STEP_ROLE.BASE]: "Base",
  [STEP_ROLE.SHADE]: "Sombra",
  [STEP_ROLE.WASH]: "Lavado",
  [STEP_ROLE.LAYER]: "Capa",
  [STEP_ROLE.HIGHLIGHT]: "Luz",
  [STEP_ROLE.EDGE]: "Filo",
  [STEP_ROLE.GLAZE]: "Veladura",
  [STEP_ROLE.DETAIL]: "Detalle",
};

/** Orden en que se pintan los roles, para mostrar los pasos en secuencia. */
export const STEP_ROLE_ORDER: readonly StepRole[] = [
  STEP_ROLE.PRIMER,
  STEP_ROLE.BASE,
  STEP_ROLE.SHADE,
  STEP_ROLE.WASH,
  STEP_ROLE.LAYER,
  STEP_ROLE.HIGHLIGHT,
  STEP_ROLE.EDGE,
  STEP_ROLE.GLAZE,
  STEP_ROLE.DETAIL,
];

export interface RecipeStep {
  role: StepRole;
  /** Referencia del catálogo. Si no existe, la receta se marca como rota. */
  code: string;
  note?: string;
}

export interface RecipeZone {
  /** Parte de la miniatura: "Piel", "Armadura", "Capa"... */
  name: string;
  steps: RecipeStep[];
}

export const DIFFICULTY = {
  BEGINNER: "iniciacion",
  INTERMEDIATE: "intermedio",
  ADVANCED: "avanzado",
} as const;

export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  [DIFFICULTY.BEGINNER]: "Iniciación",
  [DIFFICULTY.INTERMEDIATE]: "Intermedio",
  [DIFFICULTY.ADVANCED]: "Avanzado",
};

export interface Recipe {
  id: string;
  /** Nombre del esquema: "Marine espacial azul". */
  name: string;
  /** Qué se pinta: "Infantería de ciencia ficción", "Orco"... */
  subject: string;
  faction?: string;
  summary: string;
  difficulty: Difficulty;
  tags: string[];
  zones: RecipeZone[];
}

export const OWNERSHIP = {
  OWNED: "owned",
  WISHLIST: "wishlist",
} as const;

export type Ownership = (typeof OWNERSHIP)[keyof typeof OWNERSHIP];

export interface CollectionEntry {
  code: string;
  status: Ownership;
  /** Cuánto queda en el bote, 0–3. Sirve para avisar de reposición. */
  level: number;
  note?: string;
  /** ISO 8601. */
  updatedAt: string;
  /**
   * ISO 8601. Presente si la entrada está borrada lógicamente: los puertos
   * nunca eliminan filas, así que "quitar" es marcar esta fecha en vez de
   * eliminar el registro.
   */
  deletedAt?: string;
}
