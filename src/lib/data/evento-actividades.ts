"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EventoActividad, EstatusActividad } from "@/lib/types";

type Row = {
  id: string;
  evento_id: string;
  hora: string | null;
  actividad: string;
  responsable: string | null;
  ubicacion: string | null;
  observaciones: string | null;
  critica: boolean;
  estatus: string;
  orden: number;
};

function rowToActividad(r: Row): EventoActividad {
  return {
    id: r.id,
    eventoId: r.evento_id,
    // Postgres devuelve "HH:MM:SS"; nos quedamos con "HH:MM" para mostrar
    hora: r.hora ? r.hora.slice(0, 5) : undefined,
    actividad: r.actividad,
    responsable: r.responsable ?? undefined,
    ubicacion: r.ubicacion ?? undefined,
    observaciones: r.observaciones ?? undefined,
    critica: r.critica,
    estatus: r.estatus as EstatusActividad,
    orden: r.orden,
  };
}

export type EventoActividadInput = Omit<EventoActividad, "id">;

export async function listActividades(
  eventoId: string,
): Promise<EventoActividad[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_actividades")
    .select("*")
    .eq("evento_id", eventoId)
    // Postgres ordena strings de tiempo bien (NULLS LAST por defecto en asc)
    .order("hora", { ascending: true, nullsFirst: false })
    .order("orden");
  if (error) throw error;
  return (data as Row[]).map(rowToActividad);
}

export async function createActividad(
  input: EventoActividadInput,
): Promise<EventoActividad> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_actividades")
    .insert({
      evento_id: input.eventoId,
      hora: input.hora ?? null,
      actividad: input.actividad,
      responsable: input.responsable ?? null,
      ubicacion: input.ubicacion ?? null,
      observaciones: input.observaciones ?? null,
      critica: input.critica,
      estatus: input.estatus,
      orden: input.orden,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToActividad(data as Row);
}

export async function updateActividad(
  id: string,
  patch: Partial<EventoActividadInput>,
): Promise<EventoActividad> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.eventoId !== undefined) db.evento_id = patch.eventoId;
  if (patch.hora !== undefined) db.hora = patch.hora ?? null;
  if (patch.actividad !== undefined) db.actividad = patch.actividad;
  if (patch.responsable !== undefined)
    db.responsable = patch.responsable ?? null;
  if (patch.ubicacion !== undefined) db.ubicacion = patch.ubicacion ?? null;
  if (patch.observaciones !== undefined)
    db.observaciones = patch.observaciones ?? null;
  if (patch.critica !== undefined) db.critica = patch.critica;
  if (patch.estatus !== undefined) db.estatus = patch.estatus;
  if (patch.orden !== undefined) db.orden = patch.orden;

  const { data, error } = await sb
    .from("evento_actividades")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToActividad(data as Row);
}

export async function deleteActividad(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("evento_actividades").delete().eq("id", id);
  if (error) throw error;
}
