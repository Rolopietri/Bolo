"use client";

// "¿Cómo estoy?": el tablero de arriba de Inventario. Tres datos —valor en
// cámara, se acaba pronto y para pedir— y nada más. Sus "Ver" no abren otra
// lista: filtran la lista de insumos de abajo, para que cada insumo aparezca
// una sola vez en la pantalla.

import Link from "next/link";
import type { Insumo } from "@/lib/types";
import { getTasaBcvActual } from "@/lib/data/cocina";
import { listRecetas } from "@/lib/data/recetas";
import { listMovimientosSalida, listVentasParaStock } from "@/lib/data/stock-liviano";
import { calcularConsumoReceta } from "@/lib/data/ventas";
import {
  DIAS_SE_AGOTA_PRONTO,
  MIN_DIAS_CON_CONSUMO,
  VENTANA_CONSUMO_DIAS,
  fechaISOEnCaracas,
  inicioVentana,
  resumirConsumo,
  salidaDesdeMovimiento,
  salidasDeVenta,
  tasaParaValorarStock,
  type ConsumoInsumo,
  type EstadoStock,
  type GrupoValorStock,
  type OrigenTasaStock,
  type PreferenciaTasa,
  type ResumenStock,
  type SalidaStock,
} from "@/lib/stock-liviano";
import { CartIcon, ChevronIcon } from "@/components/icons";
import {
  CLAVE_TASA_HOY,
  CLAVE_TASA_PERSONALIZADA,
  bsDesdeUsd,
  fechaTasaLegible,
  formatoMonto,
  formatoTasa,
  tasaPersonalizada,
} from "../_tasa";

export type TasaInventario = { bsPorUsd: number; origen: OrigenTasaStock; fecha: string } | null;

const ORIGEN_TASA: Record<OrigenTasaStock, string> = {
  bcv: "dólar BCV",
  promedio: "promedio",
  personalizada: "tu tasa",
};

export function dinero(n: number): string {
  return `$${formatoMonto(n)}`;
}

function textoPorcentaje(n: number): string {
  if (n > 0 && n < 1) return "< 1%";
  return `${Math.round(n).toLocaleString("es-VE")}%`;
}

function preferenciaTasa(): { preferida: PreferenciaTasa | null; personalizada: number | null } {
  try {
    const raw = localStorage.getItem(CLAVE_TASA_HOY);
    const preferida: PreferenciaTasa | null =
      raw === "bcv" || raw === "euro" || raw === "promedio" || raw === "usdt" || raw === "personalizada"
        ? raw
        : null;
    return {
      preferida,
      personalizada: tasaPersonalizada(localStorage.getItem(CLAVE_TASA_PERSONALIZADA) ?? ""),
    };
  } catch {
    return { preferida: null, personalizada: null };
  }
}

/**
 * Consumo de los últimos días (ventas expandidas por receta + pérdidas) y la
 * tasa para ver el valor en bolívares. Es lo que convierte el catálogo en
 * "cuánto me dura".
 */
export async function cargarConsumoYTasa(insumos: Insumo[]): Promise<{
  consumo: Map<string, ConsumoInsumo>;
  tasa: TasaInventario;
}> {
  const hoy = fechaISOEnCaracas();
  const desde = inicioVentana(hoy);
  const [recetas, tasa, ventas, movimientos] = await Promise.all([
    listRecetas(),
    getTasaBcvActual().catch(() => null),
    listVentasParaStock(desde, hoy),
    listMovimientosSalida(desde, hoy),
  ]);
  const expandir = (id: string, raciones: number) => calcularConsumoReceta(id, raciones, recetas, insumos);
  const salidas: SalidaStock[] = [];
  for (const v of ventas) salidas.push(...salidasDeVenta(v, expandir));
  for (const m of movimientos) {
    const s = salidaDesdeMovimiento(m);
    if (s) salidas.push(s);
  }
  const prefs = preferenciaTasa();
  const elegida = tasaParaValorarStock({
    preferida: prefs.preferida,
    usdBs: tasa && tasa.usdBs > 0 ? tasa.usdBs : null,
    paralelaBs: tasa?.paralelaBs ?? null,
    personalizada: prefs.personalizada,
  });
  return {
    consumo: resumirConsumo(salidas, desde, hoy),
    tasa: elegida ? { ...elegida, fecha: tasa?.fecha ?? "" } : null,
  };
}

/** Pastilla de estado: el único lugar donde se dice si un insumo está bien. */
export function PastillaEstado({ estado }: { estado: EstadoStock }) {
  const meta = {
    agotado: { label: "Agotado", cls: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
    bajo: { label: "Bajo mínimo", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
    ok: { label: "En orden", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
    sin_minimo: { label: "Sin mínimo", cls: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
  }[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ${meta.cls}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

function BotonVerEnLista({ onClick, suave }: { onClick: () => void; suave: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mt-4 flex w-full items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-cacao ring-1 ${
        suave ? "bg-white/85 ring-black/10 hover:bg-white" : "bg-marfil-soft ring-marfil hover:bg-marfil"
      }`}
    >
      Ver en la lista
      <ChevronIcon className="size-4 rotate-90" />
    </button>
  );
}

export function TableroInventario({
  resumen,
  grupos,
  tasa,
  consumoListo,
  hayStockSinDias,
  verValor,
  onVerValor,
  onFiltrar,
}: {
  resumen: ResumenStock;
  grupos: GrupoValorStock[];
  tasa: TasaInventario;
  /** false mientras se calcula el consumo (los días aún no se conocen). */
  consumoListo: boolean;
  /** Hay insumos con stock pero ninguno con consumo para estimar días. */
  hayStockSinDias: boolean;
  verValor: boolean;
  onVerValor: () => void;
  onFiltrar: (f: { estado?: "pronto" | "pedir"; categoria?: string }) => void;
}) {
  const paraPedir = resumen.agotados + resumen.bajos;
  const bs = tasa ? bsDesdeUsd(resumen.valorUsd, tasa.bsPorUsd) : null;

  return (
    <section aria-label="Cómo estoy" className="space-y-3">
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
        <article className="min-w-0 rounded-2xl bg-white p-5 ring-1 ring-marfil">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-cacao-soft">Valor en cámara</p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{dinero(resumen.valorUsd)}</p>
          {bs != null && tasa ? (
            <p className="mt-2 text-sm text-cacao-soft">
              Bs {formatoMonto(bs)} · {ORIGEN_TASA[tasa.origen]}
              {tasa.origen !== "personalizada" && tasa.fecha ? ` del ${fechaTasaLegible(tasa.fecha)}` : ""}
              {tasa.origen !== "personalizada" ? ` · Bs ${formatoTasa(tasa.bsPorUsd)}` : ""}
            </p>
          ) : (
            <p className="mt-2 text-sm text-cacao-soft">
              Sin tasa para verlo en bolívares.{" "}
              <Link href="/cocina" className="underline hover:text-terracotta">
                La tasa está en Hoy
              </Link>
              .
            </p>
          )}
          {resumen.sinCosto > 0 && (
            <p className="mt-2 text-sm text-cacao">
              {resumen.sinCosto.toLocaleString("es-VE")}{" "}
              {resumen.sinCosto === 1 ? "insumo con stock sin costo" : "insumos con stock sin costo"}: no entran
              en la cuenta.
            </p>
          )}
          <button
            type="button"
            onClick={onVerValor}
            aria-expanded={verValor}
            className="mt-4 flex w-full items-center justify-center gap-1 rounded-xl bg-marfil-soft px-3 py-2 text-sm font-semibold text-cacao ring-1 ring-marfil hover:bg-marfil"
          >
            {verValor ? "Ocultar" : "Dónde está el dinero"}
            <ChevronIcon className={`size-4 ${verValor ? "-rotate-90" : "rotate-90"}`} />
          </button>
          {verValor && (
            <div className="mt-4 border-t border-marfil pt-3">
              {grupos.length === 0 ? (
                <p className="text-sm text-cacao">Ningún insumo con stock tiene costo todavía.</p>
              ) : (
                <ul className="space-y-3">
                  {grupos.map((g) => (
                    <li key={g.grupo}>
                      <button
                        type="button"
                        onClick={() => onFiltrar({ categoria: g.grupo })}
                        className="w-full text-left"
                        title="Ver estos insumos en la lista"
                      >
                        <span className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium text-cacao">{g.grupo}</span>
                          <span className="shrink-0 text-cacao">
                            {dinero(g.valorUsd)} · {textoPorcentaje(g.porcentaje)}
                          </span>
                        </span>
                        <span className="mt-1 block h-2 overflow-hidden rounded-full bg-marfil">
                          <span
                            className="block h-full rounded-full bg-terracotta"
                            style={{
                              width: `${Math.min(100, Math.max(g.porcentaje, 0))}%`,
                              minWidth: g.porcentaje > 0 ? "0.4rem" : 0,
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-2xl bg-[#FFF6D8] p-5 ring-1 ring-[#E4D08A]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-cacao">
            <span className="size-1.5 rounded-full bg-amber-600" aria-hidden />
            Se acaba pronto
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">
            {consumoListo ? resumen.seAgotanPronto.toLocaleString("es-VE") : "…"}
          </p>
          <p className="mt-2 text-sm text-cacao-soft">
            {hayStockSinDias
              ? `Aún sin ventas suficientes: se calcula cuando un insumo sale en ${MIN_DIAS_CON_CONSUMO} días distintos.`
              : `En ${DIAS_SE_AGOTA_PRONTO} días o menos, según las ventas de los últimos ${VENTANA_CONSUMO_DIAS} días.`}
          </p>
          {resumen.seAgotanPronto > 0 && <BotonVerEnLista suave onClick={() => onFiltrar({ estado: "pronto" })} />}
        </article>

        <article className="min-w-0 rounded-2xl bg-[#FDECEC] p-5 ring-1 ring-[#F0C4C4]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-cacao">
            <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
            Para pedir
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{paraPedir.toLocaleString("es-VE")}</p>
          <p className="mt-2 text-sm text-cacao-soft">
            {resumen.agotados === 1 ? "1 agotado" : `${resumen.agotados.toLocaleString("es-VE")} agotados`}
            {" · "}
            {resumen.bajos === 1 ? "1 bajo el mínimo" : `${resumen.bajos.toLocaleString("es-VE")} bajo el mínimo`}
          </p>
          {paraPedir > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onFiltrar({ estado: "pedir" })}
                className="flex items-center justify-center rounded-xl bg-white/85 px-3 py-2 text-sm font-semibold text-cacao ring-1 ring-black/10 hover:bg-white"
              >
                Ver cuáles
              </button>
              <Link
                href="/cocina/pedido"
                className="flex items-center justify-center gap-1.5 rounded-xl bg-cacao px-3 py-2 text-sm font-semibold text-white hover:bg-terracotta"
              >
                <CartIcon className="size-4" />
                Qué pedir
              </Link>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
