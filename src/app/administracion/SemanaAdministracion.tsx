"use client";

// Semana de Administración: de un vistazo, cómo le fue al local.
// Lee ventas (public.ventas), costo de receta, compras y bajas de inventario.
// No escribe nada.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarIcon, ChevronIcon, WarningIcon } from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
import { extractError } from "@/lib/data/error";
import { EstadoCajaPill } from "@/app/cocina/ventas/EstadoCajaPill";
import { esFaltaTablaCierre, listCierresRango } from "@/lib/data/cierre-caja";
import { getTasaBcvPorFecha, listComprasRango, listInsumos } from "@/lib/data/cocina";
import { calcularCostoReceta, listRecetas } from "@/lib/data/recetas";
import { listPerdidasRango } from "@/lib/data/stock-movimientos";
import { listVentasRango } from "@/lib/data/ventas";
import { compararCaja, diasEntre, hoyCaracas, resumenCajaSemana, type EstadoCaja, type ResumenCajaSemana } from "@/lib/cierre-caja";
import { CRITERIO_SEMANA, gastoDesdeFila, resumirGastos, restarGastos, type FilaGasto, type GastoFijo } from "@/lib/gastos-fijos";
import { fmtBs, fmtUsd } from "@/lib/moneda";
import {
  armarSemana,
  costoTeoricoLinea,
  lunesSemanaActual,
  montoVenta,
  moverSemana,
  semanaDesdeLunes,
  sumarPerdidas,
  totalesCompra,
  valorPerdida,
  type CostoCatalogo,
  type LineaSemana,
  type ResumenSemana,
} from "@/lib/semana";
import type { Insumo, Receta, Venta } from "@/lib/types";

type TasaVista = { fecha: string; usdBs: number };

type DiaVista = {
  fecha: string;
  ventasUsd: number;
  estado: EstadoCaja | "futuro";
};

const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;

function diaCorto(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y || 0, (m || 1) - 1, d || 1)).getUTCDay();
  return DIA_CORTO[dow] ?? "";
}

export function SemanaAdministracion({ onVerCierres, onVerGastos }: { onVerCierres?: () => void; onVerGastos?: () => void }) {
  const [lunes, setLunes] = useState(() => lunesSemanaActual());
  const [resumen, setResumen] = useState<ResumenSemana | null>(null);
  const [caja, setCaja] = useState<ResumenCajaSemana | null>(null);
  const [dias, setDias] = useState<DiaVista[]>([]);
  const [cajaAviso, setCajaAviso] = useState<string | null>(null);
  const [tasa, setTasa] = useState<TasaVista | null>(null);
  const [gastos, setGastos] = useState<GastoFijo[]>([]);
  const [gastosPendiente, setGastosPendiente] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const semana = semanaDesdeLunes(lunes);
  const tope = lunesSemanaActual();
  const esActual = lunes >= tope;
  const [lunesVisto, setLunesVisto] = useState(lunes);
  if (lunes !== lunesVisto) {
    setLunesVisto(lunes);
    setCargando(true);
    setError(null);
  }

  useEffect(() => {
    const esta = semanaDesdeLunes(lunes);
    const previa = semanaDesdeLunes(moverSemana(lunes, -1));
    let cancel = false;
    (async () => {
      try {
        const [ventas, compras, perdidas, recetas, insumos, tasaBcv, gastosRes, cierresRes] = await Promise.all([
          listVentasRango(previa.desde, esta.hasta),
          listComprasRango(esta.desde, esta.hasta),
          listPerdidasRango(esta.desde, esta.hasta),
          listRecetas(),
          listInsumos(),
          getTasaBcvPorFecha(esta.hasta),
          fetch("/api/admin/gastos-fijos", { cache: "no-store" })
            .then(async (r) => {
              const d = await r.json().catch(() => ({}));
              if (!r.ok) return { gastos: [] as GastoFijo[], pendiente: false };
              const lista = ((d.gastos ?? []) as GastoFijo[])
                .map((g) => gastoDesdeFila({
                  id: g.id,
                  categoria: g.categoria,
                  monto: g.monto,
                  moneda: g.moneda,
                  tasa: g.tasa,
                  monto_usd: g.montoUsd,
                  fecha: g.fecha,
                  nota: g.nota,
                  recurrente: g.recurrente,
                }))
                .filter((g): g is GastoFijo => g != null);
              return { gastos: lista, pendiente: !!d.pendiente };
            })
            .catch(() => ({ gastos: [] as GastoFijo[], pendiente: false })),
          listCierresRango(esta.desde, esta.hasta).then(
            (rows) => ({ rows, aviso: null as string | null }),
            (e: unknown) => ({
              rows: [],
              aviso: esFaltaTablaCierre(e)
                ? "El cierre de caja todavía no está en la base. Hay que aplicar la migración cierre_caja."
                : "No se pudo leer la caja. El resto de la semana sí está al día.",
            }),
          ),
        ]);
        if (cancel) return;
        const catalogo = catalogoCostos(recetas, insumos);
        const precio = new Map(insumos.map((i) => [i.id, i.precioBaseUsd] as const));
        const deEsta = ventas.filter((v) => v.fecha >= esta.desde && v.fecha <= esta.hasta);
        const deAntes = ventas.filter((v) => v.fecha >= previa.desde && v.fecha <= previa.hasta);
        const comprasTot = totalesCompra(compras);
        const perd = sumarPerdidas(
          perdidas.map((m) => valorPerdida(m, precio.get(m.insumoId) ?? null)),
        );
        setResumen(
          armarSemana({
            ventas: deEsta.map((v) => aLinea(v, catalogo)),
            ventasAnterior: deAntes.map((v) => aLinea(v, catalogo)),
            comprasInsumosUsd: comprasTot.insumos,
            fleteUsd: comprasTot.flete,
            perdidasUsd: perd.usd,
            perdidasSinPrecio: perd.sinPrecio,
          }),
        );
        const ventasUsdPorDia: Record<string, number> = {};
        for (const v of deEsta) {
          const dia = v.fecha.slice(0, 10);
          ventasUsdPorDia[dia] = (ventasUsdPorDia[dia] ?? 0) + montoVenta(v);
        }
        const hoy = hoyCaracas();
        setCaja(
          resumenCajaSemana({
            desde: esta.desde,
            hasta: esta.hasta,
            hoy,
            cierres: cierresRes.rows.map((c) => ({
              fecha: c.fecha,
              tasaUsdBs: c.tasaUsdBs,
              lineas: c.lineas,
            })),
            ventasUsdPorDia,
          }),
        );
        const porCierre = new Map(cierresRes.rows.map((c) => [c.fecha.slice(0, 10), c]));
        setDias(
          diasEntre(esta.desde, esta.hasta).map((fecha) => {
            const ventasUsd = ventasUsdPorDia[fecha] ?? 0;
            if (fecha > hoy) return { fecha, ventasUsd, estado: "futuro" as const };
            const cierre = porCierre.get(fecha);
            if (!cierre) return { fecha, ventasUsd, estado: "vacio" as const };
            const comp = compararCaja({
              lineas: cierre.lineas,
              tasaUsdBs: cierre.tasaUsdBs,
              ventasUsd,
              hayRegistro: true,
            });
            return { fecha, ventasUsd, estado: comp.estado };
          }),
        );
        setCajaAviso(cierresRes.aviso);
        setGastos(gastosRes.gastos);
        setGastosPendiente(gastosRes.pendiente);
        setTasa(tasaBcv && tasaBcv.usdBs > 0 ? { fecha: tasaBcv.fecha, usdBs: tasaBcv.usdBs } : null);
      } catch (e) {
        if (!cancel) {
          setResumen(null);
          setCaja(null);
          setDias([]);
          setCajaAviso(null);
          setGastos([]);
          setGastosPendiente(false);
          setError(extractError(e, "No se pudo armar la semana"));
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [lunes, intento]);

  function ir(delta: number) {
    setLunes((actual) => {
      const prox = moverSemana(actual, delta);
      return prox > tope ? actual : prox;
    });
  }

  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-2 rounded-2xl bg-white ring-1 ring-marfil px-2 py-3 sm:px-3" aria-label="Semana">
        <button
          type="button"
          onClick={() => ir(-1)}
          aria-label="Semana anterior"
          className="rounded-lg p-2 text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
        >
          <ChevronIcon className="size-4 rotate-180" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="flex min-w-0 flex-wrap items-center justify-center gap-x-2 font-cinzel text-base leading-snug text-cacao sm:text-lg">
            <CalendarIcon className="size-4 shrink-0 text-cacao-mute" />
            <span className="min-w-0">{semana.etiqueta}</span>
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-widest text-cacao-mute">
            {esActual ? "Esta semana · lunes a domingo" : "Semana cerrada · lunes a domingo"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => ir(1)}
          disabled={esActual}
          aria-label="Semana siguiente"
          className="rounded-lg p-2 text-cacao ring-1 ring-marfil hover:bg-marfil-soft disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronIcon className="size-4" />
        </button>
      </nav>

      {error && (
        <ErrorCarga
          que="la semana"
          detalle={error}
          onReintentar={() => {
            setCargando(true);
            setError(null);
            setIntento((n) => n + 1);
          }}
          reintentando={cargando}
        />
      )}

      {cargando ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center text-cacao-soft">
          Cargando la semana…
        </div>
      ) : resumen ? (
        <VistaSemana
          resumen={resumen}
          tasa={tasa}
          caja={caja}
          cajaAviso={cajaAviso}
          dias={dias}
          onVerCierres={onVerCierres}
          onVerGastos={onVerGastos}
          gastos={resumirGastos(gastos, semana.desde, semana.hasta)}
          gastosPendiente={gastosPendiente}
        />
      ) : null}
    </div>
  );
}

function catalogoCostos(recetas: Receta[], insumos: Insumo[]): CostoCatalogo {
  const porPorcion = new Map<string, number>();
  for (const r of recetas) {
    try {
      const { porPorcion: n } = calcularCostoReceta(r, insumos, recetas);
      if (n > 0 && Number.isFinite(n)) porPorcion.set(r.id, n);
    } catch {
      /* receta sin costo usable */
    }
  }
  const precioInsumo = new Map<string, number>();
  for (const i of insumos) {
    if (i.precioBaseUsd != null && i.precioBaseUsd >= 0 && Number.isFinite(i.precioBaseUsd)) {
      precioInsumo.set(i.id, i.precioBaseUsd);
    }
  }
  return { porPorcion, precioInsumo };
}

function aLinea(v: Venta, catalogo: CostoCatalogo): LineaSemana {
  return {
    nombre: v.recetaNombre.trim() || "Sin nombre",
    cantidad: Number.isFinite(v.cantidad) ? v.cantidad : 0,
    totalUsd: montoVenta(v),
    costoUsd: costoTeoricoLinea(v, catalogo),
  };
}

function VistaSemana({
  resumen,
  tasa,
  caja,
  cajaAviso,
  dias,
  onVerCierres,
  onVerGastos,
  gastos,
  gastosPendiente,
}: {
  resumen: ResumenSemana;
  tasa: TasaVista | null;
  caja: ResumenCajaSemana | null;
  cajaAviso: string | null;
  dias: DiaVista[];
  onVerCierres?: () => void;
  onVerGastos?: () => void;
  gastos: { totalUsd: number; porCategoria: FilaGasto[] };
  gastosPendiente: boolean;
}) {
  const r = resumen;
  const corte = restarGastos(r.utilidadUsd, gastos.totalUsd);
  const foodAlto = r.foodCostPct != null && r.foodCostPct > 0.35;
  const alertas: { texto: string }[] = [];
  if (caja && (caja.estado === "sobra" || caja.estado === "falta")) {
    alertas.push({ texto: `La caja de los días con cierre ${caja.estado === "sobra" ? "sobra" : "falta"}: ${caja.titulo}.` });
  }
  if (caja && caja.diasSinCierre > 0) {
    alertas.push({
      texto:
        caja.diasSinCierre === 1
          ? "Hay 1 día de esta semana sin cierre de caja."
          : `Hay ${caja.diasSinCierre} días de esta semana sin cierre de caja.`,
    });
  }
  if (foodAlto) {
    alertas.push({
      texto: `Food cost teórico ${fmtPct(r.foodCostPct)}. Por encima de 35% conviene revisar porciones o precios.`,
    });
  }
  return (
    <div className="space-y-4">
      {alertas.length > 0 && (
        <ul className="space-y-2">
          {alertas.map((a) => (
            <li key={a.texto} className="flex items-start gap-2 rounded-2xl bg-[#FBF3E4] px-4 py-3 text-sm text-[#8A5A12] ring-1 ring-[#E6D3A8]">
              <WarningIcon className="mt-0.5 size-4 shrink-0" />
              <span>
                {a.texto}{" "}
                {onVerCierres ? (
                  <button type="button" onClick={onVerCierres} className="underline decoration-dotted">
                    Ver cierres
                  </button>
                ) : (
                  <Link href="/administracion?seccion=cierre" className="underline decoration-dotted">
                    Ver cierres
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tarjeta
          titulo="Ventas"
          valor={fmtUsd(r.ventasUsd)}
          sub={tasa ? fmtBs(r.ventasUsd * tasa.usdBs) : "Sin tasa BCV"}
          extra={
            <div className="flex flex-wrap items-center gap-2 text-xs text-cacao">
              <span>
                {fmtCant(r.platos)} {palabraPlato(r.platos)}
              </span>
              <Variacion ratio={r.variacionVentas} actual={r.ventasUsd} anterior={r.ventasAnteriorUsd} compacto />
            </div>
          }
        />
        <Tarjeta
          titulo="Food cost"
          valor={fmtPct(r.foodCostPct)}
          sub={fmtUsd(r.foodCostUsd)}
          tono={foodAlto ? "alerta" : r.foodCostPct != null && r.foodCostPct > 0 ? "bien" : undefined}
          extra={
            <span className="text-[11px] text-cacao-mute">{foodAlto ? "Alto" : r.hayVentas ? "En rango" : "Sin ventas"}</span>
          }
        />
        <Tarjeta titulo="Compras" valor={fmtUsd(r.comprasUsd)} sub={r.fleteUsd > 0.005 ? `incluye flete ${fmtUsd(r.fleteUsd)}` : "insumos de la semana"} />
        <Tarjeta
          titulo="Caja"
          valor={caja?.cobradoUsd != null ? fmtUsd(caja.cobradoUsd) : "—"}
          sub={caja ? caja.titulo : "Sin datos"}
          extra={caja && caja.estado !== "vacio" ? <EstadoCajaPill estado={caja.estado} titulo={caja.titulo} /> : null}
        />
      </div>

      <GraficoDias dias={dias} />

      {!r.hayVentas && <VacioVentas />}

      <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
        <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Utilidad estimada</h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-cacao-mute">Antes de gastos fijos</p>
            <p className={`mt-1 font-cinzel text-2xl tabular-nums sm:text-3xl ${tonoMonto(corte.antes)}`}>{fmtUsd(corte.antes)}</p>
            {tasa && <p className="mt-0.5 text-sm tabular-nums text-cacao-soft">{fmtBs(corte.antes * tasa.usdBs)}</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-cacao-mute">Después de gastos fijos</p>
            <p className={`mt-1 font-cinzel text-2xl tabular-nums sm:text-3xl ${tonoMonto(corte.despues)}`}>{fmtUsd(corte.despues)}</p>
            {tasa && <p className="mt-0.5 text-sm tabular-nums text-cacao-soft">{fmtBs(corte.despues * tasa.usdBs)}</p>}
          </div>
        </div>
        <ul className="mt-3 max-w-md space-y-1 text-sm">
          <FilaCuenta label="Ventas" val={fmtUsd(r.ventasUsd)} />
          <FilaCuenta label="− Food cost teórico" val={fmtUsd(r.foodCostUsd)} tenue />
          <FilaCuenta label="− Pérdidas" val={fmtUsd(r.perdidasUsd)} tenue />
          <li className="flex items-baseline justify-between gap-3 border-t border-marfil pt-1">
            <span className="font-medium text-cacao">Utilidad estimada</span>
            <span className={`tabular-nums font-medium ${tonoMonto(corte.antes)}`}>{fmtUsd(corte.antes)}</span>
          </li>
          <FilaCuenta label="− Gastos fijos de la semana" val={fmtUsd(corte.gastosUsd)} tenue />
          {gastos.porCategoria.map((c) => (
            <FilaCuenta key={c.categoria} label={`· ${c.label}`} val={fmtUsd(c.usd)} tenue />
          ))}
          <li className="flex items-baseline justify-between gap-3 border-t border-marfil pt-1">
            <span className="font-medium text-cacao">Después de gastos fijos</span>
            <span className={`tabular-nums font-medium ${tonoMonto(corte.despues)}`}>{fmtUsd(corte.despues)}</span>
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-relaxed text-cacao-mute">{CRITERIO_SEMANA}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-cacao-mute">
          La de antes es el margen de lo vendido (receta y pérdidas). Las compras de la semana no entran aquí: el balance de caja está en Estado de cuenta, con el monto entero del mes. Semana anterior: {fmtUsd(r.ventasAnteriorUsd)}.
          {tasa ? ` BCV del ${fmtFecha(tasa.fecha)}: ${fmtBs(tasa.usdBs)} por $1.` : ""}
        </p>
        {corte.gastosUsd <= 0.005 && (
          <div className="mt-3 rounded-xl bg-marfil-soft px-3 py-3">
            <p className="font-serif italic text-cacao-soft">
              {gastosPendiente
                ? "Los gastos fijos todavía no están en la base. Cuando se aplique la migración, aquí se descuenta el alquiler y la nómina de la semana."
                : "Esta semana no hay gastos fijos. Anota el alquiler, la nómina o los servicios y verás la utilidad después de descontarlos."}
            </p>
            {onVerGastos ? (
              <button type="button" onClick={onVerGastos} className="mt-2 text-sm text-cacao underline decoration-dotted">
                Ir a Gastos fijos
              </button>
            ) : (
              <Link href="/administracion?seccion=gastos" className="mt-2 inline-block text-sm text-cacao underline decoration-dotted">
                Ir a Gastos fijos
              </Link>
            )}
          </div>
        )}
        {r.platosSinCosto > 0 && (
          <p className="mt-1 text-[11px] leading-relaxed text-cacao-soft">
            Faltó el costo de {fmtCant(r.platosSinCosto)} {palabraPlato(r.platosSinCosto)} ({fmtUsd(r.ventasSinCostoUsd)} de ventas). Esos no restan, así que la utilidad puede verse más alta.
          </p>
        )}
      </section>

      <CajaDeLaSemana caja={caja} aviso={cajaAviso} onVerCierres={onVerCierres} />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
        <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Platos más vendidos</h2>
        {!r.hayVentas ? (
          <p className="mt-3 font-serif text-sm italic text-cacao-soft">
            Cuando haya ventas, aquí ves los 5 platos que más salieron, con cantidad, dólares y margen.
          </p>
        ) : r.top.length === 0 ? (
          <p className="mt-3 font-serif text-sm italic text-cacao-soft">Esta semana no hay platos con cantidad.</p>
        ) : (
          <>
            <p className="mt-1 text-[11px] text-cacao-mute">
              {r.top.length < 5 ? "Todos los que salieron esta semana." : "Los 5 que más salieron."}
            </p>
            <ol className="mt-2 divide-y divide-marfil">
              {r.top.map((p, i) => (
                <li key={p.nombre} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-cacao">
                      <span className="tabular-nums text-cacao-mute">{i + 1}. </span>
                      {p.nombre}
                    </p>
                    <p className="text-xs text-cacao-soft">
                      {fmtCant(p.cantidad)} {palabraPlato(p.cantidad)} · {fmtUsd(p.ventasUsd)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {p.margenUnitarioUsd == null ? (
                      <span className="text-xs text-cacao-mute">Sin costo</span>
                    ) : (
                      <>
                        <p className={`text-sm tabular-nums ${tonoMonto(p.margenUnitarioUsd)}`}>
                          {fmtUsd(p.margenUnitarioUsd)} c/u
                        </p>
                        <p className="text-[11px] tabular-nums text-cacao-soft">
                          {p.margenPct == null ? "sin precio de venta" : fmtPct(p.margenPct)} · {fmtUsd(p.margenUsd ?? 0)} en la semana
                        </p>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
        <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Food cost y compras</h2>
        {!r.hayVentas && !r.hayCompras ? (
          <p className="mt-3 font-serif text-sm italic text-cacao-soft">
            Cuando haya ventas o compras, aquí comparas el costo de las recetas con lo que compraste.
          </p>
        ) : (
          <div className="mt-2">
            <FilaDinero
              label="Food cost teórico"
              detalle="Costo de la receta por porción, multiplicado por lo vendido."
              usd={r.foodCostUsd}
              pct={r.foodCostPct}
            />
            <FilaDinero
              label="Compras de la semana"
              detalle={
                r.fleteUsd > 0.005
                  ? `Insumos ${fmtUsd(r.comprasInsumosUsd)} · flete ${fmtUsd(r.fleteUsd)}.`
                  : "Lo registrado en Compras de Cocina, en dólares."
              }
              usd={r.comprasUsd}
              pct={r.comprasPct}
            />
            {r.explicacion && <p className="mt-3 text-sm leading-relaxed text-cacao-soft">{r.explicacion}</p>}
            {r.platosSinCosto > 0 && (
              <p className="mt-2 text-[11px] text-cacao-mute">
                {fmtCant(r.platosSinCosto)} {palabraPlato(r.platosSinCosto)} sin costo de receta no entran en el food cost.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
        <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Pérdidas</h2>
        <p className={`mt-1 font-cinzel text-2xl tabular-nums ${r.perdidasUsd > 0.005 ? "text-terracotta" : "text-cacao"}`}>
          {fmtUsd(r.perdidasUsd)}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-cacao-mute">
          Lo que diste de baja en insumos (pérdida, mal estado, merma o vencimiento). El conteo de cámara y la merma de un plato ya hecho se ven en Cocina, no aquí.
        </p>
        {r.perdidasUsd <= 0.005 && r.perdidasSinPrecio === 0 && (
          <p className="mt-2 font-serif text-sm italic text-cacao-soft">No diste de baja insumos esta semana.</p>
        )}
        {r.perdidasSinPrecio > 0 && (
          <p className="mt-2 text-[11px] text-cacao-soft">
            {r.perdidasSinPrecio} {r.perdidasSinPrecio === 1 ? "baja" : "bajas"} sin precio: no entran en el total.
          </p>
        )}
      </section>
    </div>
  );
}

function Tarjeta({
  titulo,
  valor,
  sub,
  extra,
  tono,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  extra?: ReactNode;
  tono?: "bien" | "alerta";
}) {
  const color = tono === "bien" ? "text-[#2F4A1F]" : tono === "alerta" ? "text-[#8A5A12]" : "text-cacao";
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil">
      <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">{titulo}</h2>
      <p className={`mt-1 font-cinzel text-xl tabular-nums sm:text-2xl ${color}`}>{valor}</p>
      {sub && <p className="mt-0.5 text-xs tabular-nums text-cacao-soft">{sub}</p>}
      {extra && <div className="mt-2">{extra}</div>}
    </section>
  );
}

function puntoEstado(estado: DiaVista["estado"]): string {
  if (estado === "cuadra") return "bg-[#2F4A1F]";
  if (estado === "sobra") return "bg-[#C4892A]";
  if (estado === "falta") return "bg-[#7A2419]";
  if (estado === "futuro") return "bg-transparent";
  return "bg-cacao-mute";
}

function GraficoDias({ dias }: { dias: DiaVista[] }) {
  const max = Math.max(...dias.map((d) => d.ventasUsd), 1);
  if (dias.length === 0) return null;
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
      <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Ventas por día</h2>
      <div className="mt-3 flex items-end gap-1.5 sm:gap-3">
        {dias.map((d) => {
          const alto = d.ventasUsd > 0 ? Math.max((d.ventasUsd / max) * 100, 8) : 0;
          return (
            <div key={d.fecha} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="h-4 text-[10px] tabular-nums text-cacao-mute">{d.ventasUsd > 0 ? Math.round(d.ventasUsd) : ""}</span>
              <div className="flex h-28 w-full items-end">
                <div
                  className="w-full rounded-t bg-terracotta"
                  style={{ height: `${alto}%`, opacity: d.estado === "futuro" ? 0.25 : 1 }}
                  title={`${d.fecha}: ${fmtUsd(d.ventasUsd)}`}
                />
              </div>
              <span className="text-[10px] uppercase text-cacao-mute">{diaCorto(d.fecha)}</span>
              <span className={`size-1.5 rounded-full ${puntoEstado(d.estado)}`} aria-hidden />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-cacao-mute">
        Lunes a domingo. El punto bajo el día: verde cuadra, ámbar sobra, rojo falta, gris sin cierre.
      </p>
    </section>
  );
}

function CajaDeLaSemana({
  caja,
  aviso,
  onVerCierres,
}: {
  caja: ResumenCajaSemana | null;
  aviso: string | null;
  onVerCierres?: () => void;
}) {
  const vacia = !caja || caja.estado === "vacio";
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Caja de la semana</h2>
        {caja && !vacia && <EstadoCajaPill estado={caja.estado} titulo={caja.titulo} />}
      </div>
      {aviso ? (
        <p className="mt-3 text-sm text-cacao-soft">{aviso}</p>
      ) : vacia ? (
        <div className="mt-3">
          <p className="font-serif italic text-cacao-soft">Esta semana no hay cierres de caja.</p>
          <p className="mt-1 text-sm text-cacao-soft">
            Cuando anotes el efectivo, el pago móvil y el punto, aquí ves lo cobrado y si cuadra con las ventas.
          </p>
        </div>
      ) : caja ? (
        <>
          {caja.cobradoUsd != null && (
            <p className="mt-1 font-cinzel text-2xl tabular-nums text-cacao">{fmtUsd(caja.cobradoUsd)}</p>
          )}
          <p className="mt-1 text-sm leading-relaxed text-cacao-soft">{caja.detalle}</p>
          {caja.porMetodo.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {caja.porMetodo.map((m) => (
                <li key={`${m.metodo}-${m.moneda}`} className="text-sm text-cacao">
                  <span className="text-cacao-mute">{m.label}. </span>
                  <span className="tabular-nums">{m.moneda === "USD" ? fmtUsd(m.monto) : fmtBs(m.monto)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {onVerCierres ? (
          <button type="button" onClick={onVerCierres} className="text-sm text-cacao underline decoration-dotted">
            Ver los cierres
          </button>
        ) : (
          <Link href="/administracion?seccion=cierre" className="text-sm text-cacao underline decoration-dotted">
            Ver los cierres
          </Link>
        )}
        <Link href="/cocina/ventas/cierre" className="text-sm text-cacao underline decoration-dotted">
          Anotar el de hoy
        </Link>
      </div>
    </section>
  );
}

function VacioVentas() {
  return (
    <div className="mt-4 rounded-xl bg-marfil-soft px-3 py-3">
      <p className="font-serif italic text-cacao-soft">Todavía no hay ventas esta semana.</p>
      <p className="mt-1 text-sm text-cacao-soft">
        Anótalas en Cocina y aquí vas a ver el total, en dólares y en bolívares, y si subiste o bajaste frente a la semana pasada.
      </p>
      <Link
        href="/cocina/ventas"
        className="mt-3 inline-flex items-center justify-center rounded-full bg-cacao px-4 py-2 text-sm text-white hover:bg-terracotta"
      >
        Ir a Cocina → Ventas
      </Link>
    </div>
  );
}

function Variacion({
  ratio,
  actual,
  anterior,
  compacto = false,
}: {
  ratio: number | null;
  actual: number;
  anterior: number;
  compacto?: boolean;
}) {
  if (ratio == null) {
    if (compacto) return null;
    const texto = actual <= 0.0005 && anterior <= 0.0005 ? "sin cambio" : "sin semana previa";
    return <span className="text-xs text-cacao-mute">{texto}</span>;
  }
  const sube = ratio > 0;
  const plano = Math.abs(ratio) < 0.0005;
  if (plano) return <span className="text-xs text-cacao-mute">0%</span>;
  const texto = fmtVariacion(ratio);
  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums font-medium ${compacto ? "text-xs" : "text-sm"} ${
        sube ? "text-[#2F4A1F]" : "text-terracotta"
      }`}
      aria-label={sube ? `Subió ${texto}` : `Bajó ${texto}`}
    >
      <span aria-hidden="true">{sube ? "↑" : "↓"}</span>
      {texto}
    </span>
  );
}

function FilaCuenta({ label, val, tenue }: { label: string; val: string; tenue?: boolean }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={tenue ? "text-cacao-soft" : "text-cacao"}>{label}</span>
      <span className={`tabular-nums ${tenue ? "text-cacao-soft" : "text-cacao"}`}>{val}</span>
    </li>
  );
}

function FilaDinero({
  label,
  detalle,
  usd,
  pct,
}: {
  label: string;
  detalle: string;
  usd: number;
  pct: number | null;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-marfil py-3 first:border-t-0">
      <div className="min-w-0">
        <p className="text-sm text-cacao">{label}</p>
        <p className="text-[11px] leading-relaxed text-cacao-mute">{detalle}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-medium tabular-nums text-cacao">{fmtUsd(usd)}</p>
        <p className="text-[11px] tabular-nums text-cacao-mute">{fmtPct(pct)} de las ventas</p>
      </div>
    </div>
  );
}

function tonoMonto(n: number): string {
  if (n > 0.005) return "text-[#2F4A1F]";
  if (n < -0.005) return "text-terracotta";
  return "text-cacao";
}

function fmtCant(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const redondo = Math.abs(n - Math.round(n)) < 0.05;
  return redondo
    ? Math.round(n).toLocaleString("es-VE")
    : n.toLocaleString("es-VE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function palabraPlato(n: number): string {
  return Math.abs(n - 1) < 0.05 ? "plato" : "platos";
}

function fmtPct(ratio: number | null): string {
  if (ratio == null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(1)}%`;
}

function fmtVariacion(ratio: number): string {
  const pct = Math.abs(ratio * 100);
  const texto = pct >= 10 ? pct.toFixed(0) : pct.toFixed(1);
  return `${texto}%`;
}

function fmtFecha(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${Number(d)}/${m}/${y}`;
}
