/**
 * Tercera red contra la fuga de fotos de AK Interactive: se ejecuta al final
 * de `npm run build` y aborta (código de salida distinto de cero) si `dist/`
 * contiene una foto de producto o algo que apunte a ellas. La lógica vive en
 * `assetLeaks.ts`; aquí solo se recorre el disco.
 *
 * Las fotos se descargan para uso personal y local en `local-assets/`, que
 * Vite nunca copia; esta comprobación cubre el error humano (una foto metida
 * en `public/`, un import que la arrastra al bundle).
 *
 * Uso: node scripts/check-bundle-assets.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { findAssetLeaks, type BundleFile } from "./assetLeaks.ts";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(PROJECT_ROOT, "dist");

/** Los que se leen como texto para buscar referencias; el resto, binario. */
const TEXT_EXTENSION = /\.(html|js|mjs|css|json|svg|txt|map|webmanifest)$/i;

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function toBundleFile(absolutePath: string): BundleFile {
  const path = relative(DIST_DIR, absolutePath).split(sep).join("/");
  const text = TEXT_EXTENSION.test(path) ? readFileSync(absolutePath, "utf8") : null;
  return { path, text };
}

const files = listFiles(DIST_DIR).map(toBundleFile);
const leaks = findAssetLeaks(files);

if (leaks.length > 0) {
  console.error("Comprobación de imágenes en el bundle: FALLA.\n");
  for (const leak of leaks) console.error(`  dist/${leak.path}: ${leak.reason}`);
  console.error(
    "\nLas fotos de AK tienen copyright y son de uso personal y local: no pueden" +
      "\nllegar a un despliegue. Sácalas de public/ o del código que las importe.",
  );
  process.exit(1);
}

console.log(`Comprobación de imágenes en el bundle: sin hallazgos (${files.length} ficheros revisados).`);
