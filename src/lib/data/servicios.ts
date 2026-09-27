"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Servicio,
  CategoriaServicio,
  UnidadServicio,
} from "@/lib/types";

type Row = {
  id: string;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  unidad: string;
  precio_unitario: number | string | null;
  manual: boolean;
  incluido: boolean;
  activo: boolean;
  orden: number;
};

function toServicio(r: Row): Servicio {
  const precio = r.precio_unitario === null ? null : Number(r.precio_unitario);
  return {
    id: r.id,
    categoria: r.categoria as CategoriaServicio,
    nombre: r.nombre,
    descripcion: r.descripcion ?? undefined,
    unidad: r.unidad as UnidadServicio,
    precioUnitario: precio,
    manual: r.manual,
    incluido: r.incluido,
    activo: r.activo,
    orden: r.orden,
  };
}

export type ServicioInput = Omit<Servicio, "id">;

export async function listServicios(): Promise<Servicio[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("services_catalog")
    .select("*")
    .order("orden", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(toServicio);
}

export async function createServicio(input: ServicioInput): Promise<Servicio> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("services_catalog")
    .insert({
      categoria: input.categoria,
      nombre: input.nombre,
      descripcion: input.descripcion ?? null,
      unidad: input.unidad,
      precio_unitario: input.precioUnitario,
      manual: input.manual,
      incluido: input.incluido,
      activo: input.activo,
      orden: input.orden,
    })
    .select("*")
    .single();
  if (error) throw error;
  return toServicio(data as Row);
}

export async function updateServicio(
  id: string,
  patch: Partial<ServicioInput>,
): Promise<Servicio> {
  const sb = createSupabaseBrowserClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.categoria !== undefined) dbPatch.categoria = patch.categoria;
  if (patch.nombre !== undefined) dbPatch.nombre = patch.nombre;
  if (patch.descripcion !== undefined)
    dbPatch.descripcion = patch.descripcion ?? null;
  if (patch.unidad !== undefined) dbPatch.unidad = patch.unidad;
  if (patch.precioUnitario !== undefined)
    dbPatch.precio_unitario = patch.precioUnitario;
  if (patch.manual !== undefined) dbPatch.manual = patch.manual;
  if (patch.incluido !== undefined) dbPatch.incluido = patch.incluido;
  if (patch.activo !== undefined) dbPatch.activo = patch.activo;
  if (patch.orden !== undefined) dbPatch.orden = patch.orden;

  const { data, error } = await sb
    .from("services_catalog")
    .update(dbPatch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return toServicio(data as Row);
}

export async function deleteServicio(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("services_catalog").delete().eq("id", id);
  if (error) throw error;
}
