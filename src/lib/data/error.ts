// Extrae un mensaje legible de cualquier cosa que se haya lanzado.
//
// Supabase no lanza `Error` instances — lanza objetos `{ message, details, hint, code }`,
// así que `e instanceof Error` da false y los catch genéricos terminan
// mostrando "Error guardando" sin más contexto. Esta función cubre los 3 casos
// (Error real, PostgrestError, string) y para errores comunes le añade
// una pista en español.

type WithMessage = { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function extractError(e: unknown, fallback = "Error inesperado"): string {
  let base: string;
  let code: string | undefined;
  let details: string | undefined;
  let hint: string | undefined;

  if (e instanceof Error) {
    base = e.message;
  } else if (typeof e === "string") {
    base = e;
  } else if (isObject(e)) {
    const o = e as WithMessage;
    base =
      (typeof o.message === "string" && o.message) ||
      JSON.stringify(e) ||
      fallback;
    if (typeof o.code === "string") code = o.code;
    if (typeof o.details === "string") details = o.details;
    if (typeof o.hint === "string") hint = o.hint;
  } else {
    base = fallback;
  }

  // Pistas en español para errores comunes
  const lower = base.toLowerCase();
  let pista = "";
  if (
    lower.includes("does not exist") ||
    lower.includes("relation") ||
    code === "42P01" // undefined_table
  ) {
    pista =
      " · La tabla no existe todavía en Supabase. Corre el SQL en supabase/presupuestos-inventario-contratistas.sql.";
  } else if (lower.includes("permission denied") || code === "42501") {
    pista = " · No hay permiso (RLS). Verifica las policies de la tabla.";
  } else if (
    lower.includes("violates row-level security") ||
    lower.includes("rls")
  ) {
    pista =
      " · Bloqueado por Row Level Security. ¿Tienes sesión activa? Cierra sesión y entra de nuevo.";
  }

  const extras = [details, hint].filter(Boolean).join(" · ");
  return `${base}${extras ? " (" + extras + ")" : ""}${pista}`;
}
