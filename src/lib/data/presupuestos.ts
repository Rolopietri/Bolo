"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Presupuesto,
  PresupuestoItem,
  EstadoPresupuesto,
  CategoriaServicio,
  UnidadServicio,
} from "@/lib/types";

type PresupuestoRow = {
  id: string;
  numero: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  cliente_email: string | null;
  cliente_rif: string | null;
  evento_nombre: string;
  evento_fecha: string | null;
  evento_hora: string | null;
  cantidad_personas: number | null;
  montaje_fecha: string | null;
  montaje_hora: string | null;
  desmontaje_fecha: string | null;
  desmontaje_hora: string | null;
  notas: string | null;
  validez_dias: number;
  descuento: number | string;
  estado: string;
  subtotal: number | string;
  total: number | string;
  evento_id: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  presupuesto_id: string;
  service_id: string | null;
  nombre: string;
  categoria: string | null;
  unidad: string;
  cantidad: number | string;
  precio_unitario: number | string;
  subtotal: number | string;
  orden: number;
};

function rowToItem(r: ItemRow): PresupuestoItem {
  return {
    id: r.id,
    serviceId: r.service_id ?? undefined,
    nombre: r.nombre,
    categoria: (r.categoria as CategoriaServicio) ?? undefined,
    unidad: r.unidad as UnidadServicio,
    cantidad: Number(r.cantidad),
    precioUnitario: Number(r.precio_unitario),
    subtotal: Number(r.subtotal),
    orden: r.orden,
  };
}

function rowToPresupuesto(
  r: PresupuestoRow,
  items: PresupuestoItem[] = [],
): Presupuesto {
  return {
    id: r.id,
    numero: r.numero,
    clienteNombre: r.cliente_nombre,
    clienteTelefono: r.cliente_telefono ?? undefined,
    clienteEmail: r.cliente_email ?? undefined,
    clienteRif: r.cliente_rif ?? undefined,
    eventoNombre: r.evento_nombre,
    eventoFecha: r.evento_fecha ?? undefined,
    eventoHora: r.evento_hora ?? undefined,
    cantidadPersonas: r.cantidad_personas ?? undefined,
    montajeFecha: r.montaje_fecha ?? undefined,
    montajeHora: r.montaje_hora ?? undefined,
    desmontajeFecha: r.desmontaje_fecha ?? undefined,
    desmontajeHora: r.desmontaje_hora ?? undefined,
    notas: r.notas ?? undefined,
    validezDias: r.validez_dias,
    descuento: Number(r.descuento),
    estado: r.estado as EstadoPresupuesto,
    subtotal: Number(r.subtotal),
    total: Number(r.total),
    eventoId: r.evento_id ?? undefined,
    items,
    createdAt: r.created_at,
  };
}

export type PresupuestoInput = {
  clienteNombre: string;
  clienteTelefono?: string;
  clienteEmail?: string;
  clienteRif?: string;
  eventoNombre: string;
  eventoFecha?: string;
  eventoHora?: string;
  cantidadPersonas?: number;
  montajeFecha?: string;
  montajeHora?: string;
  desmontajeFecha?: string;
  desmontajeHora?: string;
  notas?: string;
  validezDias: number;
  descuento: number;
  estado?: EstadoPresupuesto;
  items: Omit<PresupuestoItem, "id">[];
};

/** Campos del evento/logística editables después de crear el presupuesto. */
export type PresupuestoEventoInput = {
  eventoNombre: string;
  eventoFecha?: string;
  eventoHora?: string;
  cantidadPersonas?: number;
  montajeFecha?: string;
  montajeHora?: string;
  desmontajeFecha?: string;
  desmontajeHora?: string;
};

function calcularTotales(
  items: Omit<PresupuestoItem, "id">[],
  descuento: number,
): { subtotal: number; total: number } {
  const subtotal = items.reduce(
    (s, i) => s + Number(i.cantidad) * Number(i.precioUnitario),
    0,
  );
  const total = Math.max(0, subtotal - descuento);
  return { subtotal, total };
}

async function nextNumero(): Promise<string> {
  const sb = createSupabaseBrowserClient();
  const year = new Date().getFullYear();
  // Find max existing number with same year prefix.
  const prefix = `PRES-${year}-`;
  const { data, error } = await sb
    .from("presupuestos")
    .select("numero")
    .like("numero", `${prefix}%`)
    .order("numero", { ascending: false })
    .limit(1);
  if (error) throw error;
  let next = 1;
  if (data && data.length > 0) {
    const last = data[0].numero as string;
    const n = parseInt(last.replace(prefix, ""), 10);
    if (!isNaN(n)) next = n + 1;
  }
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function listPresupuestos(): Promise<Presupuesto[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("presupuestos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as PresupuestoRow[]).map((r) => rowToPresupuesto(r));
}

export async function getPresupuesto(id: string): Promise<Presupuesto> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("presupuestos")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: itemsData, error: itemsErr } = await sb
    .from("presupuesto_items")
    .select("*")
    .eq("presupuesto_id", id)
    .order("orden", { ascending: true });
  if (itemsErr) throw itemsErr;
  const items = (itemsData as ItemRow[]).map(rowToItem);
  return rowToPresupuesto(data as PresupuestoRow, items);
}

export async function createPresupuesto(
  input: PresupuestoInput,
): Promise<Presupuesto> {
  const sb = createSupabaseBrowserClient();
  const { subtotal, total } = calcularTotales(input.items, input.descuento);
  const numero = await nextNumero();
  const { data, error } = await sb
    .from("presupuestos")
    .insert({
      numero,
      cliente_nombre: input.clienteNombre,
      cliente_telefono: input.clienteTelefono ?? null,
      cliente_email: input.clienteEmail ?? null,
      cliente_rif: input.clienteRif ?? null,
      evento_nombre: input.eventoNombre,
      evento_fecha: input.eventoFecha ?? null,
      evento_hora: input.eventoHora ?? null,
      cantidad_personas: input.cantidadPersonas ?? null,
      montaje_fecha: input.montajeFecha ?? null,
      montaje_hora: input.montajeHora ?? null,
      desmontaje_fecha: input.desmontajeFecha ?? null,
      desmontaje_hora: input.desmontajeHora ?? null,
      notas: input.notas ?? null,
      validez_dias: input.validezDias,
      descuento: input.descuento,
      estado: input.estado ?? "borrador",
      subtotal,
      total,
    })
    .select("*")
    .single();
  if (error) throw error;
  const presId = (data as PresupuestoRow).id;

  if (input.items.length > 0) {
    const itemRows = input.items.map((it, i) => ({
      presupuesto_id: presId,
      service_id: it.serviceId ?? null,
      nombre: it.nombre,
      categoria: it.categoria ?? null,
      unidad: it.unidad,
      cantidad: it.cantidad,
      precio_unitario: it.precioUnitario,
      subtotal: it.cantidad * it.precioUnitario,
      orden: it.orden ?? i,
    }));
    const { error: itemsErr } = await sb
      .from("presupuesto_items")
      .insert(itemRows);
    if (itemsErr) throw itemsErr;
  }

  return getPresupuesto(presId);
}

export async function updatePresupuestoEstado(
  id: string,
  estado: EstadoPresupuesto,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("presupuestos")
    .update({ estado })
    .eq("id", id);
  if (error) throw error;
}

export async function updatePresupuestoEvento(
  id: string,
  input: PresupuestoEventoInput,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("presupuestos")
    .update({
      evento_nombre: input.eventoNombre,
      evento_fecha: input.eventoFecha ?? null,
      evento_hora: input.eventoHora ?? null,
      cantidad_personas: input.cantidadPersonas ?? null,
      montaje_fecha: input.montajeFecha ?? null,
      montaje_hora: input.montajeHora ?? null,
      desmontaje_fecha: input.desmontajeFecha ?? null,
      desmontaje_hora: input.desmontajeHora ?? null,
    })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Editar presupuesto completo: cliente + evento + items + notas + descuento.
 * Antes de aplicar los cambios, guarda un snapshot completo del estado
 * anterior en `presupuestos_versiones` para mantener historial.
 *
 * Si la tabla de versiones aún no existe (SQL pendiente), el update igual se
 * aplica — el historial queda silencioso.
 */
export async function updatePresupuestoCompleto(
  id: string,
  input: PresupuestoInput,
  motivo?: string,
): Promise<Presupuesto> {
  const sb = createSupabaseBrowserClient();
  // 1. Leer el estado actual para snapshot
  let actual: Presupuesto | null = null;
  try {
    actual = await getPresupuesto(id);
  } catch {
    actual = null;
  }

  // 2. Guardar snapshot en versiones (silencioso si la tabla no existe)
  if (actual) {
    try {
      const { data: existentes } = await sb
        .from("presupuestos_versiones")
        .select("version_numero")
        .eq("presupuesto_id", id)
        .order("version_numero", { ascending: false })
        .limit(1);
      const nextVersion =
        existentes && existentes.length > 0
          ? Number(
              (existentes[0] as { version_numero: number | string })
                .version_numero,
            ) + 1
          : 1;
      await sb.from("presupuestos_versiones").insert({
        presupuesto_id: id,
        version_numero: nextVersion,
        snapshot: actual,
        motivo: motivo?.trim() || null,
      });
    } catch {
      // No bloqueamos el update si el historial falla
    }
  }

  // 3. Calcular totales y actualizar cabecera
  const { subtotal, total } = calcularTotales(input.items, input.descuento);
  const { error: hErr } = await sb
    .from("presupuestos")
    .update({
      cliente_nombre: input.clienteNombre,
      cliente_telefono: input.clienteTelefono ?? null,
      cliente_email: input.clienteEmail ?? null,
      cliente_rif: input.clienteRif ?? null,
      evento_nombre: input.eventoNombre,
      evento_fecha: input.eventoFecha ?? null,
      evento_hora: input.eventoHora ?? null,
      cantidad_personas: input.cantidadPersonas ?? null,
      montaje_fecha: input.montajeFecha ?? null,
      montaje_hora: input.montajeHora ?? null,
      desmontaje_fecha: input.desmontajeFecha ?? null,
      desmontaje_hora: input.desmontajeHora ?? null,
      notas: input.notas ?? null,
      validez_dias: input.validezDias,
      descuento: input.descuento,
      ...(input.estado ? { estado: input.estado } : {}),
      subtotal,
      total,
    })
    .eq("id", id);
  if (hErr) throw hErr;

  // 4. Reemplazar items: borrar todos y recrear
  const { error: delErr } = await sb
    .from("presupuesto_items")
    .delete()
    .eq("presupuesto_id", id);
  if (delErr) throw delErr;

  if (input.items.length > 0) {
    const itemRows = input.items.map((it, i) => ({
      presupuesto_id: id,
      service_id: it.serviceId ?? null,
      nombre: it.nombre,
      categoria: it.categoria ?? null,
      unidad: it.unidad,
      cantidad: it.cantidad,
      precio_unitario: it.precioUnitario,
      subtotal: Number(it.cantidad) * Number(it.precioUnitario),
      orden: it.orden ?? i,
    }));
    const { error: insErr } = await sb
      .from("presupuesto_items")
      .insert(itemRows);
    if (insErr) throw insErr;
  }

  return getPresupuesto(id);
}

export type PresupuestoVersion = {
  id: string;
  presupuestoId: string;
  versionNumero: number;
  snapshot: Presupuesto;
  motivo?: string;
  createdAt: string;
};

/** Lista las versiones anteriores de un presupuesto, más recientes primero. */
export async function listVersionesPresupuesto(
  presupuestoId: string,
): Promise<PresupuestoVersion[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("presupuestos_versiones")
    .select("*")
    .eq("presupuesto_id", presupuestoId)
    .order("version_numero", { ascending: false });
  if (error) throw error;
  return (data as {
    id: string;
    presupuesto_id: string;
    version_numero: number;
    snapshot: Presupuesto;
    motivo: string | null;
    created_at: string;
  }[]).map((r) => ({
    id: r.id,
    presupuestoId: r.presupuesto_id,
    versionNumero: r.version_numero,
    snapshot: r.snapshot,
    motivo: r.motivo ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function deletePresupuesto(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("presupuestos").delete().eq("id", id);
  if (error) throw error;
}

export async function crearEventoDesdePresupuesto(
  presupuesto: Presupuesto,
): Promise<string> {
  // Crea un evento en la tabla eventos y vincula el presupuesto.
  const sb = createSupabaseBrowserClient();
  const { data: evData, error: evErr } = await sb
    .from("eventos")
    .insert({
      titulo: presupuesto.eventoNombre,
      fecha: presupuesto.eventoFecha ?? new Date().toISOString().slice(0, 10),
      estado: "confirmado",
      cliente: presupuesto.clienteNombre,
      notas: `Generado desde ${presupuesto.numero}.`,
    })
    .select("id")
    .single();
  if (evErr) throw evErr;
  const eventoId = (evData as { id: string }).id;
  const { error: linkErr } = await sb
    .from("presupuestos")
    .update({ evento_id: eventoId })
    .eq("id", presupuesto.id);
  if (linkErr) throw linkErr;
  return eventoId;
}
