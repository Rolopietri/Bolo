"use client";

import { useEffect, useState } from "react";
import { extractError } from "@/lib/data/error";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
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

export function useCocinaHoy() {
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

  function reintentar() {
    setError(null);
    setCarga(null);
    setIntento((n) => n + 1);
  }

  return {
    nombre,
    saludo,
    fecha,
    carga,
    error,
    items,
    modoAnillo: (carga ? "datos" : error ? "error" : "cargando") as "datos" | "error" | "cargando",
    titulo: carga ? tituloChecklist(items) : "Qué falta",
    intro: carga
      ? introHoy(carga.conteos)
      : error
        ? "No se pudo revisar la cocina. Los accesos de abajo siguen abiertos."
        : "Revisando proveedores, insumos, recetas, compras y el stock.",
    reintentar,
  };
}

export { AnilloListas };
