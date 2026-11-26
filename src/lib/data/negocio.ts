"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { esColumnaAusente } from "@/lib/iva-compra";
import { esFaltaTablaJornada } from "@/lib/data/jornada-cocina";

export type HorarioNegocio = {
  nombre: string;
  zonaHoraria: string;
  horaAperturaHabitual: string | null;
  horaCierreMaxima: string | null;
  jornadaHorarioNota: string | null;
  /** False si aún no está la migración de horario. */
  horarioDisponible: boolean;
};

const VACIO: HorarioNegocio = {
  nombre: "",
  zonaHoraria: "America/Caracas",
  horaAperturaHabitual: null,
  horaCierreMaxima: null,
  jornadaHorarioNota: null,
  horarioDisponible: false,
};

function hhmm(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = String(v);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export async function getHorarioNegocio(): Promise<HorarioNegocio> {
  const sb = createSupabaseBrowserClient();
  const completo =
    "nombre, zona_horaria, hora_apertura_habitual, hora_cierre_maxima, jornada_horario_nota";
  let { data, error } = await sb.from("negocio_config").select(completo).eq("id", 1).maybeSingle();
  if (error && (esColumnaAusente(error) || esFaltaTablaJornada(error))) {
    const r2 = await sb.from("negocio_config").select("nombre, zona_horaria").eq("id", 1).maybeSingle();
    if (r2.error) throw r2.error;
    data = r2.data as typeof data;
    error = null;
    const row = (data ?? {}) as { nombre?: string | null; zona_horaria?: string | null };
    return {
      ...VACIO,
      nombre: (row.nombre ?? "").trim(),
      zonaHoraria: row.zona_horaria || "America/Caracas",
      horarioDisponible: false,
    };
  }
  if (error) throw error;
  const row = (data ?? {}) as {
    nombre?: string | null;
    zona_horaria?: string | null;
    hora_apertura_habitual?: string | null;
    hora_cierre_maxima?: string | null;
    jornada_horario_nota?: string | null;
  };
  return {
    nombre: (row.nombre ?? "").trim(),
    zonaHoraria: row.zona_horaria || "America/Caracas",
    horaAperturaHabitual: hhmm(row.hora_apertura_habitual),
    horaCierreMaxima: hhmm(row.hora_cierre_maxima),
    jornadaHorarioNota: row.jornada_horario_nota ?? null,
    horarioDisponible: true,
  };
}

export async function guardarHorarioNegocio(patch: {
  nombre: string;
  horaAperturaHabitual: string | null;
  horaCierreMaxima: string | null;
  jornadaHorarioNota: string | null;
}): Promise<HorarioNegocio> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {
    id: 1,
    nombre: patch.nombre.trim(),
    hora_apertura_habitual: patch.horaAperturaHabitual,
    hora_cierre_maxima: patch.horaCierreMaxima,
    jornada_horario_nota: patch.jornadaHorarioNota?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb.from("negocio_config").update(db).eq("id", 1);
  if (error) throw error;
  return getHorarioNegocio();
}
