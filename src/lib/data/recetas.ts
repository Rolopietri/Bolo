"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  Receta,
  RecetaIngrediente,
  Seccion,
  Insumo,
} from "@/lib/types";
import { convertirParaCosto } from "@/lib/units";
import { normalizarNombreCatalogo } from "@/lib/text";

type RecetaRow = {
  id: string;
  nombre: string;
  seccion: string;
  categoria: string | null;
  perfil: string | null;
  porciones: number;
  tiempo_prep_min: number | null;
  tiempo_coccion_min: number | null;
  temperatura: string | null;
  procedimiento: string | null;
  presentacion: string | null;
  notas_chef: string | null;
  variaciones: string | null;
  responsable: string | null;
  foto_url: string | null;
  precio_sugerido_usd: number | string | null;
  xetux_nombre: string | null;
  es_subreceta: boolean | null;
  rendimiento: number | string | null;
  rendimiento_unidad: string | null;
  activo: boolean;
  created_at: string;
};

type IngRow = {
  id: string;
  receta_id: string;
  insumo_id: string | null;
  subreceta_id: string | null;
  nombre: string;
  cantidad: number | string;
  unidad: string;
  observaciones: string | null;
  costo_manual_usd: number | string | null;
  sin_insumo_ok: boolean | null;
  orden: number;
};

function rowToIng(r: IngRow): RecetaIngrediente {
  return {
    id: r.id,
    insumoId: r.insumo_id ?? undefined,
    subrecetaId: r.subreceta_id ?? undefined,
    nombre: r.nombre,
    cantidad: Number(r.cantidad),
    unidad: r.unidad,
    observaciones: r.observaciones ?? undefined,
    costoManualUsd:
      r.costo_manual_usd === null ? undefined : Number(r.costo_manual_usd),
    sinInsumoOk: r.sin_insumo_ok ?? false,
    orden: r.orden,
  };
}

function rowToReceta(r: RecetaRow, ings: RecetaIngrediente[]): Receta {
  return {
    id: r.id,
    nombre: r.nombre,
    seccion: r.seccion as Seccion,
    categoria: r.categoria ?? undefined,
    perfil: r.perfil ?? undefined,
    porciones: r.porciones,
    tiempoPrepMin: r.tiempo_prep_min ?? undefined,
    tiempoCoccionMin: r.tiempo_coccion_min ?? undefined,
    temperatura: r.temperatura ?? undefined,
    procedimiento: r.procedimiento ?? undefined,
    presentacion: r.presentacion ?? undefined,
    notasChef: r.notas_chef ?? undefined,
    variaciones: r.variaciones ?? undefined,
    responsable: r.responsable ?? undefined,
    fotoUrl: r.foto_url ?? undefined,
    precioSugeridoUsd:
      r.precio_sugerido_usd === null
        ? undefined
        : Number(r.precio_sugerido_usd),
    xetux_nombre: r.xetux_nombre ?? undefined,
    esSubreceta: r.es_subreceta ?? false,
    rendimiento: r.rendimiento === null ? undefined : Number(r.rendimiento),
    rendimientoUnidad: r.rendimiento_unidad ?? undefined,
    activo: r.activo,
    ingredientes: ings,
    createdAt: r.created_at,
  };
}

export type RecetaInput = {
  nombre: string;
  seccion: Seccion;
  categoria?: string;
  perfil?: string;
  porciones: number;
  tiempoPrepMin?: number;
  tiempoCoccionMin?: number;
  temperatura?: string;
  procedimiento?: string;
  presentacion?: string;
  notasChef?: string;
  variaciones?: string;
  responsable?: string;
  fotoUrl?: string;
  precioSugeridoUsd?: number;
  esSubreceta?: boolean;
  rendimiento?: number;
  rendimientoUnidad?: string;
  ingredientes: Omit<RecetaIngrediente, "id">[];
};

export async function listRecetas(): Promise<Receta[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("recetas")
    .select("*")
    .order("seccion")
    .order("categoria")
    .order("nombre");
  if (error) throw error;
  // Cargar ingredientes en una sola query
  const recetas = data as RecetaRow[];
  if (recetas.length === 0) return [];
  const ids = recetas.map((r) => r.id);
  const { data: ingsData, error: ingsErr } = await sb
    .from("receta_ingredientes")
    .select("*")
    .in("receta_id", ids)
    .order("orden");
  if (ingsErr) throw ingsErr;
  const byReceta = new Map<string, RecetaIngrediente[]>();
  for (const r of ingsData as IngRow[]) {
    const ing = rowToIng(r);
    if (!byReceta.has(r.receta_id)) byReceta.set(r.receta_id, []);
    byReceta.get(r.receta_id)!.push(ing);
  }
  return recetas.map((r) => rowToReceta(r, byReceta.get(r.id) ?? []));
}

export async function getReceta(id: string): Promise<Receta> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("recetas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  const { data: ingsData, error: ingsErr } = await sb
    .from("receta_ingredientes")
    .select("*")
    .eq("receta_id", id)
    .order("orden");
  if (ingsErr) throw ingsErr;
  const ings = (ingsData as IngRow[]).map(rowToIng);
  return rowToReceta(data as RecetaRow, ings);
}

// Bucket PÚBLICO de fotos de cocina (el mismo que usa menaje). Las fotos de
// recetas se guardan bajo el prefijo `recetas/`. Público porque no son
// sensibles y así se ven directo en la app y en el PDF.
const BUCKET_FOTOS = "menaje-fotos";
const FOTO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Sube la foto de una receta al bucket público y devuelve su URL pública. */
export async function subirFotoReceta(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("La foto debe ser una imagen (JPG, PNG, etc.).");
  }
  if (file.size > FOTO_MAX_BYTES) {
    throw new Error("La foto no puede pesar más de 5 MB.");
  }
  const sb = createSupabaseBrowserClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathName = `recetas/${Date.now()}_${safeName}`;
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

export async function createReceta(input: RecetaInput): Promise<Receta> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("recetas")
    .insert({
      nombre: normalizarNombreCatalogo(input.nombre),
      seccion: input.seccion,
      categoria: input.categoria ?? null,
      perfil: input.perfil ?? null,
      // Clamp defensivo: porciones = 0/negativo descuadra el motor (el plan
      // compromete crudo pero la venta no descuenta nada → inventario inflado).
      porciones: Math.max(1, Math.round(input.porciones) || 1),
      tiempo_prep_min: input.tiempoPrepMin ?? null,
      tiempo_coccion_min: input.tiempoCoccionMin ?? null,
      temperatura: input.temperatura ?? null,
      procedimiento: input.procedimiento ?? null,
      presentacion: input.presentacion ?? null,
      notas_chef: input.notasChef ?? null,
      variaciones: input.variaciones ?? null,
      responsable: input.responsable ?? null,
      foto_url: input.fotoUrl ?? null,
      precio_sugerido_usd: input.precioSugeridoUsd ?? null,
      es_subreceta: input.esSubreceta ?? false,
      rendimiento: input.rendimiento ?? null,
      rendimiento_unidad: input.rendimientoUnidad ?? null,
      activo: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  const recId = (data as RecetaRow).id;
  if (input.ingredientes.length > 0) {
    const rows = input.ingredientes.map((i, idx) => ({
      receta_id: recId,
      insumo_id: i.insumoId ?? null,
      subreceta_id: i.subrecetaId ?? null,
      nombre: normalizarNombreCatalogo(i.nombre),
      cantidad: i.cantidad,
      unidad: i.unidad,
      observaciones: i.observaciones ?? null,
      costo_manual_usd: i.costoManualUsd ?? null,
      sin_insumo_ok: i.sinInsumoOk ?? false,
      orden: i.orden ?? idx,
    }));
    const { error: insErr } = await sb
      .from("receta_ingredientes")
      .insert(rows);
    if (insErr) throw insErr;
  }
  return getReceta(recId);
}

export async function updateReceta(
  id: string,
  input: RecetaInput,
): Promise<Receta> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("recetas")
    .update({
      nombre: normalizarNombreCatalogo(input.nombre),
      seccion: input.seccion,
      categoria: input.categoria ?? null,
      perfil: input.perfil ?? null,
      // Clamp defensivo: porciones = 0/negativo descuadra el motor (el plan
      // compromete crudo pero la venta no descuenta nada → inventario inflado).
      porciones: Math.max(1, Math.round(input.porciones) || 1),
      tiempo_prep_min: input.tiempoPrepMin ?? null,
      tiempo_coccion_min: input.tiempoCoccionMin ?? null,
      temperatura: input.temperatura ?? null,
      procedimiento: input.procedimiento ?? null,
      presentacion: input.presentacion ?? null,
      notas_chef: input.notasChef ?? null,
      variaciones: input.variaciones ?? null,
      responsable: input.responsable ?? null,
      foto_url: input.fotoUrl ?? null,
      precio_sugerido_usd: input.precioSugeridoUsd ?? null,
      // Campos que faltaban — esto rompía editar sub-recetas y sus rendimientos
      es_subreceta: input.esSubreceta ?? false,
      rendimiento: input.rendimiento ?? null,
      rendimiento_unidad: input.rendimientoUnidad ?? null,
    })
    .eq("id", id);
  if (error) throw error;

  // Reemplazar ingredientes: borrar todos y recrear
  const { error: delErr } = await sb
    .from("receta_ingredientes")
    .delete()
    .eq("receta_id", id);
  if (delErr) throw delErr;
  if (input.ingredientes.length > 0) {
    const rows = input.ingredientes.map((i, idx) => ({
      receta_id: id,
      insumo_id: i.insumoId ?? null,
      // Campos que faltaban — esto hacía que al editar una receta, las
      // sub-recetas usadas como ingrediente se perdieran (quedaban como
      // líneas ad-hoc sin costo).
      subreceta_id: i.subrecetaId ?? null,
      nombre: normalizarNombreCatalogo(i.nombre),
      cantidad: i.cantidad,
      unidad: i.unidad,
      observaciones: i.observaciones ?? null,
      costo_manual_usd: i.costoManualUsd ?? null,
      sin_insumo_ok: i.sinInsumoOk ?? false,
      orden: i.orden ?? idx,
    }));
    const { error: insErr } = await sb
      .from("receta_ingredientes")
      .insert(rows);
    if (insErr) throw insErr;
  }
  return getReceta(id);
}

/**
 * Update rápido del precio sugerido sin tocar el resto de la receta.
 * Útil para edición inline en la pantalla de Costeo (M3).
 */
export async function setPrecioSugeridoUsd(
  id: string,
  precioSinIvaUsd: number | null,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("recetas")
    .update({ precio_sugerido_usd: precioSinIvaUsd })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteReceta(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("recetas").delete().eq("id", id);
  if (error) throw error;
}

/** Activa o desactiva una receta (soft). No toca ingredientes; solo el flag
 *  `activo`. Desactivar la oculta del catálogo sin perder su histórico. */
export async function setRecetaActivo(
  id: string,
  activo: boolean,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("recetas").update({ activo }).eq("id", id);
  if (error) throw error;
}

/** Cambia SOLO la categoría de una receta (para clasificar desde Análisis de
 *  ventas sin abrir el formulario completo). No toca ingredientes ni lo demás. */
export async function setRecetaCategoria(
  id: string,
  categoria: string | null,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("recetas").update({ categoria }).eq("id", id);
  if (error) throw error;
}

// ─── Cálculo de costo (cliente) ──────────────────────────────────

/**
 * Costo por unidad base de una subreceta:
 *   costo total por porción / rendimiento (en su unidad base)
 *   ej: salsa pesto cuesta $5 por porción y rinde 200g → $0.025/g
 *
 * Recursivo: si la subreceta usa otras subrecetas, se calculan también.
 * Protege contra ciclos con un depth limit + set de visitados.
 */
export function costoPorUnidadSubreceta(
  subId: string,
  recetas: Receta[],
  insumos: Insumo[],
  visitados: Set<string> = new Set(),
  depth = 0,
): number {
  if (depth > 5) return 0;
  if (visitados.has(subId)) return 0;
  const sub = recetas.find((r) => r.id === subId);
  if (!sub) return 0;
  // Una subreceta SIN rendimiento (null/0) no se puede costear: el motor SQL la
  // OMITE en el descuento de stock, así que aquí devolvemos 0 para no divergir
  // (el costo 0 avisa que falta definir el rendimiento de esa subreceta).
  if (!sub.rendimiento || sub.rendimiento <= 0) return 0;
  const rendEfectivo = sub.rendimiento;
  const nextVisited = new Set(visitados);
  nextVisited.add(subId);
  const { total } = calcularCostoRecetaInterno(
    sub,
    recetas,
    insumos,
    nextVisited,
    depth + 1,
  );
  // costo por unidad = total del batch ÷ rendimiento total
  return total / rendEfectivo;
}

function calcularCostoRecetaInterno(
  receta: Receta,
  recetas: Receta[],
  insumos: Insumo[],
  visitados: Set<string>,
  depth: number,
): { total: number; porPorcion: number; lineas: RecetaIngrediente[] } {
  const insumosMap = new Map(insumos.map((i) => [i.id, i]));
  let total = 0;
  const lineas = receta.ingredientes.map((ing) => {
    // 1) Insumo del catálogo
    if (ing.insumoId) {
      const ins = insumosMap.get(ing.insumoId);
      if (ins && ins.precioBaseUsd !== null) {
        // Convertimos la cantidad del ingrediente a la unidad base del insumo
        // antes de multiplicar por el precio/unidadBase. Esto permite que la
        // receta declare cantidades en kg cuando el insumo está en g, en L
        // cuando el insumo está en ml, etc. Si las unidades son custom (ej
        // "taza") o desconocidas, hacemos fallback al comportamiento histórico
        // (asumir misma unidad).
        const conv = convertirParaCosto(
          ing.cantidad,
          ing.unidad,
          ins.unidadBase,
        );
        const cantidadEnBase = conv?.resultado ?? ing.cantidad;
        const sub = cantidadEnBase * ins.precioBaseUsd;
        total += sub;
        return { ...ing, costoSubtotal: sub };
      }
    }
    // 2) Sub-receta
    if (ing.subrecetaId) {
      const costoUnit = costoPorUnidadSubreceta(
        ing.subrecetaId,
        recetas,
        insumos,
        visitados,
        depth,
      );
      if (costoUnit > 0) {
        // Conversión equivalente al caso de insumo: si la sub-receta rinde en
        // ml y la receta padre la pide en L, convertimos antes de multiplicar.
        const subreceta = recetas.find((r) => r.id === ing.subrecetaId);
        const unidadRend = subreceta?.rendimientoUnidad ?? ing.unidad;
        const conv = convertirParaCosto(
          ing.cantidad,
          ing.unidad,
          unidadRend,
        );
        const cantidadEnRend = conv?.resultado ?? ing.cantidad;
        const sub = cantidadEnRend * costoUnit;
        total += sub;
        return { ...ing, costoSubtotal: sub };
      }
    }
    // 3) Precio manual (ad-hoc)
    if (ing.costoManualUsd !== undefined && ing.costoManualUsd > 0) {
      const sub = ing.cantidad * ing.costoManualUsd;
      total += sub;
      return { ...ing, costoSubtotal: sub };
    }
    return { ...ing, costoSubtotal: 0 };
  });
  const porPorcion = receta.porciones > 0 ? total / receta.porciones : total;
  return { total, porPorcion, lineas };
}

export function calcularCostoReceta(
  receta: Receta,
  insumos: Insumo[],
  recetasContexto: Receta[] = [],
): { total: number; porPorcion: number; lineas: RecetaIngrediente[] } {
  // recetasContexto debe incluir todas las recetas (incluyendo subrecetas)
  // para poder resolver referencias. Si no se pasa, las subrecetas tienen costo 0.
  return calcularCostoRecetaInterno(
    receta,
    recetasContexto,
    insumos,
    new Set([receta.id]),
    0,
  );
}
