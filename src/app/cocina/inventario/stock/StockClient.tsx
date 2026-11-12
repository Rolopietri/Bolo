"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarIcon, CartIcon, ChevronIcon, SearchIcon } from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
import { EstadoVacioCocina } from "@/components/EstadoVacioCocina";
import { listInsumos, getTasaBcvActual } from "@/lib/data/cocina";
import { listRecetas } from "@/lib/data/recetas";
import { listMovimientosSalida, listVentasParaStock } from "@/lib/data/stock-liviano";
import { extractError } from "@/lib/data/error";
import { calcularConsumoReceta } from "@/lib/data/ventas";
import {
  DIAS_SE_AGOTA_PRONTO,
  MIN_DIAS_CON_CONSUMO,
  VENTANA_CONSUMO_DIAS,
  armarStock,
  categoriasDe,
  categoriaVisible,
  fechaISOEnCaracas,
  filtrarLineas,
  inicioVentana,
  losQueHayQuePedir,
  losQueSeAgotanPronto,
  ordenarLineas,
  resumirConsumo,
  salidaDesdeMovimiento,
  salidasDeVenta,
  tasaParaValorarStock,
  textoDias,
  valorPorGrupo,
  type EstadoStock,
  type FiltroEstadoStock,
  type GrupoValorStock,
  type LineaStock,
  type OrdenStock,
  type OrigenTasaStock,
  type PreferenciaTasa,
  type ResumenStock,
  type SalidaStock,
} from "@/lib/stock-liviano";
import { displayCantidad, precioLegible } from "@/lib/units";
import {
  CLAVE_TASA_HOY,
  CLAVE_TASA_PERSONALIZADA,
  bsDesdeUsd,
  fechaTasaLegible,
  formatoMonto,
  formatoTasa,
  tasaPersonalizada,
} from "../../_tasa";

type Carga = {
  lineas: LineaStock[];
  resumen: ResumenStock;
  huboInsumos: boolean;
  tasa: { bsPorUsd: number; origen: OrigenTasaStock; fecha: string } | null;
};

type TasaStock = Carga["tasa"];

const ESTADOS: { id: FiltroEstadoStock; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pronto", label: "Se acaba pronto" },
  { id: "agotado", label: "Agotado" },
  { id: "bajo", label: "Bajo mínimo" },
  { id: "ok", label: "En orden" },
  { id: "sin_minimo", label: "Sin mínimo" },
];

const ORDENES: { id: OrdenStock; label: string }[] = [
  { id: "pronto", label: "Se acaba pronto" },
  { id: "valor", label: "Mayor valor" },
  { id: "nombre", label: "Nombre" },
  { id: "estado", label: "Estado" },
];

const ORIGEN_TASA: Record<OrigenTasaStock, string> = {
  bcv: "dólar BCV",
  promedio: "promedio",
  personalizada: "tu tasa",
};

/** Cuántos insumos se ven antes de pedir "Ver más" en la lista de abajo. */
const TOPE_LISTA = 5;

function dinero(n: number): string {
  return `$${formatoMonto(n)}`;
}

function textoPorcentaje(n: number): string {
  if (n > 0 && n < 1) return "< 1%";
  return `${Math.round(n).toLocaleString("es-VE")}%`;
}

/** Costo de una unidad, en la unidad que se lee (kg, L…), no el total del stock. */
function textoCostoUnidad(costo: number | null, unidadBase: string): string | null {
  if (costo == null || !(costo > 0)) return null;
  const p = precioLegible(costo, unidadBase);
  const monto =
    p.precio < 0.01
      ? p.precio.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : formatoMonto(p.precio);
  const unidad = p.unidad.trim();
  return unidad ? `$${monto} / ${unidad}` : `$${monto}`;
}

function mensajeCarga(e: unknown): string {
  const bruto = extractError(e, "Error cargando el stock");
  if (/url and api key are required|supabaseurl is required|supabasekey is required/i.test(bruto)) {
    return "Falta la conexión con la base de datos.";
  }
  return bruto;
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

async function cargarStock(): Promise<Carga> {
  const hoy = fechaISOEnCaracas();
  const desde = inicioVentana(hoy);
  const [insumos, recetas, tasa, ventas, movimientos] = await Promise.all([
    listInsumos(),
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
  const { lineas, resumen } = armarStock(
    insumos.map((i) => ({
      id: i.id,
      nombre: i.nombre,
      activo: i.activo,
      categoria: categoriaVisible(i.categoriaCompra),
      unidadBase: i.unidadBase,
      stockTotal: i.stockTotal,
      stockComprometido: i.stockComprometido,
      stockMinimo: i.stockMinimo,
      precioBaseUsd: i.precioBaseUsd,
      precioCompraUsd: i.precioCompraUsd,
      cantidadPorCompra: i.cantidadPorCompra,
    })),
    resumirConsumo(salidas, desde, hoy),
  );
  const prefs = preferenciaTasa();
  const elegida = tasaParaValorarStock({
    preferida: prefs.preferida,
    usdBs: tasa && tasa.usdBs > 0 ? tasa.usdBs : null,
    paralelaBs: tasa?.paralelaBs ?? null,
    personalizada: prefs.personalizada,
  });
  return {
    lineas,
    resumen,
    huboInsumos: insumos.length > 0,
    tasa: elegida ? { ...elegida, fecha: tasa?.fecha ?? "" } : null,
  };
}

export function StockClient() {
  const [carga, setCarga] = useState<Carga | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [texto, setTexto] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [estado, setEstado] = useState<FiltroEstadoStock>("todos");
  const [orden, setOrden] = useState<OrdenStock>("pronto");
  const [verValor, setVerValor] = useState(false);
  const [verPronto, setVerPronto] = useState(false);
  const [verPedir, setVerPedir] = useState(false);
  const [grupoAbierto, setGrupoAbierto] = useState<string | null>(null);
  const [listaAbierta, setListaAbierta] = useState(false);
  // Estado, categoría y orden viven plegados en "Filtros" para no llenar la
  // pantalla de pastillas; al cerrarlos queda solo el resumen de lo activo.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const filtrosActivos = [
    estado !== "todos" && {
      id: "estado",
      label: ESTADOS.find((e) => e.id === estado)?.label ?? estado,
      quitar: () => setEstado("todos"),
    },
    categoria !== "todas" && {
      id: "categoria",
      label: categoria === "__sin__" ? "Sin categoría" : categoria,
      quitar: () => setCategoria("todas"),
    },
    orden !== "pronto" && {
      id: "orden",
      label: `Orden: ${ORDENES.find((o) => o.id === orden)?.label ?? orden}`,
      quitar: () => setOrden("pronto"),
    },
  ].filter((f): f is { id: string; label: string; quitar: () => void } => Boolean(f));

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const data = await cargarStock();
        if (!cancelado) setCarga(data);
      } catch (e) {
        if (!cancelado) setError(mensajeCarga(e));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [intento]);

  function reintentar() {
    setLoading(true);
    setError(null);
    setIntento((n) => n + 1);
  }

  const lineas = useMemo(() => carga?.lineas ?? [], [carga]);
  const categorias = useMemo(() => categoriasDe(lineas), [lineas]);
  const visibles = useMemo(
    () => ordenarLineas(filtrarLineas(lineas, { texto, categoria, estado }), orden),
    [lineas, texto, categoria, estado, orden],
  );
  const pronto = useMemo(() => losQueSeAgotanPronto(lineas), [lineas]);
  const paraPedirLineas = useMemo(() => losQueHayQuePedir(lineas), [lineas]);
  const gruposValor = useMemo(() => valorPorGrupo(lineas), [lineas]);
  const mostradas = listaAbierta ? visibles : visibles.slice(0, TOPE_LISTA);
  const hayMasLista = visibles.length > TOPE_LISTA;

  if (loading && !carga) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center text-cacao-soft ring-1 ring-marfil">
        Cargando el stock…
      </div>
    );
  }

  if (error && !carga) {
    return <ErrorCarga que="el stock" detalle={error} onReintentar={reintentar} />;
  }

  if (!carga) return null;

  if (!carga.huboInsumos) {
    return (
      <EstadoVacioCocina
        titulo="Todavía no hay insumos"
        beneficio="Cuando cargues ingredientes con stock y costo, aquí ves cuánto vale la cámara y qué se acaba pronto."
        cta="Ir a insumos"
        href="/cocina/insumos"
        onDemo={reintentar}
      />
    );
  }

  if (carga.lineas.length === 0) {
    return (
      <div className="rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-marfil">
        <h2 className="font-cinzel text-xl uppercase tracking-[0.08em] text-cacao">No hay insumos activos</h2>
        <p className="mx-auto mt-3 max-w-md font-serif italic text-cacao-soft">
          Activa un insumo para ver su stock y su valor.
        </p>
        <Link
          href="/cocina/insumos"
          className="mt-6 inline-flex rounded-xl bg-cacao px-5 py-2.5 font-medium text-white hover:bg-terracotta"
        >
          Ir a insumos
        </Link>
      </div>
    );
  }

  const { resumen, tasa } = carga;
  const paraPedir = resumen.agotados + resumen.bajos;
  const bs = tasa ? bsDesdeUsd(resumen.valorUsd, tasa.bsPorUsd) : null;
  const faltaConsumo = resumen.conConsumo === 0 && lineas.some((l) => l.libre > 0);

  return (
    <div className="space-y-6">
      {error && <ErrorCarga que="el stock" detalle={error} onReintentar={reintentar} desactualizado />}

      <section className="grid grid-cols-1 items-start gap-3 sm:grid-cols-3">
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
          <p className="mt-2 text-xs text-cacao-soft">
            Suma el stock físico por su costo. La cantidad de cada fila es lo libre, sin lo reservado.
          </p>
          {resumen.sinCosto > 0 && (
            <p className="mt-2 text-sm text-cacao">
              {resumen.sinCosto.toLocaleString("es-VE")}{" "}
              {resumen.sinCosto === 1 ? "insumo con stock sin costo" : "insumos con stock sin costo"}.{" "}
              <Link href="/cocina/insumos" className="underline hover:text-terracotta">
                Ponerles costo
              </Link>
            </p>
          )}
          <BotonVerMas abierto={verValor} controls="stock-valor" suave={false} onClick={() => setVerValor((v) => !v)} />
          {verValor && (
            <div id="stock-valor" className="mt-4 border-t border-marfil pt-4">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao">Dónde está el dinero</h2>
              <div className="mt-3">
                <RepartoValor
                  grupos={gruposValor}
                  tasa={tasa}
                  sinCosto={resumen.sinCosto}
                  grupoAbierto={grupoAbierto}
                  onGrupo={(g) => setGrupoAbierto((actual) => (actual === g ? null : g))}
                />
              </div>
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-2xl bg-[#FFF6D8] p-5 ring-1 ring-[#E4D08A]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-cacao">
            <span className="size-1.5 rounded-full bg-amber-600" aria-hidden />
            Se acaba pronto
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{resumen.seAgotanPronto.toLocaleString("es-VE")}</p>
          <p className="mt-2 text-sm text-cacao-soft">
            En {DIAS_SE_AGOTA_PRONTO} días o menos, según el consumo reciente.
          </p>
          <BotonVerMas abierto={verPronto} controls="stock-pronto" suave onClick={() => setVerPronto((v) => !v)} />
          {verPronto && (
            <div id="stock-pronto" className="mt-4 border-t border-[#E4D08A] pt-4">
              {pronto.length === 0 ? (
                <p className="text-sm text-cacao">
                  Ningún insumo se acaba en los próximos {DIAS_SE_AGOTA_PRONTO} días.
                </p>
              ) : (
                <ListaAlerta lineas={pronto} />
              )}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-2xl bg-[#FDECEC] p-5 ring-1 ring-[#F0C4C4]">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-cacao">
            <span className="size-1.5 rounded-full bg-red-600" aria-hidden />
            Para pedir
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{paraPedir.toLocaleString("es-VE")}</p>
          <p className="mt-2 text-sm text-cacao-soft">
            {resumen.agotados === 1
              ? "1 agotado"
              : `${resumen.agotados.toLocaleString("es-VE")} agotados`}
            {" · "}
            {resumen.bajos === 1 ? "1 bajo el mínimo" : `${resumen.bajos.toLocaleString("es-VE")} bajo el mínimo`}.
            La misma cuenta que Hoy.
          </p>
          <BotonVerMas abierto={verPedir} controls="stock-pedir" suave onClick={() => setVerPedir((v) => !v)} />
          {verPedir && (
            <div id="stock-pedir" className="mt-4 border-t border-[#F0C4C4] pt-4">
              {paraPedirLineas.length === 0 ? (
                <p className="text-sm text-cacao">No hay insumos agotados ni bajo el mínimo.</p>
              ) : (
                <ListaAlerta lineas={paraPedirLineas} />
              )}
            </div>
          )}
        </article>
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/cocina/pedido"
          className="inline-flex items-center gap-2 rounded-xl bg-cacao px-5 py-2.5 text-sm font-medium text-white hover:bg-terracotta"
        >
          <CartIcon className="size-4" />
          Qué pedir
        </Link>
        <Link
          href="/cocina/insumos?vista=uso"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
        >
          <CalendarIcon className="size-4" />
          Uso diario
        </Link>
        <Link
          href="/cocina/insumos"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
        >
          Insumos
        </Link>
      </div>

      {resumen.sinCosto > 0 && resumen.valorUsd === 0 && (
        <p className="rounded-2xl bg-white px-5 py-4 text-sm text-cacao ring-1 ring-marfil">
          Hay stock, pero ningún insumo tiene costo, así que el valor queda en cero.{" "}
          <Link href="/cocina/insumos" className="underline hover:text-terracotta">
            Carga el precio en la ficha
          </Link>
          .
        </p>
      )}

      {faltaConsumo && (
        <p className="rounded-2xl bg-white px-5 py-4 text-sm text-cacao ring-1 ring-marfil">
          Sin datos de consumo en los últimos {VENTANA_CONSUMO_DIAS} días. Los días hasta agotarse
          aparecen cuando un insumo sale al menos {MIN_DIAS_CON_CONSUMO} días distintos.{" "}
          <Link href="/cocina/ventas" className="underline hover:text-terracotta">
            Registrar ventas
          </Link>
          .
        </p>
      )}

      {resumen.sinMinimo > 0 && (
        <p className="text-sm text-cacao-soft">
          {resumen.sinMinimo.toLocaleString("es-VE")}{" "}
          {resumen.sinMinimo === 1 ? "insumo sin mínimo" : "insumos sin mínimo"}. No entran en Qué pedir hasta que
          les pongas uno.{" "}
          <Link href="/cocina/insumos" className="underline hover:text-terracotta">
            Definir mínimos
          </Link>
          .
        </p>
      )}

      <div className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao">Insumos</h2>
          {visibles.length > 0 && (
            <p className="text-xs text-cacao-soft">
              {listaAbierta || !hayMasLista
                ? `${visibles.length.toLocaleString("es-VE")} ${visibles.length === 1 ? "insumo" : "insumos"}`
                : `Mostrando ${mostradas.length.toLocaleString("es-VE")} de ${visibles.length.toLocaleString("es-VE")}`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-marfil">
            <SearchIcon className="size-4 text-cacao-mute" />
            <input
              type="search"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Buscar insumo"
              aria-label="Buscar insumo"
              className="w-full bg-transparent text-sm text-cacao outline-none placeholder:text-cacao-mute"
            />
          </label>
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            aria-expanded={filtrosAbiertos}
            className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs uppercase tracking-widest ring-1 ${
              filtrosAbiertos || filtrosActivos.length > 0
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Filtros
            {filtrosActivos.length > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 text-[10px] tracking-normal">
                {filtrosActivos.length}
              </span>
            )}
            <ChevronIcon className={`size-3.5 ${filtrosAbiertos ? "-rotate-90" : "rotate-90"}`} />
          </button>
        </div>

        {!filtrosAbiertos && filtrosActivos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filtrosActivos.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={f.quitar}
                className="inline-flex items-center gap-1 rounded-full bg-marfil-soft px-3 py-1 text-xs text-cacao ring-1 ring-marfil hover:ring-terracotta/40"
                title="Quitar este filtro"
              >
                {f.label}
                <span aria-hidden="true" className="text-cacao-mute">✕</span>
              </button>
            ))}
          </div>
        )}

        {filtrosAbiertos && (
          <div className="rounded-xl bg-marfil-soft/60 p-3 ring-1 ring-marfil">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Estado
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as FiltroEstadoStock)}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil"
                >
                  {ESTADOS.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Categoría
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  disabled={categorias.length <= 1}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil disabled:opacity-60"
                >
                  <option value="todas">Todas</option>
                  {categorias.map((c) => (
                    <option key={c} value={c === "Sin categoría" ? "__sin__" : c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Ordenar por
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as OrdenStock)}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil"
                >
                  {ORDENES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-cacao-mute">
                Los días usan las ventas y salidas de los últimos {VENTANA_CONSUMO_DIAS} días.
              </p>
              {filtrosActivos.length > 0 && (
                <button
                  type="button"
                  onClick={() => filtrosActivos.forEach((f) => f.quitar())}
                  className="text-[11px] uppercase tracking-widest text-terracotta hover:underline"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-cacao-soft ring-1 ring-marfil">
          Ningún insumo coincide con estos filtros.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          <ul className="divide-y divide-marfil">
            {mostradas.map((l) => (
              <Fila key={l.id} linea={l} />
            ))}
          </ul>
          {hayMasLista && (
            <button
              type="button"
              onClick={() => setListaAbierta((v) => !v)}
              aria-expanded={listaAbierta}
              className="flex w-full items-center justify-center gap-1 border-t border-marfil px-4 py-3 text-sm font-semibold text-cacao hover:bg-marfil-soft"
            >
              {listaAbierta
                ? "Ver menos"
                : `Ver más (${(visibles.length - TOPE_LISTA).toLocaleString("es-VE")})`}
              <ChevronIcon className={`size-4 ${listaAbierta ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BotonVerMas({
  abierto,
  onClick,
  controls,
  suave,
}: {
  abierto: boolean;
  onClick: () => void;
  controls: string;
  suave: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={abierto}
      aria-controls={controls}
      className={`mt-4 flex w-full items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-semibold text-cacao ring-1 ${
        suave ? "bg-white/85 ring-black/10 hover:bg-white" : "bg-marfil-soft ring-marfil hover:bg-marfil"
      }`}
    >
      {abierto ? "Ver menos" : "Ver más"}
      <ChevronIcon className={`size-4 ${abierto ? "-rotate-90" : "rotate-90"}`} />
    </button>
  );
}

function ListaAlerta({ lineas }: { lineas: LineaStock[] }) {
  return (
    <ul className="divide-y divide-marfil rounded-xl bg-white px-4 ring-1 ring-black/5">
      {lineas.map((l) => (
        <li key={l.id} className="py-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium break-words text-cacao">{l.nombre}</p>
              <p className="text-xs text-cacao-soft">{l.categoria}</p>
            </div>
            <Pastilla estado={l.estado} />
          </div>
          <p className="mt-1 text-sm text-cacao">
            Libre {displayCantidad(l.libre, l.unidadBase)}
            {" · "}
            {l.minimo != null && l.minimo > 0 ? `mín. ${displayCantidad(l.minimo, l.unidadBase)}` : "sin mínimo"}
          </p>
          <p className="text-sm text-cacao-soft">{textoDias(l.dias)}</p>
          <div className="mt-1.5 flex flex-wrap gap-4 text-xs uppercase tracking-widest">
            <Link href={`/cocina/insumos?insumo=${l.id}`} className="font-semibold text-terracotta hover:underline">
              Ficha
            </Link>
            <Link href="/cocina/pedido" className="font-semibold text-terracotta hover:underline">
              Qué pedir
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function RepartoValor({
  grupos,
  tasa,
  sinCosto,
  grupoAbierto,
  onGrupo,
}: {
  grupos: GrupoValorStock[];
  tasa: TasaStock;
  sinCosto: number;
  grupoAbierto: string | null;
  onGrupo: (grupo: string) => void;
}) {
  if (grupos.length === 0) {
    return (
      <p className="text-sm text-cacao">
        Ningún insumo con stock tiene costo, así que todavía no hay un reparto.
      </p>
    );
  }
  return (
    <div>
      <p className="mb-2 text-sm text-cacao-soft">Toca una categoría para ver sus insumos. De mayor a menor.</p>
      {!tasa && (
        <p className="mb-2 text-sm text-cacao">Sin tasa cargada: los montos quedan en dólares.</p>
      )}
      <ul className="divide-y divide-marfil rounded-xl bg-white px-4 ring-1 ring-black/5">
        {grupos.map((g) => {
          const abierto = grupoAbierto === g.grupo;
          const bs = tasa ? bsDesdeUsd(g.valorUsd, tasa.bsPorUsd) : null;
          return (
            <li key={g.grupo} className="py-3">
              <button
                type="button"
                onClick={() => onGrupo(g.grupo)}
                aria-expanded={abierto}
                className="w-full text-left"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="font-medium text-cacao">{g.grupo}</span>
                  <span className="shrink-0 text-right text-sm text-cacao">
                    {dinero(g.valorUsd)} · {textoPorcentaje(g.porcentaje)}
                  </span>
                </span>
                {bs != null && (
                  <span className="mt-0.5 block text-xs text-cacao-soft">Bs {formatoMonto(bs)}</span>
                )}
                <span className="mt-2 flex items-center gap-2">
                  <span className="block h-2 flex-1 overflow-hidden rounded-full bg-marfil">
                    <span
                      className="block h-full rounded-full bg-terracotta"
                      style={{
                        width: `${Math.min(100, Math.max(g.porcentaje, 0))}%`,
                        minWidth: g.porcentaje > 0 ? "0.4rem" : 0,
                      }}
                    />
                  </span>
                  <ChevronIcon className={`size-4 text-cacao-soft ${abierto ? "-rotate-90" : "rotate-90"}`} />
                </span>
              </button>
              {abierto && (
                <ul className="mt-3 space-y-2 border-l-2 border-marfil pl-3">
                  {g.lineas.map((l) => {
                    const costo = textoCostoUnidad(l.costoUnitarioUsd, l.unidadBase);
                    return (
                      <li key={l.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="min-w-0 break-words text-sm font-medium text-cacao">{l.nombre}</span>
                          <span className="shrink-0 text-sm text-cacao">
                            {l.valorUsd == null ? "Sin costo" : dinero(l.valorUsd)}
                          </span>
                        </div>
                        <p className="text-[11px] text-cacao-soft">
                          Libre {displayCantidad(l.libre, l.unidadBase)}
                          {costo ? ` · ${costo}` : ""}
                        </p>
                        <Link
                          href={`/cocina/insumos?insumo=${l.id}`}
                          className="text-xs font-semibold uppercase tracking-widest text-terracotta hover:underline"
                        >
                          Ficha
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {sinCosto > 0 && (
        <p className="mt-3 text-xs text-cacao-soft">
          {sinCosto.toLocaleString("es-VE")}{" "}
          {sinCosto === 1
            ? "insumo con stock no entra en la cuenta porque no tiene costo."
            : "insumos con stock no entran en la cuenta porque no tienen costo."}
        </p>
      )}
    </div>
  );
}

function Fila({ linea: l }: { linea: LineaStock }) {
  const costo = textoCostoUnidad(l.costoUnitarioUsd, l.unidadBase);
  return (
    <li id={`stock-${l.id}`} className="scroll-mt-24 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words text-cacao">{l.nombre}</p>
          <p className="text-xs text-cacao-soft">{l.categoria}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pastilla estado={l.estado} />
          {l.seAgotaPronto && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-900 ring-1 ring-amber-200">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Se acaba pronto
            </span>
          )}
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">Libre</dt>
          <dd className="text-cacao">{displayCantidad(l.libre, l.unidadBase)}</dd>
          {l.comprometido > 0 && (
            <dd className="text-[11px] text-cacao-soft">
              {displayCantidad(l.comprometido, l.unidadBase)} reservados
            </dd>
          )}
          {l.minimo != null && l.minimo > 0 && (
            <dd className="text-[11px] text-cacao-soft">mín. {displayCantidad(l.minimo, l.unidadBase)}</dd>
          )}
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">Valor en stock</dt>
          <dd className="text-cacao">
            {l.valorUsd == null ? (
              <Link href={`/cocina/insumos?insumo=${l.id}`} className="underline hover:text-terracotta">
                Sin costo
              </Link>
            ) : (
              dinero(l.valorUsd)
            )}
          </dd>
          {costo && <dd className="text-[11px] text-cacao-soft">{costo}</dd>}
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">Se acaba</dt>
          <dd className={l.dias.estado === "sin_datos" ? "text-cacao-soft" : "text-cacao"}>{textoDias(l.dias)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-4 text-xs uppercase tracking-widest">
        <Link href={`/cocina/insumos?insumo=${l.id}`} className="text-terracotta hover:underline">
          Ficha
        </Link>
        {(l.estado === "agotado" || l.estado === "bajo") && (
          <Link href="/cocina/pedido" className="text-terracotta hover:underline">
            Qué pedir
          </Link>
        )}
        <Link href={`/cocina/insumos?vista=uso&insumo=${l.id}`} className="text-cacao-soft hover:text-terracotta hover:underline">
          Uso diario
        </Link>
      </div>
    </li>
  );
}

function Pastilla({ estado }: { estado: EstadoStock }) {
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
