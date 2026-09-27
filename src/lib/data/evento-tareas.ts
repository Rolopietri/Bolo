"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EventoTarea } from "@/lib/types";

type Row = {
  id: string;
  evento_id: string;
  fase: string;
  titulo: string;
  responsable: string | null;
  notas: string | null;
  fecha_limite: string | null;
  completada: boolean;
  orden: number;
};

function rowToTarea(r: Row): EventoTarea {
  return {
    id: r.id,
    eventoId: r.evento_id,
    fase: r.fase,
    titulo: r.titulo,
    responsable: r.responsable ?? undefined,
    notas: r.notas ?? undefined,
    fechaLimite: r.fecha_limite ?? undefined,
    completada: r.completada,
    orden: r.orden,
  };
}

export type EventoTareaInput = Omit<EventoTarea, "id">;

export async function listTareas(eventoId: string): Promise<EventoTarea[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_tareas")
    .select("*")
    .eq("evento_id", eventoId)
    .order("fase")
    .order("orden");
  if (error) throw error;
  return (data as Row[]).map(rowToTarea);
}

export async function createTarea(input: EventoTareaInput): Promise<EventoTarea> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_tareas")
    .insert({
      evento_id: input.eventoId,
      fase: input.fase,
      titulo: input.titulo,
      responsable: input.responsable ?? null,
      notas: input.notas ?? null,
      fecha_limite: input.fechaLimite ?? null,
      completada: input.completada,
      orden: input.orden,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToTarea(data as Row);
}

export async function updateTarea(
  id: string,
  patch: Partial<EventoTareaInput>,
): Promise<EventoTarea> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.eventoId !== undefined) db.evento_id = patch.eventoId;
  if (patch.fase !== undefined) db.fase = patch.fase;
  if (patch.titulo !== undefined) db.titulo = patch.titulo;
  if (patch.responsable !== undefined)
    db.responsable = patch.responsable ?? null;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.fechaLimite !== undefined)
    db.fecha_limite = patch.fechaLimite ?? null;
  if (patch.completada !== undefined) db.completada = patch.completada;
  if (patch.orden !== undefined) db.orden = patch.orden;

  const { data, error } = await sb
    .from("evento_tareas")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToTarea(data as Row);
}

export async function deleteTarea(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("evento_tareas").delete().eq("id", id);
  if (error) throw error;
}

/** Devuelve { total, completadas, pendientes } para un evento — útil para
 *  mostrar el progreso en la lista sin cargar las tareas completas. */
export async function tareasResumen(
  eventoIds: string[],
): Promise<Map<string, { total: number; completadas: number }>> {
  const map = new Map<string, { total: number; completadas: number }>();
  if (eventoIds.length === 0) return map;
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("evento_tareas")
    .select("evento_id, completada")
    .in("evento_id", eventoIds);
  if (error) throw error;
  (data as { evento_id: string; completada: boolean }[]).forEach((r) => {
    const cur = map.get(r.evento_id) ?? { total: 0, completadas: 0 };
    cur.total += 1;
    if (r.completada) cur.completadas += 1;
    map.set(r.evento_id, cur);
  });
  return map;
}
