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
    /cocina_tablero_en_uso|cocina_jornadas|cocina_jornada_revisar|cocina_jornada_posponer|cocina_jornada_estado|jornada_actual|jornada_de|jornada_fecha|schema cache/i.test(msg)
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


export type EstadoJornadaCocina = {
  jornadaId: string | null;
  fecha: string | null;
  iniciadoAt: string | null;
  horaAperturaHabitual: string | null;
  horaCierreMaxima: string | null;
  nota: string | null;
  limiteEfectivo: string | null;
  alertaDesde: string | null;
  posposiciones: number;
  puedePosponer: boolean;
  mostrarAlerta: boolean;
  debeCerrar: boolean;
  /** Jornada que esta llamada acaba de cerrar en automático, si hubo. */
  cerroJornadaId: string | null;
};

type EstadoRow = {
  jornada_id?: string | null;
  fecha?: string | null;
  iniciado_at?: string | null;
  hora_apertura_habitual?: string | null;
  hora_cierre_maxima?: string | null;
  nota?: string | null;
  limite_efectivo?: string | null;
  alerta_desde?: string | null;
  posposiciones?: number | string | null;
  puede_posponer?: boolean | null;
  mostrar_alerta?: boolean | null;
  debe_cerrar?: boolean | null;
  cerro_jornada_id?: string | null;
};

function deEstado(r: EstadoRow | null | undefined): EstadoJornadaCocina {
  const row = r ?? {};
  return {
    jornadaId: row.jornada_id ?? null,
    fecha: row.fecha ?? null,
    iniciadoAt: row.iniciado_at ?? null,
    horaAperturaHabitual: row.hora_apertura_habitual ?? null,
    horaCierreMaxima: row.hora_cierre_maxima ?? null,
    nota: row.nota ?? null,
    limiteEfectivo: row.limite_efectivo ?? null,
    alertaDesde: row.alerta_desde ?? null,
    posposiciones: num(row.posposiciones),
    puedePosponer: !!row.puede_posponer,
    mostrarAlerta: !!row.mostrar_alerta,
    debeCerrar: !!row.debe_cerrar,
    cerroJornadaId: row.cerro_jornada_id ?? null,
  };
}

/** Revisa si toca el cierre automático y devuelve el estado de la jornada
 *  abierta. Si la migración aún no está, devuelve null. */
export async function revisarJornadaCocina(): Promise<EstadoJornadaCocina | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("cocina_jornada_revisar");
  if (error) {
    if (esFaltaTablaJornada(error)) return null;
    throw error;
  }
  return deEstado((data ?? {}) as EstadoRow);
}

export type ResultadoPosponer =
  | { ok: true; jornadaId: string; posposiciones: number; limiteEfectivo: string | null }
  | { ok: false; error: "tope" | "cerrada" | "sin_horario" | string };

/** «Recordar en 1 hora»: alarga el límite una hora (tope de 6). */
export async function posponerCierreJornada(): Promise<ResultadoPosponer> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("cocina_jornada_posponer");
  if (error) {
    if (esFaltaTablaJornada(error)) return { ok: false, error: "sin_horario" };
    throw error;
  }
  const r = (data ?? {}) as {
    ok?: boolean;
    error?: string;
    jornada_id?: string;
    posposiciones?: number | string;
    limite_efectivo?: string | null;
  };
  if (!r.ok) {
    return { ok: false, error: r.error ?? "error" };
  }
  return {
    ok: true,
    jornadaId: r.jornada_id ?? "",
    posposiciones: num(r.posposiciones),
    limiteEfectivo: r.limite_efectivo ?? null,
  };
}
