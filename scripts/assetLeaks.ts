/**
 * Núcleo puro de la tercera red contra la fuga de fotos de AK Interactive:
 * dado el contenido de `dist/`, dice qué ficheros no deberían estar ahí. Sin
 * I/O, para poder probar la vía de fallo sin construir nada. La cáscara que
 * recorre `dist/` de verdad es `check-bundle-assets.ts`.
 *
 * Las fotos tienen copyright de AK y son de uso estrictamente personal y
 * local: un despliegue que las incluyera las estaría distribuyendo.
 */

/** Un fichero del bundle. `text` es `null` para los binarios. */
export interface BundleFile {
  /** Ruta relativa a `dist/`, con `/` como separador. */
  path: string;
  text: string | null;
}

export interface AssetLeak {
  path: string;
  /** Corto y sin contenido del fichero: solo la causa. */
  reason: string;
}

const RASTER_EXTENSION = /\.(webp|jpe?g|png|avif|gif)$/i;

/** Nombre de fichero (no la ruta) que empieza como un código del catálogo. */
const PRODUCT_CODE_NAME = /^AK\d/;

/** Textos que delatan que el bundle apunta a las fotos, aunque no las contenga. */
const FORBIDDEN_TEXTS = ["local-assets", "ak-interactive.com/wp-content"] as const;

/**
 * Lista blanca de imágenes raster legítimas del bundle. Hoy está vacía: los
 * iconos de `public/` son SVG. Una lista blanca, y no un patrón `AK*`, detecta
 * también una foto renombrada. Añadir un PNG legítimo obliga a editarla: esa
 * fricción es buscada.
 */
export const ALLOWED_RASTERS: readonly string[] = [];

function fileName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function reasonFor(file: BundleFile, allowedRasters: readonly string[]): string | null {
  if (RASTER_EXTENSION.test(file.path) && !allowedRasters.includes(file.path)) {
    return "imagen raster que no está en la lista blanca (ALLOWED_RASTERS)";
  }
  if (PRODUCT_CODE_NAME.test(fileName(file.path))) {
    return "el nombre empieza por un código de producto de AK";
  }
  if (file.text !== null) {
    const found = FORBIDDEN_TEXTS.find((forbidden) => file.text?.includes(forbidden));
    if (found !== undefined) return `el contenido menciona «${found}»`;
  }
  return null;
}

/** Un hallazgo por fichero como mucho: basta con la primera causa. */
export function findAssetLeaks(
  files: readonly BundleFile[],
  allowedRasters: readonly string[] = ALLOWED_RASTERS,
): AssetLeak[] {
  const leaks: AssetLeak[] = [];
  for (const file of files) {
    const reason = reasonFor(file, allowedRasters);
    if (reason !== null) leaks.push({ path: file.path, reason });
  }
  return leaks;
}
