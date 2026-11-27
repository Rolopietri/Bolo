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
    /cocina_tablero_en_uso|cocina_jornadas|cocina_jornada_revisar|cocina_jornada_posponer|cocina_jornada_estado|cocina_jornada_fijar_tasa_propia|jornada_actual|jornada_de|jornada_fecha|tasa_jornada|schema cache/i.test(msg)
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
  tasaTipo: "usd_bs" | "eur_bs" | "propia" | null;
  tasaValor: number | null;
  tasaFecha: string | null;
  tasaPredeterminada: "usd_bs" | "eur_bs" | null;
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
  tasa_tipo?: string | null;
  tasa_valor?: number | string | null;
  tasa_fecha?: string | null;
  tasa_predeterminada?: string | null;
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
    tasaTipo: asTasaTipo(row.tasa_tipo),
    tasaValor: row.tasa_valor == null || row.tasa_valor === "" ? null : num(row.tasa_valor) || null,
    tasaFecha: row.tasa_fecha ?? null,
    tasaPredeterminada: asTasaPred(row.tasa_predeterminada),
  };
}

function asTasaTipo(v: string | null | undefined): EstadoJornadaCocina["tasaTipo"] {
  if (v === "usd_bs" || v === "eur_bs" || v === "propia") return v;
  return null;
}
function asTasaPred(v: string | null | undefined): EstadoJornadaCocina["tasaPredeterminada"] {
  if (v === "usd_bs" || v === "eur_bs") return v;
  return null;
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


/** YYYY-MM-DD civil en America/Caracas, solo como respaldo si falta la migración. */
export function fechaCivilCaracas(ahora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** Fecha de negocio de la jornada abierta. Si la migración no está, cae al día civil de Caracas. */
export async function jornadaHoy(): Promise<string> {
  try {
    const e = await revisarJornadaCocina();
    if (e?.fecha) return String(e.fecha).slice(0, 10);
  } catch {
    /* sin sesión o sin migración */
  }
  return fechaCivilCaracas();
}

export type TasaJornada = {
  jornadaId: string | null;
  fecha: string | null;
  tipo: "usd_bs" | "eur_bs" | "propia" | null;
  valor: number | null;
  tasaFecha: string | null;
};

export async function tasaJornada(): Promise<TasaJornada | null> {
  try {
    const e = await revisarJornadaCocina();
    if (!e) return null;
    return {
      jornadaId: e.jornadaId,
      fecha: e.fecha,
      tipo: e.tasaTipo,
      valor: e.tasaValor,
      tasaFecha: e.tasaFecha,
    };
  } catch {
    return null;
  }
}

/** Tasa guardada de la jornada de esa fecha de negocio (o la BCV oficial si no hay). */
export async function getTasaJornadaPorFecha(fecha: string): Promise<TasaJornada | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("tasa_jornada_de_fecha", { p_fecha: fecha });
  if (error) {
    if (esFaltaTablaJornada(error)) return null;
    throw error;
  }
  const row = (Array.isArray(data) ? data[0] : data) as {
    jornada_id?: string | null;
    fecha?: string | null;
    tasa_tipo?: string | null;
    tasa_valor?: number | string | null;
    tasa_fecha?: string | null;
  } | null;
  if (!row) return null;
  const valor = row.tasa_valor == null || row.tasa_valor === "" ? null : Number(row.tasa_valor);
  return {
    jornadaId: row.jornada_id ?? null,
    fecha: row.fecha ?? fecha,
    tipo: asTasaTipo(row.tasa_tipo),
    valor: valor != null && Number.isFinite(valor) && valor > 0 ? valor : null,
    tasaFecha: row.tasa_fecha ?? null,
  };
}

export async function fijarTasaPropia(valor: number): Promise<{ ok: boolean; error?: string }> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("cocina_jornada_fijar_tasa_propia", { p_valor: valor });
  if (error) {
    if (esFaltaTablaJornada(error)) return { ok: false, error: "sin_migracion" };
    throw error;
  }
  const r = (data ?? {}) as { ok?: boolean; error?: string };
  return { ok: !!r.ok, error: r.error };
}

/** Pide que se envíe el resumen de Telegram de las jornadas cerradas pendientes. */
export async function pedirResumenJornadaPendiente(jornadaId?: string | null): Promise<void> {
  try {
    await fetch("/api/cron/resumen-produccion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(jornadaId ? { jornadaId } : { pendientes: true }),
    });
  } catch {
    /* el cron de repesca lo intenta después */
  }
}
