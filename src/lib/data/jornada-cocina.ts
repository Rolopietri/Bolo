"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Fila del tablero de «en uso», partida entre lo que viene de la jornada
 *  anterior y lo habilitado en esta. FIFO: primero sale lo arrastrado. */
export type TableroEnUso = {
  insumoId: string;
  nombre: string;
  unidadBase: string;
  stockActual: number;
  stockProcesado: number;
  vieneDeAnterior: number;
  habilitadoEsta: number;
  procesadoHabilitado: number;
  jornadaId: string | null;
  jornadaIniciadoAt: string | null;
  pendientesAbiertos: number;
  lotesPendientes: number;
};

type Fila = {
  insumo_id: string;
  nombre: string;
  unidad_base: string | null;
  stock_actual: number | string;
  stock_procesado: number | string;
  viene_de_anterior: number | string;
  habilitado_esta: number | string;
  procesado_habilitado: number | string;
  jornada_id: string | null;
  jornada_iniciado_at: string | null;
  pendientes_abiertos: number | string;
  lotes_pendientes: number | string;
};

function num(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function deFila(r: Fila): TableroEnUso {
  return {
    insumoId: r.insumo_id,
    nombre: r.nombre,
    unidadBase: r.unidad_base ?? "",
    stockActual: num(r.stock_actual),
    stockProcesado: num(r.stock_procesado),
    vieneDeAnterior: num(r.viene_de_anterior),
    habilitadoEsta: num(r.habilitado_esta),
    procesadoHabilitado: num(r.procesado_habilitado),
    jornadaId: r.jornada_id,
    jornadaIniciadoAt: r.jornada_iniciado_at,
    pendientesAbiertos: num(r.pendientes_abiertos),
    lotesPendientes: num(r.lotes_pendientes),
  };
}

export function esFaltaTablaJornada(e: unknown): boolean {
  const code =
    typeof e === "object" && e && "code" in e && typeof (e as { code: unknown }).code === "string"
      ? (e as { code: string }).code
      : "";
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return (
    code === "42P01" ||
    code === "PGRST202" ||
    code === "PGRST205" ||
    /cocina_tablero_en_uso|cocina_jornadas|schema cache/i.test(msg)
  );
}

/** Saldo en uso de la jornada abierta, para el tablero. Si aún no se aplicó
 *  la migración, devuelve null. */
export async function listTableroEnUso(): Promise<TableroEnUso[] | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("cocina_tablero_en_uso");
  if (error) {
    if (esFaltaTablaJornada(error)) return null;
    throw error;
  }
  return ((data as Fila[]) ?? []).map(deFila);
}
