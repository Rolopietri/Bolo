"use client";

// Auditoría de stock (M5) — lectura del registro automático de cambios de
// stock. La escritura la hace un disparador en la base de datos
// (ver supabase/cocina-stock-auditoria.sql); aquí solo consultamos.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type OrigenAuditoria = "alta" | "app" | "directo";

export type StockAuditoria = {
  id: string;
  insumoId: string | null;
  insumoNombre: string;
  unidadBase: string | null;
  stockAnterior: number | null;
  stockNuevo: number | null;
  comprometidoAnterior: number | null;
  comprometidoNuevo: number | null;
  origen: OrigenAuditoria;
  changedAt: string;
};

type Row = {
  id: string;
  insumo_id: string | null;
  insumo_nombre: string;
  unidad_base: string | null;
  stock_anterior: number | string | null;
  stock_nuevo: number | string | null;
  comprometido_anterior: number | string | null;
  comprometido_nuevo: number | string | null;
  origen: string;
  changed_at: string;
};

function num(v: number | string | null): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function rowToEntry(r: Row): StockAuditoria {
  return {
    id: r.id,
    insumoId: r.insumo_id,
    insumoNombre: r.insumo_nombre,
    unidadBase: r.unidad_base,
    stockAnterior: num(r.stock_anterior),
    stockNuevo: num(r.stock_nuevo),
    comprometidoAnterior: num(r.comprometido_anterior),
    comprometidoNuevo: num(r.comprometido_nuevo),
    origen: (r.origen as OrigenAuditoria) ?? "directo",
    changedAt: r.changed_at,
  };
}

export async function listStockAuditoria(
  opts: { insumoId?: string; origen?: OrigenAuditoria; limit?: number } = {},
): Promise<StockAuditoria[]> {
  const sb = createSupabaseBrowserClient();
  let q = sb
    .from("stock_auditoria")
    .select("*")
    .order("changed_at", { ascending: false });
  if (opts.insumoId) q = q.eq("insumo_id", opts.insumoId);
  if (opts.origen) q = q.eq("origen", opts.origen);
  q = q.limit(opts.limit ?? 300);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Row[]).map(rowToEntry);
}
