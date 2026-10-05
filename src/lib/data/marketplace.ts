"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Mercado (marketplace) de bolo. Anuncios GLOBALES (los ven todos los clientes):
 * proveedores de insumos, equipos de cocina y productos para revender.
 * Cualquier usuario autenticado publica; cada quien edita/borra lo suyo.
 * Sin pagos: solo conecta (contacto directo por WhatsApp/teléfono).
 */
export type TipoAnuncio = "insumo" | "equipo" | "reventa";

export type Anuncio = {
  id: string;
  tipo: TipoAnuncio;
  titulo: string;
  descripcion?: string | null;
  precio?: number | null;
  moneda: string;
  categoria?: string | null;
  ciudad?: string | null;
  contactoNombre?: string | null;
  contactoWhatsapp?: string | null;
  fotoUrl?: string | null;
  publicadoPor?: string | null;
  activo: boolean;
  createdAt: string;
};

export type AnuncioInput = {
  tipo: TipoAnuncio;
  titulo: string;
  descripcion?: string;
  precio?: number | null;
  moneda?: string;
  categoria?: string;
  ciudad?: string;
  contactoNombre?: string;
  contactoWhatsapp?: string;
  fotoUrl?: string;
};

type Row = {
  id: string;
  tipo: TipoAnuncio;
  titulo: string;
  descripcion: string | null;
  precio: number | null;
  moneda: string;
  categoria: string | null;
  ciudad: string | null;
  contacto_nombre: string | null;
  contacto_whatsapp: string | null;
  foto_url: string | null;
  publicado_por: string | null;
  activo: boolean;
  created_at: string;
};

function rowToAnuncio(r: Row): Anuncio {
  return {
    id: r.id,
    tipo: r.tipo,
    titulo: r.titulo,
    descripcion: r.descripcion,
    precio: r.precio === null ? null : Number(r.precio),
    moneda: r.moneda,
    categoria: r.categoria,
    ciudad: r.ciudad,
    contactoNombre: r.contacto_nombre,
    contactoWhatsapp: r.contacto_whatsapp,
    fotoUrl: r.foto_url,
    publicadoPor: r.publicado_por,
    activo: r.activo,
    createdAt: r.created_at,
  };
}

export async function listAnuncios(): Promise<Anuncio[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("marketplace_anuncios")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Row[]).map(rowToAnuncio);
}

export async function createAnuncio(input: AnuncioInput): Promise<Anuncio> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("marketplace_anuncios")
    .insert({
      tipo: input.tipo,
      titulo: input.titulo,
      descripcion: input.descripcion || null,
      precio: input.precio ?? null,
      moneda: input.moneda || "USD",
      categoria: input.categoria || null,
      ciudad: input.ciudad || null,
      contacto_nombre: input.contactoNombre || null,
      contacto_whatsapp: input.contactoWhatsapp || null,
      foto_url: input.fotoUrl || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToAnuncio(data as Row);
}

/** Borra un anuncio (solo funciona en los propios, por RLS). */
export async function borrarAnuncio(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("marketplace_anuncios").delete().eq("id", id);
  if (error) throw error;
}

/** Id del usuario actual, para saber cuáles anuncios son suyos (y puede borrar). */
export async function getUsuarioId(): Promise<string | null> {
  const sb = createSupabaseBrowserClient();
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}

const BUCKET_FOTOS = "menaje-fotos";
const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export async function subirFotoAnuncio(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("La foto debe ser una imagen (JPG, PNG, etc.).");
  }
  if (file.size > FOTO_MAX_BYTES) {
    throw new Error("La foto no puede pesar más de 5 MB.");
  }
  const sb = createSupabaseBrowserClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathName = `marketplace/${Date.now()}_${safeName}`;
  const { error: upErr } = await sb.storage
    .from(BUCKET_FOTOS)
    .upload(pathName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (upErr) throw upErr;
  const { data } = sb.storage.from(BUCKET_FOTOS).getPublicUrl(pathName);
  return data.publicUrl;
}
