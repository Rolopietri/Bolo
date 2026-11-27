// Permite importar desde los scripts de prueba los módulos de src/ que usan el
// alias "@/..." y rutas sin extensión, como lo resuelve Next.
// Uso: node --import ./scripts/alias-loader.mjs scripts/check-....mjs
import { register } from "node:module";

const SRC = new URL("../src/", import.meta.url).href;

register(
  "data:text/javascript," +
    encodeURIComponent(`
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
const SRC = ${JSON.stringify(SRC)};
const CON_EXT = /\\.[cm]?[jt]sx?$/;
function archivo(url) {
  const p = fileURLToPath(url);
  if (CON_EXT.test(p)) return url;
  for (const c of [p + ".ts", p + ".tsx", p + "/index.ts"]) {
    if (existsSync(c) && statSync(c).isFile()) return pathToFileURL(c).href;
  }
  return url;
}
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("@/")) return next(archivo(new URL(spec.slice(2), SRC).href), ctx);
  if ((spec.startsWith("./") || spec.startsWith("../")) && ctx.parentURL?.startsWith("file:")) {
    return next(archivo(new URL(spec, ctx.parentURL).href), ctx);
  }
  try {
    return await next(spec, ctx);
  } catch (e) {
    // "next/server" → "next/server.js" (paquetes sin "exports").
    if (e?.code === "ERR_MODULE_NOT_FOUND" && !spec.startsWith(".") && !CON_EXT.test(spec)) return next(spec + ".js", ctx);
    throw e;
  }
}
`),
);
