"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ConfigHistorialEntry = {
  id: string;
  campo: string;
  valorAnterior: number | null;
  valorNuevo: number;
  changedAt: string;
};

type Row = {
  id: string;
  campo: string;
  valor_anterior: number | string | null;
  valor_nuevo: number | string;
  changed_at: string;
};

function rowToEntry(r: Row): ConfigHistorialEntry {
  return {
    id: r.id,
    campo: r.campo,
    valorAnterior:
      r.valor_anterior === null || r.valor_anterior === undefined
        ? null
        : Number(r.valor_anterior),
    valorNuevo: Number(r.valor_nuevo),
    changedAt: r.changed_at,
  };
}

export async function listConfigHistorial(
  limit = 50,
): Promise<ConfigHistorialEntry[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cocina_config_historial")
    .select("*")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Row[]).map(rowToEntry);
}

/** Labels legibles de cada campo. */
export const CAMPO_LABELS: Record<string, string> = {
  food_cost_objetivo_porc: "Food cost objetivo",
  gastos_operativos_porc: "Gastos operativos",
  margen_verde_min: "Verde (margen ≥)",
  margen_amarillo_min: "Amarillo (margen ≥)",
  iva_porc: "IVA carta",
};
