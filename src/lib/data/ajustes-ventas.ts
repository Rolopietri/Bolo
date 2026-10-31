"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/** Cómo anota el restaurante las ventas. Una sola fila, compartida. */
export type AjustesVentas = {
  ventasManual: boolean;
  ventasPos: boolean;
  /** false si la tabla aún no existe o no se pudo leer. */
  persistido: boolean;
};

const DEFECTO: AjustesVentas = {
  ventasManual: true,
  ventasPos: true,
  persistido: false,
};

type Fila = { ventas_manual: boolean | null; ventas_pos: boolean | null };

function deFila(r: Fila): AjustesVentas {
  return {
    ventasManual: r.ventas_manual !== false,
    ventasPos: r.ventas_pos !== false,
    persistido: true,
  };
}

export async function leerAjustesVentas(): Promise<AjustesVentas> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("restaurante_ajustes")
    .select("ventas_manual, ventas_pos")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return DEFECTO;
  return deFila(data as Fila);
}

export async function guardarAjustesVentas(next: AjustesVentas): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("restaurante_ajustes").upsert(
    {
      id: 1,
      ventas_manual: next.ventasManual,
      ventas_pos: next.ventasPos,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (error) throw new Error(error.message);
}
