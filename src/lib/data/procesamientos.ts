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
};

type Row = {
  id: string;
  insumo_id: string;
  fecha: string;
  crudo: number | string;
  procesado: number | string;
  merma_porc: number | string;
  nota: string | null;
};

function toProc(r: Row): Procesamiento {
  return {
    id: r.id,
    insumoId: r.insumo_id,
    fecha: r.fecha,
    crudo: Number(r.crudo),
    procesado: Number(r.procesado),
    mermaPorc: Number(r.merma_porc),
    nota: r.nota ?? undefined,
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
    .select("id, insumo_id, fecha, crudo, procesado, merma_porc, nota")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (insumoId) q = q.eq("insumo_id", insumoId);
  const { data, error } = await q;
  if (error) return [];
  return (data as Row[]).map(toProc);
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
