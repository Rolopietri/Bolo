"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { uid } from "@/lib/storage";
import type {
  CalendarioItem,
  TipoCalendario,
  EstadoCalendario,
} from "@/lib/types";

const HAS_SB =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Respaldo local (cuando no hay Supabase configurado) ──────────────
const LS_KEY = "qm_calendario_v1";

function lsLoad(): CalendarioItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CalendarioItem[]) : [];
  } catch {
    return [];
  }
}

function lsSave(items: CalendarioItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    // sin persistencia (modo privado / almacenamiento lleno)
  }
}

// ── Mapeo fila (snake_case) ↔ dominio (camelCase) ────────────────────
type Row = {
  id: string;
  tipo: string;
  titulo: string;
  fecha: string;
  fecha_fin: string | null;
  hora: string | null;
  responsable: string | null;
  area: string | null;
  estado: string;
  notas: string | null;
};

function rowToItem(r: Row): CalendarioItem {
  return {
    id: r.id,
    tipo: r.tipo as TipoCalendario,
    titulo: r.titulo,
    fecha: r.fecha,
    fechaFin: r.fecha_fin ?? undefined,
    hora: r.hora || undefined,
    responsable: r.responsable || undefined,
    area: r.area || undefined,
    estado: r.estado as EstadoCalendario,
    notas: r.notas || undefined,
  };
}

/**
 * Input para crear/actualizar. Como en `eventos.ts`: permitimos `null` explícito
 * para "limpiar este campo"; `undefined` en un patch significa "no tocar".
 */
export type CalendarioItemInput = {
  tipo: TipoCalendario;
  titulo: string;
  fecha: string;
  fechaFin?: string | null;
  hora?: string | null;
  responsable?: string | null;
  area?: string | null;
  estado: EstadoCalendario;
  notas?: string | null;
};

/** Devuelve null si el string es nullish o vacío (post-trim); si no, el trim. */
function strOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function inputToItem(input: CalendarioItemInput, id: string): CalendarioItem {
  return {
    id,
    tipo: input.tipo,
    titulo: input.titulo,
    fecha: input.fecha,
    fechaFin: strOrNull(input.fechaFin) ?? undefined,
    hora: strOrNull(input.hora) ?? undefined,
    responsable: strOrNull(input.responsable) ?? undefined,
    area: strOrNull(input.area) ?? undefined,
    estado: input.estado,
    notas: strOrNull(input.notas) ?? undefined,
  };
}

export async function listCalendario(): Promise<CalendarioItem[]> {
  if (!HAS_SB) {
    return lsLoad().sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("calendario_items")
    .select("*")
    .order("fecha", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(rowToItem);
}

export async function createCalendarioItem(
  input: CalendarioItemInput,
): Promise<CalendarioItem> {
  if (!HAS_SB) {
    const item = inputToItem(input, uid());
    lsSave([...lsLoad(), item]);
    return item;
  }
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("calendario_items")
    .insert({
      tipo: input.tipo,
      titulo: input.titulo,
      fecha: input.fecha,
      fecha_fin: strOrNull(input.fechaFin),
      hora: strOrNull(input.hora),
      responsable: strOrNull(input.responsable),
      area: strOrNull(input.area),
      estado: input.estado,
      notas: strOrNull(input.notas),
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

export async function updateCalendarioItem(
  id: string,
  patch: Partial<CalendarioItemInput>,
): Promise<CalendarioItem> {
  if (!HAS_SB) {
    const all = lsLoad();
    const next = all.map((it) => {
      if (it.id !== id) return it;
      const merged: CalendarioItem = { ...it };
      if (patch.tipo !== undefined) merged.tipo = patch.tipo;
      if (patch.titulo !== undefined) merged.titulo = patch.titulo;
      if (patch.fecha !== undefined) merged.fecha = patch.fecha;
      if (patch.fechaFin !== undefined)
        merged.fechaFin = strOrNull(patch.fechaFin) ?? undefined;
      if (patch.hora !== undefined)
        merged.hora = strOrNull(patch.hora) ?? undefined;
      if (patch.responsable !== undefined)
        merged.responsable = strOrNull(patch.responsable) ?? undefined;
      if (patch.area !== undefined)
        merged.area = strOrNull(patch.area) ?? undefined;
      if (patch.estado !== undefined) merged.estado = patch.estado;
      if (patch.notas !== undefined)
        merged.notas = strOrNull(patch.notas) ?? undefined;
      return merged;
    });
    lsSave(next);
    return next.find((it) => it.id === id)!;
  }
  const sb = createSupabaseBrowserClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.tipo !== undefined) dbPatch.tipo = patch.tipo;
  if (patch.titulo !== undefined) dbPatch.titulo = patch.titulo;
  if (patch.fecha !== undefined) dbPatch.fecha = patch.fecha;
  if (patch.fechaFin !== undefined) dbPatch.fecha_fin = strOrNull(patch.fechaFin);
  if (patch.hora !== undefined) dbPatch.hora = strOrNull(patch.hora);
  if (patch.responsable !== undefined)
    dbPatch.responsable = strOrNull(patch.responsable);
  if (patch.area !== undefined) dbPatch.area = strOrNull(patch.area);
  if (patch.estado !== undefined) dbPatch.estado = patch.estado;
  if (patch.notas !== undefined) dbPatch.notas = strOrNull(patch.notas);

  const { data, error } = await sb
    .from("calendario_items")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

export async function deleteCalendarioItem(id: string): Promise<void> {
  if (!HAS_SB) {
    lsSave(lsLoad().filter((it) => it.id !== id));
    return;
  }
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("calendario_items").delete().eq("id", id);
  if (error) throw error;
}
