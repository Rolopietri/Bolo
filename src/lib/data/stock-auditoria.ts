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
  /** Por qué cambió (compra, venta, perdida:mal_estado…). Null en registros
   *  anteriores a BOLO-04. */
  motivo: string | null;
  /** Usuario que hizo el cambio (null si fue directo en la base). */
  changedBy: string | null;
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
  motivo?: string | null;
  changed_by?: string | null;
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
    motivo: r.motivo ?? null,
    changedBy: r.changed_by ?? null,
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

/** Nombre visible de cada usuario (id → nombre). Si la función de la base aún
 *  no existe, devuelve un mapa vacío y la pantalla sigue funcionando. */
export async function nombresUsuarios(ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  try {
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb.rpc("nombres_usuarios", { p_ids: ids });
    if (error) return out;
    for (const r of (data ?? []) as { id: string; nombre: string | null }[]) {
      if (r.nombre) out.set(r.id, r.nombre);
    }
  } catch {
    // sin nombres: se muestra solo el motivo
  }
  return out;
}

/** Texto para el motivo guardado por la base (ver BOLO-04). */
export function motivoLabel(motivo: string | null): string | null {
  if (!motivo) return null;
  if (motivo.startsWith("perdida:")) {
    const t = motivo.slice("perdida:".length);
    const tipos: Record<string, string> = {
      perdida: "Pérdida",
      mal_estado: "Pérdida · mal estado",
      merma: "Pérdida · merma",
      vencimiento: "Pérdida · vencimiento",
      otro: "Pérdida · otro",
    };
    return tipos[t] ?? "Pérdida";
  }
  const map: Record<string, string> = {
    alta: "Alta del insumo",
    edicion: "Edición manual",
    compra: "Compra",
    compra_revertida: "Compra borrada o editada",
    perdida_deshecha: "Pérdida deshecha",
    conteo: "Conteo físico",
    plan: "Plan de producción",
    venta: "Venta",
    merma_receta: "Merma de receta",
    venta_revertida: "Venta borrada",
  };
  return map[motivo] ?? motivo;
}
