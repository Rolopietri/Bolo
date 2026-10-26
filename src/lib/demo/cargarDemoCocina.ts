"use client";

// Carga el dataset de src/lib/demo/cocina-demo.json con la sesión del usuario.
// Usa las mismas funciones que los formularios (RLS de authenticated, triggers
// de stock). No usa la llave de servicio. Es idempotente: una segunda pasada
// no duplica filas marcadas como demo ni se engancha a homónimos reales.

import datos from "./cocina-demo.json";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { normalizarNombreCatalogo } from "@/lib/text";
import {
  createCompra,
  createInsumo,
  createProveedor,
  listCompras,
  listInsumos,
  listProveedores,
} from "@/lib/data/cocina";
import { createReceta, listRecetas } from "@/lib/data/recetas";
import { createMenajeItem, listMenaje } from "@/lib/data/menaje";
import { createVenta } from "@/lib/data/ventas";

const NOTA = datos.nota;

export type ResumenDemo = {
  creados: {
    proveedores: number;
    insumos: number;
    recetas: number;
    compras: number;
    ventas: number;
    menaje: number;
  };
  /** Nombres que ya existían y no son de este demo: no se tocaron. */
  omitidos: string[];
  total: number;
};

function claveLibre(nombre: string) {
  return nombre.trim().toLowerCase();
}

function esDemo(notas: string | null | undefined) {
  return (notas ?? "").includes("demo de bolo");
}

function fechaHace(dias: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export async function cargarDemoCocina(): Promise<ResumenDemo> {
  const creados = {
    proveedores: 0,
    insumos: 0,
    recetas: 0,
    compras: 0,
    ventas: 0,
    menaje: 0,
  };
  const omitidos: string[] = [];
  const sb = createSupabaseBrowserClient();

  const proveedores = await listProveedores();
  const provPorNombre = new Map(proveedores.map((p) => [claveLibre(p.nombre), p]));

  for (const p of datos.proveedores) {
    const ya = provPorNombre.get(claveLibre(p.nombre));
    if (ya) {
      if (!esDemo(ya.notas)) omitidos.push(p.nombre);
      continue;
    }
    const nuevo = await createProveedor({
      nombre: p.nombre,
      contactoNombre: p.contactoNombre,
      contactoTelefono: p.contactoTelefono,
      contactoEmail: p.contactoEmail,
      aceptaBsBcvDolar: p.aceptaBsBcvDolar,
      aceptaBsBcvEuro: p.aceptaBsBcvEuro,
      aceptaBsParalela: p.aceptaBsParalela,
      aceptaUsdEfectivo: p.aceptaUsdEfectivo,
      aceptaUsdDivisa: p.aceptaUsdDivisa,
      notas: NOTA,
      activo: true,
    });
    provPorNombre.set(claveLibre(nuevo.nombre), nuevo);
    creados.proveedores += 1;
  }

  const insumos = await listInsumos();
  const insPorNombre = new Map(
    insumos.map((i) => [normalizarNombreCatalogo(i.nombre), i]),
  );

  for (const i of datos.insumos) {
    const nombre = normalizarNombreCatalogo(i.nombre);
    const ya = insPorNombre.get(nombre);
    if (ya) {
      if (!esDemo(ya.notas)) omitidos.push(nombre);
      continue;
    }
    const prov = provPorNombre.get(claveLibre(i.proveedor));
    if (!prov || !esDemo(prov.notas)) {
      omitidos.push(nombre);
      continue;
    }
    const nuevo = await createInsumo({
      nombre: i.nombre,
      categoria: i.categoria,
      unidadCompra: i.unidadCompra,
      cantidadPorCompra: i.cantidadPorCompra,
      unidadBase: i.unidadBase,
      precioCompraUsd: i.precioCompraUsd,
      precioBaseUsd:
        i.cantidadPorCompra > 0 ? i.precioCompraUsd / i.cantidadPorCompra : i.precioCompraUsd,
      stockTotal: 0,
      stockComprometido: 0,
      stockMinimo: i.stockMinimo,
      proveedorId: prov.id,
      notas: NOTA,
      activo: true,
    });
    insPorNombre.set(normalizarNombreCatalogo(nuevo.nombre), nuevo);
    creados.insumos += 1;
  }

  const recetas = await listRecetas();
  const recPorNombre = new Map(
    recetas.map((r) => [normalizarNombreCatalogo(r.nombre), r]),
  );

  for (const r of datos.recetas) {
    const nombre = normalizarNombreCatalogo(r.nombre);
    const rec = recPorNombre.get(nombre);
    if (rec && !esDemo(rec.notasChef)) {
      omitidos.push(nombre);
      continue;
    }
    const ingredientes = [];
    let saltar = false;
    for (const [orden, ing] of r.ingredientes.entries()) {
      const insNombre = normalizarNombreCatalogo(ing.insumo);
      const ins = insPorNombre.get(insNombre);
      if (!ins || !esDemo(ins.notas)) {
        omitidos.push(`${nombre} / ${insNombre}`);
        saltar = true;
        break;
      }
      ingredientes.push({
        insumoId: ins.id,
        nombre: ing.insumo,
        cantidad: ing.cantidad,
        unidad: ing.unidad,
        orden,
        insNombre,
      });
    }
    if (saltar) continue;
    if (!rec) {
      const nueva = await createReceta({
        nombre: r.nombre,
        categoria: r.categoria,
        porciones: r.porciones,
        tiempoPrepMin: r.tiempoPrepMin,
        tiempoCoccionMin: r.tiempoCoccionMin,
        procedimiento: r.procedimiento,
        precioSugeridoUsd: r.precioSugeridoUsd,
        notasChef: NOTA,
        ingredientes: ingredientes.map((ing) => ({
          insumoId: ing.insumoId,
          nombre: ing.nombre,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          orden: ing.orden,
        })),
      });
      recPorNombre.set(normalizarNombreCatalogo(nueva.nombre), nueva);
      creados.recetas += 1;
      continue;
    }
    const yaIng = new Set(rec.ingredientes.map((i) => normalizarNombreCatalogo(i.nombre)));
    const faltan = ingredientes.filter((ing) => !yaIng.has(ing.insNombre));
    if (faltan.length) {
      const { error } = await sb.from("receta_ingredientes").insert(
        faltan.map((ing) => ({
          receta_id: rec.id,
          insumo_id: ing.insumoId,
          nombre: ing.insNombre,
          cantidad: ing.cantidad,
          unidad: ing.unidad,
          orden: ing.orden,
        })),
      );
      if (error) throw error;
    }
  }

  const compras = await listCompras();
  const comprasDemo = new Set(
    compras.filter((c) => esDemo(c.notas)).map((c) => c.insumoId),
  );

  for (const c of datos.compras) {
    const ins = insPorNombre.get(normalizarNombreCatalogo(c.insumo));
    const prov = provPorNombre.get(claveLibre(c.proveedor));
    if (!ins || !esDemo(ins.notas) || !prov) {
      omitidos.push(c.insumo);
      continue;
    }
    if (comprasDemo.has(ins.id)) continue;
    await createCompra({
      insumoId: ins.id,
      proveedorId: prov.id,
      fecha: fechaHace(c.diasAtras),
      cantidad: c.cantidad,
      precioTotalUsd: c.precioTotalUsd,
      modalidadPago: c.modalidadPago as "efectivo" | "bcv_dolar",
      notas: NOTA,
      pagada: c.pagada,
      fechaPago: c.pagada ? fechaHace(c.diasAtras) : undefined,
      numeroFactura: c.numeroFactura,
    });
    comprasDemo.add(ins.id);
    creados.compras += 1;
  }

  const { data: venRows, error: venErr } = await sb
    .from("ventas")
    .select("receta_id")
    .eq("notas", NOTA);
  if (venErr) throw venErr;
  const ventasDemo = new Set(
    (venRows ?? []).map((v) => (v as { receta_id: string | null }).receta_id),
  );

  for (const v of datos.ventas) {
    const rec = recPorNombre.get(normalizarNombreCatalogo(v.receta));
    if (!rec || !esDemo(rec.notasChef)) {
      omitidos.push(v.receta);
      continue;
    }
    if (ventasDemo.has(rec.id)) continue;
    await createVenta({
      fecha: fechaHace(v.diasAtras),
      recetaId: rec.id,
      recetaNombre: rec.nombre,
      cantidad: v.cantidad,
      precioUnitarioUsd: v.precioUnitarioUsd,
      totalUsd: v.cantidad * v.precioUnitarioUsd,
      fuente: "manual",
      notas: NOTA,
      tipoItem: "insumo",
    });
    ventasDemo.add(rec.id);
    creados.ventas += 1;
  }

  const menaje = await listMenaje();
  const menPorNombre = new Map(menaje.map((m) => [claveLibre(m.nombre), m]));
  for (const m of datos.menaje) {
    const ya = menPorNombre.get(claveLibre(m.nombre));
    if (ya) {
      if (!esDemo(ya.notas)) omitidos.push(m.nombre);
      continue;
    }
    await createMenajeItem({
      nombre: m.nombre,
      categoria: m.categoria,
      descripcion: m.descripcion,
      cantidadActual: m.cantidad,
      cantidadInicial: m.cantidad,
      precioReposicionUsd: m.precioReposicionUsd,
      notas: NOTA,
      activo: true,
    });
    creados.menaje += 1;
  }

  const total = Object.values(creados).reduce((s, n) => s + n, 0);
  return { creados, omitidos, total };
}
