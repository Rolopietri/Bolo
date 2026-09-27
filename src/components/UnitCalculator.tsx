"use client";

import { useMemo, useState } from "react";
import {
  convert,
  dimension,
  UNIDADES_COMUNES,
  type Dimension,
} from "@/lib/units";

/**
 * Calculadora de conversión de unidades reusable.
 * Por defecto se renderiza plegada — el usuario abre el panel cuando lo
 * necesita. Es self-contained: no necesita props para funcionar.
 */
export function UnitCalculator({
  defaultOpen = false,
  className = "",
}: {
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [cantidad, setCantidad] = useState("1");
  const [from, setFrom] = useState("kg");
  const [to, setTo] = useState("g");

  const num = Number(cantidad);
  const dimFrom = dimension(from);
  const dimTo = dimension(to);

  const resultado = useMemo(() => {
    if (!Number.isFinite(num)) return null;
    return convert(num, from, to);
  }, [num, from, to]);

  // Sugerencias de conversiones rápidas si la dimensión es conocida
  const sugerencias: { de: string; a: string; label: string }[] = useMemo(() => {
    if (dimFrom === "peso") {
      return [
        { de: "kg", a: "g", label: "kg → g" },
        { de: "g", a: "kg", label: "g → kg" },
        { de: "kg", a: "mg", label: "kg → mg" },
      ];
    }
    if (dimFrom === "volumen") {
      return [
        { de: "L", a: "ml", label: "L → ml" },
        { de: "ml", a: "L", label: "ml → L" },
      ];
    }
    return [
      { de: "kg", a: "g", label: "kg → g" },
      { de: "L", a: "ml", label: "L → ml" },
    ];
  }, [dimFrom]);

  return (
    <section
      className={`rounded-2xl bg-white ring-1 ring-marfil ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-marfil-soft transition-colors rounded-2xl"
      >
        <div>
          <p className="font-display text-[11px] tracking-[0.4em] uppercase text-cacao-soft">
            Herramienta
          </p>
          <h3 className="font-cinzel text-base tracking-[0.08em] text-cacao mt-0.5">
            Calculadora de unidades
          </h3>
          <p className="text-xs text-cacao-soft font-serif italic mt-0.5">
            kg ↔ g · L ↔ ml — para convertir cantidades al vuelo.
          </p>
        </div>
        <span
          className={`text-cacao-soft text-xl transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ⌄
        </span>
      </button>

      {open && (
        <div className="border-t border-marfil p-4 space-y-3">
          <div className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-3">
              <label className="text-[10px] uppercase tracking-widest text-cacao-mute">
                Cantidad
              </label>
              <input
                type="number"
                step="any"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-5 sm:col-span-3">
              <label className="text-[10px] uppercase tracking-widest text-cacao-mute">
                De
              </label>
              <input
                type="text"
                list="unit-calc-list"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 sm:col-span-1 text-center text-cacao-soft text-lg pb-2">
              →
            </div>
            <div className="col-span-5 sm:col-span-3">
              <label className="text-[10px] uppercase tracking-widest text-cacao-mute">
                A
              </label>
              <input
                type="text"
                list="unit-calc-list"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-12 sm:col-span-2 text-right">
              <label className="text-[10px] uppercase tracking-widest text-cacao-mute">
                Resultado
              </label>
              <div className="mt-1 text-cacao font-cinzel text-base">
                {resultado === null
                  ? "—"
                  : formatNum(resultado)}
              </div>
            </div>
          </div>

          {/* Mensaje contextual */}
          {resultado === null && (
            <p className="text-xs text-terracotta">
              {!Number.isFinite(num)
                ? "Escribe una cantidad numérica."
                : dimFrom === "desconocida" || dimTo === "desconocida"
                ? "Unidad desconocida. Probá con kg, g, mg, L, ml o unidad."
                : `No se puede convertir ${dimensionLabel(dimFrom)} a ${dimensionLabel(dimTo)}.`}
            </p>
          )}
          {resultado !== null && (
            <p className="text-xs text-cacao-soft">
              {formatNum(num)} {from} = {formatNum(resultado)} {to}
            </p>
          )}

          {/* Atajos rápidos */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] uppercase tracking-widest text-cacao-mute self-center mr-1">
              Atajos:
            </span>
            {sugerencias.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setFrom(s.de);
                  setTo(s.a);
                }}
                className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-marfil text-cacao-soft hover:bg-marfil-soft hover:text-cacao"
              >
                {s.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                const old = from;
                setFrom(to);
                setTo(old);
              }}
              className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-cacao text-cacao hover:bg-cacao hover:text-white ml-1"
            >
              ⇄ Invertir
            </button>
          </div>

          <datalist id="unit-calc-list">
            {UNIDADES_COMUNES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      )}
    </section>
  );
}

function formatNum(n: number): string {
  if (!Number.isFinite(n)) return "—";
  // Mostramos hasta 6 decimales pero quitamos ceros sobrantes
  const abs = Math.abs(n);
  const decimales = abs >= 100 ? 2 : abs >= 1 ? 3 : abs >= 0.01 ? 4 : 6;
  const s = n.toFixed(decimales);
  return s.replace(/\.?0+$/, "");
}

function dimensionLabel(d: Dimension): string {
  switch (d) {
    case "peso":
      return "peso";
    case "volumen":
      return "volumen";
    case "conteo":
      return "conteo";
    default:
      return "desconocido";
  }
}
