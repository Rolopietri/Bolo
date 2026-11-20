"use client";

// Historial de procesamientos (Fase E). Alimenta las alertas de merma.
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type Procesamiento = {
  id: string;
  insumoId: string;
  fecha: string;
  crudo: number;
  procesado: number;
  mermaPorc: number;
  nota?: string;
  responsable?: string;
  origen: "manual" | "escaneo" | "telegram";
};

type Row = {
  id: string;
  insumo_id: string;
  fecha: string;
  crudo: number | string;
  procesado: number | string;
  merma_porc: number | string;
  nota: string | null;
  responsable: string | null;
  origen: string | null;
};

const COLS = "id, insumo_id, fecha, crudo, procesado, merma_porc, nota, responsable, origen";

function toProc(r: Row): Procesamiento {
  return {
    id: r.id,
    insumoId: r.insumo_id,
    fecha: r.fecha,
    crudo: Number(r.crudo),
    procesado: Number(r.procesado),
    mermaPorc: Number(r.merma_porc),
    nota: r.nota ?? undefined,
    responsable: r.responsable ?? undefined,
    origen:
      r.origen === "escaneo" || r.origen === "telegram" ? r.origen : "manual",
  };
}

/** Lista procesamientos (más reciente primero). Si la tabla aún no existe
 *  (migración pendiente), devuelve []. */
export async function listProcesamientos(
  insumoId?: string,
  limit = 300,
): Promise<Procesamiento[]> {
  const sb = createSupabaseBrowserClient();
  let q = sb
    .from("procesamientos")
    .select(COLS)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (insumoId) q = q.eq("insumo_id", insumoId);
  const { data, error } = await q;
  if (error) return [];
  return (data as Row[]).map(toProc);
}

/** Lista procesamientos en un rango de fechas (más reciente primero). Lo usa el
 *  módulo de Producción, que lee de esta misma tabla. */
export async function listProcesamientosRango(
  desde: string,
  hasta: string,
): Promise<Procesamiento[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("procesamientos")
    .select(COLS)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toProc);
}

/** Borra un procesamiento por id (no revierte el stock ni la merma del libro). */
export async function borrarProcesamiento(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("procesamientos").delete().eq("id", id);
  if (error) throw error;
}

/** Mapa insumoId → mermas % recientes (más reciente primero), para evaluar las
 *  alertas de merma de cada insumo. */
export async function mermasRecientesPorInsumo(
  limit = 500,
): Promise<Map<string, number[]>> {
  const procs = await listProcesamientos(undefined, limit);
  const out = new Map<string, number[]>();
  for (const p of procs) {
    const arr = out.get(p.insumoId);
    if (arr) arr.push(p.mermaPorc);
    else out.set(p.insumoId, [p.mermaPorc]);
  }
  return out;
}
