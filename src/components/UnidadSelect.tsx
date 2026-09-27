"use client";

import { useState } from "react";

// Unidades estándar, en el orden solicitado por el equipo.
const UNIDADES = ["kg", "g", "mg", "L", "ml", "unidad", "porción"];
const OTRA = "__otra__";
const norm = (s: string) => s.trim().toLowerCase();

/**
 * Selector de unidad: desplegable nativo (`<select>`).
 *
 * A diferencia del `<input list="...">` con datalist (que en Safari de iPad
 * FILTRABA y escondía opciones cuando el campo ya tenía un valor), un `<select>`
 * muestra SIEMPRE todas las opciones. El iPad lo abre como su ruedita nativa.
 *
 * - `unidadesExtra`: unidades que ya existen en los datos del sistema (ej.
 *   "scoops"). Se suman a las estándar, sin duplicar. Así el desplegable ofrece
 *   TODO lo que se usa, sin mantener una lista a mano.
 * - `incluirEstandar` (default true): si es false, NO se muestran las 7 unidades
 *   estándar; solo las de `unidadesExtra` (+ "Otra…"). Se usa en la "unidad de
 *   compra", donde no queremos ofrecer unidades base de medida (g, mg, ml…).
 * - `permitirOtra`: agrega la opción "Otra…", que abre un campo de texto para
 *   escribir unidades libres (ej. "botella", "paq 12"). Se usa en la "unidad de
 *   compra" de insumos.
 */
export function UnidadSelect({
  value,
  onChange,
  className,
  permitirOtra = false,
  incluirEstandar = true,
  unidadesExtra,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  permitirOtra?: boolean;
  incluirEstandar?: boolean;
  unidadesExtra?: string[];
}) {
  const v = value?.trim() ?? "";
  // Recordamos si el usuario eligió "Otra…" (para quedarnos en modo texto
  // aunque el valor esté momentáneamente vacío mientras escribe).
  const [otraElegida, setOtraElegida] = useState(false);

  // Lista base fija: las 7 estándar, salvo que se pida ocultarlas.
  const estandar = incluirEstandar ? UNIDADES : [];
  const estandarNorm = new Set(estandar.map(norm));
  // Extras del sistema que no están ya en la lista base, deduplicadas.
  const extrasMap = new Map<string, string>();
  for (const u of unidadesExtra ?? []) {
    const t = (u ?? "").trim();
    if (!t || estandarNorm.has(norm(t))) continue;
    if (!extrasMap.has(norm(t))) extrasMap.set(norm(t), t);
  }
  const extras = Array.from(extrasMap.values());

  // ¿El valor actual ya es una unidad conocida (estándar o extra)?
  const conocidasNorm = new Set([...estandarNorm, ...extras.map(norm)]);
  const esConocida = v !== "" && conocidasNorm.has(norm(v));

  // Modo "otra" (campo de texto visible): solo si se permite y el valor es
  // desconocido, o el usuario eligió "Otra…" a propósito.
  const enOtra = permitirOtra && (otraElegida || (v !== "" && !esConocida));

  // Si el valor EXACTO no está entre las opciones (diferencia de mayúsculas, o
  // unidad custom sin permitirOtra), lo agregamos para que el select lo muestre
  // y no se pierda.
  const opcionesExactas = new Set([...estandar, ...extras]);
  const valorSuelto =
    v !== "" && !enOtra && !opcionesExactas.has(value) ? value : null;

  return (
    <div className="w-full">
      <select
        value={enOtra ? OTRA : value}
        onChange={(e) => {
          if (e.target.value === OTRA) {
            setOtraElegida(true);
            onChange(""); // limpiar para que escriba la unidad libre
          } else {
            setOtraElegida(false);
            onChange(e.target.value);
          }
        }}
        className={className}
      >
        {v === "" && !enOtra && (
          <option value="" disabled>
            Unidad…
          </option>
        )}
        {valorSuelto && <option value={valorSuelto}>{valorSuelto}</option>}
        {estandar.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        {extras.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
        {permitirOtra && <option value={OTRA}>Otra…</option>}
      </select>
      {enOtra && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Escribe la unidad (ej: botella, paq 12)"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className={(className ?? "") + " mt-1"}
        />
      )}
    </div>
  );
}
