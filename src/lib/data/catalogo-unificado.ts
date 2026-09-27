"use client";

// Catálogo unificado para Presupuestos.
//
// Lee de 3 fuentes y devuelve un tipo común que el formulario de
// "nuevo presupuesto" y la vista de catálogo pueden consumir igual:
//   1. services_catalog → servicios propios (espacios, catering propio, padel, etc.)
//   2. inventario_alquiler → mobiliario y objetos en alquiler
//   3. contratistas → terceros (fotografía, DJ, decoración, ...)
//
// No duplica datos: cada lectura va a su tabla. Si editas un contratista,
// el cambio se ve al instante en el catálogo y en la pantalla de creación
// de presupuestos.

import { listServicios } from "./servicios";
import { listInventario } from "./inventario";
import { listContratistas } from "./contratistas";
import type {
  Servicio,
  InventarioItem,
  Contratista,
  UnidadServicio,
} from "@/lib/types";

export type OrigenCatalogo = "servicio" | "inventario" | "contratista";

export type CatalogoEntry = {
  /** ID compuesto "servicio:uuid" | "inventario:uuid" | "contratista:uuid".
   *  Útil para usar como key React y para no chocar entre tablas. */
  key: string;
  origen: OrigenCatalogo;
  nombre: string;
  descripcion?: string;
  /** Categoría textual dentro del origen (ej "Espacios", "Mesas", "Fotografía"). */
  categoria: string;
  /** Precio referencial en USD. null cuando es manual o no se ha cargado. */
  precio: number | null;
  /** Cómo presentarlo en pantalla: "$15.00", "Manual", "Incluido", "—". */
  precioLabel: string;
  /** Unidad por la que se cobra (día, hora, evento, unidad, ...). */
  unidad: UnidadServicio;
  manual: boolean;
  incluido: boolean;
  /** Solo activos llegan al picker; el cliente filtra por origen si quiere. */
  activo: boolean;
  /** Referencias originales — útiles para leer info extra (contacto, stock, etc.) */
  servicio?: Servicio;
  inventario?: InventarioItem;
  contratista?: Contratista;
};

function formatPrecio(precio: number | null, manual: boolean, incluido: boolean): string {
  if (incluido) return "Incluido";
  if (manual) return "Manual";
  if (precio === null) return "—";
  return `$${precio.toFixed(2)}`;
}

function servicioToEntry(s: Servicio): CatalogoEntry {
  return {
    key: `servicio:${s.id}`,
    origen: "servicio",
    nombre: s.nombre,
    descripcion: s.descripcion,
    categoria: s.categoria, // valores fijos: espacio | catering | equipo | padel | tecnico | otros
    precio: s.precioUnitario,
    precioLabel: formatPrecio(s.precioUnitario, s.manual, s.incluido),
    unidad: s.unidad,
    manual: s.manual,
    incluido: s.incluido,
    activo: s.activo,
    servicio: s,
  };
}

function inventarioToEntry(i: InventarioItem): CatalogoEntry {
  // Inventario va siempre con unidad "unidad" y precio del alquiler.
  // Si no hay precio cargado, marcamos como "manual" para que se llene
  // al cotizar.
  const precio = i.precioAlquilerUsd ?? null;
  const manual = precio === null;
  return {
    key: `inventario:${i.id}`,
    origen: "inventario",
    nombre: i.nombre,
    descripcion: i.descripcion,
    categoria: i.categoria,
    precio,
    precioLabel: formatPrecio(precio, manual, false),
    unidad: "unidad",
    manual,
    incluido: false,
    activo: i.activo && i.estado !== "agotado",
    inventario: i,
  };
}

function contratistaToEntry(c: Contratista): CatalogoEntry {
  // Contratistas se cotizan por evento, con su precio referencial.
  const precio = c.precioReferencialUsd ?? null;
  const manual = precio === null;
  return {
    key: `contratista:${c.id}`,
    origen: "contratista",
    nombre: c.nombre,
    descripcion: c.contactoNombre
      ? `Contacto: ${[c.contactoNombre, c.contactoTelefono]
          .filter(Boolean)
          .join(" · ")}`
      : undefined,
    categoria: c.especialidad,
    precio,
    precioLabel: formatPrecio(precio, manual, false),
    unidad: "evento",
    manual,
    incluido: false,
    activo: c.activo,
    contratista: c,
  };
}

export type CatalogoUnificado = {
  servicios: CatalogoEntry[];
  inventario: CatalogoEntry[];
  contratistas: CatalogoEntry[];
};

/**
 * Carga las 3 fuentes en paralelo. Si una falla (ej. la tabla aún no existe),
 * la sección queda vacía pero las otras siguen funcionando — no hacemos caer
 * todo el catálogo por una tabla pendiente de migrar.
 */
export async function listCatalogoUnificado(): Promise<CatalogoUnificado> {
  const [serviciosRes, inventarioRes, contratistasRes] = await Promise.allSettled([
    listServicios(),
    listInventario(),
    listContratistas(),
  ]);

  const servicios =
    serviciosRes.status === "fulfilled"
      ? serviciosRes.value.map(servicioToEntry)
      : [];
  const inventario =
    inventarioRes.status === "fulfilled"
      ? inventarioRes.value.map(inventarioToEntry)
      : [];
  const contratistas =
    contratistasRes.status === "fulfilled"
      ? contratistasRes.value.map(contratistaToEntry)
      : [];

  return { servicios, inventario, contratistas };
}

/** Aplana el catálogo en un solo array (útil para iterar sin perder origen). */
export function flatten(cat: CatalogoUnificado): CatalogoEntry[] {
  return [...cat.servicios, ...cat.inventario, ...cat.contratistas];
}
