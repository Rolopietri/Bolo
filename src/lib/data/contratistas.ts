"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Contratista } from "@/lib/types";

type Row = {
  id: string;
  nombre: string;
  especialidad: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  precio_referencial_usd: number | string | null;
  comision_porc: number | string | null;
  notas: string | null;
  activo: boolean;
};

function rowToContratista(r: Row): Contratista {
  return {
    id: r.id,
    nombre: r.nombre,
    especialidad: r.especialidad,
    contactoNombre: r.contacto_nombre ?? undefined,
    contactoTelefono: r.contacto_telefono ?? undefined,
    contactoEmail: r.contacto_email ?? undefined,
    precioReferencialUsd:
      r.precio_referencial_usd === null
        ? undefined
        : Number(r.precio_referencial_usd),
    comisionPorc:
      r.comision_porc === null ? undefined : Number(r.comision_porc),
    notas: r.notas ?? undefined,
    activo: r.activo,
  };
}

export type ContratistaInput = Omit<Contratista, "id">;

export async function listContratistas(): Promise<Contratista[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("contratistas")
    .select("*")
    .order("especialidad")
    .order("nombre");
  if (error) throw error;
  return (data as Row[]).map(rowToContratista);
}

export async function createContratista(
  input: ContratistaInput,
): Promise<Contratista> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("contratistas")
    .insert({
      nombre: input.nombre,
      especialidad: input.especialidad,
      contacto_nombre: input.contactoNombre ?? null,
      contacto_telefono: input.contactoTelefono ?? null,
      contacto_email: input.contactoEmail ?? null,
      precio_referencial_usd: input.precioReferencialUsd ?? null,
      comision_porc: input.comisionPorc ?? null,
      notas: input.notas ?? null,
      activo: input.activo,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToContratista(data as Row);
}

export async function updateContratista(
  id: string,
  patch: Partial<ContratistaInput>,
): Promise<Contratista> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.nombre !== undefined) db.nombre = patch.nombre;
  if (patch.especialidad !== undefined) db.especialidad = patch.especialidad;
  if (patch.contactoNombre !== undefined)
    db.contacto_nombre = patch.contactoNombre ?? null;
  if (patch.contactoTelefono !== undefined)
    db.contacto_telefono = patch.contactoTelefono ?? null;
  if (patch.contactoEmail !== undefined)
    db.contacto_email = patch.contactoEmail ?? null;
  if (patch.precioReferencialUsd !== undefined)
    db.precio_referencial_usd = patch.precioReferencialUsd ?? null;
  if (patch.comisionPorc !== undefined)
    db.comision_porc = patch.comisionPorc ?? null;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.activo !== undefined) db.activo = patch.activo;

  const { data, error } = await sb
    .from("contratistas")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToContratista(data as Row);
}

export async function deleteContratista(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("contratistas").delete().eq("id", id);
  if (error) throw error;
}
