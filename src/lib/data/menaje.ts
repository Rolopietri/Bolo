"use client";

// Menaje (M6 de cocina).
// Items durables (vajilla, cristalería, cubiertos, etc.) que no se consumen
// pero hay que inventariar. Soporta movimientos de baja (rotura, deterioro,
// mancha, pérdida, robo) y entrada (compra con factura adjunta).

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  MenajeItem,
  MovimientoMenaje,
  TipoMovimientoMenaje,
} from "@/lib/types";

const BUCKET = "menaje-facturas";
const BUCKET_FOTOS = "menaje-fotos";
const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Sube la foto de un ítem de menaje al bucket PÚBLICO `menaje-fotos` y devuelve
 * su URL pública (estable). A diferencia de las facturas (bucket privado con
 * signed URLs), las fotos de producto no son sensibles: se muestran directo en
 * la app y en el PDF del cliente.
 */
export async function subirFotoMenaje(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("La foto debe ser una imagen (JPG, PNG, etc.).");
  }
  if (file.size > FOTO_MAX_BYTES) {
    throw new Error("La foto no puede pesar más de 5 MB.");
  }
  const sb = createSupabaseBrowserClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathName = `fotos/${Date.now()}_${safeName}`;
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

// ─── ITEMS ─────────────────────────────────────────────────────────

type ItemRow = {
  id: string;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  cantidad_actual: number | string;
  cantidad_inicial: number | string | null;
  precio_reposicion_usd: number | string | null;
  foto_url: string | null;
  notas: string | null;
  activo: boolean;
};

function rowToItem(r: ItemRow): MenajeItem {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    descripcion: r.descripcion ?? undefined,
    cantidadActual: Number(r.cantidad_actual),
    cantidadInicial:
      r.cantidad_inicial === null || r.cantidad_inicial === undefined
        ? undefined
        : Number(r.cantidad_inicial),
    precioReposicionUsd:
      r.precio_reposicion_usd === null || r.precio_reposicion_usd === undefined
        ? undefined
        : Number(r.precio_reposicion_usd),
    fotoUrl: r.foto_url ?? undefined,
    notas: r.notas ?? undefined,
    activo: r.activo,
  };
}

export type MenajeItemInput = Omit<MenajeItem, "id">;

export async function listMenaje(): Promise<MenajeItem[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("menaje_items")
    .select("*")
    .order("categoria")
    .order("nombre");
  if (error) throw error;
  return (data as ItemRow[]).map(rowToItem);
}

export async function createMenajeItem(
  input: MenajeItemInput,
): Promise<MenajeItem> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("menaje_items")
    .insert({
      nombre: input.nombre,
      categoria: input.categoria,
      descripcion: input.descripcion ?? null,
      cantidad_actual: input.cantidadActual,
      cantidad_inicial: input.cantidadInicial ?? input.cantidadActual,
      precio_reposicion_usd: input.precioReposicionUsd ?? null,
      foto_url: input.fotoUrl ?? null,
      notas: input.notas ?? null,
      activo: input.activo,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as ItemRow);
}

export async function updateMenajeItem(
  id: string,
  patch: Partial<MenajeItemInput>,
): Promise<MenajeItem> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.nombre !== undefined) db.nombre = patch.nombre;
  if (patch.categoria !== undefined) db.categoria = patch.categoria;
  if (patch.descripcion !== undefined)
    db.descripcion = patch.descripcion ?? null;
  if (patch.cantidadActual !== undefined)
    db.cantidad_actual = patch.cantidadActual;
  if (patch.cantidadInicial !== undefined)
    db.cantidad_inicial = patch.cantidadInicial ?? null;
  if (patch.precioReposicionUsd !== undefined)
    db.precio_reposicion_usd = patch.precioReposicionUsd ?? null;
  if (patch.fotoUrl !== undefined) db.foto_url = patch.fotoUrl ?? null;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.activo !== undefined) db.activo = patch.activo;
  const { data, error } = await sb
    .from("menaje_items")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToItem(data as ItemRow);
}

export async function deleteMenajeItem(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("menaje_items").delete().eq("id", id);
  if (error) throw error;
}

// ─── MOVIMIENTOS ───────────────────────────────────────────────────

type MovRow = {
  id: string;
  item_id: string;
  tipo: string;
  cantidad: number | string;
  motivo: string | null;
  fecha: string;
  factura_url: string | null;
  factura_nombre: string | null;
  precio_unitario_usd: number | string | null;
  precio_total_usd: number | string | null;
  nota: string | null;
  created_at: string;
};

function rowToMov(r: MovRow): MovimientoMenaje {
  return {
    id: r.id,
    itemId: r.item_id,
    tipo: r.tipo as TipoMovimientoMenaje,
    cantidad: Number(r.cantidad),
    motivo: r.motivo ?? undefined,
    fecha: r.fecha,
    facturaUrl: r.factura_url ?? undefined,
    facturaNombre: r.factura_nombre ?? undefined,
    precioUnitarioUsd:
      r.precio_unitario_usd === null || r.precio_unitario_usd === undefined
        ? undefined
        : Number(r.precio_unitario_usd),
    precioTotalUsd:
      r.precio_total_usd === null || r.precio_total_usd === undefined
        ? undefined
        : Number(r.precio_total_usd),
    nota: r.nota ?? undefined,
    createdAt: r.created_at,
  };
}

export async function listMovimientosMenaje(
  opts: { itemId?: string; limit?: number } = {},
): Promise<MovimientoMenaje[]> {
  const sb = createSupabaseBrowserClient();
  let q = sb
    .from("menaje_movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (opts.itemId) q = q.eq("item_id", opts.itemId);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MovRow[]).map(rowToMov);
}

// ─── REGISTRAR BAJA (rotura, deterioro, etc.) ──────────────────────

export type BajaMenajeInput = {
  itemId: string;
  cantidad: number;  // positivo — internamente se guarda negativo
  tipo: Extract<
    TipoMovimientoMenaje,
    "rotura" | "deterioro" | "mancha" | "perdida" | "robo" | "otro"
  >;
  motivo?: string;
  fecha?: string;
  nota?: string;
};

export async function registrarBajaMenaje(
  input: BajaMenajeInput,
): Promise<{ movimiento: MovimientoMenaje; cantidadActual: number }> {
  if (input.cantidad <= 0) {
    throw new Error("La cantidad debe ser mayor a 0.");
  }
  const sb = createSupabaseBrowserClient();

  // 1. Insertar movimiento (cantidad NEGATIVA)
  const { data: movRow, error: movErr } = await sb
    .from("menaje_movimientos")
    .insert({
      item_id: input.itemId,
      tipo: input.tipo,
      cantidad: -Math.abs(input.cantidad),
      motivo: input.motivo?.trim() || null,
      fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
      nota: input.nota?.trim() || null,
    })
    .select("*")
    .single();
  if (movErr) throw movErr;

  // 2. Descontar cantidad_actual de forma ATÓMICA (delta negativo).
  const { data: nuevaCant, error: updErr } = await sb.rpc(
    "ajustar_menaje_stock",
    { p_item_id: input.itemId, p_delta: -Math.abs(input.cantidad) },
  );
  if (updErr) throw updErr;
  const nueva = Number(nuevaCant ?? 0);
  return { movimiento: rowToMov(movRow as MovRow), cantidadActual: nueva };
}

// ─── REGISTRAR COMPRA (con factura opcional) ───────────────────────

export type CompraMenajeInput = {
  itemId: string;
  cantidad: number;
  precioUnitarioUsd?: number;
  precioTotalUsd?: number;
  fecha?: string;
  factura?: File;             // archivo opcional
  motivo?: string;
  nota?: string;
};

/**
 * Sube el archivo de factura (si hay) a Supabase Storage y devuelve la URL
 * pública/signed que se guarda en el movimiento.
 */
const FACTURA_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

async function subirFactura(file: File, itemId: string): Promise<{ url: string; nombre: string }> {
  // Validación real (el `accept` del input es solo una sugerencia del navegador).
  const esPdf = file.type === "application/pdf";
  const esImagen = file.type.startsWith("image/");
  if (!esPdf && !esImagen) {
    throw new Error("La factura debe ser un PDF o una imagen.");
  }
  if (file.size > FACTURA_MAX_BYTES) {
    throw new Error("La factura no puede pesar más de 10 MB.");
  }
  const sb = createSupabaseBrowserClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${itemId}/${Date.now()}_${safeName}`;
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
  if (upErr) throw upErr;
  // El bucket es privado — guardamos el path, generamos signed URL al mostrar
  return { url: path, nombre: file.name };
}

export async function registrarCompraMenaje(
  input: CompraMenajeInput,
): Promise<{ movimiento: MovimientoMenaje; cantidadActual: number }> {
  if (input.cantidad <= 0) {
    throw new Error("La cantidad debe ser mayor a 0.");
  }
  const sb = createSupabaseBrowserClient();

  // 1. Subir factura si hay
  let facturaUrl: string | null = null;
  let facturaNombre: string | null = null;
  if (input.factura) {
    const r = await subirFactura(input.factura, input.itemId);
    facturaUrl = r.url;
    facturaNombre = r.nombre;
  }

  // 2. Insertar movimiento (cantidad positiva)
  const total =
    input.precioTotalUsd ??
    (input.precioUnitarioUsd !== undefined
      ? input.precioUnitarioUsd * input.cantidad
      : null);
  const { data: movRow, error: movErr } = await sb
    .from("menaje_movimientos")
    .insert({
      item_id: input.itemId,
      tipo: "compra",
      cantidad: Math.abs(input.cantidad),
      motivo: input.motivo?.trim() || null,
      fecha: input.fecha ?? new Date().toISOString().slice(0, 10),
      factura_url: facturaUrl,
      factura_nombre: facturaNombre,
      precio_unitario_usd: input.precioUnitarioUsd ?? null,
      precio_total_usd: total,
      nota: input.nota?.trim() || null,
    })
    .select("*")
    .single();
  if (movErr) throw movErr;

  // 3. Sumar al cantidad_actual de forma ATÓMICA (delta positivo). El RPC
  //    también guarda el precio de reposición si el ítem no tenía uno.
  const { data: nuevaCant, error: updErr } = await sb.rpc(
    "ajustar_menaje_stock",
    {
      p_item_id: input.itemId,
      p_delta: Math.abs(input.cantidad),
      p_precio_reposicion: input.precioUnitarioUsd ?? null,
    },
  );
  if (updErr) throw updErr;
  const nueva = Number(nuevaCant ?? 0);
  return { movimiento: rowToMov(movRow as MovRow), cantidadActual: nueva };
}

/** Genera una signed URL temporal (1 hora) para mostrar la factura. */
export async function getFacturaSignedUrl(path: string): Promise<string | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteMovimientoMenaje(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("menaje_movimientos").delete().eq("id", id);
  if (error) throw error;
}
