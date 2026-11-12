"use client";

// Lotes de producción (tabla produccion_lotes, ver supabase/bolo-05-produccion-lotes.sql).

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LoteProduccion } from "@/lib/produccion";

type Row = {
  id: string;
  fecha: string;
  insumo_id: string;
  cantidad_tomada: number | string;
  cantidad_util: number | string;
  responsable: string | null;
  notas: string | null;
  origen: string;
};

function aLote(r: Row): LoteProduccion {
  return {
    id: r.id,
    fecha: String(r.fecha).slice(0, 10),
    insumoId: r.insumo_id,
    tomada: Number(r.cantidad_tomada),
    util: Number(r.cantidad_util),
    responsable: r.responsable,
    notas: r.notas,
    origen: r.origen === "escaneo" || r.origen === "telegram" ? r.origen : "manual",
  };
}

/** true si el error es porque la tabla todavía no se creó en la base. */
export function faltaTablaProduccion(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  return /produccion_lotes/i.test(msg) && /(does not exist|no existe|schema cache|42P01)/i.test(msg);
}

export async function listLotes(desde: string, hasta: string): Promise<LoteProduccion[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("produccion_lotes")
    .select("id, fecha, insumo_id, cantidad_tomada, cantidad_util, responsable, notas, origen")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(aLote);
}

export type NuevoLote = {
  fecha: string;
  insumoId: string;
  tomada: number;
  util: number;
  responsable?: string;
  notas?: string;
  origen: "manual" | "escaneo" | "telegram";
};

export async function crearLotes(lotes: NuevoLote[]): Promise<LoteProduccion[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("produccion_lotes")
    .insert(
      lotes.map((l) => ({
        fecha: l.fecha,
        insumo_id: l.insumoId,
        cantidad_tomada: l.tomada,
        cantidad_util: l.util,
        responsable: l.responsable?.trim() || null,
        notas: l.notas?.trim() || null,
        origen: l.origen,
      })),
    )
    .select("id, fecha, insumo_id, cantidad_tomada, cantidad_util, responsable, notas, origen");
  if (error) throw error;
  return ((data ?? []) as Row[]).map(aLote);
}

export async function borrarLote(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("produccion_lotes").delete().eq("id", id);
  if (error) throw error;
}
