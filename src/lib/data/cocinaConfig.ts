"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { esColumnaAusente } from "@/lib/iva-compra";
import type { CocinaConfig } from "@/lib/types";

type Row = {
  id: number;
  food_cost_objetivo_porc: number | string;
  gastos_operativos_porc: number | string;
  margen_verde_min: number | string;
  margen_amarillo_min: number | string;
  iva_porc: number | string | null;
  recupera_iva_compras?: boolean | null;
};

const DEFAULT_CONFIG: CocinaConfig = {
  foodCostObjetivoPorc: 30,
  gastosOperativosPorc: 0,
  margenVerdeMin: 70,
  margenAmarilloMin: 60,
  ivaPorc: 16,
  recuperaIvaCompras: true,
};

function rowToConfig(r: Row): CocinaConfig {
  return {
    foodCostObjetivoPorc: Number(r.food_cost_objetivo_porc),
    gastosOperativosPorc: Number(r.gastos_operativos_porc),
    margenVerdeMin: Number(r.margen_verde_min),
    margenAmarilloMin: Number(r.margen_amarillo_min),
    // Si el SQL aún no agregó la columna, usamos el default 16 (Venezuela)
    ivaPorc: r.iva_porc === null || r.iva_porc === undefined ? 16 : Number(r.iva_porc),
    // Sin la columna (SQL aún no corrido) se asume que sí recupera el IVA.
    recuperaIvaCompras: r.recupera_iva_compras === false ? false : true,
  };
}

export async function getCocinaConfig(): Promise<CocinaConfig> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("cocina_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  // Un fallo de la consulta se propaga: mostrar los valores por defecto como si
  // fueran los del negocio daría precios y márgenes falsos. Solo si la fila aún
  // no existe (negocio sin configurar) se usan los valores por defecto.
  if (error) throw error;
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
  if (patch.recuperaIvaCompras !== undefined) db.recupera_iva_compras = patch.recuperaIvaCompras;
  db.updated_at = new Date().toISOString();
  let { data, error } = await sb
    .from("cocina_config")
    .upsert(db, { onConflict: "id" })
    .select("*")
    .single();
  // La columna del ajuste puede no existir todavía: se guardan los otros
  // parámetros. Si lo único que se quería cambiar era ese sí/no, se avisa.
  if (error && esColumnaAusente(error) && patch.recuperaIvaCompras !== undefined) {
    const resto: Record<string, unknown> = { ...db };
    delete resto.recupera_iva_compras;
    const otros = Object.keys(resto).filter((k) => k !== "id" && k !== "updated_at");
    if (otros.length === 0) {
      throw new Error(
        "Para guardar si recuperas el IVA, primero corre supabase/cocina-recupera-iva-compras.sql.",
      );
    }
    ({ data, error } = await sb.from("cocina_config").upsert(resto, { onConflict: "id" }).select("*").single());
  }
  if (error) throw error;
  return rowToConfig(data as Row);
}
