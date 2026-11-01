"use client";

import { useMemo, useState } from "react";
import type { Receta } from "@/lib/types";
import { createVentasBatch } from "@/lib/data/ventas";
import { normalizarBusqueda } from "@/lib/text";
import { fmtUsd } from "@/lib/moneda";
import { SearchIcon } from "@/components/icons";

type Props = {
  recetas: Receta[];
  fecha: string;
  onFecha: (iso: string) => void;
  onGuardado: () => void;
};

export function RegistroPlatos({ recetas, fecha, onFecha, onGuardado }: Props) {
  const [buscar, setBuscar] = useState("");
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const lista = useMemo(() => {
    const q = normalizarBusqueda(buscar.trim());
    const base = [...recetas].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!q) return base;
    return base.filter((r) => normalizarBusqueda(r.nombre).includes(q));
  }, [recetas, buscar]);

  const elegidos = recetas.filter((r) => (cantidades[r.id] ?? 0) > 0);
  const unidades = elegidos.reduce((s, r) => s + (cantidades[r.id] ?? 0), 0);
  const total = elegidos.reduce((s, r) => {
    const precio = r.precioSugeridoUsd ?? 0;
    return precio > 0 ? s + precio * (cantidades[r.id] ?? 0) : s;
  }, 0);
  const sinPrecio = elegidos.filter((r) => !(r.precioSugeridoUsd && r.precioSugeridoUsd > 0)).length;

  function poner(id: string, n: number) {
    const cant = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    setCantidades((prev) => ({ ...prev, [id]: cant }));
    setOk(null);
  }

  async function guardar() {
    if (elegidos.length === 0) {
      setError("Pon la cantidad en al menos un plato.");
      return;
    }
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      await createVentasBatch(
        elegidos.map((r) => {
          const cantidad = cantidades[r.id] ?? 0;
          const precio = r.precioSugeridoUsd && r.precioSugeridoUsd > 0 ? r.precioSugeridoUsd : undefined;
          return {
            fecha,
            recetaId: r.id,
            recetaNombre: r.nombre,
            cantidad,
            precioUnitarioUsd: precio,
            totalUsd: precio != null ? Math.round(precio * cantidad * 100) / 100 : undefined,
            fuente: "manual" as const,
          };
        }),
      );
      setCantidades({});
      setOk(
        `Listo: ${unidades} plato${unidades === 1 ? "" : "s"} del ${fecha}. El stock ya se descontó.`,
      );
      onGuardado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron guardar las ventas.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section id="registro-venta" className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-4">
      <div>
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Platos del día
        </h2>
        <p className="mt-1 text-sm text-cacao-soft">
          Elige la fecha, busca el plato y pon cuántos salieron. El precio sale de la receta, en dólares.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">{ok}</div>
      )}

      <label className="text-sm text-cacao block max-w-xs">
        Fecha
        <input
          type="date"
          value={fecha}
          onChange={(e) => onFecha(e.target.value)}
          required
          className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
      </label>

      <label className="text-sm text-cacao block">
        Buscar plato
        <span className="mt-1 flex items-center gap-2 rounded-lg ring-1 ring-marfil px-3 py-2">
          <SearchIcon className="size-4 text-cacao-mute shrink-0" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Sanduche, café, limonada…"
            className="w-full bg-transparent text-sm text-cacao outline-none"
          />
        </span>
      </label>

      {recetas.length === 0 ? (
        <p className="text-sm text-cacao-soft italic font-serif">
          Todavía no hay platos activos. Créalos en Recetas y vuelve a anotar las ventas.
        </p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-cacao-soft italic font-serif">Ningún plato coincide con la búsqueda.</p>
      ) : (
        <ul className="divide-y divide-marfil max-h-[28rem] overflow-y-auto rounded-xl ring-1 ring-marfil">
          {lista.map((r) => {
            const cant = cantidades[r.id] ?? 0;
            const precio = r.precioSugeridoUsd && r.precioSugeridoUsd > 0 ? r.precioSugeridoUsd : null;
            return (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-cacao truncate">{r.nombre}</div>
                  <div className="text-[11px] text-cacao-mute">
                    {precio != null ? `${fmtUsd(precio)} c/u` : "Sin precio de venta"}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => poner(r.id, cant - 1)}
                    className="h-8 w-8 rounded-lg ring-1 ring-marfil text-cacao hover:bg-marfil-soft"
                    aria-label={`Quitar uno de ${r.nombre}`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={cant === 0 ? "" : String(cant)}
                    placeholder="0"
                    onChange={(e) => poner(r.id, e.target.value === "" ? 0 : Number(e.target.value))}
                    aria-label={`Cantidad de ${r.nombre}`}
                    className="w-14 rounded-lg ring-1 ring-marfil px-1 py-1.5 text-center text-sm text-cacao tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() => poner(r.id, cant + 1)}
                    className="h-8 w-8 rounded-lg ring-1 ring-marfil text-cacao hover:bg-marfil-soft"
                    aria-label={`Sumar uno de ${r.nombre}`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cacao-soft">
          {elegidos.length === 0
            ? "Ningún plato con cantidad."
            : `${unidades} unidad${unidades === 1 ? "" : "es"} · ${fmtUsd(total)}${sinPrecio > 0 ? ` · ${sinPrecio} sin precio (descuenta stock, no suma dinero)` : ""}`}
        </p>
        <button
          type="button"
          onClick={guardar}
          disabled={guardando || elegidos.length === 0}
          className="rounded-lg bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar ventas del día"}
        </button>
      </div>

      <p className="text-[12px] text-cacao-mute">
        El cierre de caja (cuánto entró en efectivo, pago móvil o punto, en dólares o bolívares) se anota en un paso siguiente. Ejemplo: Efectivo $120, Pago Móvil Bs 4.500, Punto Bs 3.200.
      </p>
    </section>
  );
}
