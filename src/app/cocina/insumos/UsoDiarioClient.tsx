"use client";

// Uso diario de insumos (pestaña de Insumos). Muestra, día por día, cuánto
// salió de cada insumo por las ventas de ese día —si se vendieron 10
// hamburguesas, 10 panes—, más mermas de receta, pérdidas y compras. Reemplaza
// al conteo físico: el control sale del historial, comparando cada día con el
// promedio del período.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TIPOS_PERDIDA, type Insumo, type Receta } from "@/lib/types";
import { listInsumos, listComprasRango } from "@/lib/data/cocina";
import { listRecetas } from "@/lib/data/recetas";
import { calcularConsumoReceta } from "@/lib/data/ventas";
import { listMovimientosSalida } from "@/lib/data/stock-liviano";
import { listVentasUso } from "@/lib/data/uso-diario";
import {
  costoPorUnidadBase,
  fechaISOEnCaracas,
  restarDiasISO,
} from "@/lib/stock-liviano";
import {
  armarHistorial,
  compararConPromedio,
  stockAlCierre,
  usoTotalDia,
  type HistorialInsumo,
  type UsoDia,
  type VentaUso,
} from "@/lib/uso-diario";
import { displayCantidad } from "@/lib/units";
import { pillClass } from "@/lib/ui";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";
import { ChevronIcon } from "@/components/icons";

const PERIODOS = [7, 14, 30] as const;
type Periodo = (typeof PERIODOS)[number];
const TIPOS_PERDIDA_SET = new Set<string>(TIPOS_PERDIDA.map((t) => t.value));

type Datos = {
  insumos: Insumo[];
  recetas: Receta[];
  ventas: VentaUso[];
  compras: { insumoId: string; fecha: string; cantidad: number }[];
  perdidas: { insumoId: string; fecha: string; cantidad: number }[];
};

/** Cantidad legible: "10 unid", "8 kg", "750 ml". */
function fmtCant(n: number, unidad: string): string {
  return displayCantidad(n, unidad).replace(/ unidad$/, " unid");
}

function fUSD(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "Hoy", "Ayer" o "mar 11 nov". */
function fDia(iso: string, hoy: string): string {
  if (iso === hoy) return "Hoy";
  if (iso === restarDiasISO(hoy, 1)) return "Ayer";
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" });
}

function Variacion({ usado, promedio }: { usado: number; promedio: number }) {
  const c = compararConPromedio(usado, promedio);
  if (c.tipo !== "alto" && c.tipo !== "bajo") return null;
  const alto = c.tipo === "alto";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-widest ring-1 ${
        alto
          ? "bg-red-50 text-terracotta ring-red-200"
          : "bg-marfil-soft text-cacao-soft ring-marfil"
      }`}
      title="Comparado con el promedio diario del período"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${alto ? "bg-red-500" : "bg-stone-400"}`} />
      {alto ? "+" : ""}
      {Math.round((c.variacion ?? 0) * 100)} % vs promedio
    </span>
  );
}

/** Detalle de por qué salió: "10 × Hamburguesa clásica → 10 unid". */
function DetalleProductos({ dia, unidad }: { dia: UsoDia; unidad: string }) {
  const filas = [...dia.porProducto.entries()].sort((a, b) => b[1].cantidad - a[1].cantidad);
  return (
    <ul className="mt-2 space-y-1 text-xs text-cacao-soft">
      {filas.map(([producto, p]) => (
        <li key={producto} className="flex justify-between gap-3">
          <span className="min-w-0 truncate">
            {Number(p.unidades.toFixed(2))} × {producto}
          </span>
          <span className="shrink-0 tabular-nums text-cacao">{fmtCant(p.cantidad, unidad)}</span>
        </li>
      ))}
      {dia.mermaReceta > 0 && (
        <li className="flex justify-between gap-3">
          <span>Merma de receta</span>
          <span className="tabular-nums text-cacao">{fmtCant(dia.mermaReceta, unidad)}</span>
        </li>
      )}
      {dia.perdidas > 0 && (
        <li className="flex justify-between gap-3">
          <span>Pérdidas anotadas</span>
          <span className="tabular-nums text-cacao">{fmtCant(dia.perdidas, unidad)}</span>
        </li>
      )}
    </ul>
  );
}

export function UsoDiarioClient({
  insumoInicial = null,
  fijo = false,
}: {
  insumoInicial?: string | null;
  /** Dentro del detalle de un insumo: sin selector de insumo ni texto de ayuda. */
  fijo?: boolean;
}) {
  const hoy = useMemo(() => fechaISOEnCaracas(), []);
  // 14 días, igual que la ventana de consumo de Stock.
  const [periodo, setPeriodo] = useState<Periodo>(14);
  const [insumoSel, setInsumoSel] = useState<string>(insumoInicial ?? "todos");
  const [datos, setDatos] = useState<Datos | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const desde = restarDiasISO(hoy, periodo - 1);
  const loading = datos === null && errorCarga === null;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [insumos, recetas, ventas, compras, salidas] = await Promise.all([
          listInsumos(),
          listRecetas(),
          listVentasUso(desde, hoy),
          listComprasRango(desde, hoy),
          listMovimientosSalida(desde, hoy),
        ]);
        if (!vivo) return;
        const porId = new Map(insumos.map((i) => [i.id, i]));
        setDatos({
          insumos,
          recetas,
          ventas,
          // La compra guarda unidades de compra: se pasan a unidad base.
          compras: compras.map((c) => ({
            insumoId: c.insumoId,
            fecha: c.fecha,
            cantidad: c.cantidad * (porId.get(c.insumoId)?.cantidadPorCompra || 1),
          })),
          perdidas: salidas.filter((m) => TIPOS_PERDIDA_SET.has(m.tipo)),
        });
      } catch (e) {
        if (vivo) setErrorCarga(extractError(e, "Error cargando el uso diario"));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [desde, hoy, intento]);

  function cambiarPeriodo(p: Periodo) {
    if (p === periodo) return;
    setDatos(null);
    setErrorCarga(null);
    setPeriodo(p);
  }

  const insumoPorId = useMemo(
    () => new Map((datos?.insumos ?? []).map((i) => [i.id, i])),
    [datos],
  );

  const historial = useMemo(() => {
    if (!datos) return new Map<string, HistorialInsumo>();
    const expandir = (id: string, raciones: number) =>
      calcularConsumoReceta(id, raciones, datos.recetas, datos.insumos);
    return armarHistorial({
      desde,
      hasta: hoy,
      ventas: datos.ventas,
      perdidas: datos.perdidas,
      compras: datos.compras,
      expandir,
    });
  }, [datos, desde, hoy]);

  const costo = (i: Insumo | undefined) => (i ? costoPorUnidadBase(i) : null);

  // Vista "Todos": días (del más nuevo al más viejo) con lo usado de cada insumo.
  const porDia = useMemo(() => {
    const fechas = new Map<string, { insumo: Insumo; dia: UsoDia; h: HistorialInsumo }[]>();
    for (const h of historial.values()) {
      const ins = insumoPorId.get(h.insumoId);
      if (!ins) continue;
      for (const d of h.dias) {
        if (!(usoTotalDia(d) > 1e-9)) continue;
        const arr = fechas.get(d.fecha) ?? [];
        arr.push({ insumo: ins, dia: d, h });
        fechas.set(d.fecha, arr);
      }
    }
    const lista: { fecha: string; filas: { insumo: Insumo; dia: UsoDia; h: HistorialInsumo }[]; valor: number; ventas: number }[] = [];
    for (let i = 0; i < periodo; i++) {
      const fecha = restarDiasISO(hoy, i);
      const filas = (fechas.get(fecha) ?? []).sort((a, b) => {
        const va = usoTotalDia(a.dia) * (costo(a.insumo) ?? 0);
        const vb = usoTotalDia(b.dia) * (costo(b.insumo) ?? 0);
        return vb - va || a.insumo.nombre.localeCompare(b.insumo.nombre, "es");
      });
      const valor = filas.reduce((s, f) => s + usoTotalDia(f.dia) * (costo(f.insumo) ?? 0), 0);
      const ventas = (datos?.ventas ?? [])
        .filter((v) => v.fecha === fecha && !v.esMerma)
        .reduce((s, v) => s + v.cantidad, 0);
      lista.push({ fecha, filas, valor, ventas });
    }
    return lista;
  }, [historial, insumoPorId, periodo, hoy, datos]);

  const insumosOrdenados = useMemo(
    () =>
      [...(datos?.insumos ?? [])]
        .filter((i) => i.activo || historial.has(i.id))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [datos, historial],
  );

  const toggle = (k: string) => setAbiertos((p) => ({ ...p, [k]: !p[k] }));

  if (errorCarga) {
    return (
      <ErrorCarga
        que="el uso diario"
        detalle={errorCarga}
        onReintentar={() => {
          setErrorCarga(null);
          setIntento((n) => n + 1);
        }}
      />
    );
  }

  const sel = insumoSel !== "todos" ? insumoPorId.get(insumoSel) : undefined;
  const hSel = sel ? historial.get(sel.id) : undefined;

  return (
    <div className="space-y-6">
      {!fijo && <p className="text-[12px] text-cacao-soft">
        Lo que salió de cada insumo cada día, calculado con las <b>ventas de ese día</b> y sus
        recetas (10 hamburguesas vendidas → 10 panes), más mermas, pérdidas y compras. Compara
        cada día con el promedio para ver dónde se usó de más.
      </p>}

      <div className="flex flex-wrap items-center gap-2">
        {!fijo && <select
          value={insumoSel}
          onChange={(e) => setInsumoSel(e.target.value)}
          aria-label="Insumo"
          className="rounded-lg ring-1 ring-marfil bg-white px-3 py-2 text-sm"
        >
          <option value="todos">Todos los insumos (por día)</option>
          {insumosOrdenados.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nombre}
            </option>
          ))}
        </select>}
        <div className="flex gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => cambiarPeriodo(p)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${pillClass(p === periodo)}`}
            >
              {p} días
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-cacao-soft">Cargando…</p>
      ) : sel ? (
        <VistaInsumo insumo={sel} h={hSel} hoy={hoy} costo={costo(sel)} />
      ) : (
        <div className="space-y-6">
          {porDia.every((d) => d.filas.length === 0) && (
            <p className="py-6 text-center font-serif italic text-cacao-soft">
              No hay ventas, mermas ni pérdidas en estos {periodo} días. Cuando registres o
              importes las ventas, aquí verás lo que se usó de cada insumo.{" "}
              <Link href="/cocina/ventas" className="not-italic font-semibold underline hover:text-terracotta">
                Ir a Ventas
              </Link>
            </p>
          )}
          {porDia.map(({ fecha, filas, valor, ventas }) => (
            <section key={fecha}>
              <div className="flex items-baseline justify-between gap-3 border-b border-marfil pb-2">
                <h3 className="font-cinzel text-lg text-cacao capitalize">{fDia(fecha, hoy)}</h3>
                <span className="text-xs text-cacao-mute">
                  {filas.length === 0
                    ? "sin ventas registradas"
                    : `${Number(ventas.toFixed(2))} vendidos · ${fUSD(valor)} en insumos`}
                </span>
              </div>
              {filas.length > 0 && (
                <ul className="divide-y divide-marfil">
                  {filas.map(({ insumo, dia, h }) => {
                    const k = `${fecha}:${insumo.id}`;
                    const total = usoTotalDia(dia);
                    const c = costo(insumo);
                    return (
                      <li key={k} className="py-2.5">
                        <button
                          type="button"
                          onClick={() => toggle(k)}
                          className="flex w-full items-center gap-3 text-left"
                          aria-expanded={!!abiertos[k]}
                        >
                          <ChevronIcon
                            className={`size-4 text-cacao-mute transition-transform ${abiertos[k] ? "rotate-90" : ""}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-cacao">{insumo.nombre}</span>
                            <Variacion usado={total} promedio={h.promedioDiario} />
                          </span>
                          <span className="text-right">
                            <span className="block tabular-nums text-cacao font-medium">
                              {fmtCant(total, insumo.unidadBase)}
                            </span>
                            {c != null && (
                              <span className="block text-[11px] tabular-nums text-cacao-mute">
                                {fUSD(total * c)}
                              </span>
                            )}
                          </span>
                        </button>
                        {abiertos[k] && (
                          <div className="pl-7">
                            <DetalleProductos dia={dia} unidad={insumo.unidadBase} />
                            <button
                              type="button"
                              onClick={() => setInsumoSel(insumo.id)}
                              className="mt-2 text-[11px] uppercase tracking-widest text-terracotta hover:underline"
                            >
                              Ver su historial →
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Historial de un insumo: resumen, barras por día y detalle diario. */
function VistaInsumo({
  insumo,
  h,
  hoy,
  costo,
}: {
  insumo: Insumo;
  h: HistorialInsumo | undefined;
  hoy: string;
  costo: number | null;
}) {
  const u = insumo.unidadBase;
  if (!h || h.usadoTotal <= 1e-9 && h.dias.every((d) => d.comprado <= 0)) {
    return (
      <p className="py-8 text-center font-serif italic text-cacao-soft">
        {insumo.nombre} no tuvo ventas, mermas ni compras en este período. Revisa que sus
        recetas lo usen y que las ventas estén registradas.
      </p>
    );
  }
  const cierres = stockAlCierre(insumo.stockTotal, h.dias, hoy);
  const max = Math.max(...h.dias.map(usoTotalDia), 1e-9);
  const pico = h.dias.reduce((a, b) => (usoTotalDia(b) > usoTotalDia(a) ? b : a), h.dias[0]);
  const diasRecientes = [...h.dias].reverse();

  return (
    <div className="space-y-6">
      {/* Resumen, sin recuadros */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 border-y border-marfil">
        {[
          {
            t: "Usado en el período",
            v: fmtCant(h.usadoTotal, u),
            s: costo != null ? fUSD(h.usadoTotal * costo) : null,
          },
          {
            t: "Promedio por día",
            v: fmtCant(h.promedioDiario, u),
            s: `${h.diasConUso} día${h.diasConUso === 1 ? "" : "s"} con uso`,
          },
          {
            t: "Día de más uso",
            v: usoTotalDia(pico) > 0 ? fmtCant(usoTotalDia(pico), u) : "—",
            s: usoTotalDia(pico) > 0 ? fDia(pico.fecha, hoy) : null,
          },
          { t: "Stock hoy", v: fmtCant(insumo.stockTotal, u), s: null },
        ].map((x) => (
          <div key={x.t} className="py-3">
            <div className="text-[10px] uppercase tracking-widest text-cacao-mute">{x.t}</div>
            <div className="mt-1 font-cinzel text-lg text-cacao tabular-nums">{x.v}</div>
            {x.s && <div className="text-[11px] text-cacao-mute first-letter:uppercase">{x.s}</div>}
          </div>
        ))}
      </div>

      {/* Barras por día */}
      <div>
        <div className="flex h-28 items-end gap-1" aria-hidden="true">
          {h.dias.map((d) => {
            const t = usoTotalDia(d);
            const c = compararConPromedio(t, h.promedioDiario);
            return (
              <div key={d.fecha} className="flex flex-1 flex-col items-center justify-end h-full">
                <div
                  className={`w-full rounded-t ${c.tipo === "alto" ? "bg-terracotta" : "bg-naranja-soft"}`}
                  style={{ height: `${Math.max(t > 0 ? 4 : 0, (t / max) * 100)}%` }}
                  title={`${fDia(d.fecha, hoy)}: ${fmtCant(t, u)}`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-cacao-mute">
          <span className="capitalize">{fDia(h.dias[0].fecha, hoy)}</span>
          <span>Hoy</span>
        </div>
        {h.promedioDiario > 0 && (
          <p className="mt-1 text-[11px] text-cacao-mute">
            Barras en naranja fuerte: días con 50 % o más sobre el promedio ({fmtCant(h.promedioDiario, u)}).
          </p>
        )}
      </div>

      {/* Día por día */}
      <ul className="divide-y divide-marfil border-y border-marfil">
        {diasRecientes.map((d) => {
          const t = usoTotalDia(d);
          const cierre = cierres.get(d.fecha);
          return (
            <li key={d.fecha} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-cacao capitalize">{fDia(d.fecha, hoy)}</div>
                  <Variacion usado={t} promedio={h.promedioDiario} />
                </div>
                <div className="text-right text-sm">
                  <div className="tabular-nums text-cacao font-medium">
                    {t > 0 ? `− ${fmtCant(t, u)}` : "sin uso"}
                  </div>
                  {d.comprado > 0 && (
                    <div className="text-[11px] tabular-nums text-oliva">+ {fmtCant(d.comprado, u)} comprado</div>
                  )}
                  {cierre != null && (
                    <div className="text-[11px] tabular-nums text-cacao-mute">
                      quedó ≈ {fmtCant(cierre, u)}
                    </div>
                  )}
                </div>
              </div>
              {t > 0 && <DetalleProductos dia={d} unidad={u} />}
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-cacao-mute">
        &ldquo;Quedó&rdquo; es una estimación hacia atrás desde el stock de hoy con las compras y
        salidas registradas; no incluye cambios hechos a mano en la ficha.
      </p>
    </div>
  );
}
