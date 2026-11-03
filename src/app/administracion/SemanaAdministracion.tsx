"use client";

// Semana de Administración: de un vistazo, cómo le fue al local.
// Lee ventas (public.ventas), costo de receta, compras y bajas de inventario.
// No escribe nada.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarIcon, ChevronIcon } from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
import { extractError } from "@/lib/data/error";
import { getTasaBcvPorFecha, listComprasRango, listInsumos } from "@/lib/data/cocina";
import { calcularCostoReceta, listRecetas } from "@/lib/data/recetas";
import { listPerdidasRango } from "@/lib/data/stock-movimientos";
import { listVentasRango } from "@/lib/data/ventas";
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

export function SemanaAdministracion() {
  const [lunes, setLunes] = useState(() => lunesSemanaActual());
  const [resumen, setResumen] = useState<ResumenSemana | null>(null);
  const [tasa, setTasa] = useState<TasaVista | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  const semana = semanaDesdeLunes(lunes);
  const tope = lunesSemanaActual();
  const esActual = lunes >= tope;

  useEffect(() => {
    const esta = semanaDesdeLunes(lunes);
    const previa = semanaDesdeLunes(moverSemana(lunes, -1));
    let cancel = false;
    setCargando(true);
    setError(null);
    (async () => {
      try {
        const [ventas, compras, perdidas, recetas, insumos, tasaBcv] = await Promise.all([
          listVentasRango(previa.desde, esta.hasta),
          listComprasRango(esta.desde, esta.hasta),
          listPerdidasRango(esta.desde, esta.hasta),
          listRecetas(),
          listInsumos(),
          getTasaBcvPorFecha(esta.hasta),
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
        setTasa(tasaBcv && tasaBcv.usdBs > 0 ? { fecha: tasaBcv.fecha, usdBs: tasaBcv.usdBs } : null);
      } catch (e) {
        if (!cancel) {
          setResumen(null);
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
          onReintentar={() => setIntento((n) => n + 1)}
          reintentando={cargando}
        />
      )}

      {cargando ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center text-cacao-soft">
          Cargando la semana…
        </div>
      ) : resumen ? (
        <VistaSemana resumen={resumen} tasa={tasa} />
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

function VistaSemana({ resumen, tasa }: { resumen: ResumenSemana; tasa: TasaVista | null }) {
  const r = resumen;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Ventas</h2>
              <p className="mt-1 font-cinzel text-2xl tabular-nums text-cacao sm:text-3xl">{fmtUsd(r.ventasUsd)}</p>
              <p className="mt-0.5 text-sm tabular-nums text-cacao-soft">
                {tasa ? fmtBs(r.ventasUsd * tasa.usdBs) : "Sin tasa BCV para mostrar bolívares"}
              </p>
            </div>
            <Variacion ratio={r.variacionVentas} actual={r.ventasUsd} anterior={r.ventasAnteriorUsd} />
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-cacao">
            <span>
              {fmtCant(r.platos)} {palabraPlato(r.platos)}
            </span>
            <Variacion ratio={r.variacionPlatos} actual={r.platos} anterior={r.platosAnterior} compacto />
          </p>
          <p className="mt-1 text-xs text-cacao-mute">
            Semana anterior: {fmtUsd(r.ventasAnteriorUsd)} · {fmtCant(r.platosAnterior)} {palabraPlato(r.platosAnterior)}
          </p>
          {tasa && (
            <p className="mt-2 text-[11px] text-cacao-mute">
              BCV del {fmtFecha(tasa.fecha)}: {fmtBs(tasa.usdBs)} por $1
            </p>
          )}
          {!r.hayVentas && <VacioVentas />}
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-marfil sm:p-5">
          <h2 className="text-[10px] uppercase tracking-widest text-cacao-mute">Utilidad estimada</h2>
          <p className={`mt-1 font-cinzel text-2xl tabular-nums sm:text-3xl ${tonoMonto(r.utilidadUsd)}`}>
            {fmtUsd(r.utilidadUsd)}
          </p>
          {tasa && (
            <p className="mt-0.5 text-sm tabular-nums text-cacao-soft">{fmtBs(r.utilidadUsd * tasa.usdBs)}</p>
          )}
          <ul className="mt-3 space-y-1 text-sm">
            <FilaCuenta label="Ventas" val={fmtUsd(r.ventasUsd)} />
            <FilaCuenta label="− Food cost teórico" val={fmtUsd(r.foodCostUsd)} tenue />
            <FilaCuenta label="− Pérdidas" val={fmtUsd(r.perdidasUsd)} tenue />
            <li className="flex items-baseline justify-between gap-3 border-t border-marfil pt-1">
              <span className="font-medium text-cacao">Utilidad estimada</span>
              <span className={`tabular-nums font-medium ${tonoMonto(r.utilidadUsd)}`}>{fmtUsd(r.utilidadUsd)}</span>
            </li>
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-cacao-mute">
            Todavía no incluye gastos fijos (alquiler, nómina, servicios). Esos entran después.
          </p>
          {r.platosSinCosto > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-cacao-soft">
              Faltó el costo de {fmtCant(r.platosSinCosto)} {palabraPlato(r.platosSinCosto)} ({fmtUsd(r.ventasSinCostoUsd)} de ventas). Esos no restan, así que la utilidad puede verse más alta.
            </p>
          )}
        </section>
      </div>

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
    const texto = actual <= 0.0005 && anterior <= 0.0005 ? "sin cambio" : "sin base";
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
