"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  loadEventos as lsLoad,
  saveEventos as lsSave,
  ensureSeeded,
  uid,
} from "@/lib/storage";
import type { Evento, EstadoEvento } from "@/lib/types";

const HAS_SB =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

type Row = {
  id: string;
  titulo: string;
  fecha: string;
  fecha_fin: string | null;
  horario: string | null;
  estado: string;
  ubicacion: string | null;
  cliente: string | null;
  cantidad_personas: number | string | null;
  descripcion: string | null;
  notas: string | null;
};

function rowToEvento(r: Row): Evento {
  return {
    id: r.id,
    titulo: r.titulo,
    fecha: r.fecha,
    fechaFin: r.fecha_fin ?? undefined,
    horario: r.horario || undefined,
    estado: r.estado as EstadoEvento,
    ubicacion: r.ubicacion || undefined,
    cliente: r.cliente || undefined,
    cantidadPersonas:
      r.cantidad_personas === null || r.cantidad_personas === undefined
        ? undefined
        : Number(r.cantidad_personas),
    descripcion: r.descripcion || undefined,
    notas: r.notas || undefined,
  };
}

/**
 * Input para crear o actualizar un evento. A diferencia de `Evento` (donde los
 * campos opcionales son `undefined`), aquí permitimos `null` explícitamente
 * para indicar "limpiar este campo" en updates. Esto evita el bug clásico
 * donde vaciar un textarea no se persistía porque el form mandaba `undefined`
 * y el patch lo interpretaba como "no tocar".
 */
export type EventoInput = {
  titulo: string;
  fecha: string;
  fechaFin?: string | null;
  horario?: string | null;
  estado: EstadoEvento;
  ubicacion?: string | null;
  cliente?: string | null;
  cantidadPersonas?: number | null;
  descripcion?: string | null;
  notas?: string | null;
};

/** Devuelve null si el string es nullish o vacío (post-trim); si no, el trim. */
function strOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

export async function listEventos(): Promise<Evento[]> {
  if (!HAS_SB) {
    ensureSeeded();
    return lsLoad();
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("eventos")
    .select("*")
    .order("fecha", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(rowToEvento);
}

/** Normaliza un EventoInput a Evento (null → undefined) para el storage local. */
function inputToEvento(input: EventoInput, id: string): Evento {
  return {
    id,
    titulo: input.titulo,
    fecha: input.fecha,
    fechaFin: strOrNull(input.fechaFin) ?? undefined,
    horario: strOrNull(input.horario) ?? undefined,
    estado: input.estado,
    ubicacion: strOrNull(input.ubicacion) ?? undefined,
    cliente: strOrNull(input.cliente) ?? undefined,
    cantidadPersonas: input.cantidadPersonas ?? undefined,
    descripcion: strOrNull(input.descripcion) ?? undefined,
    notas: strOrNull(input.notas) ?? undefined,
  };
}

export async function createEvento(input: EventoInput): Promise<Evento> {
  if (!HAS_SB) {
    const ev = inputToEvento(input, uid());
    lsSave([...lsLoad(), ev]);
    return ev;
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("eventos")
    .insert({
      titulo: input.titulo,
      fecha: input.fecha,
      fecha_fin: strOrNull(input.fechaFin),
      horario: strOrNull(input.horario),
      estado: input.estado,
      ubicacion: strOrNull(input.ubicacion),
      cliente: strOrNull(input.cliente),
      cantidad_personas: input.cantidadPersonas ?? null,
      descripcion: strOrNull(input.descripcion),
      notas: strOrNull(input.notas),
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToEvento(data as Row);
}

export async function updateEvento(
  id: string,
  patch: Partial<EventoInput>,
): Promise<Evento> {
  if (!HAS_SB) {
    const all = lsLoad();
    const next = all.map((e) => {
      if (e.id !== id) return e;
      // Normalizamos null → undefined al mergear con el evento existente
      // para mantener el tipo Evento limpio en localStorage.
      const merged: Evento = { ...e };
      if (patch.titulo !== undefined) merged.titulo = patch.titulo;
      if (patch.fecha !== undefined) merged.fecha = patch.fecha;
      if (patch.fechaFin !== undefined)
        merged.fechaFin = strOrNull(patch.fechaFin) ?? undefined;
      if (patch.horario !== undefined)
        merged.horario = strOrNull(patch.horario) ?? undefined;
      if (patch.estado !== undefined) merged.estado = patch.estado;
      if (patch.ubicacion !== undefined)
        merged.ubicacion = strOrNull(patch.ubicacion) ?? undefined;
      if (patch.cliente !== undefined)
        merged.cliente = strOrNull(patch.cliente) ?? undefined;
      if (patch.cantidadPersonas !== undefined)
        merged.cantidadPersonas = patch.cantidadPersonas ?? undefined;
      if (patch.descripcion !== undefined)
        merged.descripcion = strOrNull(patch.descripcion) ?? undefined;
      if (patch.notas !== undefined)
        merged.notas = strOrNull(patch.notas) ?? undefined;
      return merged;
    });
    lsSave(next);
    return next.find((e) => e.id === id)!;
  }
  const sb = createSupabaseBrowserClient();
  const dbPatch: Record<string, unknown> = {};
  // Para campos opcionales: undefined = "no tocar", "" o null = "limpiar".
  // strOrNull se encarga de la conversión a null cuando viene vacío o nullish.
  if (patch.titulo !== undefined) dbPatch.titulo = patch.titulo;
  if (patch.fecha !== undefined) dbPatch.fecha = patch.fecha;
  if (patch.fechaFin !== undefined) dbPatch.fecha_fin = strOrNull(patch.fechaFin);
  if (patch.horario !== undefined) dbPatch.horario = strOrNull(patch.horario);
  if (patch.estado !== undefined) dbPatch.estado = patch.estado;
  if (patch.ubicacion !== undefined) dbPatch.ubicacion = strOrNull(patch.ubicacion);
  if (patch.cliente !== undefined) dbPatch.cliente = strOrNull(patch.cliente);
  if (patch.cantidadPersonas !== undefined)
    dbPatch.cantidad_personas = patch.cantidadPersonas ?? null;
  if (patch.descripcion !== undefined)
    dbPatch.descripcion = strOrNull(patch.descripcion);
  if (patch.notas !== undefined) dbPatch.notas = strOrNull(patch.notas);

  const { data, error } = await sb
    .from("eventos")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToEvento(data as Row);
}

export async function deleteEvento(id: string): Promise<void> {
  if (!HAS_SB) {
    lsSave(lsLoad().filter((e) => e.id !== id));
    return;
  }
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("eventos").delete().eq("id", id);
  if (error) throw error;
}
