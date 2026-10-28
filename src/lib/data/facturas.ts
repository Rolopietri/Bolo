import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizarDescripcion, normalizarRif } from "@/lib/facturas/parser";

// ─── MEMORIA DEL LECTOR DE FACTURAS ──────────────────────────────
// Equivalencias "línea de la factura de un proveedor" → insumo. Son de la
// empresa: las confirma cualquier usuario y sirven a todos los demás.

export type Equivalencia = {
  proveedorId: string;
  descripcionNorm: string;
  insumoId: string;
  /** Unidades de compra del insumo por cada unidad de la factura. */
  factorCantidad: number;
  usos: number;
};

type EquivalenciaRow = {
  proveedor_id: string;
  descripcion_norm: string;
  insumo_id: string;
  factor_cantidad: number | string;
  usos: number;
};

/** Equivalencias guardadas de un proveedor, por descripción normalizada. Si la
 *  tabla aún no existe en la base, devuelve un mapa vacío (el lector funciona
 *  igual, solo que sin memoria). */
export async function listEquivalencias(
  proveedorId: string,
): Promise<Map<string, Equivalencia>> {
  const out = new Map<string, Equivalencia>();
  try {
    const sb = createSupabaseBrowserClient();
    const { data, error } = await sb
      .from("factura_equivalencias")
      .select("proveedor_id, descripcion_norm, insumo_id, factor_cantidad, usos")
      .eq("proveedor_id", proveedorId);
    if (error) return out;
    for (const r of (data ?? []) as EquivalenciaRow[]) {
      out.set(r.descripcion_norm, {
        proveedorId: r.proveedor_id,
        descripcionNorm: r.descripcion_norm,
        insumoId: r.insumo_id,
        factorCantidad: Number(r.factor_cantidad) || 1,
        usos: r.usos,
      });
    }
  } catch {
    // Sin memoria disponible: se sigue sin ella.
  }
  return out;
}

/** Guarda (o corrige) lo que se confirmó en una factura. La corrección más
 *  reciente reemplaza a la anterior. Devuelve false si no se pudo guardar (la
 *  compra ya quedó registrada; solo se pierde el recuerdo). */
export async function guardarEquivalencias(
  proveedorId: string,
  lineas: { descripcion: string; insumoId: string; factorCantidad: number }[],
  previas: Map<string, Equivalencia>,
): Promise<boolean> {
  const filas = new Map<string, Record<string, unknown>>();
  for (const l of lineas) {
    const norm = normalizarDescripcion(l.descripcion);
    if (!norm) continue;
    const previa = previas.get(norm);
    filas.set(norm, {
      proveedor_id: proveedorId,
      descripcion_norm: norm,
      descripcion: l.descripcion.trim(),
      insumo_id: l.insumoId,
      factor_cantidad: l.factorCantidad > 0 ? l.factorCantidad : 1,
      usos: (previa?.usos ?? 0) + 1,
      ultima_vez: new Date().toISOString(),
    });
  }
  if (filas.size === 0) return true;
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("factura_equivalencias")
    .upsert([...filas.values()], { onConflict: "proveedor_id,descripcion_norm" });
  return !error;
}

/** Guarda el RIF del proveedor (para reconocerlo solo en la próxima factura).
 *  Silencioso si la columna aún no existe o el RIF ya lo tiene otro proveedor. */
export async function setProveedorRif(proveedorId: string, rif: string): Promise<void> {
  const limpio = rif.trim().toUpperCase();
  if (!limpio) return;
  const sb = createSupabaseBrowserClient();
  await sb.from("proveedores").update({ rif: limpio }).eq("id", proveedorId);
}

/** Busca el proveedor que corresponde a un RIF entre los ya cargados. */
export function proveedorPorRif<T extends { rif?: string }>(
  proveedores: T[],
  rif: string | undefined,
): T | undefined {
  if (!rif) return undefined;
  const buscado = normalizarRif(rif);
  const exacto = proveedores.find((p) => p.rif && normalizarRif(p.rif) === buscado);
  if (exacto) return exacto;
  // El OCR suele confundir UN dígito (3↔8, 1↔7): se acepta si solo hay un
  // proveedor a esa distancia, para no confundir dos parecidos.
  const cercanos = proveedores.filter((p) => {
    if (!p.rif) return false;
    const r = normalizarRif(p.rif);
    if (r.length !== buscado.length || r[0] !== buscado[0]) return false;
    let distintos = 0;
    for (let i = 0; i < r.length; i++) if (r[i] !== buscado[i]) distintos++;
    return distintos === 1;
  });
  return cercanos.length === 1 ? cercanos[0] : undefined;
}
