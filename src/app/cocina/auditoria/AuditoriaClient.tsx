"use client";

import { useEffect, useMemo, useState } from "react";
import { listInsumos } from "@/lib/data/cocina";
import {
  listStockAuditoria,
  type StockAuditoria,
  type OrigenAuditoria,
} from "@/lib/data/stock-auditoria";
import { extractError } from "@/lib/data/error";
import { displayCantidad } from "@/lib/units";
import type { Insumo } from "@/lib/types";
import { normalizarBusqueda } from "@/lib/text";
import { ErrorBanner } from "@/components/ErrorBanner";

type FiltroOrigen = "todos" | OrigenAuditoria;

const ORIGEN_META: Record<
  OrigenAuditoria,
  { label: string; className: string }
> = {
  app: {
    label: "App",
    className: "bg-marfil-soft text-cacao-soft ring-marfil",
  },
  alta: {
    label: "Alta",
    className: "bg-[#EEF3EA] text-[#3B5A2A] ring-[#CBD9BC]",
  },
  directo: {
    label: "Directo (SQL)",
    className: "bg-[#F6EEDD] text-[#8A5A15] ring-[#E4CE9E]",
  },
};

function fmtFechaHora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-VE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Renderiza "antes → después" con el delta y color según suba/baje. */
function CambioCapa({
  anterior,
  nuevo,
  unidad,
}: {
  anterior: number | null;
  nuevo: number | null;
  unidad: string | null;
}) {
  if (anterior === null && nuevo === null) return <span>—</span>;
  const a = anterior ?? 0;
  const n = nuevo ?? 0;
  const delta = n - a;
  const sinCambio = Math.abs(delta) < 1e-9;
  const color = sinCambio
    ? "text-cacao-mute"
    : delta < 0
      ? "text-terracotta"
      : "text-[#3B5A2A]";
  return (
    <span className="whitespace-nowrap">
      <span className="text-cacao-soft">
        {anterior === null ? "—" : displayCantidad(a, unidad)}
      </span>
      <span className="mx-1 text-cacao-mute">→</span>
      <span className="text-cacao font-medium">{displayCantidad(n, unidad)}</span>
      {!sinCambio && (
        <span className={`ml-2 ${color}`}>
          ({delta > 0 ? "+" : ""}
          {displayCantidad(delta, unidad)})
        </span>
      )}
    </span>
  );
}

export function AuditoriaClient() {
  const [entries, setEntries] = useState<StockAuditoria[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** True cuando la tabla stock_auditoria todavía no existe en la base
   *  (falta correr el SQL). Mostramos un aviso amable, no un error. */
  const [sinActivar, setSinActivar] = useState(false);

  const [filterInsumo, setFilterInsumo] = useState<string>("todos");
  const [filterOrigen, setFilterOrigen] = useState<FiltroOrigen>("todos");
  const [soloFisico, setSoloFisico] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [aud, ins] = await Promise.all([
          listStockAuditoria({ limit: 500 }),
          listInsumos(),
        ]);
        if (!vivo) return;
        setEntries(aud);
        setInsumos(ins);
      } catch (e) {
        if (!vivo) return;
        const msg = extractError(e);
        // La tabla aún no existe → falta correr el SQL de activación.
        if (
          /stock_auditoria/i.test(msg) ||
          /does not exist|no existe|42p01|schema cache/i.test(msg)
        ) {
          setSinActivar(true);
        } else {
          setError(msg);
        }
      } finally {
        if (vivo) setLoading(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const insumosOrdenados = useMemo(
    () => [...insumos].sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [insumos],
  );

  const filtered = useMemo(() => {
    const q = normalizarBusqueda(search.trim());
    return entries.filter((e) => {
      if (filterInsumo !== "todos" && e.insumoId !== filterInsumo) return false;
      if (filterOrigen !== "todos" && e.origen !== filterOrigen) return false;
      if (soloFisico) {
        const cambioFisico =
          (e.stockAnterior ?? 0) !== (e.stockNuevo ?? 0) ||
          e.stockAnterior === null;
        if (!cambioFisico) return false;
      }
      if (q && !normalizarBusqueda(e.insumoNombre).includes(q)) return false;
      return true;
    });
  }, [entries, filterInsumo, filterOrigen, soloFisico, search]);

  const nDirectos = useMemo(
    () => entries.filter((e) => e.origen === "directo").length,
    [entries],
  );

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando auditoría…
      </div>
    );
  }

  if (sinActivar) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center">
        <p className="font-cinzel text-lg tracking-[0.06em] text-cacao">
          Auditoría por activar
        </p>
        <p className="mt-3 text-sm text-cacao-soft font-serif max-w-md mx-auto">
          El registro automático de cambios de stock todavía no está activo en
          la base de datos. Una vez que se corra el SQL de activación, cada
          cambio de stock empezará a quedar registrado aquí — cuándo, cuánto y
          de dónde vino.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="rounded-xl bg-marfil-soft ring-1 ring-marfil p-4 text-sm text-cacao-soft font-serif">
        Cada cambio de stock queda registrado automáticamente: el antes, el
        después, el momento exacto y de dónde vino. Los marcados como{" "}
        <span className="font-sans font-medium text-[#8A5A15]">
          Directo (SQL)
        </span>{" "}
        son cambios hechos fuera de la app (editor de Supabase o procesos), los
        que conviene revisar con cuidado.
        {nDirectos > 0 && (
          <span className="block mt-1">
            Hay <strong className="text-cacao">{nDirectos}</strong> cambio(s)
            directo(s) en el registro.
          </span>
        )}
      </div>

      {/* Filtros */}
      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select
            value={filterInsumo}
            onChange={(e) => setFilterInsumo(e.target.value)}
            className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
          >
            <option value="todos">Todos los insumos</option>
            {insumosOrdenados.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nombre}
              </option>
            ))}
          </select>
          <select
            value={filterOrigen}
            onChange={(e) => setFilterOrigen(e.target.value as FiltroOrigen)}
            className="rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
          >
            <option value="todos">Cualquier origen</option>
            <option value="app">App</option>
            <option value="alta">Alta</option>
            <option value="directo">Directo (SQL)</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-cacao rounded-lg ring-1 ring-marfil px-3 py-2 bg-white cursor-pointer">
            <input
              type="checkbox"
              checked={soloFisico}
              onChange={(e) => setSoloFisico(e.target.checked)}
              className="h-4 w-4 accent-cacao"
            />
            Solo cambios del físico
          </label>
        </div>
        <input
          type="text"
          placeholder="Buscar insumo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
      </section>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          No hay cambios de stock registrados con estos filtros.
          <p className="mt-2 text-xs text-cacao-mute">
            El registro empieza a llenarse desde que se activa el disparador en
            la base de datos.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-marfil text-left">
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-cacao-mute font-medium">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-cacao-mute font-medium">
                    Insumo
                  </th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-cacao-mute font-medium">
                    Stock físico
                  </th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-cacao-mute font-medium">
                    Reservado
                  </th>
                  <th className="px-4 py-3 text-[11px] uppercase tracking-widest text-cacao-mute font-medium">
                    Origen
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => {
                  const meta = ORIGEN_META[e.origen] ?? ORIGEN_META.directo;
                  const comprometidoCambio =
                    (e.comprometidoAnterior ?? 0) !==
                    (e.comprometidoNuevo ?? 0);
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-marfil/60 last:border-0 align-top"
                    >
                      <td className="px-4 py-3 text-cacao-soft whitespace-nowrap">
                        {fmtFechaHora(e.changedAt)}
                      </td>
                      <td className="px-4 py-3 text-cacao font-medium">
                        {e.insumoNombre}
                      </td>
                      <td className="px-4 py-3">
                        <CambioCapa
                          anterior={e.stockAnterior}
                          nuevo={e.stockNuevo}
                          unidad={e.unidadBase}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {comprometidoCambio ? (
                          <CambioCapa
                            anterior={e.comprometidoAnterior}
                            nuevo={e.comprometidoNuevo}
                            unidad={e.unidadBase}
                          />
                        ) : (
                          <span className="text-cacao-mute">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] ring-1 ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs text-cacao-mute text-center">
        Mostrando {filtered.length} de {entries.length} cambios (últimos 500).
      </p>
    </div>
  );
}
