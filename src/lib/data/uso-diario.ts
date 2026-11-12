"use client";

// Lectura para el historial de uso diario de insumos. El cálculo vive en
// src/lib/uso-diario.ts; aquí solo se traen ventas, compras y pérdidas.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { VentaUso } from "@/lib/uso-diario";

const PAGE = 1000;

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

/** Ventas (y mermas de receta) del período, con el nombre del producto. */
export async function listVentasUso(desde: string, hasta: string): Promise<VentaUso[]> {
  const sb = createSupabaseBrowserClient();
  const out: VentaUso[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("ventas")
      .select(
        "id, fecha, cantidad, receta_id, receta_nombre, es_merma, insumo_id, insumo_cantidad, extra_receta_id, extra_cantidad, swap_from_insumo_id, swap_to_insumo_id",
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
        fecha: String(r.fecha ?? "").slice(0, 10),
        cantidad: num(r.cantidad),
        producto: String(r.receta_nombre ?? "").trim() || "Venta sin nombre",
        esMerma: r.es_merma === true,
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
