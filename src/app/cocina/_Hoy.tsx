"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  BookIcon,
  CartIcon,
  CheckIcon,
  ChevronIcon,
  ClipboardIcon,
  WarningIcon,
} from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
import { displayCantidad } from "@/lib/units";
import { extractError } from "@/lib/data/error";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { BcvRateBanner } from "./BcvRateBanner";
import {
  checklistHoy,
  fechaHoyLegible,
  introHoy,
  nombreVisible,
  resumirStock,
  saludoDelDia,
  tituloChecklist,
  type AlertaStock,
  type ConteosHoy,
  type InsumoHoy,
  type ItemChecklist,
  type TonoHoy,
} from "./_hoy";

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

const ACCIONES: { href: string; titulo: string; detalle: string; Icon: Icono }[] = [
  {
    href: "/cocina/inventario/conteo",
    titulo: "Conteo",
    detalle: "Anota lo que hay en cámara y cuadra el stock.",
    Icon: ClipboardIcon,
  },
  {
    href: "/cocina/pedido",
    titulo: "Pedido sugerido",
    detalle: "Arma la compra con lo que está bajo el mínimo.",
    Icon: CartIcon,
  },
  {
    href: "/cocina/recetas",
    titulo: "Recetas",
    detalle: "Revisa el costo de cada plato.",
    Icon: BookIcon,
  },
];

/** Filas visibles aunque todavía no lleguen los conteos, para no dejar
 *  colgado el cursor-guía del asistente. */
const FILAS_BASE: ItemChecklist[] = [
  {
    id: "proveedores",
    titulo: "Proveedores",
    detalle: "Revisando…",
    href: "/cocina/proveedores",
    tono: "falta",
    etiqueta: "…",
    dataGuia: "paso-proveedores",
  },
  {
    id: "insumos",
    titulo: "Insumos",
    detalle: "Revisando…",
    href: "/cocina/insumos",
    tono: "falta",
    etiqueta: "…",
    dataGuia: "paso-insumos",
  },
  {
    id: "recetas",
    titulo: "Recetas",
    detalle: "Revisando…",
    href: "/cocina/recetas",
    tono: "falta",
    etiqueta: "…",
    dataGuia: "paso-recetas",
  },
  {
    id: "compras",
    titulo: "Compras",
    detalle: "Revisando…",
    href: "/cocina/compras",
    tono: "falta",
    etiqueta: "…",
    dataGuia: "paso-compras",
  },
  {
    id: "stock",
    titulo: "Stock y alertas",
    detalle: "Revisando…",
    href: "/cocina/insumos?vista=alertas",
    tono: "falta",
    etiqueta: "…",
  },
];

const MAX_ALERTAS = 4;

type Carga = {
  conteos: ConteosHoy;
  alertas: AlertaStock[];
};

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function numONull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mensajeCarga(e: unknown): string {
  const bruto = extractError(e, "Error cargando");
  if (/url and api key are required|supabaseurl is required|supabasekey is required/i.test(bruto)) {
    return "Falta la conexión con la base de datos.";
  }
  return bruto;
}

function exigirConteo(
  que: string,
  res: { count: number | null; error: { message: string } | null },
): number {
  if (res.error) throw res.error;
  if (res.count === null) throw new Error(`No se pudo contar ${que}.`);
  return res.count;
}

async function listarInsumosActivos(
  sb: ReturnType<typeof createSupabaseBrowserClient>,
): Promise<InsumoHoy[]> {
  const PAGE = 1000;
  const out: InsumoHoy[] = [];
  for (let desde = 0; ; desde += PAGE) {
    const { data, error } = await sb
      .from("insumos")
      .select("id, nombre, unidad_base, stock_actual, stock_comprometido, stock_minimo")
      .eq("activo", true)
      .order("nombre")
      .order("id")
      .range(desde, desde + PAGE - 1);
    if (error) throw error;
    const filas = data ?? [];
    for (const r of filas) {
      out.push({
        id: String(r.id),
        nombre: String(r.nombre ?? ""),
        unidadBase: String(r.unidad_base ?? ""),
        stockTotal: num(r.stock_actual),
        stockComprometido: num(r.stock_comprometido),
        stockMinimo: numONull(r.stock_minimo),
      });
    }
    if (filas.length < PAGE) break;
  }
  return out;
}

async function cargarHoy(): Promise<Carga> {
  const sb = createSupabaseBrowserClient();
  const [prov, rec, comp, insumos] = await Promise.all([
    sb.from("proveedores").select("id", { count: "exact", head: true }).eq("activo", true),
    sb.from("recetas").select("id", { count: "exact", head: true }).eq("activo", true),
    sb.from("compras").select("id", { count: "exact", head: true }),
    listarInsumosActivos(sb),
  ]);
  const stock = resumirStock(insumos);
  return {
    conteos: {
      proveedores: exigirConteo("proveedores", prov),
      insumos: stock.conteos.insumos,
      recetas: exigirConteo("recetas", rec),
      compras: exigirConteo("compras", comp),
      agotados: stock.conteos.agotados,
      bajos: stock.conteos.bajos,
      sinMinimo: stock.conteos.sinMinimo,
    },
    alertas: stock.alertas,
  };
}

async function leerNombre(): Promise<string | null> {
  try {
    const sb = createSupabaseBrowserClient();
    const { data } = await sb.auth.getUser();
    const user = data.user;
    if (!user) return null;
    let persona: string | null = null;
    const { data: fila, error } = await sb
      .from("negocio_persona")
      .select("nombre")
      .eq("user_id", user.id)
      .eq("activo", true)
      .maybeSingle();
    if (!error && fila && typeof fila.nombre === "string") persona = fila.nombre;
    return nombreVisible({ persona, metadata: user.user_metadata });
  } catch {
    return null;
  }
}

export function Hoy() {
  const [nombre, setNombre] = useState<string | null>(null);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    leerNombre().then((n) => {
      if (!cancelado) setNombre(n);
    });
    (async () => {
      try {
        const datos = await cargarHoy();
        if (!cancelado) {
          setCarga(datos);
          setError(null);
        }
      } catch (e) {
        if (!cancelado) setError(mensajeCarga(e));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [intento]);

  const saludo = saludoDelDia();
  const fecha = fechaHoyLegible();
  const items = carga
    ? checklistHoy(carga.conteos)
    : error
      ? FILAS_BASE.map((fila) => ({
          ...fila,
          detalle: "No se pudo revisar. Puedes entrar igual.",
        }))
      : FILAS_BASE;
  const faltantes = carga ? carga.conteos.agotados + carga.conteos.bajos : 0;

  return (
    <div className="space-y-8">
      <section>
        <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Hoy</p>
        <h1
          className="mt-2 text-balance font-cinzel text-3xl text-cacao sm:text-4xl"
          suppressHydrationWarning
        >
          {saludo}
          {nombre ? `, ${nombre}` : ""}
        </h1>
        <p className="mt-2 max-w-xl text-cacao-soft" suppressHydrationWarning>
          {fecha} · Esto es lo que conviene atender en la cocina.
        </p>
      </section>

      <BcvRateBanner />

      <section aria-label="Acciones rápidas">
        <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">Para hoy</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {ACCIONES.map((a) => (
            <li key={a.href}>
              <Link
                href={a.href}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-marfil-soft p-4 ring-1 ring-marfil transition-colors hover:bg-white hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta sm:p-5"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="grid size-11 place-items-center rounded-full bg-naranja-soft/70 text-terracotta transition-colors group-hover:bg-terracotta group-hover:text-white">
                    <a.Icon className="size-5" />
                  </span>
                  {a.href === "/cocina/pedido" && faltantes > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-red-800 ring-1 ring-red-200">
                      <span className="size-1.5 rounded-full bg-red-500" aria-hidden />
                      Stock bajo
                    </span>
                  )}
                </span>
                <span>
                  <span className="block font-cinzel text-lg leading-tight text-cacao transition-colors group-hover:text-terracotta">
                    {a.titulo}
                  </span>
                  <span className="mt-1 block text-sm leading-snug text-cacao-soft">{a.detalle}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Qué falta" aria-busy={!carga && !error} data-guia="cocina-empezar">
        <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">
          {carga ? tituloChecklist(items) : "Qué falta"}
        </h2>
        <p className="mt-2 max-w-xl text-sm text-cacao-soft">
          {carga
            ? introHoy(carga.conteos)
            : error
              ? "No se pudo revisar la cocina. Los accesos de abajo siguen abiertos."
              : "Revisando proveedores, insumos, recetas, compras y el stock."}
        </p>
        {error && (
          <ErrorCarga
            className="mt-4"
            que="hoy"
            detalle={error}
            onReintentar={() => {
              setError(null);
              setCarga(null);
              setIntento((n) => n + 1);
            }}
          />
        )}
        <ul className="mt-3 divide-y divide-marfil overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          {items.map((item) => (
            <li key={item.id}>
              <FilaChecklist item={item} cargando={!carga} />
            </li>
          ))}
        </ul>
      </section>

      <AlertasStock
        cargando={!carga && !error}
        error={!!error}
        insumos={carga?.conteos.insumos ?? 0}
        agotados={carga?.conteos.agotados ?? 0}
        bajos={carga?.conteos.bajos ?? 0}
        sinMinimo={carga?.conteos.sinMinimo ?? 0}
        alertas={carga?.alertas ?? []}
      />
    </div>
  );
}

function FilaChecklist({ item, cargando }: { item: ItemChecklist; cargando: boolean }) {
  const tono: TonoHoy | "cargando" = cargando ? "cargando" : item.tono;
  return (
    <Link
      href={item.href}
      data-guia={item.dataGuia}
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-marfil-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terracotta sm:gap-4 sm:px-5"
    >
      <Marca tono={tono} />
      <span className="min-w-0 flex-1">
        <span className="block font-cinzel text-lg leading-tight text-cacao group-hover:text-terracotta">
          {item.titulo}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-cacao-soft">{item.detalle}</span>
      </span>
      {!cargando && <Pastilla tono={item.tono} etiqueta={item.etiqueta} />}
      <ChevronIcon className="size-5 shrink-0 text-cacao-mute transition group-hover:translate-x-0.5 group-hover:text-terracotta" />
    </Link>
  );
}

function Marca({ tono }: { tono: TonoHoy | "cargando" }) {
  if (tono === "listo") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckIcon className="size-4" />
      </span>
    );
  }
  if (tono === "atencion") {
    return (
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-red-100 text-red-700">
        <WarningIcon className="size-4" />
      </span>
    );
  }
  const punto = tono === "cargando" ? "bg-cacao-mute" : "bg-terracotta";
  const fondo = tono === "cargando" ? "bg-marfil-light" : "bg-naranja-soft/80";
  return (
    <span className={`grid size-8 shrink-0 place-items-center rounded-full ${fondo}`}>
      <span className={`size-2 rounded-full ${punto}`} aria-hidden />
    </span>
  );
}

function Pastilla({ tono, etiqueta }: { tono: TonoHoy; etiqueta: string }) {
  const estilo =
    tono === "listo"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : tono === "atencion"
        ? "bg-red-50 text-red-800 ring-red-200"
        : "bg-naranja-soft/80 text-terracotta-deep ring-naranja-soft";
  const punto =
    tono === "listo" ? "bg-emerald-500" : tono === "atencion" ? "bg-red-500" : "bg-terracotta";
  return (
    <span
      className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1 sm:inline-flex ${estilo}`}
    >
      <span className={`size-1.5 rounded-full ${punto}`} aria-hidden />
      {etiqueta}
    </span>
  );
}

function AlertasStock({
  cargando,
  error,
  insumos,
  agotados,
  bajos,
  sinMinimo,
  alertas,
}: {
  cargando: boolean;
  error: boolean;
  insumos: number;
  agotados: number;
  bajos: number;
  sinMinimo: number;
  alertas: AlertaStock[];
}) {
  const visibles = alertas.slice(0, MAX_ALERTAS);
  const resto = alertas.length - visibles.length;
  return (
    <section aria-label="Alertas de stock">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[11px] uppercase tracking-[0.3em] text-cacao-soft">Alertas de stock</h2>
        <Link
          href="/cocina/insumos?vista=alertas"
          className="text-xs font-semibold uppercase tracking-widest text-cacao-soft hover:text-terracotta"
        >
          Ver alertas
        </Link>
      </div>

      {cargando ? (
        <p className="mt-3 rounded-2xl bg-white px-5 py-6 text-sm text-cacao-soft ring-1 ring-marfil">
          Revisando el stock…
        </p>
      ) : error ? (
        <p className="mt-3 rounded-2xl bg-white px-5 py-6 text-sm text-cacao-soft ring-1 ring-marfil">
          No se pudo revisar el stock.{" "}
          <Link href="/cocina/insumos?vista=alertas" className="font-semibold text-terracotta hover:underline">
            Abrir alertas
          </Link>
        </p>
      ) : insumos === 0 ? (
        <p className="mt-3 rounded-2xl bg-white px-5 py-6 text-sm text-cacao-soft ring-1 ring-marfil">
          Todavía no hay insumos para vigilar.{" "}
          <Link href="/cocina/insumos" className="font-semibold text-terracotta hover:underline">
            Cargar insumos
          </Link>
        </p>
      ) : (
        <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          <div className="flex flex-wrap gap-2 border-b border-marfil px-4 py-3 sm:px-5">
            <Conteo
              href="/cocina/insumos?vista=alertas"
              n={agotados}
              etiqueta={agotados === 1 ? "agotado" : "agotados"}
              punto="bg-red-500"
              tono="bg-red-50 text-red-800 ring-red-200"
            />
            <Conteo
              href="/cocina/insumos?vista=alertas"
              n={bajos}
              etiqueta={bajos === 1 ? "bajo" : "bajos"}
              punto="bg-amber-500"
              tono="bg-amber-50 text-amber-900 ring-amber-200"
            />
            <Conteo
              href="/cocina/insumos"
              n={sinMinimo}
              etiqueta="sin mínimo"
              punto="bg-stone-400"
              tono="bg-stone-50 text-cacao-soft ring-stone-200"
            />
          </div>
          {visibles.length === 0 ? (
            <div className="flex items-start gap-3 px-4 py-5 sm:px-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckIcon className="size-4" />
              </span>
              <p className="text-sm text-cacao-soft">
                {sinMinimo > 0
                  ? "Nadie está bajo el mínimo. Los que no tienen mínimo no avisan todavía."
                  : "Ningún insumo está agotado ni por debajo del mínimo."}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-marfil">
              {visibles.map((a) => (
                <li key={a.id}>
                  <Link
                    href="/cocina/insumos?vista=alertas"
                    className="flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-marfil-soft sm:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-cacao">{a.nombre}</span>
                      <span className="mt-0.5 block text-xs text-cacao-soft">
                        {displayCantidad(a.libre, a.unidadBase)} libres · mínimo{" "}
                        {displayCantidad(a.minimo, a.unidadBase)}
                        {a.comprometido > 0 ? " · hay reserva" : ""}
                      </span>
                    </span>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1 ${
                        a.clase === "agotado"
                          ? "bg-red-50 text-red-800 ring-red-200"
                          : "bg-amber-50 text-amber-900 ring-amber-200"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${a.clase === "agotado" ? "bg-red-500" : "bg-amber-500"}`}
                        aria-hidden
                      />
                      {a.clase === "agotado" ? "Agotado" : "Bajo"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {resto > 0 && (
            <div className="border-t border-marfil px-4 py-3 sm:px-5">
              <Link
                href="/cocina/insumos?vista=alertas"
                className="text-sm font-semibold text-terracotta hover:underline"
              >
                Ver {resto === 1 ? "la otra alerta" : `las otras ${resto.toLocaleString("es-VE")} alertas`}
              </Link>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Conteo({
  href,
  n,
  etiqueta,
  punto,
  tono,
}: {
  href: string;
  n: number;
  etiqueta: string;
  punto: string;
  tono: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tono}`}
    >
      <span className={`size-1.5 rounded-full ${punto}`} aria-hidden />
      {n.toLocaleString("es-VE")} {etiqueta}
    </Link>
  );
}
