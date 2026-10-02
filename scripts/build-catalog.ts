/**
 * Convierte las tablas markdown de `data/raw/` en `src/data/static/catalog.json`,
 * aplicando encima las correcciones de `data/overrides.json`.
 *
 * Uso: npm run build:catalog
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAINT_FAMILY,
  PAINT_FAMILY_ORDER,
  type PaintFamily,
  type PaintRecord,
} from "../src/domain/types.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface RawRow {
  name: string;
  code: string;
  set: string;
  hex: string;
}

/**
 * Gamas que entran en el catálogo, y a qué familia corresponde cada una.
 *
 * Fuera quedan Air y AFV pese a ser 3rd Gen: son cartas RAL/FS de camuflaje de
 * aviación y blindados, 200 referencias que solo añaden ruido a las búsquedas
 * de quien pinta miniaturas. Fuera quedan también la gama clásica y Real
 * Colors. Para incluir una gama, añádela aquí con su familia.
 */
const FAMILIA_POR_GAMA: ReadonlyMap<string, PaintFamily> = new Map([
  ["Standard (3rd Gen)", PAINT_FAMILY.STANDARD],
  ["Figures (3rd Gen)", PAINT_FAMILY.FIGURES],
  ["Metallic (3rd Gen)", PAINT_FAMILY.METALLIC],
  ["Ink (3rd Gen)", PAINT_FAMILY.INK],
  ["Intense (3rd Gen)", PAINT_FAMILY.INTENSE],
  ["Pastel (3rd Gen)", PAINT_FAMILY.PASTEL],
  ["Primer (3rd Gen)", PAINT_FAMILY.PRIMER],
  ["Auxiliary (3rd Gen)", PAINT_FAMILY.AUXILIARY],
]);

function parseMarkdownTable(markdown: string): RawRow[] {
  const rows: RawRow[] = [];

  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) continue;

    const cells = line.split("|").slice(1, -1);
    if (cells.length < 7) continue;

    const [name, code, set] = cells.map((cell) => cell.trim());
    // Descarta la fila de cabecera y la de separadores.
    if (name === "Name" || name.startsWith("---")) continue;

    const hexMatch = cells[6].match(/#([0-9a-fA-F]{6})/);
    if (!hexMatch) continue;

    rows.push({ name, code, set, hex: `#${hexMatch[1].toUpperCase()}` });
  }

  return rows;
}

/** Limpia el nombre: algunas filas traen el volumen pegado ("... 10ml"). */
function cleanName(name: string): string {
  return name.replace(/\s+\d+\s*ml$/i, "").trim();
}

/** Referencias tal y como salen de `data/raw/`, sin tocar. */
function readVendored(): Map<string, PaintRecord> {
  const byCode = new Map<string, PaintRecord>();

  // Solo AK.md: AKRC.md (Real Colors) no trae ninguna gama de 3rd Generation.
  const markdown = readFileSync(resolve(projectRoot, "data/raw/AK.md"), "utf8");

  for (const row of parseMarkdownTable(markdown)) {
    const family = FAMILIA_POR_GAMA.get(row.set);
    if (!family) continue;
    if (byCode.has(row.code)) continue;

    byCode.set(row.code, {
      code: row.code,
      name: cleanName(row.name),
      family,
      hex: row.hex,
    });
  }

  return byCode;
}

// --- Capa de correcciones --------------------------------------------------

/**
 * Campos corregibles de una referencia que ya existe en la fuente. El índice
 * de `string` deja que el type guard de abajo narrows desde `Record<string,
 * unknown>`, que es lo que sale de parsear el JSON.
 */
interface OverrideFix {
  [key: string]: unknown;
  name?: string;
  family?: PaintFamily;
  hex?: string;
  why: string;
}

/** Referencia que la fuente no trae y añadimos a mano. */
interface OverrideAdd {
  [key: string]: unknown;
  name: string;
  family: PaintFamily;
  hex: string;
  why: string;
}

interface OverrideDrop {
  [key: string]: unknown;
  why: string;
}

interface Overrides {
  fix: Record<string, OverrideFix>;
  add: Record<string, OverrideAdd>;
  drop: Record<string, OverrideDrop>;
}

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

/** Errores acumulados: se informan todos juntos antes de abortar. */
const problems: string[] = [];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFamily(value: unknown): value is PaintFamily {
  return PAINT_FAMILY_ORDER.includes(value as PaintFamily);
}

/** Narrows a un `OverrideFix` concreto: `name`, `hex` y `family`, si están, con el tipo correcto. */
function isOverrideFix(entry: Record<string, unknown>): entry is OverrideFix {
  return (
    typeof entry.why === "string" &&
    (entry.name === undefined || typeof entry.name === "string") &&
    (entry.family === undefined || isFamily(entry.family)) &&
    (entry.hex === undefined || typeof entry.hex === "string")
  );
}

/** Narrows a un `OverrideAdd` concreto: a diferencia de fix, aquí todo es obligatorio. */
function isOverrideAdd(entry: Record<string, unknown>): entry is OverrideAdd {
  return (
    typeof entry.why === "string" &&
    typeof entry.name === "string" &&
    isFamily(entry.family) &&
    typeof entry.hex === "string"
  );
}

/** Narrows a un `OverrideDrop`: solo necesita el porqué. */
function isOverrideDrop(entry: Record<string, unknown>): entry is OverrideDrop {
  return typeof entry.why === "string";
}

/**
 * Valida un bloque del fichero de overrides. Devuelve las entradas bien
 * formadas y apunta en `problems` las que no lo estén, para que un override
 * mal escrito no se cuele en silencio. El guard de tipo final narrows a T
 * en vez de confiar en un `as`, que aquí TS rechazaría (ver tsconfig.node.json).
 */
function readSection<T extends Record<string, unknown>>(
  raw: unknown,
  section: string,
  required: readonly string[],
  isValid: (entry: Record<string, unknown>) => entry is T,
): Map<string, T> {
  const entries = new Map<string, T>();
  if (raw === undefined) return entries;

  if (!isRecord(raw)) {
    problems.push(`"${section}" debe ser un objeto indexado por referencia.`);
    return entries;
  }

  for (const [code, entry] of Object.entries(raw)) {
    const where = `${section}.${code}`;

    if (!isRecord(entry)) {
      problems.push(`${where}: debe ser un objeto.`);
      continue;
    }
    if (typeof entry.why !== "string" || entry.why.trim() === "") {
      problems.push(`${where}: falta "why" explicando la corrección.`);
      continue;
    }
    const missing = required.filter((field) => entry[field] === undefined);
    if (missing.length > 0) {
      for (const field of missing) problems.push(`${where}: falta "${field}".`);
      continue;
    }
    if (entry.hex !== undefined && !HEX_PATTERN.test(String(entry.hex))) {
      problems.push(`${where}: "hex" debe ser #RRGGBB en mayúsculas.`);
      continue;
    }
    if (entry.family !== undefined && !isFamily(entry.family)) {
      problems.push(`${where}: familia desconocida "${String(entry.family)}".`);
      continue;
    }
    if (!isValid(entry)) {
      problems.push(`${where}: tiene un campo con un tipo inesperado.`);
      continue;
    }

    entries.set(code, entry);
  }

  return entries;
}

function readOverrides(): Overrides {
  const parsed: unknown = JSON.parse(
    readFileSync(resolve(projectRoot, "data/overrides.json"), "utf8"),
  );

  if (!isRecord(parsed)) {
    throw new Error("data/overrides.json debe contener un objeto.");
  }

  return {
    fix: Object.fromEntries(readSection(parsed.fix, "fix", [], isOverrideFix)),
    add: Object.fromEntries(
      readSection(parsed.add, "add", ["name", "family", "hex"], isOverrideAdd),
    ),
    drop: Object.fromEntries(readSection(parsed.drop, "drop", [], isOverrideDrop)),
  };
}

/**
 * Aplica las correcciones sobre lo que trae la fuente.
 *
 * Cada override se comprueba contra la fuente y el build aborta si alguno ha
 * quedado obsoleto: así, cuando el repo de terceros se actualice, el propio
 * build nos dirá qué correcciones ya no hacen falta en vez de arrastrarlas.
 */
function applyOverrides(
  byCode: Map<string, PaintRecord>,
  overrides: Overrides,
): void {
  for (const [code, fix] of Object.entries(overrides.fix)) {
    const current = byCode.get(code);
    if (!current) {
      problems.push(`fix.${code}: la fuente ya no trae esa referencia.`);
      continue;
    }

    const patch: Partial<PaintRecord> = {};
    if (fix.name !== undefined && fix.name !== current.name) patch.name = fix.name;
    if (fix.family !== undefined && fix.family !== current.family) {
      patch.family = fix.family;
    }
    if (fix.hex !== undefined && fix.hex !== current.hex) patch.hex = fix.hex;

    if (Object.keys(patch).length === 0) {
      problems.push(`fix.${code}: redundante, la fuente ya dice lo mismo. Bórralo.`);
      continue;
    }

    byCode.set(code, { ...current, ...patch });
  }

  for (const [code, add] of Object.entries(overrides.add)) {
    if (byCode.has(code)) {
      problems.push(`add.${code}: ya está en la fuente. Muévelo a "fix".`);
      continue;
    }
    byCode.set(code, {
      code,
      name: add.name,
      family: add.family,
      hex: add.hex,
    });
  }

  for (const code of Object.keys(overrides.drop)) {
    if (!byCode.delete(code)) {
      problems.push(`drop.${code}: la fuente ya no trae esa referencia. Bórralo.`);
    }
  }
}

// --- Build ----------------------------------------------------------------

const byCode = readVendored();
const overrides = readOverrides();
applyOverrides(byCode, overrides);

if (problems.length > 0) {
  console.error("data/overrides.json tiene problemas:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const catalog = [...byCode.values()].sort((a, b) =>
  a.code.localeCompare(b.code, "en", { numeric: true }),
);

writeFileSync(
  resolve(projectRoot, "src/data/static/catalog.json"),
  `${JSON.stringify(catalog, null, 0)}\n`,
  "utf8",
);

const porFamilia = new Map<PaintFamily, number>();
for (const paint of catalog) {
  porFamilia.set(paint.family, (porFamilia.get(paint.family) ?? 0) + 1);
}

const corrections =
  Object.keys(overrides.fix).length +
  Object.keys(overrides.add).length +
  Object.keys(overrides.drop).length;

console.log(`catalog.json: ${catalog.length} referencias (${corrections} correcciones)`);
for (const family of PAINT_FAMILY_ORDER) {
  const count = porFamilia.get(family);
  if (count) console.log(`  ${family.padEnd(10)} ${count}`);
}
