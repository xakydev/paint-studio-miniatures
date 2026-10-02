/**
 * Comprobación de secretos en el bundle de producción. Se ejecuta al final de
 * `npm run build`, después de `vite build`, y aborta el build (código de
 * salida distinto de cero) si `dist/` contiene:
 *   - el prefijo de la clave secreta de Supabase (`sb_secret_`);
 *   - el literal del rol administrador de Postgres (`service_role`);
 *   - un JWT (`eyJ…`) cuyo payload decodificado lleva ese mismo rol.
 *
 * La clave PUBLICABLE (prefijo `sb_publishable_`) SÍ debe aparecer en el
 * bundle: viaja ahí por diseño, la seguridad la da RLS en Postgres, no el
 * secreto de la clave. Este script nunca imprime el valor de un token
 * completo, solo el fichero y la posición donde aparece.
 *
 * Uso: node scripts/check-bundle-secrets.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(PROJECT_ROOT, "dist");

const SERVICE_ROLE = "service_role";
const JWT_PATTERN = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;

/**
 * El propio SDK de `@supabase/supabase-js` trae, para distinguir el formato
 * nuevo de claves, la comparación `key.startsWith('sb_secret_')`: el literal
 * `sb_secret_` a secas, sin nada detrás, vive en el chunk de cualquier build
 * que use el adaptador aunque no haya ninguna clave secreta de por medio.
 * Por eso esta regex exige al menos un carácter de clave detrás del prefijo:
 * así distingue una clave real filtrada (`sb_secret_AbC123…`) del código del
 * SDK que solo compara el prefijo.
 */
const SECRET_KEY_PATTERN = /sb_secret_[\w-]+/;

interface Finding {
  file: string;
  reason: string;
}

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

/** Guarda de tipo: no asumimos la forma del payload de un JWT ajeno. */
function hasServiceRole(payload: unknown): boolean {
  if (typeof payload !== "object" || payload === null) return false;
  if (!("role" in payload)) return false;
  return (payload as Record<string, unknown>).role === SERVICE_ROLE;
}

/** `null` si el segmento no es JSON válido: no es un JWT, o va truncado. */
function decodeJwtPayload(token: string): unknown {
  const payloadSegment = token.split(".")[1];
  if (payloadSegment === undefined) return null;
  try {
    const json = Buffer.from(payloadSegment, "base64url").toString("utf8");
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function locate(content: string, index: number): string {
  const before = content.slice(0, index);
  const lines = before.split("\n");
  const line = lines.length;
  const column = (lines.at(-1)?.length ?? 0) + 1;
  return `línea ${line}, columna ${column}`;
}

function checkFile(path: string): Finding[] {
  const content = readFileSync(path, "utf8");
  const file = relative(PROJECT_ROOT, path);
  const findings: Finding[] = [];

  const leakedKey = content.match(SECRET_KEY_PATTERN)?.[0];
  if (leakedKey !== undefined) {
    findings.push({
      file,
      reason: `contiene una clave con el prefijo secreto de Supabase (${leakedKey.slice(0, 10)}…, no se imprime entera)`,
    });
  }
  if (content.includes(SERVICE_ROLE)) {
    findings.push({ file, reason: "contiene el literal del rol administrador de Postgres" });
  }
  for (const match of content.matchAll(JWT_PATTERN)) {
    if (hasServiceRole(decodeJwtPayload(match[0]))) {
      findings.push({
        file,
        reason: `contiene un JWT con el rol administrador, en ${locate(content, match.index)} (no se imprime el token)`,
      });
    }
  }

  return findings;
}

function main(): void {
  let distStats: ReturnType<typeof statSync>;
  try {
    distStats = statSync(DIST_DIR);
  } catch {
    console.error(`No existe ${relative(PROJECT_ROOT, DIST_DIR)}/. Ejecuta "vite build" antes de esta comprobación.`);
    process.exit(1);
  }
  if (!distStats.isDirectory()) {
    console.error(`${relative(PROJECT_ROOT, DIST_DIR)} no es un directorio.`);
    process.exit(1);
  }

  const files = listFiles(DIST_DIR);
  const findings = files.flatMap(checkFile);

  if (findings.length > 0) {
    console.error("Se encontraron posibles secretos en el bundle de producción:");
    for (const finding of findings) {
      console.error(`  - ${finding.file}: ${finding.reason}`);
    }
    process.exit(1);
  }

  console.log(`Comprobación de secretos en el bundle: sin hallazgos (${files.length} ficheros revisados).`);
}

main();
