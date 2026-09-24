import type { Lab } from "./lib/color";

/** Línea comercial del bote. Determina formato, acabado y numeración. */
export const PAINT_LINE = {
  THIRD_GEN: "3gen",
  CLASSIC: "classic",
  REAL_COLORS: "real-colors",
} as const;

export type PaintLine = (typeof PAINT_LINE)[keyof typeof PAINT_LINE];

export const PAINT_LINE_LABEL: Record<PaintLine, string> = {
  [PAINT_LINE.THIRD_GEN]: "3rd Generation",
  [PAINT_LINE.CLASSIC]: "Clásica",
  [PAINT_LINE.REAL_COLORS]: "Real Colors",
};

/** Subgama dentro de la línea: para qué está pensado el color. */
export const PAINT_FAMILY = {
  STANDARD: "standard",
  METALLIC: "metallic",
  INK: "ink",
  PRIMER: "primer",
  INTENSE: "intense",
  PASTEL: "pastel",
  AUXILIARY: "auxiliary",
  FIGURES: "figures",
  AFV: "afv",
  AIR: "air",
  NAVAL: "naval",
  MODERN: "modern",
  WWII: "wwii",
  CLEAR: "clear",
  GENERAL: "general",
} as const;

export type PaintFamily = (typeof PAINT_FAMILY)[keyof typeof PAINT_FAMILY];

export const PAINT_FAMILY_LABEL: Record<PaintFamily, string> = {
  [PAINT_FAMILY.STANDARD]: "Estándar",
  [PAINT_FAMILY.METALLIC]: "Metálicos",
  [PAINT_FAMILY.INK]: "Tintas",
  [PAINT_FAMILY.PRIMER]: "Imprimaciones",
  [PAINT_FAMILY.INTENSE]: "Intense",
  [PAINT_FAMILY.PASTEL]: "Pastel",
  [PAINT_FAMILY.AUXILIARY]: "Auxiliares",
  [PAINT_FAMILY.FIGURES]: "Figuras",
  [PAINT_FAMILY.AFV]: "Blindados",
  [PAINT_FAMILY.AIR]: "Aviación",
  [PAINT_FAMILY.NAVAL]: "Naval",
  [PAINT_FAMILY.MODERN]: "Moderno",
  [PAINT_FAMILY.WWII]: "WWII",
  [PAINT_FAMILY.CLEAR]: "Transparentes",
  [PAINT_FAMILY.GENERAL]: "General",
};

/** Lo que se serializa en `catalog.json`. */
export interface PaintRecord {
  /** Referencia AK, p. ej. "AK11001" o "RC319". Única en todo el catálogo. */
  code: string;
  name: string;
  line: PaintLine;
  families: PaintFamily[];
  /** Nombres de gama tal y como los publica AK, para búsqueda literal. */
  sets: string[];
  hex: string;
}

/**
 * El registro más su color en CIELAB. El Lab no se guarda en el JSON —son 94 kB
 * de decimales— sino que se calcula una sola vez al cargar el catálogo.
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
export const STEP_ROLE_ORDER: StepRole[] = [
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
  /** Nombre del esquema: "Space Marine Ultramarines". */
  name: string;
  /** Qué se pinta: "Infantería de ciencia ficción", "Panzer IV"... */
  subject: string;
  faction?: string;
  summary: string;
  difficulty: Difficulty;
  tags: string[];
  zones: RecipeZone[];
  /** true si la escribió el usuario en la app, false si viene de semilla. */
  custom?: boolean;
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
}
