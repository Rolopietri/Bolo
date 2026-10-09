"use client";

import type { OpcionCantidad } from "@/lib/units";

/**
 * Cantidad + unidad en un solo campo: el número y, al lado, un desplegable con
 * las unidades en que se puede escribir (la presentación del insumo, kg, g…).
 * Controlado: el padre guarda el texto y la `key` de la unidad, y convierte a
 * unidad base con el `factor` de la opción elegida.
 */
export function CantidadUnidad({
  valor,
  unidad,
  opciones,
  onChange,
  required,
  autoFocus,
  placeholder = "0",
}: {
  valor: string;
  unidad: string;
  opciones: OpcionCantidad[];
  onChange: (valor: string, unidad: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="mt-1 flex rounded-lg ring-1 ring-marfil bg-white focus-within:ring-terracotta/60">
      <input
        type="number"
        step="any"
        min="0"
        inputMode="decimal"
        value={valor}
        onChange={(e) => onChange(e.target.value, unidad)}
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 outline-none"
      />
      {opciones.length > 1 ? (
        <select
          value={unidad}
          onChange={(e) => onChange(valor, e.target.value)}
          aria-label="Unidad"
          className="max-w-[55%] shrink-0 rounded-r-lg border-l border-marfil bg-marfil-soft px-2 py-2 text-sm text-cacao outline-none"
        >
          {opciones.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      ) : (
        <span className="shrink-0 self-center px-3 text-sm text-cacao-soft">
          {opciones[0]?.label ?? ""}
        </span>
      )}
    </div>
  );
}

/** Factor (unidades base por 1) de la opción elegida; 1 si no está. */
export function factorDe(opciones: OpcionCantidad[], key: string): number {
  return opciones.find((o) => o.key === key)?.factor ?? 1;
}
