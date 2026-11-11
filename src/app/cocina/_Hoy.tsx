"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import {
  BookIcon,
  CartIcon,
  ChartIcon,
  ClipboardIcon,
} from "@/components/icons";
import { ErrorCarga } from "@/components/ErrorCarga";
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
  type ConteosHoy,
  type InsumoHoy,
  type ItemChecklist,
} from "./_hoy";
import { AnilloListas } from "./_AnilloListas";

type Icono = ComponentType<SVGProps<SVGSVGElement>>;

const ACCIONES: { href: string; titulo: string; detalle: string; Icon: Icono; dataGuia?: string }[] = [
  {
    href: "/cocina/inventario/stock",
    titulo: "Stock",
    detalle: "Cuánto hay libre, cuánto vale y qué se acaba pronto.",
    Icon: ChartIcon,
    dataGuia: "accion-stock",
  },
  {
    href: "/cocina/inventario/conteo",
    titulo: "Conteo",
    detalle: "Anota lo que hay en cámara y cuadra el stock.",
    Icon: ClipboardIcon,
  },
  {
    href: "/cocina/pedido",
    titulo: "Pedido sugerido",
    detalle: "Lo que está bajo el mínimo. Lo revisas y lo pasas a compra.",
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

type Carga = {
  conteos: ConteosHoy;
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
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {ACCIONES.map((a) => {
            const detalle =
              a.href === "/cocina/pedido" && faltantes > 0
                ? `${faltantes.toLocaleString("es-VE")} ${faltantes === 1 ? "insumo para reponer" : "insumos para reponer"}. Revísalos y regístralos como compra.`
                : a.detalle;
            return (
            <li key={a.href}>
              <Link
                href={a.href}
                data-guia={a.dataGuia}
                className="group flex h-full flex-col gap-3 rounded-2xl bg-marfil-soft p-4 ring-1 ring-marfil transition-colors hover:bg-white hover:ring-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta sm:p-5"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-naranja-soft/70 text-terracotta transition-colors group-hover:bg-terracotta group-hover:text-white">
                    <a.Icon className="size-5" />
                  </span>
                  {a.href === "/cocina/inventario/stock" && carga && (
                    <SemaforoStock conteos={carga.conteos} />
                  )}
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
                  <span className="mt-1 block text-sm leading-snug text-cacao-soft">{detalle}</span>
                </span>
              </Link>
            </li>
            );
          })}
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
        <AnilloListas
          items={items}
          modo={carga ? "datos" : error ? "error" : "cargando"}
        />
      </section>

    </div>
  );
}

function cuentaAlerta(n: number, uno: string, varios: string): string {
  return `${n.toLocaleString("es-VE")} ${n === 1 ? uno : varios}`;
}

/** Los tres conteos que antes estaban en Alertas de stock, en el mismo orden. */
function SemaforoStock({ conteos }: { conteos: ConteosHoy }) {
  const items = [
    {
      corto: "Agotado",
      frase: cuentaAlerta(conteos.agotados, "agotado", "agotados"),
      n: conteos.agotados,
      tono: "bg-[#FDECEC] ring-[#E7B4B4]",
    },
    {
      corto: "Bajo",
      frase: cuentaAlerta(conteos.bajos, "bajo el mínimo", "bajo el mínimo"),
      n: conteos.bajos,
      tono: "bg-[#FFF6D8] ring-[#E4D08A]",
    },
    {
      corto: "Sin mín.",
      frase: cuentaAlerta(conteos.sinMinimo, "sin mínimo", "sin mínimo"),
      n: conteos.sinMinimo,
      tono: "bg-stone-200 ring-stone-300",
    },
  ];
  return (
    <span className="flex items-start gap-1" role="group" aria-label="Alertas de stock">
      {items.map((item) => (
        <span key={item.corto} title={item.frase} aria-label={item.frase} className="flex w-12 flex-col items-center gap-1">
          <span
            className={`grid h-8 min-w-8 place-items-center rounded-full px-1 text-sm font-bold tabular-nums text-cacao ring-1 ${item.tono}`}
          >
            {item.n.toLocaleString("es-VE")}
          </span>
          <span className="text-center text-[10px] font-semibold leading-none text-cacao">{item.corto}</span>
        </span>
      ))}
    </span>
  );
}
