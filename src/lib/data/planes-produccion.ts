"use client";

// Planes de producción (M5).
// El cálculo de cuánto reservar de cada insumo se hace en TS (donde tenemos
// conversión de unidades — kg↔g, L↔ml). El resultado se manda al RPC
// `create_plan_produccion` como JSONB para que el insert + update de stock
// suceda atomicamente en una sola transacción de Postgres.

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  PlanProduccion,
  PlanProduccionCompromiso,
  EstadoPlanProduccion,
  Receta,
  Insumo,
} from "@/lib/types";
import { calcularConsumoReceta } from "./ventas";

// ─── Row mappers ──────────────────────────────────────────────────

type HeaderRow = {
  id: string;
  receta_id: string;
  receta_nombre: string;
  raciones: number | string;
  raciones_consumidas: number | string | null;
  raciones_perdidas: number | string | null;
  fecha_objetivo: string | null;
  nota: string | null;
  estado: string;
  completado_at: string | null;
  cancelado_at: string | null;
  created_at: string;
};

type CompRow = {
  id: string;
  plan_id: string;
  insumo_id: string;
  cantidad: number | string;
  unidad_base: string;
};

function rowToCompromiso(r: CompRow): PlanProduccionCompromiso {
  return {
    id: r.id,
    planId: r.plan_id,
    insumoId: r.insumo_id,
    cantidad: Number(r.cantidad),
    unidadBase: r.unidad_base,
  };
}

function headerToPlan(
  h: HeaderRow,
  compromisos: PlanProduccionCompromiso[],
): PlanProduccion {
  return {
    id: h.id,
    recetaId: h.receta_id,
    recetaNombre: h.receta_nombre,
    raciones: Number(h.raciones),
    racionesConsumidas: Number(h.raciones_consumidas ?? 0),
    racionesPerdidas: Number(h.raciones_perdidas ?? 0),
    fechaObjetivo: h.fecha_objetivo ?? undefined,
    nota: h.nota ?? undefined,
    estado: h.estado as EstadoPlanProduccion,
    completadoAt: h.completado_at ?? undefined,
    canceladoAt: h.cancelado_at ?? undefined,
    createdAt: h.created_at,
    compromisos,
  };
}

// ─── Listar ──────────────────────────────────────────────────────

export async function listPlanesProduccion(): Promise<PlanProduccion[]> {
  const sb = createSupabaseBrowserClient();
  const { data: heads, error: hErr } = await sb
    .from("cocina_planes_produccion")
    .select("*")
    // Pendientes primero, luego completados/cancelados más recientes
    .order("estado", { ascending: true })
    .order("fecha_objetivo", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (hErr) throw hErr;
  const ids = (heads as HeaderRow[]).map((h) => h.id);
  if (ids.length === 0) return [];

  const { data: comps, error: cErr } = await sb
    .from("cocina_plan_compromisos")
    .select("*")
    .in("plan_id", ids);
  if (cErr) throw cErr;

  const byPlan = new Map<string, PlanProduccionCompromiso[]>();
  (comps as CompRow[]).forEach((r) => {
    const c = rowToCompromiso(r);
    if (!byPlan.has(c.planId)) byPlan.set(c.planId, []);
    byPlan.get(c.planId)!.push(c);
  });

  return (heads as HeaderRow[]).map((h) =>
    headerToPlan(h, byPlan.get(h.id) ?? []),
  );
}

// ─── Crear plan ──────────────────────────────────────────────────

export type CrearPlanInput = {
  receta: Receta;
  raciones: number;
  fechaObjetivo?: string | null;
  nota?: string | null;
  /** Catálogos para calcular el consumo (con expansión de subrecetas). */
  recetas: Receta[];
  insumos: Insumo[];
};

export async function createPlanProduccion(
  input: CrearPlanInput,
): Promise<string> {
  if (input.raciones <= 0) {
    throw new Error("Las raciones deben ser mayores a 0.");
  }
  // 1. Calcular consumo de insumos en TS (con conversión de unidades)
  const consumo = calcularConsumoReceta(
    input.receta.id,
    input.raciones,
    input.recetas,
    input.insumos,
  );
  if (consumo.size === 0) {
    throw new Error(
      "La receta no tiene ingredientes que se puedan resolver hasta materia prima.",
    );
  }

  // 2. Armar el JSONB de compromisos
  const insMap = new Map(input.insumos.map((i) => [i.id, i]));
  const compromisos = Array.from(consumo.entries())
    .filter(([insumoId, cant]) => insMap.has(insumoId) && cant > 0)
    .map(([insumoId, cant]) => {
      const ins = insMap.get(insumoId)!;
      return {
        insumo_id: insumoId,
        cantidad: cant,
        unidad_base: ins.unidadBase,
      };
    });

  // 3. Llamar RPC atómico
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("create_plan_produccion", {
    p_receta_id: input.receta.id,
    p_receta_nombre: input.receta.nombre,
    p_raciones: input.raciones,
    p_fecha_objetivo: input.fechaObjetivo ?? null,
    p_nota: input.nota ?? null,
    p_compromisos: compromisos,
  });
  if (error) throw error;
  return data as string;
}

// ─── Completar / Cancelar / Borrar ───────────────────────────────

export async function completarPlanProduccion(planId: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.rpc("completar_plan_produccion", {
    p_plan_id: planId,
  });
  if (error) throw error;
}

export async function cancelarPlanProduccion(planId: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.rpc("cancelar_plan_produccion", {
    p_plan_id: planId,
  });
  if (error) throw error;
}

/** Ajusta un plan completado (raciones y consumidas); el motor recalcula el
 *  stock físico y el comprometido acorde. */
export async function ajustarPlanCompletado(
  planId: string,
  raciones: number,
  racionesConsumidas: number,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.rpc("ajustar_plan_completado", {
    p_plan_id: planId,
    p_raciones: raciones,
    p_raciones_consumidas: racionesConsumidas,
  });
  if (error) throw error;
}

export async function deletePlanProduccion(planId: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.rpc("delete_plan_produccion", {
    p_plan_id: planId,
  });
  if (error) throw error;
}

/**
 * Recalcula stock_comprometido en TODOS los insumos sumando los compromisos
 * de planes pendientes y completados. Útil para reparar el estado si por
 * algún motivo el UPDATE atómico no se reflejó (caching, RLS, etc).
 *
 * Devuelve cuántos insumos fueron actualizados.
 */
export async function recalcularStockComprometido(): Promise<number> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb.rpc("recalcular_stock_comprometido");
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

/** Pre-cálculo del consumo (para preview en UI antes de guardar). */
export function previewConsumo(
  receta: Receta,
  raciones: number,
  recetas: Receta[],
  insumos: Insumo[],
): { insumo: Insumo; cantidad: number }[] {
  if (raciones <= 0) return [];
  const consumo = calcularConsumoReceta(receta.id, raciones, recetas, insumos);
  const insMap = new Map(insumos.map((i) => [i.id, i]));
  const out: { insumo: Insumo; cantidad: number }[] = [];
  consumo.forEach((cant, insumoId) => {
    const ins = insMap.get(insumoId);
    if (ins && cant > 0) out.push({ insumo: ins, cantidad: cant });
  });
  return out.sort((a, b) => a.insumo.nombre.localeCompare(b.insumo.nombre));
}
