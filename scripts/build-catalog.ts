/**
 * Convierte las tablas markdown de `data/raw/` en `src/data/catalog.json`.
 *

 * Uso: npm run build:catalog
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAINT_FAMILY,
  PAINT_LINE,
  type PaintRecord,
  type PaintFamily,
  type PaintLine,
} from "../src/types.ts";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

interface RawRow {
  name: string;
  code: string;
  set: string;
  hex: string;
}

/** Palabra clave de la gama → subfamilia. El orden no importa, son exclusivas. */
const FAMILY_BY_KEYWORD: ReadonlyArray<readonly [string, PaintFamily]> = [
  ["metallic", PAINT_FAMILY.METALLIC],
  ["ink", PAINT_FAMILY.INK],
  ["primer", PAINT_FAMILY.PRIMER],
  ["intense", PAINT_FAMILY.INTENSE],
  ["pastel", PAINT_FAMILY.PASTEL],
  ["auxiliary", PAINT_FAMILY.AUXILIARY],
  ["figures", PAINT_FAMILY.FIGURES],
  ["afv", PAINT_FAMILY.AFV],
  ["air", PAINT_FAMILY.AIR],
  ["naval", PAINT_FAMILY.NAVAL],
  ["modern", PAINT_FAMILY.MODERN],
  ["wwii", PAINT_FAMILY.WWII],
  ["clear", PAINT_FAMILY.CLEAR],
  ["standard", PAINT_FAMILY.STANDARD],
  ["general", PAINT_FAMILY.GENERAL],
];

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

function lineOf(set: string): PaintLine {
  const lower = set.toLowerCase();
  if (lower.includes("real colors")) return PAINT_LINE.REAL_COLORS;
  if (lower.includes("3rd gen")) return PAINT_LINE.THIRD_GEN;
  return PAINT_LINE.CLASSIC;
}

function familyOf(set: string): PaintFamily {
  const lower = set.toLowerCase();
  const hit = FAMILY_BY_KEYWORD.find(([keyword]) => lower.includes(keyword));
  return hit ? hit[1] : PAINT_FAMILY.GENERAL;
}

/**
 * Limpia el nombre: la gama Real Colors trae el volumen pegado al nombre
 * ("A-14 Interior Steel Grey 10ml") y eso ensucia la búsqueda.
 */
function cleanName(name: string): string {
  return name.replace(/\s+\d+\s*ml$/i, "").trim();
}

function buildCatalog(): PaintRecord[] {
  const files = ["AK.md", "AKRC.md"];
  const byCode = new Map<string, PaintRecord>();

  for (const file of files) {
    const markdown = readFileSync(resolve(projectRoot, "data/raw", file), "utf8");

    for (const row of parseMarkdownTable(markdown)) {
      const existing = byCode.get(row.code);
      const family = familyOf(row.set);

      // Una misma referencia aparece repetida en varias gamas (p. ej. RC319 está
      // en "Real Colors - Air" y en "- WWII"). Se fusiona en una sola entrada.
      if (existing) {
        if (!existing.sets.includes(row.set)) existing.sets.push(row.set);
        if (!existing.families.includes(family)) existing.families.push(family);
        continue;
      }

      byCode.set(row.code, {
        code: row.code,
        name: cleanName(row.name),
        line: lineOf(row.set),
        families: [family],
        sets: [row.set],
        hex: row.hex,
      });
    }
  }

  return [...byCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code, "en", { numeric: true }),
  );
}

const catalog = buildCatalog();
const outputPath = resolve(projectRoot, "src/data/catalog.json");
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 0)}\n`, "utf8");

const byLine = catalog.reduce<Record<string, number>>((acc, paint) => {
  acc[paint.line] = (acc[paint.line] ?? 0) + 1;
  return acc;
}, {});

console.log(`catalog.json: ${catalog.length} referencias`);
for (const [line, count] of Object.entries(byLine)) {
  console.log(`  ${line.padEnd(12)} ${count}`);
}
