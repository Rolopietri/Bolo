"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  EventoPlantilla,
  PlantillaTarea,
  PlantillaActividad,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// Plantillas (cabecera)
// ─────────────────────────────────────────────────────────────

type RowPl = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activa: boolean;
};

function rowToPlantilla(r: RowPl): EventoPlantilla {
  return {
    id: r.id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? undefined,
    activa: r.activa,
  };
}

export async function listPlantillas(): Promise<EventoPlantilla[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_plantillas")
    .select("*")
    .eq("activa", true)
    .order("nombre");
  if (error) throw error;
  return (data as RowPl[]).map(rowToPlantilla);
}

// ─────────────────────────────────────────────────────────────
// Líneas de plantilla
// ─────────────────────────────────────────────────────────────

type RowPlT = {
  id: string;
  plantilla_id: string;
  fase: string;
  titulo: string;
  responsable: string | null;
  notas: string | null;
  dias_offset: number | null;
  orden: number;
};

function rowToPlantillaTarea(r: RowPlT): PlantillaTarea {
  return {
    id: r.id,
    plantillaId: r.plantilla_id,
    fase: r.fase,
    titulo: r.titulo,
    responsable: r.responsable ?? undefined,
    notas: r.notas ?? undefined,
    diasOffset: r.dias_offset ?? undefined,
    orden: r.orden,
  };
}

type RowPlA = {
  id: string;
  plantilla_id: string;
  hora: string | null;
  actividad: string;
  responsable: string | null;
  ubicacion: string | null;
  observaciones: string | null;
  critica: boolean;
  orden: number;
};

function rowToPlantillaActividad(r: RowPlA): PlantillaActividad {
  return {
    id: r.id,
    plantillaId: r.plantilla_id,
    hora: r.hora ? r.hora.slice(0, 5) : undefined,
    actividad: r.actividad,
    responsable: r.responsable ?? undefined,
    ubicacion: r.ubicacion ?? undefined,
    observaciones: r.observaciones ?? undefined,
    critica: r.critica,
    orden: r.orden,
  };
}

// ─────────────────────────────────────────────────────────────
// Aplicar plantilla a un evento (clona líneas → evento_tareas + evento_actividades)
// ─────────────────────────────────────────────────────────────

/** Suma N días a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD. */
function addDays(fechaIso: string, n: number): string {
  const d = new Date(fechaIso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export type AplicarOpciones = {
  /** Si es true, inserta tareas del checklist. */
  tareas: boolean;
  /** Si es true, inserta actividades del cronograma. */
  cronograma: boolean;
};

/**
 * Aplica una plantilla a un evento. Si la plantilla tiene tareas con `dias_offset`
 * y el evento tiene `fecha`, calcula la fecha límite (días antes del evento por
 * convención: 5 = 5 días antes, 0 = mismo día, -3 = 3 días después).
 */
export async function aplicarPlantilla(
  plantillaId: string,
  eventoId: string,
  fechaEvento: string | undefined,
  opciones: AplicarOpciones = { tareas: true, cronograma: true },
): Promise<{ tareasInsertadas: number; actividadesInsertadas: number }> {
  const sb = createSupabaseBrowserClient();

  let tareasInsertadas = 0;
  let actividadesInsertadas = 0;

  if (opciones.tareas) {
    const { data: lineasT, error: errT } = await sb
      .from("evento_plantilla_tareas")
      .select("*")
      .eq("plantilla_id", plantillaId)
      .order("orden");
    if (errT) throw errT;
    const lineas = (lineasT as RowPlT[]).map(rowToPlantillaTarea);
    if (lineas.length > 0) {
      const inserts = lineas.map((l) => ({
        evento_id: eventoId,
        fase: l.fase,
        titulo: l.titulo,
        responsable: l.responsable ?? null,
        notas: l.notas ?? null,
        fecha_limite:
          l.diasOffset !== undefined && l.diasOffset !== null && fechaEvento
            ? addDays(fechaEvento, -l.diasOffset)
            : null,
        completada: false,
        orden: l.orden,
      }));
      const { error: errIns } = await sb.from("evento_tareas").insert(inserts);
      if (errIns) throw errIns;
      tareasInsertadas = inserts.length;
    }
  }

  if (opciones.cronograma) {
    const { data: lineasA, error: errA } = await sb
      .from("evento_plantilla_actividades")
      .select("*")
      .eq("plantilla_id", plantillaId)
      .order("orden");
    if (errA) throw errA;
    const lineas = (lineasA as RowPlA[]).map(rowToPlantillaActividad);
    if (lineas.length > 0) {
      const inserts = lineas.map((l) => ({
        evento_id: eventoId,
        hora: l.hora ?? null,
        actividad: l.actividad,
        responsable: l.responsable ?? null,
        ubicacion: l.ubicacion ?? null,
        observaciones: l.observaciones ?? null,
        critica: l.critica,
        estatus: "pendiente",
        orden: l.orden,
      }));
      const { error: errIns } = await sb
        .from("evento_actividades")
        .insert(inserts);
      if (errIns) throw errIns;
      actividadesInsertadas = inserts.length;
    }
  }

  return { tareasInsertadas, actividadesInsertadas };
}

/** Cuenta cuántas tareas y actividades tiene cada plantilla — útil para mostrar
 *  en el selector. */
export async function plantillaResumen(
  plantillaIds: string[],
): Promise<Map<string, { tareas: number; actividades: number }>> {
  const map = new Map<string, { tareas: number; actividades: number }>();
  if (plantillaIds.length === 0) return map;
  const sb = createSupabaseBrowserClient();
  plantillaIds.forEach((id) =>
    map.set(id, { tareas: 0, actividades: 0 }),
  );

  const [tRes, aRes] = await Promise.all([
    sb
      .from("evento_plantilla_tareas")
      .select("plantilla_id")
      .in("plantilla_id", plantillaIds),
    sb
      .from("evento_plantilla_actividades")
      .select("plantilla_id")
      .in("plantilla_id", plantillaIds),
  ]);
  if (tRes.error) throw tRes.error;
  if (aRes.error) throw aRes.error;

  (tRes.data as { plantilla_id: string }[]).forEach((r) => {
    const cur = map.get(r.plantilla_id);
    if (cur) cur.tareas += 1;
  });
  (aRes.data as { plantilla_id: string }[]).forEach((r) => {
    const cur = map.get(r.plantilla_id);
    if (cur) cur.actividades += 1;
  });

  return map;
}
