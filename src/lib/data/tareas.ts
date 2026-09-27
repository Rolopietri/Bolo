"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  loadTareas as lsLoad,
  saveTareas as lsSave,
  ensureSeeded,
  uid,
} from "@/lib/storage";
import type { Tarea, EstadoTarea, Area, Prioridad } from "@/lib/types";

const HAS_SB =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Row = {
  id: string;
  titulo: string;
  estado: string;
  area: string | null;
  prioridad: string | null;
  asignado_a: string | null;
  fecha_limite: string | null;
  notas: string | null;
  created_at: string;
};

function rowToTarea(r: Row): Tarea {
  return {
    id: r.id,
    titulo: r.titulo,
    estado: r.estado as EstadoTarea,
    area: (r.area as Area) || undefined,
    prioridad: (r.prioridad as Prioridad) || undefined,
    asignadoA: r.asignado_a || undefined,
    fechaLimite: r.fecha_limite || undefined,
    notas: r.notas || undefined,
    createdAt: r.created_at,
  };
}

export type TareaInput = Omit<Tarea, "id" | "createdAt">;

export async function listTareas(): Promise<Tarea[]> {
  if (!HAS_SB) {
    ensureSeeded();
    return lsLoad();
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("tareas")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(rowToTarea);
}

export async function createTarea(input: TareaInput): Promise<Tarea> {
  if (!HAS_SB) {
    const t: Tarea = { ...input, id: uid(), createdAt: new Date().toISOString() };
    const next = [t, ...lsLoad()];
    lsSave(next);
    return t;
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("tareas")
    .insert({
      titulo: input.titulo,
      estado: input.estado,
      area: input.area ?? null,
      prioridad: input.prioridad ?? null,
      asignado_a: input.asignadoA ?? null,
      fecha_limite: input.fechaLimite ?? null,
      notas: input.notas ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToTarea(data as Row);
}

export async function updateTarea(
  id: string,
  patch: Partial<TareaInput>,
): Promise<Tarea> {
  if (!HAS_SB) {
    const all = lsLoad();
    const next = all.map((t) => (t.id === id ? { ...t, ...patch } : t));
    lsSave(next);
    return next.find((t) => t.id === id)!;
  }
  const sb = createSupabaseBrowserClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.titulo !== undefined) dbPatch.titulo = patch.titulo;
  if (patch.estado !== undefined) dbPatch.estado = patch.estado;
  if (patch.area !== undefined) dbPatch.area = patch.area ?? null;
  if (patch.prioridad !== undefined) dbPatch.prioridad = patch.prioridad ?? null;
  if (patch.asignadoA !== undefined) dbPatch.asignado_a = patch.asignadoA ?? null;
  if (patch.fechaLimite !== undefined)
    dbPatch.fecha_limite = patch.fechaLimite ?? null;
  if (patch.notas !== undefined) dbPatch.notas = patch.notas ?? null;

  const { data, error } = await sb
    .from("tareas")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToTarea(data as Row);
}

export async function deleteTarea(id: string): Promise<void> {
  if (!HAS_SB) {
    lsSave(lsLoad().filter((t) => t.id !== id));
    return;
  }
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("tareas").delete().eq("id", id);
  if (error) throw error;
}
