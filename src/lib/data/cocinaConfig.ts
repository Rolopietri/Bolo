"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CocinaConfig } from "@/lib/types";

type Row = {
  id: number;
  food_cost_objetivo_porc: number | string;
  gastos_operativos_porc: number | string;
  margen_verde_min: number | string;
  margen_amarillo_min: number | string;
  iva_porc: number | string | null;
};

const DEFAULT_CONFIG: CocinaConfig = {
  foodCostObjetivoPorc: 30,
  gastosOperativosPorc: 0,
  margenVerdeMin: 70,
  margenAmarilloMin: 60,
  ivaPorc: 16,
};

function rowToConfig(r: Row): CocinaConfig {
  return {
    foodCostObjetivoPorc: Number(r.food_cost_objetivo_porc),
    gastosOperativosPorc: Number(r.gastos_operativos_porc),
    margenVerdeMin: Number(r.margen_verde_min),
    margenAmarilloMin: Number(r.margen_amarillo_min),
    // Si el SQL aún no agregó la columna, usamos el default 16 (Venezuela)
    ivaPorc: r.iva_porc === null || r.iva_porc === undefined ? 16 : Number(r.iva_porc),
  };
}

export async function getCocinaConfig(): Promise<CocinaConfig> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cocina_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.warn("[cocinaConfig] fallback a default:", error.message);
    return DEFAULT_CONFIG;
  }
  if (!data) return DEFAULT_CONFIG;
  return rowToConfig(data as Row);
}

export async function updateCocinaConfig(
  patch: Partial<CocinaConfig>,
): Promise<CocinaConfig> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = { id: 1 };
  if (patch.foodCostObjetivoPorc !== undefined)
    db.food_cost_objetivo_porc = patch.foodCostObjetivoPorc;
  if (patch.gastosOperativosPorc !== undefined)
    db.gastos_operativos_porc = patch.gastosOperativosPorc;
  if (patch.margenVerdeMin !== undefined)
    db.margen_verde_min = patch.margenVerdeMin;
  if (patch.margenAmarilloMin !== undefined)
    db.margen_amarillo_min = patch.margenAmarilloMin;
  if (patch.ivaPorc !== undefined) db.iva_porc = patch.ivaPorc;
  db.updated_at = new Date().toISOString();
  const { data, error } = await sb
    .from("cocina_config")
    .upsert(db, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return rowToConfig(data as Row);
}
