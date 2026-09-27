"use client";

// Pedidos guardados de cocina.
// Permite guardar la selección de recetas + raciones que el usuario armó
// en /cocina/pedido, con una fecha objetivo y nota. Después se puede cargar
// para recalcular el pedido sugerido contra el stock actual.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  PedidoCocina,
  PedidoCocinaReceta,
  EstadoPedidoCocina,
} from "@/lib/types";

type HeaderRow = {
  id: string;
  nombre: string;
  fecha_necesaria: string | null;
  nota: string | null;
  estado: string;
  planes_generados: boolean | null;
  created_at: string;
};

type LineaRow = {
  id: string;
  pedido_id: string;
  receta_id: string | null;
  receta_nombre: string;
  raciones: number | string;
  orden: number;
};

function rowToReceta(r: LineaRow): PedidoCocinaReceta {
  return {
    id: r.id,
    pedidoId: r.pedido_id,
    recetaId: r.receta_id ?? undefined,
    recetaNombre: r.receta_nombre,
    raciones: Number(r.raciones),
    orden: r.orden,
  };
}

function headerToPedido(
  h: HeaderRow,
  recetas: PedidoCocinaReceta[],
): PedidoCocina {
  return {
    id: h.id,
    nombre: h.nombre,
    fechaNecesaria: h.fecha_necesaria ?? undefined,
    nota: h.nota ?? undefined,
    estado: h.estado as EstadoPedidoCocina,
    createdAt: h.created_at,
    recetas: recetas.sort((a, b) => a.orden - b.orden),
    planesGenerados: !!h.planes_generados,
  };
}

export async function listPedidosCocina(): Promise<PedidoCocina[]> {
  const sb = createSupabaseBrowserClient();
  // Trae headers + todas las líneas en 2 queries (más simple que un join).
  const { data: heads, error: hErr } = await sb
    .from("cocina_pedidos")
    .select("*")
    .order("fecha_necesaria", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (hErr) throw hErr;
  const ids = (heads as HeaderRow[]).map((h) => h.id);
  if (ids.length === 0) return [];
  const { data: lines, error: lErr } = await sb
    .from("cocina_pedidos_recetas")
    .select("*")
    .in("pedido_id", ids);
  if (lErr) throw lErr;
  // Indexar líneas por pedido_id
  const byPedido = new Map<string, PedidoCocinaReceta[]>();
  (lines as LineaRow[]).forEach((l) => {
    const r = rowToReceta(l);
    if (!byPedido.has(r.pedidoId)) byPedido.set(r.pedidoId, []);
    byPedido.get(r.pedidoId)!.push(r);
  });
  return (heads as HeaderRow[]).map((h) =>
    headerToPedido(h, byPedido.get(h.id) ?? []),
  );
}

export type PedidoCocinaInput = {
  nombre: string;
  fechaNecesaria?: string | null;
  nota?: string | null;
  estado?: EstadoPedidoCocina;
  recetas: { recetaId?: string; recetaNombre: string; raciones: number }[];
};

export async function createPedidoCocina(
  input: PedidoCocinaInput,
): Promise<PedidoCocina> {
  const sb = createSupabaseBrowserClient();
  // 1. Insertar header
  const { data: head, error: hErr } = await sb
    .from("cocina_pedidos")
    .insert({
      nombre: input.nombre,
      fecha_necesaria: input.fechaNecesaria ?? null,
      nota: input.nota?.trim() ? input.nota.trim() : null,
      estado: input.estado ?? "pendiente",
    })
    .select("*")
    .single();
  if (hErr) throw hErr;
  const h = head as HeaderRow;

  // 2. Insertar líneas
  if (input.recetas.length > 0) {
    const inserts = input.recetas.map((r, i) => ({
      pedido_id: h.id,
      receta_id: r.recetaId ?? null,
      receta_nombre: r.recetaNombre,
      raciones: r.raciones,
      orden: i,
    }));
    const { data: lines, error: lErr } = await sb
      .from("cocina_pedidos_recetas")
      .insert(inserts)
      .select("*");
    if (lErr) throw lErr;
    return headerToPedido(h, (lines as LineaRow[]).map(rowToReceta));
  }
  return headerToPedido(h, []);
}

/** Actualiza solo header (nombre, fecha, nota, estado). Para cambiar las
 *  recetas conviene borrar y crear de nuevo el pedido. */
export async function updatePedidoCocina(
  id: string,
  patch: Partial<
    Pick<PedidoCocinaInput, "nombre" | "fechaNecesaria" | "nota" | "estado">
  > & { planesGenerados?: boolean },
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const dbPatch: Record<string, unknown> = {};
  if (patch.nombre !== undefined) dbPatch.nombre = patch.nombre;
  if (patch.fechaNecesaria !== undefined)
    dbPatch.fecha_necesaria = patch.fechaNecesaria ?? null;
  if (patch.nota !== undefined)
    dbPatch.nota = patch.nota && patch.nota.trim() ? patch.nota.trim() : null;
  if (patch.estado !== undefined) dbPatch.estado = patch.estado;
  if (patch.planesGenerados !== undefined)
    dbPatch.planes_generados = patch.planesGenerados;
  const { error } = await sb
    .from("cocina_pedidos")
    .update(dbPatch)
    .eq("id", id);
  if (error) throw error;
}

export async function deletePedidoCocina(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("cocina_pedidos").delete().eq("id", id);
  if (error) throw error;
}
