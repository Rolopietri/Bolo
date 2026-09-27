"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { InventarioItem, EstadoInventario } from "@/lib/types";

type Row = {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  cantidad_disponible: number | string;
  precio_alquiler_usd: number | string | null;
  estado: string;
  foto_url: string | null;
  notas: string | null;
  activo: boolean;
};

function rowToItem(r: Row): InventarioItem {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    descripcion: r.descripcion ?? undefined,
    cantidadDisponible: Number(r.cantidad_disponible),
    precioAlquilerUsd:
      r.precio_alquiler_usd === null
        ? undefined
        : Number(r.precio_alquiler_usd),
    estado: r.estado as EstadoInventario,
    fotoUrl: r.foto_url ?? undefined,
    notas: r.notas ?? undefined,
    activo: r.activo,
  };
}

export type InventarioInput = Omit<InventarioItem, "id">;

export async function listInventario(): Promise<InventarioItem[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("inventario_alquiler")
    .select("*")
    .order("categoria")
    .order("nombre");
  if (error) throw error;
  return (data as Row[]).map(rowToItem);
}

export async function createInventarioItem(
  input: InventarioInput,
): Promise<InventarioItem> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("inventario_alquiler")
    .insert({
      nombre: input.nombre,
      categoria: input.categoria,
      descripcion: input.descripcion ?? null,
      cantidad_disponible: input.cantidadDisponible,
      precio_alquiler_usd: input.precioAlquilerUsd ?? null,
      estado: input.estado,
      foto_url: input.fotoUrl ?? null,
      notas: input.notas ?? null,
      activo: input.activo,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

export async function updateInventarioItem(
  id: string,
  patch: Partial<InventarioInput>,
): Promise<InventarioItem> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.nombre !== undefined) db.nombre = patch.nombre;
  if (patch.categoria !== undefined) db.categoria = patch.categoria;
  if (patch.descripcion !== undefined)
    db.descripcion = patch.descripcion ?? null;
  if (patch.cantidadDisponible !== undefined)
    db.cantidad_disponible = patch.cantidadDisponible;
  if (patch.precioAlquilerUsd !== undefined)
    db.precio_alquiler_usd = patch.precioAlquilerUsd ?? null;
  if (patch.estado !== undefined) db.estado = patch.estado;
  if (patch.fotoUrl !== undefined) db.foto_url = patch.fotoUrl ?? null;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.activo !== undefined) db.activo = patch.activo;

  const { data, error } = await sb
    .from("inventario_alquiler")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as Row);
}

export async function deleteInventarioItem(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("inventario_alquiler").delete().eq("id", id);
  if (error) throw error;
}
