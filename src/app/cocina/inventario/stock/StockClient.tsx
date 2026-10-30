"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CartIcon, ClipboardIcon, SearchIcon } from "@/components/icons";
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
  losDeMasValor,
  losQueSeAgotanPronto,
  ordenarLineas,
  resumirConsumo,
  salidaDesdeMovimiento,
  salidasDeVenta,
  tasaParaValorarStock,
  textoDias,
  type EstadoStock,
  type FiltroEstadoStock,
  type LineaStock,
  type OrdenStock,
  type OrigenTasaStock,
  type PreferenciaTasa,
  type ResumenStock,
  type SalidaStock,
} from "@/lib/stock-liviano";
import { displayCantidad } from "@/lib/units";
import { pillClass } from "@/lib/ui";
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

const ESTADOS: { id: FiltroEstadoStock; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "pronto", label: "Se acaba pronto" },
  { id: "agotado", label: "Agotado" },
  { id: "bajo", label: "Bajo mínimo" },
  { id: "ok", label: "OK" },
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

function dinero(n: number): string {
  return `$${formatoMonto(n)}`;
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
  const valiosos = useMemo(() => losDeMasValor(lineas), [lineas]);

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

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl bg-white p-5 ring-1 ring-marfil sm:col-span-1">
          <p className="text-[10px] uppercase tracking-widest text-cacao-mute">Valor en cámara</p>
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
          <p className="mt-2 text-xs text-cacao-mute">
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
        </article>

        <article className="rounded-2xl bg-white p-5 ring-1 ring-marfil">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cacao-mute">
            <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
            Se acaba pronto
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{resumen.seAgotanPronto.toLocaleString("es-VE")}</p>
          <p className="mt-2 text-sm text-cacao-soft">
            En {DIAS_SE_AGOTA_PRONTO} días o menos, según el consumo reciente.
          </p>
        </article>

        <article className="rounded-2xl bg-white p-5 ring-1 ring-marfil">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-cacao-mute">
            <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
            Para pedir
          </p>
          <p className="mt-1 font-cinzel text-3xl text-cacao">{paraPedir.toLocaleString("es-VE")}</p>
          <p className="mt-2 text-sm text-cacao-soft">
            {resumen.agotados.toLocaleString("es-VE")} agotados · {resumen.bajos.toLocaleString("es-VE")} bajo el mínimo.
            La misma cuenta que Hoy.
          </p>
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
          href="/cocina/inventario/conteo"
          className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
        >
          <ClipboardIcon className="size-4" />
          Conteo
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

      {(pronto.length > 0 || valiosos.length > 0) && (
        <section className="grid gap-3 lg:grid-cols-2">
          {pronto.length > 0 && (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-marfil">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao-mute">Se acaba pronto</h2>
              <ul className="mt-3 space-y-2">
                {pronto.slice(0, 5).map((l) => (
                  <li key={l.id}>
                    <a href={`#stock-${l.id}`} className="flex items-baseline justify-between gap-3 hover:text-terracotta">
                      <span className="font-medium text-cacao">{l.nombre}</span>
                      <span className="shrink-0 text-sm text-cacao-soft">{textoDias(l.dias)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {valiosos.length > 0 && (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-marfil">
              <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao-mute">Donde está el dinero</h2>
              <ul className="mt-3 space-y-2">
                {valiosos.map((l) => (
                  <li key={l.id}>
                    <a href={`#stock-${l.id}`} className="flex items-baseline justify-between gap-3 hover:text-terracotta">
                      <span className="font-medium text-cacao">{l.nombre}</span>
                      <span className="shrink-0 text-sm text-cacao-soft">{dinero(l.valorUsd ?? 0)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
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
        <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-marfil">
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
        <div className="flex flex-wrap gap-2" aria-label="Filtrar por estado">
          {ESTADOS.map((e) => (
            <button key={e.id} type="button" onClick={() => setEstado(e.id)} className={pillClass(estado === e.id)}>
              {e.label}
            </button>
          ))}
        </div>
        {categorias.length > 1 && (
          <div className="flex flex-wrap gap-2" aria-label="Filtrar por categoría">
            <button type="button" onClick={() => setCategoria("todas")} className={pillClass(categoria === "todas")}>
              Todas
            </button>
            {categorias.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoria(c === "Sin categoría" ? "__sin__" : c)}
                className={pillClass(categoria === (c === "Sin categoría" ? "__sin__" : c))}
              >
                {c}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-cacao-mute">Orden</span>
          {ORDENES.map((o) => (
            <button key={o.id} type="button" onClick={() => setOrden(o.id)} className={pillClass(orden === o.id)}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-cacao-mute">
          Los días usan las ventas y las salidas (pérdidas y mermas) de los últimos {VENTANA_CONSUMO_DIAS} días.
          Si no hay salida en al menos {MIN_DIAS_CON_CONSUMO} días, no calculamos un promedio.
        </p>
      </div>

      {visibles.length === 0 ? (
        <div className="rounded-2xl bg-white p-8 text-center text-cacao-soft ring-1 ring-marfil">
          Ningún insumo coincide con estos filtros.
        </div>
      ) : (
        <ul className="divide-y divide-marfil overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          {visibles.map((l) => (
            <Fila key={l.id} linea={l} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Fila({ linea: l }: { linea: LineaStock }) {
  return (
    <li id={`stock-${l.id}`} className="scroll-mt-24 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-cacao">{l.nombre}</p>
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
          <dt className="text-[10px] uppercase tracking-widest text-cacao-mute">Libre</dt>
          <dd className="text-cacao">{displayCantidad(l.libre, l.unidadBase)}</dd>
          {l.comprometido > 0 && (
            <dd className="text-[11px] text-cacao-mute">
              {displayCantidad(l.comprometido, l.unidadBase)} reservados
            </dd>
          )}
          {l.minimo != null && l.minimo > 0 && (
            <dd className="text-[11px] text-cacao-mute">mín. {displayCantidad(l.minimo, l.unidadBase)}</dd>
          )}
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-mute">Valor</dt>
          <dd className="text-cacao">
            {l.valorUsd == null ? (
              <Link href={`/cocina/insumos?insumo=${l.id}`} className="underline hover:text-terracotta">
                Sin costo
              </Link>
            ) : (
              dinero(l.valorUsd)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-mute">Se acaba</dt>
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
        <Link href="/cocina/inventario/conteo" className="text-cacao-soft hover:text-terracotta hover:underline">
          Conteo
        </Link>
      </div>
    </li>
  );
}

function Pastilla({ estado }: { estado: EstadoStock }) {
  const meta = {
    agotado: { label: "Agotado", cls: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
    bajo: { label: "Bajo mínimo", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
    ok: { label: "OK", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
    sin_minimo: { label: "Sin mínimo", cls: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
  }[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ${meta.cls}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}
