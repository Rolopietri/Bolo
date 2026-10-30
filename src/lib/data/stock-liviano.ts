"use client";

// Lectura para la vista de stock. No calcula días ni valor: eso vive en
// src/lib/stock-liviano.ts. Aquí solo trae las ventas (también las mermas de
// producción, porque descuentan stock) y las salidas del libro.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { TIPOS_SALIDA_STOCK, type VentaParaStock } from "@/lib/stock-liviano";

export type MovimientoSalida = {
  insumoId: string;
  fecha: string;
  tipo: string;
  cantidad: number;
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

function fecha(v: unknown): string {
  return String(v ?? "").slice(0, 10);
}

const PAGE = 1000;

export async function listVentasParaStock(desde: string, hasta: string): Promise<VentaParaStock[]> {
  const sb = createSupabaseBrowserClient();
  const out: VentaParaStock[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("ventas")
      .select(
        "id, fecha, cantidad, receta_id, insumo_id, insumo_cantidad, extra_receta_id, extra_cantidad, swap_from_insumo_id, swap_to_insumo_id",
      )
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      out.push({
        fecha: fecha(r.fecha),
        cantidad: num(r.cantidad),
        recetaId: r.receta_id ?? undefined,
        insumoId: r.insumo_id ?? undefined,
        insumoCantidad: numONull(r.insumo_cantidad),
        extraRecetaId: r.extra_receta_id ?? undefined,
        extraCantidad: numONull(r.extra_cantidad),
        swapFromInsumoId: r.swap_from_insumo_id ?? undefined,
        swapToInsumoId: r.swap_to_insumo_id ?? undefined,
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function listMovimientosSalida(desde: string, hasta: string): Promise<MovimientoSalida[]> {
  const sb = createSupabaseBrowserClient();
  const out: MovimientoSalida[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("stock_movimientos")
      .select("id, insumo_id, fecha, tipo, cantidad")
      .in("tipo", [...TIPOS_SALIDA_STOCK])
      .lt("cantidad", 0)
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data ?? [];
    for (const r of rows) {
      out.push({
        insumoId: String(r.insumo_id ?? ""),
        fecha: fecha(r.fecha),
        tipo: String(r.tipo ?? ""),
        cantidad: num(r.cantidad),
      });
    }
    if (rows.length < PAGE) break;
  }
  return out;
}
