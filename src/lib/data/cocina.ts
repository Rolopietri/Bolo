"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { hoyISO } from "@/lib/ui";
import { normalizarNombreCatalogo } from "@/lib/text";
import type {
  Proveedor,
  Insumo,
  Compra,
  TasaBcv,
  Seccion,
  ModalidadPago,
} from "@/lib/types";

// ─── PROVEEDORES ─────────────────────────────────────────────────

type ProveedorRow = {
  id: string;
  nombre: string;
  contacto_nombre: string | null;
  contacto_telefono: string | null;
  contacto_email: string | null;
  acepta_bs_bcv_dolar: boolean;
  acepta_bs_bcv_euro: boolean;
  acepta_bs_paralela: boolean;
  acepta_usd_efectivo: boolean;
  acepta_usd_divisa: boolean;
  notas: string | null;
  activo: boolean;
};

function rowToProveedor(r: ProveedorRow): Proveedor {
  return {
    id: r.id,
    nombre: r.nombre,
    contactoNombre: r.contacto_nombre ?? undefined,
    contactoTelefono: r.contacto_telefono ?? undefined,
    contactoEmail: r.contacto_email ?? undefined,
    aceptaBsBcvDolar: r.acepta_bs_bcv_dolar,
    aceptaBsBcvEuro: r.acepta_bs_bcv_euro,
    aceptaBsParalela: r.acepta_bs_paralela,
    aceptaUsdEfectivo: r.acepta_usd_efectivo,
    aceptaUsdDivisa: r.acepta_usd_divisa,
    notas: r.notas ?? undefined,
    activo: r.activo,
  };
}

export type ProveedorInput = Omit<Proveedor, "id">;

export async function listProveedores(): Promise<Proveedor[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("proveedores")
    .select("*")
    .order("nombre");
  if (error) throw error;
  return (data as ProveedorRow[]).map(rowToProveedor);
}

export async function createProveedor(
  input: ProveedorInput,
): Promise<Proveedor> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("proveedores")
    .insert({
      nombre: input.nombre,
      contacto_nombre: input.contactoNombre ?? null,
      contacto_telefono: input.contactoTelefono ?? null,
      contacto_email: input.contactoEmail ?? null,
      acepta_bs_bcv_dolar: input.aceptaBsBcvDolar,
      acepta_bs_bcv_euro: input.aceptaBsBcvEuro,
      acepta_bs_paralela: input.aceptaBsParalela,
      acepta_usd_efectivo: input.aceptaUsdEfectivo,
      acepta_usd_divisa: input.aceptaUsdDivisa,
      notas: input.notas ?? null,
      activo: input.activo,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToProveedor(data as ProveedorRow);
}

export async function updateProveedor(
  id: string,
  patch: Partial<ProveedorInput>,
): Promise<Proveedor> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.nombre !== undefined) db.nombre = patch.nombre;
  if (patch.contactoNombre !== undefined)
    db.contacto_nombre = patch.contactoNombre ?? null;
  if (patch.contactoTelefono !== undefined)
    db.contacto_telefono = patch.contactoTelefono ?? null;
  if (patch.contactoEmail !== undefined)
    db.contacto_email = patch.contactoEmail ?? null;
  if (patch.aceptaBsBcvDolar !== undefined)
    db.acepta_bs_bcv_dolar = patch.aceptaBsBcvDolar;
  if (patch.aceptaBsBcvEuro !== undefined)
    db.acepta_bs_bcv_euro = patch.aceptaBsBcvEuro;
  if (patch.aceptaBsParalela !== undefined)
    db.acepta_bs_paralela = patch.aceptaBsParalela;
  if (patch.aceptaUsdEfectivo !== undefined)
    db.acepta_usd_efectivo = patch.aceptaUsdEfectivo;
  if (patch.aceptaUsdDivisa !== undefined)
    db.acepta_usd_divisa = patch.aceptaUsdDivisa;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.activo !== undefined) db.activo = patch.activo;

  const { data, error } = await sb
    .from("proveedores")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToProveedor(data as ProveedorRow);
}

export async function deleteProveedor(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("proveedores").delete().eq("id", id);
  if (error) throw error;
}

// ─── INSUMOS ─────────────────────────────────────────────────────

type InsumoRow = {
  id: string;
  nombre: string;
  categoria: string;
  categoria_compra: string | null;
  seccion: string;
  unidad_compra: string;
  cantidad_por_compra: number | string;
  unidad_base: string;
  precio_compra_usd: number | string | null;
  precio_base_usd: number | string | null;
  precio_actualizado: string | null;
  stock_actual: number | string;
  stock_comprometido: number | string | null;
  stock_minimo: number | string | null;
  merma_coccion_porc: number | string | null;
  proveedor_id: string | null;
  ultima_fecha: string | null;
  ultima_cantidad: number | string | null;
  ultima_precio_usd: number | string | null;
  ultima_precio_bs: number | string | null;
  penultima_fecha: string | null;
  penultima_cantidad: number | string | null;
  penultima_precio_usd: number | string | null;
  penultima_precio_bs: number | string | null;
  notas: string | null;
  activo: boolean;
};

function rowToInsumo(r: InsumoRow): Insumo {
  return {
    id: r.id,
    nombre: r.nombre,
    categoria: r.categoria,
    categoriaCompra: r.categoria_compra ?? undefined,
    seccion: r.seccion as Seccion,
    unidadCompra: r.unidad_compra,
    cantidadPorCompra: Number(r.cantidad_por_compra),
    unidadBase: r.unidad_base,
    precioCompraUsd:
      r.precio_compra_usd === null ? null : Number(r.precio_compra_usd),
    precioBaseUsd:
      r.precio_base_usd === null ? null : Number(r.precio_base_usd),
    precioActualizado: r.precio_actualizado ?? undefined,
    // Mapeo de las 3 capas de stock. La columna DB se llama `stock_actual`
    // por compatibilidad (no rompemos triggers existentes) pero en código
    // se llama stockTotal. stock_comprometido es columna nueva.
    stockTotal: Number(r.stock_actual),
    stockComprometido:
      r.stock_comprometido === null || r.stock_comprometido === undefined
        ? 0
        : Number(r.stock_comprometido),
    stockMinimo: r.stock_minimo === null ? null : Number(r.stock_minimo),
    mermaCoccionPorc:
      r.merma_coccion_porc === null || r.merma_coccion_porc === undefined
        ? null
        : Number(r.merma_coccion_porc),
    proveedorId: r.proveedor_id ?? undefined,
    ultimaFecha: r.ultima_fecha ?? undefined,
    ultimaCantidad:
      r.ultima_cantidad === null ? undefined : Number(r.ultima_cantidad),
    ultimaPrecioUsd:
      r.ultima_precio_usd === null ? undefined : Number(r.ultima_precio_usd),
    ultimaPrecioBs:
      r.ultima_precio_bs === null ? undefined : Number(r.ultima_precio_bs),
    penultimaFecha: r.penultima_fecha ?? undefined,
    penultimaCantidad:
      r.penultima_cantidad === null ? undefined : Number(r.penultima_cantidad),
    penultimaPrecioUsd:
      r.penultima_precio_usd === null
        ? undefined
        : Number(r.penultima_precio_usd),
    penultimaPrecioBs:
      r.penultima_precio_bs === null
        ? undefined
        : Number(r.penultima_precio_bs),
    notas: r.notas ?? undefined,
    activo: r.activo,
  };
}

export type InsumoInput = Omit<
  Insumo,
  | "id"
  | "precioActualizado"
  | "ultimaFecha"
  | "ultimaCantidad"
  | "ultimaPrecioUsd"
  | "ultimaPrecioBs"
  | "penultimaFecha"
  | "penultimaCantidad"
  | "penultimaPrecioUsd"
  | "penultimaPrecioBs"
>;

export async function listInsumos(): Promise<Insumo[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("insumos")
    .select("*")
    .order("categoria")
    .order("nombre");
  if (error) throw error;
  return (data as InsumoRow[]).map(rowToInsumo);
}

export async function createInsumo(input: InsumoInput): Promise<Insumo> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("insumos")
    .insert({
      nombre: normalizarNombreCatalogo(input.nombre),
      categoria: input.categoria,
      categoria_compra: input.categoriaCompra ?? null,
      seccion: input.seccion,
      unidad_compra: input.unidadCompra,
      cantidad_por_compra: input.cantidadPorCompra,
      unidad_base: input.unidadBase,
      precio_compra_usd: input.precioCompraUsd,
      precio_base_usd: input.precioBaseUsd,
      stock_actual: input.stockTotal,
      stock_comprometido: input.stockComprometido ?? 0,
      stock_minimo: input.stockMinimo,
      merma_coccion_porc: input.mermaCoccionPorc ?? null,
      proveedor_id: input.proveedorId ?? null,
      notas: input.notas ?? null,
      activo: input.activo,
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToInsumo(data as InsumoRow);
}

export async function updateInsumo(
  id: string,
  patch: Partial<InsumoInput>,
): Promise<Insumo> {
  const sb = createSupabaseBrowserClient();
  const db: Record<string, unknown> = {};
  if (patch.nombre !== undefined)
    db.nombre = normalizarNombreCatalogo(patch.nombre);
  if (patch.categoria !== undefined) db.categoria = patch.categoria;
  if (patch.categoriaCompra !== undefined)
    db.categoria_compra = patch.categoriaCompra ?? null;
  if (patch.seccion !== undefined) db.seccion = patch.seccion;
  if (patch.unidadCompra !== undefined) db.unidad_compra = patch.unidadCompra;
  if (patch.cantidadPorCompra !== undefined)
    db.cantidad_por_compra = patch.cantidadPorCompra;
  if (patch.unidadBase !== undefined) db.unidad_base = patch.unidadBase;
  if (patch.precioCompraUsd !== undefined) {
    db.precio_compra_usd = patch.precioCompraUsd;
    // Recalcular precio_base si cambia precio_compra
    if (patch.cantidadPorCompra !== undefined && patch.cantidadPorCompra > 0) {
      db.precio_base_usd =
        (patch.precioCompraUsd ?? 0) / patch.cantidadPorCompra;
    }
  }
  if (patch.precioBaseUsd !== undefined) db.precio_base_usd = patch.precioBaseUsd;
  if (patch.stockTotal !== undefined) db.stock_actual = patch.stockTotal;
  if (patch.stockComprometido !== undefined)
    db.stock_comprometido = patch.stockComprometido;
  if (patch.stockMinimo !== undefined) db.stock_minimo = patch.stockMinimo;
  if (patch.mermaCoccionPorc !== undefined)
    db.merma_coccion_porc = patch.mermaCoccionPorc ?? null;
  if (patch.proveedorId !== undefined)
    db.proveedor_id = patch.proveedorId ?? null;
  if (patch.notas !== undefined) db.notas = patch.notas ?? null;
  if (patch.activo !== undefined) db.activo = patch.activo;

  const { data, error } = await sb
    .from("insumos")
    .update(db)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToInsumo(data as InsumoRow);
}

export async function deleteInsumo(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("insumos").delete().eq("id", id);
  if (error) throw error;
}

/** Refresca el precio de un insumo al precio de hoy SIN registrar una compra.
 *  Recalcula el precio por unidad base y estampa `precio_actualizado` con la
 *  fecha de hoy, para que el costeo deje de marcarlo como viejo. Pensado para
 *  cuando conoces el precio de mercado actual pero no compraste todavía. */
/** Cambia SOLO la categoría de un insumo (para clasificar ítems de reventa
 *  desde Análisis de ventas). No toca precio ni lo demás. */
export async function setInsumoCategoria(
  id: string,
  categoria: string | null,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("insumos").update({ categoria }).eq("id", id);
  if (error) throw error;
}

/** Cambia SOLO la categoría de COMPRA de un insumo (para clasificar desde
 *  Análisis de Compras). Es un campo aparte de `categoria` (que usa Ventas). */
export async function setInsumoCategoriaCompra(
  id: string,
  categoria: string | null,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("insumos")
    .update({ categoria_compra: categoria })
    .eq("id", id);
  if (error) throw error;
}

export async function actualizarPrecioInsumo(
  id: string,
  precioCompraUsd: number,
  cantidadPorCompra: number,
): Promise<Insumo> {
  const sb = createSupabaseBrowserClient();
  const hoy = hoyISO();
  const precioBase =
    cantidadPorCompra > 0
      ? precioCompraUsd / cantidadPorCompra
      : precioCompraUsd;
  const { data, error } = await sb
    .from("insumos")
    .update({
      precio_compra_usd: precioCompraUsd,
      precio_base_usd: precioBase,
      precio_actualizado: hoy,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return rowToInsumo(data as InsumoRow);
}

// ─── COMPRAS ─────────────────────────────────────────────────────

type CompraRow = {
  id: string;
  insumo_id: string;
  proveedor_id: string | null;
  fecha: string;
  cantidad: number | string;
  precio_total_usd: number | string;
  precio_total_bs: number | string | null;
  tasa_bcv_usada: number | string | null;
  modalidad_pago: string | null;
  notas: string | null;
  numero_factura: string | null;
  flete_usd: number | string | null;
  pagada: boolean | null;
  fecha_pago: string | null;
};

function rowToCompra(r: CompraRow): Compra {
  return {
    id: r.id,
    insumoId: r.insumo_id,
    proveedorId: r.proveedor_id ?? undefined,
    fecha: r.fecha,
    cantidad: Number(r.cantidad),
    precioTotalUsd: Number(r.precio_total_usd),
    precioTotalBs: r.precio_total_bs === null ? undefined : Number(r.precio_total_bs),
    tasaBcvUsada:
      r.tasa_bcv_usada === null ? undefined : Number(r.tasa_bcv_usada),
    modalidadPago: (r.modalidad_pago as ModalidadPago) ?? undefined,
    notas: r.notas ?? undefined,
    numeroFactura: r.numero_factura ?? undefined,
    fleteUsd: r.flete_usd === null ? undefined : Number(r.flete_usd),
    pagada: r.pagada ?? true,
    fechaPago: r.fecha_pago ?? undefined,
  };
}

export type CompraInput = Omit<Compra, "id">;

export async function listCompras(insumoId?: string): Promise<Compra[]> {
  const sb = createSupabaseBrowserClient();
  let q = sb.from("compras").select("*").order("fecha", { ascending: false });
  if (insumoId) q = q.eq("insumo_id", insumoId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as CompraRow[]).map(rowToCompra);
}

/** Compras dentro de un rango de fechas [desde, hasta] (inclusive). Pagina para
 *  esquivar el tope de 1000 filas de Supabase (igual que las ventas). */
export async function listComprasRango(desde: string, hasta: string): Promise<Compra[]> {
  const sb = createSupabaseBrowserClient();
  const PAGE = 1000;
  const out: Compra[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("compras")
      .select("*")
      .gte("fecha", desde)
      .lte("fecha", hasta)
      .order("fecha", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data as CompraRow[]) ?? [];
    out.push(...rows.map(rowToCompra));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Compras PAGADAS que cuentan como egreso del mes [desde, hasta] por CAJA REAL:
 *  su fecha efectiva es la de PAGO (fecha_pago). Las que no tienen fecha_pago
 *  (datos viejos) cuentan por su fecha de compra, para no perderlas. Así cada
 *  compra cuenta en un solo mes: el de su pago. Pagina el tope de 1000. */
export async function listComprasEgresoMes(desde: string, hasta: string): Promise<Compra[]> {
  const sb = createSupabaseBrowserClient();
  // Dos consultas simples (más robustas que un .or anidado):
  //  1) pagadas con fecha_pago dentro del mes (cuentan por fecha de pago).
  //  2) pagadas SIN fecha_pago (dato viejo) con fecha de compra dentro del mes.
  const [porPago, sinPago] = await Promise.all([
    sb.from("compras").select("*").eq("pagada", true).gte("fecha_pago", desde).lte("fecha_pago", hasta),
    sb.from("compras").select("*").eq("pagada", true).is("fecha_pago", null).gte("fecha", desde).lte("fecha", hasta),
  ]);
  if (porPago.error) throw porPago.error;
  const seen = new Set<string>();
  const out: Compra[] = [];
  for (const r of [...(porPago.data ?? []), ...(sinPago.error ? [] : sinPago.data ?? [])] as CompraRow[]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(rowToCompra(r));
  }
  return out;
}

/** Compras pendientes de pago (pagada=false), sin filtro de fecha — son deudas
 *  vigentes. Ordenadas de más antigua a más nueva. Pagina el tope de 1000. */
export async function listComprasPendientes(): Promise<Compra[]> {
  const sb = createSupabaseBrowserClient();
  const PAGE = 1000;
  const out: Compra[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("compras")
      .select("*")
      .eq("pagada", false)
      .order("fecha", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data as CompraRow[]) ?? [];
    out.push(...rows.map(rowToCompra));
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function createCompra(input: CompraInput): Promise<Compra> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("compras")
    .insert({
      insumo_id: input.insumoId,
      proveedor_id: input.proveedorId ?? null,
      fecha: input.fecha,
      cantidad: input.cantidad,
      precio_total_usd: input.precioTotalUsd,
      precio_total_bs: input.precioTotalBs ?? null,
      tasa_bcv_usada: input.tasaBcvUsada ?? null,
      modalidad_pago: input.modalidadPago ?? null,
      notas: input.notas ?? null,
      numero_factura: input.numeroFactura?.trim() || null,
      flete_usd: input.fleteUsd ?? null,
      pagada: input.pagada ?? true,
      fecha_pago:
        input.pagada === false ? null : (input.fechaPago ?? input.fecha),
    })
    .select("*")
    .single();
  if (error) throw error;
  return rowToCompra(data as CompraRow);
}

/**
 * Edita una compra. Se implementa como BORRAR + RECREAR para reutilizar los
 * triggers ya probados: al borrar, la base revierte el stock (y el precio si era
 * la última compra); al recrear con los datos nuevos, los vuelve a aplicar. Así
 * corregir la cantidad o el precio ajusta el inventario por la diferencia sin
 * lógica nueva. Devuelve la compra recreada (nuevo id).
 */
export async function updateCompra(
  id: string,
  input: CompraInput,
): Promise<Compra> {
  await deleteCompra(id);
  return createCompra(input);
}

/** Marca una compra como pagada / por pagar (no toca stock ni precio). Al pagar
 *  guarda la fecha de pago; al volver a "por pagar" la limpia. */
export async function marcarCompraPagada(
  id: string,
  pagada: boolean,
  fechaPago?: string,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb
    .from("compras")
    .update({ pagada, fecha_pago: pagada ? (fechaPago ?? hoyISO()) : null })
    .eq("id", id);
  if (error) throw error;
}

/** Marca como pagada / por pagar TODAS las líneas de una misma factura (mismo
 *  número de factura + proveedor). Una factura se paga completa, no línea por
 *  línea. Devuelve los ids afectados para actualizar el estado local. */
export async function marcarFacturaPagada(
  numeroFactura: string,
  proveedorId: string | null,
  pagada: boolean,
  fechaPago?: string,
): Promise<string[]> {
  const sb = createSupabaseBrowserClient();
  let q = sb
    .from("compras")
    .update({ pagada, fecha_pago: pagada ? (fechaPago ?? hoyISO()) : null })
    .eq("numero_factura", numeroFactura);
  q = proveedorId ? q.eq("proveedor_id", proveedorId) : q.is("proveedor_id", null);
  const { data, error } = await q.select("id");
  if (error) throw error;
  return (data ?? []).map((r) => (r as { id: string }).id);
}

export async function deleteCompra(id: string): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("compras").delete().eq("id", id);
  if (error) throw error;
}

/** Asigna (o quita, con null) el proveedor de una compra. Solo toca ese campo;
 *  no afecta stock ni precio. Útil para completar compras sin proveedor. */
export async function setCompraProveedor(id: string, proveedorId: string | null): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { error } = await sb.from("compras").update({ proveedor_id: proveedorId }).eq("id", id);
  if (error) throw error;
}

// ─── TASA BCV ────────────────────────────────────────────────────

type TasaRow = {
  fecha: string;
  usd_bs: number | string;
  eur_bs: number | string | null;
  paralela_bs: number | string | null;
  fuente: string | null;
};

/** Tasas BCV (usd_bs, eur_bs) por fecha dentro de un rango — para convertir
 *  cada registro con la tasa real de SU día. */
export async function listTasasBcvRango(desde: string, hasta: string): Promise<TasaBcv[]> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("tasa_bcv")
    .select("fecha, usd_bs, eur_bs, paralela_bs, fuente")
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha", { ascending: true });
  if (error) return [];
  return (data as TasaRow[]).map((r) => ({
    fecha: r.fecha,
    usdBs: Number(r.usd_bs),
    eurBs: r.eur_bs === null ? undefined : Number(r.eur_bs),
    paralelaBs: r.paralela_bs === null ? undefined : Number(r.paralela_bs),
    fuente: r.fuente ?? "bcv",
  }));
}

/** Tasa BCV aplicable a una fecha: la más reciente con fecha ≤ la pedida (el BCV
 *  no publica fines de semana/feriados, así que se usa la última vigente). Si no
 *  hay ninguna anterior, cae a la más antigua disponible. null si no hay tasas. */
export async function getTasaBcvPorFecha(fecha: string): Promise<TasaBcv | null> {
  const sb = createSupabaseBrowserClient();
  const toTasa = (r: TasaRow): TasaBcv => ({
    fecha: r.fecha,
    usdBs: Number(r.usd_bs),
    eurBs: r.eur_bs === null ? undefined : Number(r.eur_bs),
    paralelaBs: r.paralela_bs === null ? undefined : Number(r.paralela_bs),
    fuente: r.fuente ?? "bcv",
  });
  const enOAntes = await sb
    .from("tasa_bcv").select("*").lte("fecha", fecha)
    .order("fecha", { ascending: false }).limit(1).maybeSingle();
  if (!enOAntes.error && enOAntes.data) return toTasa(enOAntes.data as TasaRow);
  // Sin tasa anterior (fecha muy vieja): usa la más antigua que exista.
  const masVieja = await sb
    .from("tasa_bcv").select("*")
    .order("fecha", { ascending: true }).limit(1).maybeSingle();
  if (!masVieja.error && masVieja.data) return toTasa(masVieja.data as TasaRow);
  return null;
}

export async function getTasaBcvActual(): Promise<TasaBcv | null> {
  const sb = createSupabaseBrowserClient();
  const { data, error } = await sb
    .from("tasa_bcv")
    .select("*")
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as TasaRow;
  return {
    fecha: r.fecha,
    usdBs: Number(r.usd_bs),
    eurBs: r.eur_bs === null ? undefined : Number(r.eur_bs),
    paralelaBs: r.paralela_bs === null ? undefined : Number(r.paralela_bs),
    fuente: r.fuente ?? "bcv",
  };
}

export async function upsertTasaBcvParalela(
  fecha: string,
  paralelaBs: number,
): Promise<void> {
  const sb = createSupabaseBrowserClient();
  const { data: existing } = await sb
    .from("tasa_bcv")
    .select("*")
    .eq("fecha", fecha)
    .maybeSingle();
  if (existing) {
    const { error } = await sb
      .from("tasa_bcv")
      .update({ paralela_bs: paralelaBs })
      .eq("fecha", fecha);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from("tasa_bcv")
      .insert({ fecha, usd_bs: 0, paralela_bs: paralelaBs, fuente: "manual" });
    if (error) throw error;
  }
}
