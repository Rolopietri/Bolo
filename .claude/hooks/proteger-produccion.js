#!/usr/bin/env node
// Frena a Claude y pide autorización antes de:
//  1) borrar tablas, columnas o datos (DROP, TRUNCATE, DELETE, db reset)
//  2) tocar archivos o variables de claves y contraseñas
// Todo lo demás sigue las reglas normales de settings.json.

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    process.exit(0); // si no se puede leer, no interferir
  }

  const tool = data.tool_name || "";
  const input = data.tool_input || {};

  // Reunir todo el texto relevante de la llamada
  const partes = [
    input.command,
    input.query,
    input.sql,
    input.content,
    input.new_string,
    input.file_path,
    ...(Array.isArray(input.edits) ? input.edits.map((e) => e.new_string) : []),
  ].filter((x) => typeof x === "string");
  const texto = partes.join("\n");

  const borrado =
    /\b(drop\s+(table|schema|database|column|view|function|policy|index)|truncate(\s+table)?\s+\w|delete\s+from|alter\s+table\s+[\w."]+\s+drop)\b/i;
  const reset = /\b(supabase\s+db\s+reset)\b/i;
  const claves =
    /(^|[\s/"'=])\.env(\.[\w-]+)?\b|\bvercel\s+env\b|\.(pem|key)\b|service_role/i;

  let motivo = null;
  if (borrado.test(texto) || reset.test(texto)) {
    motivo = `Operación que borra tablas o datos (${tool}). Revisa antes de autorizar.`;
  } else if (claves.test(texto)) {
    motivo = `Acceso a claves o contraseñas (${tool}). Revisa antes de autorizar.`;
  }

  if (motivo) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: motivo,
        },
      })
    );
  }
  process.exit(0);
});
