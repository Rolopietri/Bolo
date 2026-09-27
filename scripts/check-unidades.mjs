// Guardia de unidades (B1).
// ─────────────────────────────────────────────────────────────────
// Las unidades se definen en DOS lugares que hay que mantener sincronizados:
//   1. src/lib/units.ts        → el diccionario UNITS (lo usa la app).
//   2. supabase/…-descuento-stock.sql → unidad_dim() (lo usa el motor de stock).
//
// Si se agrega una unidad en un solo lado, la app y la base convertirían
// distinto y el inventario se descuadraría en silencio. Este script compara
// ambas listas y falla (exit 1) si difieren, para que se note enseguida.
//
// No necesita dependencias: se corre con `npm run test:unidades`.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const TS = join(raiz, "src/lib/units.ts");
const SQL = join(raiz, "supabase/cocina-fix-conversion-descuento-stock.sql");

/** Normaliza igual que la app y el SQL: minúsculas, sin acentos. */
function norm(u) {
  return u
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Extrae las claves del objeto UNITS de units.ts. */
function unidadesApp() {
  const txt = readFileSync(TS, "utf8");
  const bloque = txt.match(/const UNITS[^{]*\{([\s\S]*?)\n\};/);
  if (!bloque) throw new Error("No encontré el objeto UNITS en units.ts");
  const set = new Set();
  for (const linea of bloque[1].split("\n")) {
    // key: { toBase ...   ó   "key": { toBase ...
    const m = linea.match(/^\s*(?:"([^"]+)"|([A-Za-zñáéíóú]+))\s*:\s*\{\s*toBase/);
    if (m) set.add(norm(m[1] ?? m[2]));
  }
  return set;
}

/** Extrae los tokens de unidad de la función unidad_dim() del SQL. */
function unidadesSql() {
  const txt = readFileSync(SQL, "utf8");
  const fn = txt.match(/function public\.unidad_dim[\s\S]*?\$\$;/);
  if (!fn) throw new Error("No encontré la función unidad_dim en el SQL");
  const set = new Set();
  for (const m of fn[0].matchAll(/when\s+'([^']+)'\s+then/g)) {
    set.add(norm(m[1]));
  }
  return set;
}

const app = unidadesApp();
const sql = unidadesSql();

const soloApp = [...app].filter((u) => !sql.has(u)).sort();
const soloSql = [...sql].filter((u) => !app.has(u)).sort();

if (soloApp.length === 0 && soloSql.length === 0) {
  console.log(`✓ Unidades sincronizadas (${app.size} en ambos lados).`);
  process.exit(0);
}

console.error("✗ Las listas de unidades NO coinciden:\n");
if (soloApp.length)
  console.error(`  Solo en la app (units.ts): ${soloApp.join(", ")}`);
if (soloSql.length)
  console.error(`  Solo en la base (unidad_dim): ${soloSql.join(", ")}`);
console.error(
  "\n  Agregá la(s) unidad(es) faltante(s) en el otro lado y volvé a correr.",
);
process.exit(1);
