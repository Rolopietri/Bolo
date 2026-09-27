"use client";

// Dashboard "Análisis de Ventas". Usa exactamente los mismos datos que el
// reporte detallado (tabla `ventas`, es_merma=false). No crea datos paralelos:
// carga las ventas del rango + las recetas (para la categoría) y agrega todo en
// el cliente con useMemo. Modular: no toca la lógica de registro de ventas.

import { useEffect, useMemo, useState } from "react";
import { Plegable } from "@/components/Plegable";
import type { Venta, Receta, Insumo } from "@/lib/types";
import { categoriaRecetaLabel, categoriaInsumoLabel } from "@/lib/types";
import { listVentasRango, normPos } from "@/lib/data/ventas";
import { listRecetas, setRecetaCategoria, calcularCostoReceta } from "@/lib/data/recetas";
import { listInsumos, setInsumoCategoria } from "@/lib/data/cocina";
import { listCategoriasProducto, createCategoriaProducto, renameCategoriaProducto, deleteCategoriaProducto, setCategoriaExcluirRanking, type CategoriaProducto } from "@/lib/data/categorias";
import { listCategoriasPorNombre, setCategoriaPorNombre } from "@/lib/data/categoriasNombre";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  BarrasH,
  LineaEvolucion,
  Dona,
  PanelCard,
  colorPorIndice,
  type BarRow,
} from "@/components/charts/VentasCharts";

// ── Formato ──────────────────────────────────────────────────────────────
const fUSD = (n: number) =>
  "$" +
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fUnid = (n: number) =>
  Number.isInteger(n)
    ? n.toLocaleString("en-US")
    : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fPct = (n: number) => `${n.toFixed(1)}%`;

// Fecha ISO local (evita el corrimiento de zona horaria de toISOString()).
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Etiqueta corta de día para el eje X (ej. "05/08").
function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

type Preset = "dia" | "semana" | "mes" | "rango";

// Rango de fechas para cada preset (mes = mes actual por defecto).
function rangoDePreset(preset: Preset): { desde: string; hasta: string } {
  const hoy = new Date();
  if (preset === "dia") return { desde: isoLocal(hoy), hasta: isoLocal(hoy) };
  if (preset === "semana") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: isoLocal(d), hasta: isoLocal(hoy) };
  }
  // mes actual
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: isoLocal(primero), hasta: isoLocal(hoy) };
}

// Normaliza un nombre de categoría para AGRUPAR: sin acentos, en minúsculas y
// sin espacios repetidos. Así "Otros" de receta y "Otros" de insumo (o cualquier
// par que se escriba igual) caen en la MISMA categoría en vez de duplicarse.
function normCat(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// Unifica nombres equivalentes de las DOS taxonomías (categorías de receta +
// categorías de insumo de reventa) en una sola etiqueta canónica, para que el
// análisis no muestre categorías repetidas. Solo toca la VISTA del dashboard;
// no cambia los datos de recetas ni insumos. Clave = nombre normalizado.
// Ya NO se colapsan las categorías en unas pocas genéricas: cada categoría fina
// se muestra por separado. Solo se dejan un par de normalizaciones inofensivas
// (miscelánea → "Otros") para no ensuciar el análisis.
const CANON_CATEGORIA: Record<string, string> = {
  otros: "Otros",
  // "Leche de Almendras" vendida como extra: el insumo está en "Lácteos", pero
  // no es una categoría de venta propia → va a Otros.
  lacteos: "Otros",
};

// Categoría de una venta (usa datos existentes, no inventa):
//   • receta vinculada con categoría → esa categoría.
//   • venta insumo_directo (reventa: aguas, refrescos, galletas…) → la categoría
//     del insumo del catálogo.
//   • consignación / servicio → su tipo.
//   • si no → "Sin categoría".
// Se agrupa por el nombre CANÓNICO (una sola lista limpia, sin repetidos).
function categoriaDeVenta(
  v: Venta,
  catPorReceta: Map<string, string>,
  catPorInsumo: Map<string, string>,
  catPorNombre: Map<string, string>,
  rubroMap: Map<string, string>,
): { key: string; label: string; underKey: string; underLabel: string } {
  let label: string | null = null;
  if (v.recetaId) {
    const cat = catPorReceta.get(v.recetaId);
    if (cat && cat.trim()) label = categoriaRecetaLabel(cat);
  }
  if (!label && v.insumoId) {
    const cat = catPorInsumo.get(v.insumoId);
    if (cat && cat.trim()) label = categoriaInsumoLabel(cat);
  }
  // Sin categoría de receta/insumo: última vía → asignación manual por nombre
  // (consignación, servicios, ítems sueltos del POS).
  if (!label) {
    const ov = catPorNombre.get(normPos(v.recetaNombre || ""));
    if (ov && ov.trim()) label = ov;
  }
  if (!label && v.tipoItem === "consignacion") label = "Consignación";
  if (!label && v.tipoItem === "servicio") label = "Servicio";
  if (!label) label = "Sin categoría";
  const canon = CANON_CATEGORIA[normCat(label)] ?? label;
  // Rollup administrativo: si la categoría tiene un "rubro" definido, se agrupa
  // bajo ese rubro (p. ej. Smoothies + Bebidas naturales → un solo rubro). En
  // Recetas/Cocina la categoría sigue usándose tal cual; esto es solo la vista.
  // Además, las dos categorías en consignación se agrupan (fijo) bajo
  // "Consignación", pudiéndose abrir cada una por separado en el drill.
  const rubro = rubroMap.get(normCat(canon)) ?? SUBRUBRO_FIJO[normCat(canon)] ?? canon;
  // Se devuelve TAMBIÉN la categoría subyacente (antes del rollup) para el
  // tercer nivel del drill: rubro → categoría real → ítems.
  return { key: normCat(rubro), label: rubro, underKey: normCat(canon), underLabel: canon };
}

// Sub-rubros fijos (sin depender de la config de la BD): agrupan varias
// categorías bajo un nombre en el análisis, pero cada una sigue siendo abrible
// por separado. Las dos consignaciones se juntan como "Consignación".
const SUBRUBRO_FIJO: Record<string, string> = {
  "bar of mix (consignacion)": "Consignación",
  "cocina clandestina (consignacion)": "Consignación",
  consignacion: "Consignación",
};

// Grupo de NIVEL SUPERIOR para el gráfico principal de Administración: las 3
// categorías de alquiler se muestran solas y todo lo demás (café, bebidas,
// cocina, consignaciones…) se engloba en "Cafetería". Al abrir Cafetería
// salen sus categorías, y de ahí el detalle por ítem.
const GRUPOS_ALQUILER = new Set(
  ["Alquileres fijos", "Eventos & Alquileres por bloque", "Pádel"].map(normCat),
);
function grupoDeCategoria(catLabel: string): { key: string; label: string } {
  const n = normCat(catLabel);
  if (GRUPOS_ALQUILER.has(n)) return { key: n, label: catLabel };
  return { key: "cafeteria", label: "Cafetería" };
}

type OrdenTabla = "monto" | "unidades" | "pct";

export function AnalisisVentas() {
  const [preset, setPreset] = useState<Preset>("mes");
  const inicial = rangoDePreset("mes");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [filtroCat, setFiltroCat] = useState<string>("all");
  const [filtroProd, setFiltroProd] = useState<string>("all");
  const [topN, setTopN] = useState<5 | 10 | 20>(5);
  const [orden, setOrden] = useState<OrdenTabla>("monto");

  const [ventas, setVentas] = useState<Venta[]>([]);
  const [ventasPrev, setVentasPrev] = useState<Venta[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [loading, setLoading] = useState(true);
  // Drill-down de dos niveles: `catDrill` = grupo abierto del gráfico principal
  // (Cafetería o un alquiler); `subDrill` = categoría abierta DENTRO de ese
  // grupo (solo aplica a Cafetería, que agrupa varias categorías).
  const [catDrill, setCatDrill] = useState<{ key: string; label: string } | null>(null);
  const [subDrill, setSubDrill] = useState<{ key: string; label: string } | null>(null);
  // Tercer nivel: categoría REAL dentro de una sub-categoría que agrupa varias
  // (p. ej. Consignación → Bar of Mix / Cocina Clandestina).
  const [underDrill, setUnderDrill] = useState<{ key: string; label: string } | null>(null);
  const abrirGrupo = (key: string, label: string) => { setCatDrill({ key, label }); setSubDrill(null); setUnderDrill(null); };
  // Abre el drill directo en una categoría concreta: entra por su grupo y, si es
  // de Cafetería, la deja seleccionada como sub-categoría (para ver sus ítems).
  const abrirCategoria = (catKey: string, catLabel: string) => {
    const grp = grupoDeCategoria(catLabel);
    setCatDrill({ key: grp.key, label: grp.label });
    setSubDrill(grp.key === "cafeteria" ? { key: catKey, label: catLabel } : null);
    setUnderDrill(null);
  };
  const [error, setError] = useState<string | null>(null);
  // Conciliación con Administración (componentes del rango, en euros).
  const [conc, setConc] = useState<{ setuxNeto: number; ivaSetux: number; cxc: number; rpp: number; cxcNeto: number; rppNeto: number; cobrosEur: number; otrosEur: number; tickets: number } | null>(null);
  // Panel de clasificación de productos (asigna la categoría desde Admin).
  const [mostrarClasif, setMostrarClasif] = useState(false);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const [mostrarSinVenta, setMostrarSinVenta] = useState(false);
  const [busquedaClasif, setBusquedaClasif] = useState("");
  const [guardandoCat, setGuardandoCat] = useState<string | null>(null);
  // Categorías definidas por el usuario (se comparten con los demás módulos).
  const [categorias, setCategorias] = useState<CategoriaProducto[]>([]);
  const [nuevaCat, setNuevaCat] = useState("");
  const [editCat, setEditCat] = useState<{ id: string; nombre: string } | null>(null);
  const [gestionCat, setGestionCat] = useState(false);
  // Categoría asignada por NOMBRE del ítem (consignación, servicios, sueltos).
  const [catNombre, setCatNombre] = useState<Map<string, string>>(new Map());

  // Recetas + insumos una sola vez (para los mapas de categoría: las ventas de
  // receta usan la categoría de la receta; las de reventa (insumo_directo) usan
  // la del insumo).
  useEffect(() => {
    let cancel = false;
    listRecetas()
      .then((r) => !cancel && setRecetas(r))
      .catch(() => {});
    listInsumos()
      .then((i) => !cancel && setInsumos(i))
      .catch(() => {});
    listCategoriasProducto()
      .then((c) => !cancel && setCategorias(c))
      .catch(() => {});
    listCategoriasPorNombre()
      .then((rows) => !cancel && setCatNombre(new Map(rows.map((r) => [r.nombreNorm, r.categoria]))))
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

  // Ventas: se recargan cuando cambia el rango de fechas.
  useEffect(() => {
    let cancel = false;
    async function cargar() {
      setLoading(true);
      setError(null);
      try {
        const v = await listVentasRango(desde, hasta);
        if (!cancel) setVentas(v);
      } catch (e) {
        if (!cancel)
          setError(e instanceof Error ? e.message : "Error cargando ventas");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancel = true;
    };
  }, [desde, hasta]);

  // Componentes de conciliación (Setux neto, CXC, RPP…) del mismo rango.
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/conciliacion?desde=${desde}&hasta=${hasta}`, { cache: "no-store" });
        const d = await r.json();
        if (!cancel) setConc(r.ok ? d : null);
      } catch {
        if (!cancel) setConc(null);
      }
    })();
    return () => { cancel = true; };
  }, [desde, hasta]);

  // Período anterior: mismo largo, justo antes de `desde`. Para comparar ▲▼.
  const rangoPrev = useMemo(() => {
    const d0 = new Date(desde + "T00:00");
    const d1 = new Date(hasta + "T00:00");
    const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
    const finPrev = new Date(d0);
    finPrev.setDate(finPrev.getDate() - 1);
    const iniPrev = new Date(finPrev);
    iniPrev.setDate(iniPrev.getDate() - (dias - 1));
    return { desde: isoLocal(iniPrev), hasta: isoLocal(finPrev), dias };
  }, [desde, hasta]);

  useEffect(() => {
    let cancel = false;
    listVentasRango(rangoPrev.desde, rangoPrev.hasta)
      .then((v) => !cancel && setVentasPrev(v))
      .catch(() => !cancel && setVentasPrev([]));
    return () => { cancel = true; };
  }, [rangoPrev.desde, rangoPrev.hasta]);

  // Total de Cocina del rango (todas las ventas, sin filtros de cat/producto).
  const cocinaTotalRango = useMemo(() => ventas.reduce((s, v) => s + (v.totalUsd ?? 0), 0), [ventas]);
  const prevTotalMonto = useMemo(() => ventasPrev.reduce((s, v) => s + (v.totalUsd ?? 0), 0), [ventasPrev]);

  const catPorReceta = useMemo(() => {
    const m = new Map<string, string>();
    recetas.forEach((r) => {
      if (r.categoria) m.set(r.id, r.categoria);
    });
    return m;
  }, [recetas]);

  const catPorInsumo = useMemo(() => {
    const m = new Map<string, string>();
    insumos.forEach((i) => {
      if (i.categoria) m.set(i.id, i.categoria);
    });
    return m;
  }, [insumos]);

  // Costo por unidad de cada receta vendible (para el margen). Usa el mismo
  // motor de costos que Cocina (insumos + subrecetas), costo por porción.
  const costoUnitPorReceta = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of recetas) {
      if (r.esSubreceta) continue;
      try {
        const { porPorcion } = calcularCostoReceta(r, insumos, recetas);
        if (porPorcion > 0) m.set(r.id, porPorcion);
      } catch { /* receta sin costo calculable */ }
    }
    return m;
  }, [recetas, insumos]);
  // Precio base de cada insumo (para el costo de la reventa directa).
  const precioBaseInsumo = useMemo(() => {
    const m = new Map<string, number>();
    insumos.forEach((i) => { if (i.precioBaseUsd != null) m.set(i.id, i.precioBaseUsd); });
    return m;
  }, [insumos]);

  // Mapa categoría (nombre normalizado) → rubro administrativo, para agrupar en
  // el análisis (Smoothies + Bebidas naturales → un solo rubro). Solo la vista.
  const rubroMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) {
      if (c.rubro && c.rubro.trim()) m.set(normCat(c.nombre), c.rubro.trim());
    }
    return m;
  }, [categorias]);

  // Enriquecer cada venta con producto/categoría/unidades/monto/costo.
  // costo = costo de la línea completa (todas las unidades); null si no se puede
  // costear (consignación, servicios, receta sin costo).
  const enriquecidas = useMemo(
    () =>
      ventas.map((v) => {
        const cat = categoriaDeVenta(v, catPorReceta, catPorInsumo, catNombre, rubroMap);
        const grp = grupoDeCategoria(cat.label);
        const unidades = v.cantidad || 0;
        let costo: number | null = null;
        if (v.recetaId) {
          const c = costoUnitPorReceta.get(v.recetaId);
          if (c != null) costo = c * unidades;
        } else if (v.insumoId) {
          const p = precioBaseInsumo.get(v.insumoId);
          if (p != null) costo = p * (v.insumoCantidad || 0) * unidades;
        }
        return {
          fecha: v.fecha,
          producto: v.recetaNombre.trim() || "—",
          catKey: cat.key,
          catLabel: cat.label,
          underKey: cat.underKey,
          underLabel: cat.underLabel,
          grpKey: grp.key,
          grpLabel: grp.label,
          unidades,
          monto: v.totalUsd ?? 0,
          costo,
        };
      }),
    [ventas, catPorReceta, catPorInsumo, catNombre, costoUnitPorReceta, precioBaseInsumo],
  );

  // Opciones de los filtros (según lo que existe en el rango cargado).
  const categoriasOpciones = useMemo(() => {
    const m = new Map<string, string>();
    enriquecidas.forEach((e) => m.set(e.catKey, e.catLabel));
    return Array.from(m.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [enriquecidas]);

  const productosOpciones = useMemo(() => {
    const base =
      filtroCat === "all"
        ? enriquecidas
        : enriquecidas.filter((e) => e.catKey === filtroCat);
    return Array.from(new Set(base.map((e) => e.producto))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [enriquecidas, filtroCat]);

  // Aplicar filtros de categoría y producto.
  const filtradas = useMemo(
    () =>
      enriquecidas.filter(
        (e) =>
          (filtroCat === "all" || e.catKey === filtroCat) &&
          (filtroProd === "all" || e.producto === filtroProd),
      ),
    [enriquecidas, filtroCat, filtroProd],
  );

  // ── Agregados ────────────────────────────────────────────────────────
  const totalMonto = useMemo(
    () => filtradas.reduce((s, e) => s + e.monto, 0),
    [filtradas],
  );
  const totalUnidades = useMemo(
    () => filtradas.reduce((s, e) => s + e.unidades, 0),
    [filtradas],
  );

  const porProducto = useMemo(() => {
    const m = new Map<
      string,
      { producto: string; catKey: string; catLabel: string; underKey: string; underLabel: string; grpKey: string; grpLabel: string; unidades: number; monto: number; costo: number; costeado: boolean }
    >();
    filtradas.forEach((e) => {
      const cur =
        m.get(e.producto) ??
        { producto: e.producto, catKey: e.catKey, catLabel: e.catLabel, underKey: e.underKey, underLabel: e.underLabel, grpKey: e.grpKey, grpLabel: e.grpLabel, unidades: 0, monto: 0, costo: 0, costeado: true };
      cur.unidades += e.unidades;
      cur.monto += e.monto;
      if (e.costo == null) cur.costeado = false; else cur.costo += e.costo;
      m.set(e.producto, cur);
    });
    return Array.from(m.values());
  }, [filtradas]);

  // Categorías excluidas de los rankings (alquileres fijos, eventos, etc.).
  // Siguen contando en totales y "por categoría"; solo se quitan de los tops.
  const catExcluidas = useMemo(
    () => new Set(categorias.filter((c) => c.excluirRanking).map((c) => normCat(c.nombre))),
    [categorias],
  );
  const nombresExcluidos = useMemo(
    () => categorias.filter((c) => c.excluirRanking).map((c) => c.nombre),
    [categorias],
  );
  // Base para los rankings: productos SIN las categorías excluidas.
  const porProductoRank = useMemo(
    () => porProducto.filter((p) => !catExcluidas.has(p.catKey)),
    [porProducto, catExcluidas],
  );

  // ── Nuevos parámetros de análisis ────────────────────────────────────
  // Comparación vs período anterior (global, todas las ventas del rango).
  const deltaMonto = useMemo(
    () => (prevTotalMonto > 0 ? (cocinaTotalRango - prevTotalMonto) / prevTotalMonto : null),
    [cocinaTotalRango, prevTotalMonto],
  );

  // Venta promedio por día con ventas (aprox: el POS no trae ticket ni hora).
  const diasConVenta = useMemo(() => new Set(filtradas.map((e) => e.fecha)).size, [filtradas]);
  const ventaPromedioDia = diasConVenta > 0 ? totalMonto / diasConVenta : 0;

  // Ventas por día de la semana (Lun→Dom).
  const porDiaSemana = useMemo(() => {
    const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const monto = new Array(7).fill(0);
    filtradas.forEach((e) => {
      const dow = (new Date(e.fecha + "T00:00").getDay() + 6) % 7; // 0=Lun
      monto[dow] += e.monto;
    });
    return nombres.map((label, i) => ({ key: label, label, value: monto[i] }));
  }, [filtradas]);

  // Pareto 80/20: cuántos productos concentran el 80% de la facturación.
  const pareto = useMemo(() => {
    const arr = [...porProductoRank].sort((a, b) => b.monto - a.monto);
    const total = arr.reduce((s, p) => s + p.monto, 0);
    let acc = 0, n = 0;
    for (const p of arr) { acc += p.monto; n++; if (total > 0 && acc / total >= 0.8) break; }
    return { n, deTotal: arr.length, pctProd: arr.length > 0 ? n / arr.length : 0 };
  }, [porProductoRank]);

  // Margen / rentabilidad. Solo líneas con costo calculable (recetas + reventa).
  const margen = useMemo(() => {
    let ingreso = 0, costo = 0;
    filtradas.forEach((e) => { if (e.costo != null) { ingreso += e.monto; costo += e.costo; } });
    return { ingreso, costo, ganancia: ingreso - costo, cobertura: totalMonto > 0 ? ingreso / totalMonto : 0 };
  }, [filtradas, totalMonto]);
  const topMargen = useMemo(
    () => porProductoRank
      .filter((p) => p.costeado && p.monto > 0)
      .map((p) => ({ ...p, ganancia: p.monto - p.costo, pct: (p.monto - p.costo) / p.monto }))
      .sort((a, b) => b.ganancia - a.ganancia)
      .slice(0, topN),
    [porProductoRank, topN],
  );
  const margenPorCategoria = useMemo(() => {
    const m = new Map<string, { key: string; label: string; monto: number; costo: number }>();
    filtradas.forEach((e) => {
      if (e.costo == null) return;
      const cur = m.get(e.catKey) ?? { key: e.catKey, label: e.catLabel, monto: 0, costo: 0 };
      cur.monto += e.monto; cur.costo += e.costo; m.set(e.catKey, cur);
    });
    return Array.from(m.values())
      .map((c) => ({ ...c, ganancia: c.monto - c.costo, pct: c.monto > 0 ? (c.monto - c.costo) / c.monto : 0 }))
      .sort((a, b) => b.ganancia - a.ganancia);
  }, [filtradas]);

  // Mix de ingreso: contado (dinero que entró) vs crédito (CXC) vs cortesías (RPP).
  const mixIngreso = useMemo(() => {
    if (!conc) return null;
    const contado = Math.max(0, conc.setuxNeto);
    const credito = Math.max(0, conc.cxc);
    const cortesias = Math.max(0, conc.rpp);
    const total = contado + credito + cortesias;
    if (total <= 0.005) return null;
    return { contado, credito, cortesias, total };
  }, [conc]);

  // Productos activos SIN ninguna venta en el período (menú "muerto").
  const productosSinVenta = useMemo(() => {
    const vendidas = new Set(ventas.filter((v) => v.recetaId).map((v) => v.recetaId));
    return recetas
      .filter((r) => !r.esSubreceta && r.activo && !vendidas.has(r.id))
      .map((r) => ({ id: r.id, nombre: r.nombre, categoria: (r.categoria || "").trim() || "Sin categoría" }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
  }, [recetas, ventas]);

  // Alquileres/eventos y demás categorías excluidas, en panel aparte.
  const categoriasExcluidasResumen = useMemo(() => {
    const m = new Map<string, { key: string; label: string; unidades: number; monto: number }>();
    porProducto.forEach((p) => {
      if (!catExcluidas.has(p.catKey)) return;
      const cur = m.get(p.catKey) ?? { key: p.catKey, label: p.catLabel, unidades: 0, monto: 0 };
      cur.unidades += p.unidades; cur.monto += p.monto; m.set(p.catKey, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
  }, [porProducto, catExcluidas]);

  // Sub-categorías del grupo abierto (nivel 1 del drill). Solo tiene sentido en
  // Cafetería, que agrupa varias categorías; un alquiler es una sola categoría.
  const subcats = useMemo(() => {
    if (!catDrill) return [] as { key: string; label: string; unidades: number; monto: number }[];
    const m = new Map<string, { key: string; label: string; unidades: number; monto: number }>();
    porProducto.filter((p) => p.grpKey === catDrill.key).forEach((p) => {
      const cur = m.get(p.catKey) ?? { key: p.catKey, label: p.catLabel, unidades: 0, monto: 0 };
      cur.unidades += p.unidades; cur.monto += p.monto; m.set(p.catKey, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
  }, [catDrill, porProducto]);

  // Categorías REALES dentro de la sub-categoría abierta (nivel 2 → 3). Solo
  // tiene sentido cuando la sub-categoría agrupa varias (Consignación, o el
  // rubro Smoothies+Bebidas); si es una sola, se salta directo a los ítems.
  const unders = useMemo(() => {
    if (!subDrill) return [] as { key: string; label: string; unidades: number; monto: number }[];
    const m = new Map<string, { key: string; label: string; unidades: number; monto: number }>();
    porProducto.filter((p) => p.catKey === subDrill.key).forEach((p) => {
      const cur = m.get(p.underKey) ?? { key: p.underKey, label: p.underLabel, unidades: 0, monto: 0 };
      cur.unidades += p.unidades; cur.monto += p.monto; m.set(p.underKey, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
  }, [subDrill, porProducto]);

  // Ítems del nivel más profundo abierto: categoría real (underDrill) →
  // sub-categoría (subDrill) → grupo (catDrill).
  const drill = useMemo(() => {
    if (!catDrill) return null;
    const items = porProducto.filter((p) =>
      underDrill ? p.underKey === underDrill.key
        : subDrill ? p.catKey === subDrill.key
        : p.grpKey === catDrill.key,
    );
    const total = items.reduce((s, p) => s + p.monto, 0);
    const totalU = items.reduce((s, p) => s + p.unidades, 0);
    return { items: [...items].sort((a, b) => b.monto - a.monto), total, totalU };
  }, [catDrill, subDrill, underDrill, porProducto]);

  // Gráfico principal: los 4 grupos de nivel superior (3 alquileres + Cafetería).
  const porGrupo = useMemo(() => {
    const m = new Map<
      string,
      { key: string; label: string; unidades: number; monto: number }
    >();
    filtradas.forEach((e) => {
      const cur =
        m.get(e.grpKey) ??
        { key: e.grpKey, label: e.grpLabel, unidades: 0, monto: 0 };
      cur.unidades += e.unidades;
      cur.monto += e.monto;
      m.set(e.grpKey, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
  }, [filtradas]);

  // Ticket promedio de CAFETERÍA (realista): consumo de cafetería (sin
  // alquileres) ÷ tickets de cafetería. Los tickets totales del período vienen
  // del reporte por factura; se les restan las transacciones de alquiler (una
  // por cada línea de alquiler, que es como se factura) para no diluir el
  // promedio con los pocos-pero-grandes alquileres. Se usa TODO el período
  // (no depende de los filtros de categoría/producto), igual que los tickets.
  const ticketCafeteria = useMemo(() => {
    const consumoNeto = enriquecidas.reduce((s, e) => s + (e.grpKey === "cafeteria" ? e.monto : 0), 0);
    const lineasAlquiler = enriquecidas.reduce((s, e) => s + (e.grpKey !== "cafeteria" ? 1 : 0), 0);
    const ticketsTotal = conc?.tickets ?? 0;
    const ticketsCaf = Math.max(0, ticketsTotal - lineasAlquiler);
    // Se muestra con IVA (lo que paga el cliente): se sube el neto a bruto con la
    // proporción REAL de IVA del período (IVA/neto de Setux), que respeta los
    // métodos sin IVA (Zelle/Dólar). Si no hay datos, se asume 16%.
    const factorIva = conc && conc.setuxNeto > 0 ? (conc.setuxNeto + conc.ivaSetux) / conc.setuxNeto : 1.16;
    const consumo = consumoNeto * factorIva;
    return { consumo, tickets: ticketsCaf, promedio: ticketsCaf > 0 ? consumo / ticketsCaf : null };
  }, [enriquecidas, conc]);

  // Evolución diaria: todos los días del rango, con 0 si no hubo ventas.
  const porDia = useMemo(() => {
    const acc = new Map<string, number>();
    filtradas.forEach((e) => acc.set(e.fecha, (acc.get(e.fecha) ?? 0) + e.monto));
    const dias: { label: string; value: number; tip: string }[] = [];
    const d = new Date(desde + "T00:00");
    const fin = new Date(hasta + "T00:00");
    let guard = 0;
    while (d <= fin && guard < 400) {
      const iso = isoLocal(d);
      dias.push({ label: diaCorto(iso), value: acc.get(iso) ?? 0, tip: iso });
      d.setDate(d.getDate() + 1);
      guard++;
    }
    return dias;
  }, [filtradas, desde, hasta]);

  const masVendidoUnid = useMemo(
    () =>
      porProductoRank.reduce<(typeof porProductoRank)[number] | null>(
        (best, p) => (!best || p.unidades > best.unidades ? p : best),
        null,
      ),
    [porProductoRank],
  );
  const masFactura = useMemo(
    () =>
      porProductoRank.reduce<(typeof porProductoRank)[number] | null>(
        (best, p) => (!best || p.monto > best.monto ? p : best),
        null,
      ),
    [porProductoRank],
  );

  const tablaOrdenada = useMemo(() => {
    const arr = [...porProducto];
    arr.sort((a, b) =>
      orden === "unidades" ? b.unidades - a.unidades : b.monto - a.monto,
    );
    return arr;
  }, [porProducto, orden]);

  const topUnidades = useMemo(
    () => [...porProductoRank].sort((a, b) => b.unidades - a.unidades).slice(0, topN),
    [porProductoRank, topN],
  );
  const topMonto = useMemo(
    () => [...porProductoRank].sort((a, b) => b.monto - a.monto).slice(0, topN),
    [porProductoRank, topN],
  );
  const menosVendidos = useMemo(
    () =>
      [...porProductoRank].sort((a, b) => a.unidades - b.unidades).slice(0, topN),
    [porProductoRank, topN],
  );

  const pct = (monto: number) => (totalMonto > 0 ? (monto / totalMonto) * 100 : 0);

  function limpiarFiltros() {
    setPreset("mes");
    const r = rangoDePreset("mes");
    setDesde(r.desde);
    setHasta(r.hasta);
    setFiltroCat("all");
    setFiltroProd("all");
    setTopN(5);
    setOrden("monto");
  }

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== "rango") {
      const r = rangoDePreset(p);
      setDesde(r.desde);
      setHasta(r.hasta);
    }
  }

  const hayDatos = filtradas.length > 0;

  // Ventas (unidades) por receta / por insumo en el rango, para ordenar el
  // clasificador por relevancia (los más vendidos primero).
  const unidadesPorReceta = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ventas) if (v.recetaId) m.set(v.recetaId, (m.get(v.recetaId) ?? 0) + (v.cantidad || 0));
    return m;
  }, [ventas]);
  const unidadesPorInsumo = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of ventas) if (!v.recetaId && v.insumoId) m.set(v.insumoId, (m.get(v.insumoId) ?? 0) + (v.cantidad || 0));
    return m;
  }, [ventas]);

  // Nombre de categoría actual de un producto (o null si no coincide con ninguna
  // de las definidas). Acepta el nombre guardado o el slug/label viejo.
  const catPorNombre = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of categorias) m.set(normCat(c.nombre), c.nombre);
    return m;
  }, [categorias]);
  function categoriaActual(cat: string | undefined, tipo: "receta" | "insumo"): string | null {
    if (!cat || !cat.trim()) return null;
    const directa = catPorNombre.get(normCat(cat));
    if (directa) return directa;
    const label = tipo === "receta" ? categoriaRecetaLabel(cat) : categoriaInsumoLabel(cat);
    return catPorNombre.get(normCat(label)) ?? null;
  }

  // Ítems del POS que NO son receta ni insumo de reventa (consignación,
  // servicios, sueltos): agrupados por nombre para clasificarlos por nombre.
  const itemsPorNombre = useMemo(() => {
    const m = new Map<string, { nombre: string; tipoItem?: string; unidades: number }>();
    for (const v of ventas) {
      if (v.recetaId || v.insumoId) continue;
      const nombre = (v.recetaNombre || "").trim();
      if (!nombre) continue;
      const key = normPos(nombre);
      const cur = m.get(key) ?? { nombre, tipoItem: v.tipoItem, unidades: 0 };
      cur.unidades += v.cantidad || 0;
      m.set(key, cur);
    }
    return m;
  }, [ventas]);

  // Productos a clasificar: recetas vendibles + ítems de reventa (insumos
  // vendidos directo en el rango) + ítems del POS por nombre (consignación /
  // servicios). "Por clasificar" primero, luego más vendidos.
  const productosClasif = useMemo(() => {
    const q = normCat(busquedaClasif);
    const recs = recetas
      .filter((r) => !r.esSubreceta)
      .map((r) => { const cur = categoriaActual(r.categoria, "receta"); return { tipo: "receta" as const, id: r.id, nombre: r.nombre, cur, activo: r.activo, ventas: unidadesPorReceta.get(r.id) ?? 0, sinCat: !cur }; });
    const insById = new Map(insumos.map((i) => [i.id, i]));
    const revs = [...unidadesPorInsumo.keys()]
      .map((id) => insById.get(id))
      .filter((i): i is Insumo => !!i)
      .map((i) => { const cur = categoriaActual(i.categoria, "insumo"); return { tipo: "insumo" as const, id: i.id, nombre: `${i.nombre} · reventa`, cur, activo: true, ventas: unidadesPorInsumo.get(i.id) ?? 0, sinCat: !cur }; });
    const noms = [...itemsPorNombre.entries()].map(([key, it]) => {
      const cur = categoriaActual(catNombre.get(key), "insumo");
      const suf = it.tipoItem === "consignacion" ? " · consignación" : it.tipoItem === "servicio" ? " · servicio" : " · POS";
      return { tipo: "nombre" as const, id: it.nombre, nombre: `${it.nombre}${suf}`, cur, activo: true, ventas: it.unidades, sinCat: !cur };
    });
    return [...recs, ...revs, ...noms]
      .filter((p) => !q || normCat(p.nombre).includes(q))
      .sort((a, b) => (a.sinCat !== b.sinCat ? (a.sinCat ? -1 : 1) : b.ventas - a.ventas || a.nombre.localeCompare(b.nombre)));
  }, [recetas, insumos, unidadesPorReceta, unidadesPorInsumo, itemsPorNombre, catNombre, busquedaClasif, catPorNombre]); // eslint-disable-line react-hooks/exhaustive-deps
  const sinCategoria = productosClasif.filter((p) => p.sinCat).length;

  async function cambiarCategoria(tipo: "receta" | "insumo" | "nombre", id: string, categoria: string) {
    setGuardandoCat(id);
    try {
      if (tipo === "receta") {
        await setRecetaCategoria(id, categoria || null);
        setRecetas((prev) => prev.map((r) => (r.id === id ? { ...r, categoria: categoria || undefined } : r)));
      } else if (tipo === "insumo") {
        await setInsumoCategoria(id, categoria || null);
        setInsumos((prev) => prev.map((i) => (i.id === id ? { ...i, categoria: categoria || "" } : i)));
      } else {
        // tipo "nombre": id es el nombre original del ítem del POS.
        await setCategoriaPorNombre(id, categoria || null);
        setCatNombre((prev) => { const m = new Map(prev); if (categoria) m.set(normPos(id), categoria); else m.delete(normPos(id)); return m; });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la categoría");
    } finally {
      setGuardandoCat(null);
    }
  }

  // ── Gestión de categorías (crear / renombrar / borrar) ──
  async function agregarCategoria() {
    const nombre = nuevaCat.trim();
    if (!nombre) return;
    try {
      const c = await createCategoriaProducto(nombre, (categorias.at(-1)?.orden ?? 0) + 10);
      setCategorias((prev) => [...prev, c].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)));
      setNuevaCat("");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo crear la categoría"); }
  }
  async function guardarRename() {
    if (!editCat) return;
    const nuevo = editCat.nombre.trim();
    const cat = categorias.find((c) => c.id === editCat.id);
    if (!cat || !nuevo || nuevo === cat.nombre) { setEditCat(null); return; }
    try {
      await renameCategoriaProducto(cat.id, cat.nombre, nuevo);
      setCategorias((prev) => prev.map((c) => (c.id === cat.id ? { ...c, nombre: nuevo } : c)));
      // Refleja el rename en los productos ya cargados.
      setRecetas((prev) => prev.map((r) => (r.categoria === cat.nombre ? { ...r, categoria: nuevo } : r)));
      setInsumos((prev) => prev.map((i) => (i.categoria === cat.nombre ? { ...i, categoria: nuevo } : i)));
      setEditCat(null);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo renombrar"); }
  }
  async function borrarCategoria(id: string) {
    try {
      await deleteCategoriaProducto(id);
      setCategorias((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo borrar"); }
  }
  async function toggleExcluirRanking(id: string, excluir: boolean) {
    // Optimista: refleja el cambio y revierte si falla.
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, excluirRanking: excluir } : c)));
    try {
      await setCategoriaExcluirRanking(id, excluir);
    } catch (e) {
      setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, excluirRanking: !excluir } : c)));
      setError(e instanceof Error ? e.message : "No se pudo actualizar. ¿Corriste el ALTER de excluir_ranking?");
    }
  }

  const pill = (active: boolean) =>
    `px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
      active
        ? "bg-cacao text-white ring-cacao"
        : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
    }`;

  return (
    <div className="space-y-5">
      {/* ── Filtros ─────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["dia", "semana", "mes", "rango"] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => aplicarPreset(p)}
              className={pill(preset === p)}
            >
              {p === "dia"
                ? "Día"
                : p === "semana"
                  ? "Semana"
                  : p === "mes"
                    ? "Mes"
                    : "Rango"}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1 text-xs text-cacao-soft">
              Desde
              <input
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => {
                  setPreset("rango");
                  setDesde(e.target.value);
                }}
                className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-cacao-soft">
              Hasta
              <input
                type="date"
                value={hasta}
                min={desde}
                max={hoyISO()}
                onChange={(e) => {
                  setPreset("rango");
                  setHasta(e.target.value);
                }}
                className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white"
              />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filtroCat}
            onChange={(e) => {
              setFiltroCat(e.target.value);
              setFiltroProd("all");
            }}
            className="rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
          >
            <option value="all">Todas las categorías</option>
            {categoriasOpciones.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={filtroProd}
            onChange={(e) => setFiltroProd(e.target.value)}
            className="rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white max-w-[240px]"
          >
            <option value="all">Todos los productos</option>
            {productosOpciones.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {(filtroCat !== "all" ||
            filtroProd !== "all" ||
            preset !== "mes") && (
            <button
              type="button"
              onClick={limpiarFiltros}
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta"
            >
              ↺ Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Clasificar productos (asigna la categoría desde aquí) ── */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
        <button type="button" onClick={() => setMostrarClasif((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
          <span className="font-cinzel text-base text-cacao">Clasificar productos</span>
          <span className="flex items-center gap-2">
            {sinCategoria > 0 && <span className="rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest">{sinCategoria} por clasificar</span>}
            <span className={`text-cacao-mute transition-transform ${mostrarClasif ? "rotate-90" : ""}`}>›</span>
          </span>
        </button>
        {mostrarClasif && (
          <div className="mt-3 space-y-3">
            <p className="text-[12px] text-cacao-soft">Asigna la categoría de cada producto. Se guarda en la receta (misma que ve Cocina) y el análisis de abajo se reagrupa al instante. Ordenados: sin categoría primero, luego los más vendidos del período.</p>
            {error && <div className="rounded-lg bg-red-50 text-red-800 ring-1 ring-red-200 px-3 py-2 text-[12px]">{error}</div>}

            {/* Gestionar categorías: crear / renombrar / borrar (definidas por ti) */}
            <div className="rounded-xl ring-1 ring-marfil bg-marfil/30 p-3">
              <button type="button" onClick={() => setGestionCat((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
                <span className="text-[11px] uppercase tracking-widest text-cacao-soft">Categorías ({categorias.length})</span>
                <span className={`text-cacao-mute transition-transform ${gestionCat ? "rotate-90" : ""}`}>›</span>
              </button>
              {gestionCat && (
                <div className="mt-2 space-y-2">
                  {categorias.length === 0 && <p className="text-[12px] text-cacao-soft italic">Aún no hay categorías. Crea la primera abajo (o corre el SQL de semilla).</p>}
                  <ul className="divide-y divide-marfil rounded-lg ring-1 ring-marfil bg-white">
                    {categorias.map((c) => (
                      <li key={c.id} className="px-2.5 py-1.5 flex items-center gap-2">
                        {editCat?.id === c.id ? (
                          <>
                            <input autoFocus value={editCat.nombre} onChange={(e) => setEditCat({ id: c.id, nombre: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") guardarRename(); if (e.key === "Escape") setEditCat(null); }} className="flex-1 min-w-0 rounded-md ring-1 ring-marfil px-2 py-1 text-sm" />
                            <button type="button" onClick={guardarRename} className="text-xs text-terracotta hover:underline">Guardar</button>
                            <button type="button" onClick={() => setEditCat(null)} className="text-xs text-cacao-mute hover:underline">Cancelar</button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 min-w-0 truncate text-sm text-cacao">{c.nombre}</span>
                            <button
                              type="button"
                              onClick={() => toggleExcluirRanking(c.id, !c.excluirRanking)}
                              title={c.excluirRanking ? "Excluida de los rankings (clic para incluir)" : "Incluir/excluir de los rankings (más vendido, tops)"}
                              className={`text-[10px] uppercase tracking-widest rounded-full px-2 py-0.5 ring-1 ${c.excluirRanking ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-white text-cacao-mute ring-marfil hover:text-cacao"}`}
                            >
                              {c.excluirRanking ? "Sin ranking" : "En ranking"}
                            </button>
                            <button type="button" onClick={() => setEditCat({ id: c.id, nombre: c.nombre })} title="Renombrar" className="text-cacao-mute hover:text-terracotta text-sm">✎</button>
                            <button type="button" onClick={() => borrarCategoria(c.id)} title="Borrar" className="text-cacao-mute hover:text-terracotta text-sm">✕</button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-cacao-soft">Con <strong>“Sin ranking”</strong> la categoría no cuenta en los tops (más vendido, mayor facturación) pero sí en totales y en “por categoría”. Úsalo para alquileres fijos, eventos y alquileres por bloque.</p>
                  <div className="flex items-center gap-2">
                    <input value={nuevaCat} onChange={(e) => setNuevaCat(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") agregarCategoria(); }} placeholder="Nueva categoría…" className="flex-1 min-w-0 rounded-lg ring-1 ring-marfil px-3 py-2 text-sm" />
                    <button type="button" onClick={agregarCategoria} disabled={!nuevaCat.trim()} className="rounded-lg bg-terracotta text-white px-3 py-2 text-sm disabled:opacity-40">Agregar</button>
                  </div>
                </div>
              )}
            </div>

            <input value={busquedaClasif} onChange={(e) => setBusquedaClasif(e.target.value)} placeholder="Buscar producto…" className="w-full sm:w-72 rounded-lg ring-1 ring-marfil px-3 py-2 text-sm" />
            <div className="rounded-xl ring-1 ring-marfil overflow-hidden max-h-[28rem] overflow-y-auto">
              <ul className="divide-y divide-marfil">
                {productosClasif.map((p) => (
                  <li key={`${p.tipo}-${p.id}`} className={`px-3 py-2 grid grid-cols-[1fr_auto] gap-3 items-center ${p.sinCat ? "bg-amber-50/50" : ""}`}>
                    <div className="min-w-0">
                      <div className="text-sm text-cacao truncate">{p.nombre}</div>
                      <div className="text-[11px] text-cacao-mute">{p.ventas > 0 ? `${fUnid(p.ventas)} vendidos en el período` : "sin ventas en el período"}{!p.activo ? " · inactiva" : ""}</div>
                    </div>
                    <select
                      value={p.cur ?? ""}
                      disabled={guardandoCat === p.id}
                      onChange={(e) => cambiarCategoria(p.tipo, p.id, e.target.value)}
                      className={`rounded-lg ring-1 px-2 py-1.5 text-sm bg-white ${p.sinCat ? "ring-amber-300 text-amber-800" : "ring-marfil text-cacao"} disabled:opacity-50`}
                    >
                      <option value="">— Sin categoría —</option>
                      {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                  </li>
                ))}
                {productosClasif.length === 0 && <li className="px-3 py-4 text-center text-sm text-cacao-soft italic">Sin productos que coincidan.</li>}
              </ul>
            </div>
          </div>
        )}
      </section>

      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center text-cacao-soft">
          Cargando análisis…
        </div>
      ) : !hayDatos ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft">
            No hay ventas en el período{filtroCat !== "all" || filtroProd !== "all" ? " / filtro" : ""}{" "}
            seleccionado. Ajusta las fechas o limpia los filtros.
          </p>
        </div>
      ) : (
        <>
          {/* ── Resumen ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard titulo="Ventas totales" valor={fUSD(totalMonto)} />
            <StatCard titulo="Unidades vendidas" valor={fUnid(totalUnidades)} />
            <StatCard
              titulo="Ticket prom. cafetería"
              valor={ticketCafeteria.promedio != null ? `${ticketCafeteria.promedio.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}
              sub={ticketCafeteria.tickets > 0 ? `${fUnid(ticketCafeteria.tickets)} tickets · con IVA` : "faltan tickets del período (importa el reporte por factura)"}
            />
            <StatCard
              titulo="Productos distintos"
              valor={fUnid(porProducto.length)}
            />
            <StatCard
              titulo="Más vendido (unid.)"
              valor={masVendidoUnid?.producto ?? "—"}
              sub={masVendidoUnid ? `${fUnid(masVendidoUnid.unidades)} unid.` : undefined}
            />
            <StatCard
              titulo="Mayor facturación"
              valor={masFactura?.producto ?? "—"}
              sub={masFactura ? fUSD(masFactura.monto) : undefined}
            />
            <StatCard
              titulo="vs período anterior"
              valor={deltaMonto == null ? "—" : `${deltaMonto >= 0 ? "▲" : "▼"} ${fPct(Math.abs(deltaMonto) * 100)}`}
              sub={prevTotalMonto > 0 ? `antes ${fUSD(prevTotalMonto)}` : "sin datos previos"}
              tono={deltaMonto == null ? undefined : deltaMonto >= 0 ? "bien" : "alerta"}
            />
            <StatCard titulo="Venta prom./día" valor={fUSD(ventaPromedioDia)} sub={`${diasConVenta} días con venta`} />
            <StatCard
              titulo="Ganancia estimada"
              valor={fUSD(margen.ganancia)}
              sub={margen.ingreso > 0 ? `margen ${fPct((margen.ganancia / margen.ingreso) * 100)} · costeado ${fPct(margen.cobertura * 100)}` : "sin costo calculable"}
              tono="bien"
            />
            <StatCard
              titulo="Concentración 80/20"
              valor={pareto.deTotal > 0 ? `${pareto.n} de ${pareto.deTotal}` : "—"}
              sub={pareto.deTotal > 0 ? `${fPct(pareto.pctProd * 100)} de productos = 80% de ventas` : undefined}
            />
            <StatCard
              titulo="Sin ventas"
              valor={fUnid(productosSinVenta.length)}
              sub="productos activos sin vender"
              tono={productosSinVenta.length > 0 ? "alerta" : undefined}
            />
          </div>

          {/* Aviso: más vendido ≠ más factura */}
          {masVendidoUnid &&
            masFactura &&
            masVendidoUnid.producto !== masFactura.producto && (
              <div className="rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 text-xs text-cacao-soft">
                <strong className="text-cacao">{masVendidoUnid.producto}</strong> es
                el más vendido por unidades ({fUnid(masVendidoUnid.unidades)}), pero{" "}
                <strong className="text-cacao">{masFactura.producto}</strong> es el
                que más factura ({fUSD(masFactura.monto)}). Vender más unidades no
                siempre es facturar más.
              </div>
            )}

          {/* ── Evolución ───────────────────────────────────────── */}
          <PanelCard titulo="Evolución de ventas (por día)">
            <LineaEvolucion puntos={porDia} format={fUSD} />
          </PanelCard>

          {/* ── Categorías ──────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4">
            <PanelCard titulo="Ventas por categoría">
              <p className="text-[11px] text-cacao-mute mb-3">Alquileres y Cafetería. Toca un grupo (en el gráfico o en la lista) para abrirlo; Cafetería se despliega en sus categorías, y de ahí al detalle por ítem.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <Dona
                  segmentos={porGrupo.map((c, i) => ({ key: c.key, label: c.label, value: c.monto, color: colorPorIndice(i) }))}
                  format={fUSD}
                  sinLeyenda
                  onSelect={(k) => { const c = porGrupo.find((x) => x.key === k); if (c) abrirGrupo(c.key, c.label); }}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-cacao-mute uppercase tracking-widest text-left">
                        <th className="py-1 font-normal">Grupo</th>
                        <th className="py-1 font-normal text-right">Unid.</th>
                        <th className="py-1 font-normal text-right">% unid.</th>
                        <th className="py-1 font-normal text-right">Monto</th>
                        <th className="py-1 font-normal text-right">% monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porGrupo.map((c) => (
                        <tr key={c.key} onClick={() => abrirGrupo(c.key, c.label)} className={`border-t border-marfil cursor-pointer hover:bg-marfil-soft ${catDrill?.key === c.key ? "bg-marfil-soft" : ""}`}>
                          <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{c.label}<span className="text-cacao-mute">›</span></span></td>
                          <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.unidades)}</td>
                          <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(totalUnidades > 0 ? (c.unidades / totalUnidades) * 100 : 0)}</td>
                          <td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td>
                          <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(pct(c.monto))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </PanelCard>
          </div>

          {/* ── Desglose del grupo seleccionado (drill de 2 niveles) ── */}
          {catDrill && (
            <section className="rounded-2xl bg-white ring-1 ring-terracotta/40 p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-cinzel text-base text-cacao">Desglose: {catDrill.label}{subDrill ? <span className="text-cacao-soft"> › {subDrill.label}</span> : null}{underDrill ? <span className="text-cacao-soft"> › {underDrill.label}</span> : null}</h3>
                <div className="flex items-center gap-3">
                  {(subDrill || underDrill) && <button type="button" onClick={() => { if (underDrill) setUnderDrill(null); else setSubDrill(null); }} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">‹ Volver</button>}
                  <button type="button" onClick={() => { setCatDrill(null); setSubDrill(null); setUnderDrill(null); }} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta">✕ Cerrar</button>
                </div>
              </div>

              {subcats.length > 1 && !subDrill ? (() => {
                // Nivel 1: las categorías dentro del grupo (Cafetería).
                const gTotal = subcats.reduce((s, c) => s + c.monto, 0);
                const gU = subcats.reduce((s, c) => s + c.unidades, 0);
                return (
                  <>
                    <p className="text-[11px] text-cacao-mute mb-3">{fUnid(gU)} unid · {fUSD(gTotal)} · {subcats.length} categorías. Toca una categoría para ver sus ítems.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Dona
                        segmentos={subcats.map((c, i) => ({ key: c.key, label: c.label, value: c.monto, color: colorPorIndice(i) }))}
                        format={fUSD}
                        sinLeyenda
                        onSelect={(k) => { const c = subcats.find((x) => x.key === k); if (c) setSubDrill({ key: c.key, label: c.label }); }}
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-cacao-mute uppercase tracking-widest text-left">
                              <th className="py-1 font-normal">Categoría</th>
                              <th className="py-1 font-normal text-right">Unid.</th>
                              <th className="py-1 font-normal text-right">% unid.</th>
                              <th className="py-1 font-normal text-right">Monto</th>
                              <th className="py-1 font-normal text-right">% monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subcats.map((c) => (
                              <tr key={c.key} onClick={() => setSubDrill({ key: c.key, label: c.label })} className="border-t border-marfil cursor-pointer hover:bg-marfil-soft">
                                <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{c.label}<span className="text-cacao-mute">›</span></span></td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.unidades)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(gU > 0 ? (c.unidades / gU) * 100 : 0)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(gTotal > 0 ? (c.monto / gTotal) * 100 : 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })() : subDrill && unders.length > 1 && !underDrill ? (() => {
                // Nivel intermedio: las categorías REALES dentro de la sub-categoría
                // (p. ej. Consignación → Bar of Mix / Cocina Clandestina).
                const gTotal = unders.reduce((s, c) => s + c.monto, 0);
                const gU = unders.reduce((s, c) => s + c.unidades, 0);
                return (
                  <>
                    <p className="text-[11px] text-cacao-mute mb-3">{fUnid(gU)} unid · {fUSD(gTotal)} · {unders.length} categorías. Toca una para ver sus ítems.</p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Dona
                        segmentos={unders.map((c, i) => ({ key: c.key, label: c.label, value: c.monto, color: colorPorIndice(i) }))}
                        format={fUSD}
                        sinLeyenda
                        onSelect={(k) => { const c = unders.find((x) => x.key === k); if (c) setUnderDrill({ key: c.key, label: c.label }); }}
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-cacao-mute uppercase tracking-widest text-left">
                              <th className="py-1 font-normal">Categoría</th>
                              <th className="py-1 font-normal text-right">Unid.</th>
                              <th className="py-1 font-normal text-right">% unid.</th>
                              <th className="py-1 font-normal text-right">Monto</th>
                              <th className="py-1 font-normal text-right">% monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {unders.map((c) => (
                              <tr key={c.key} onClick={() => setUnderDrill({ key: c.key, label: c.label })} className="border-t border-marfil cursor-pointer hover:bg-marfil-soft">
                                <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{c.label}<span className="text-cacao-mute">›</span></span></td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.unidades)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(gU > 0 ? (c.unidades / gU) * 100 : 0)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(gTotal > 0 ? (c.monto / gTotal) * 100 : 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })() : (
                // Nivel final: ítems (de la categoría real, de la sub-categoría, o del grupo).
                <>
                  <p className="text-[11px] text-cacao-mute mb-3">{drill ? `${fUnid(drill.totalU)} unid · ${fUSD(drill.total)} · ${drill.items.length} ítems. El % es dentro de esta categoría.` : ""}</p>
                  {!drill || drill.items.length === 0 ? (
                    <p className="text-sm text-cacao-soft italic">Sin ítems en el período.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Dona
                        segmentos={drill.items.map((p, i) => ({ key: p.producto, label: p.producto, value: p.monto, color: colorPorIndice(i) }))}
                        format={fUSD}
                        sinLeyenda
                      />
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-cacao-mute uppercase tracking-widest text-left">
                              <th className="py-1 font-normal">Ítem</th>
                              <th className="py-1 font-normal text-right">Unid.</th>
                              <th className="py-1 font-normal text-right">% unid.</th>
                              <th className="py-1 font-normal text-right">Monto</th>
                              <th className="py-1 font-normal text-right">% monto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {drill.items.map((p) => (
                              <tr key={p.producto} className="border-t border-marfil">
                                <td className="py-1 text-cacao">{p.producto}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(p.unidades)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(drill.totalU > 0 ? (p.unidades / drill.totalU) * 100 : 0)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao">{fUSD(p.monto)}</td>
                                <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(drill.total > 0 ? (p.monto / drill.total) * 100 : 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Top / menos vendidos (plegable) ── */}
          <Plegable titulo="Top y menos vendidos" sub={nombresExcluidos.length > 0 ? `sin ${nombresExcluidos.join(", ")}` : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-cacao-mute">
              Mostrar
            </span>
            {([5, 10, 20] as const).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setTopN(n)}
                className={pill(topN === n)}
              >
                Top {n}
              </button>
            ))}
            {nombresExcluidos.length > 0 && (
              <span className="text-[11px] text-cacao-soft ml-auto">
                Rankings sin: {nombresExcluidos.join(", ")}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard titulo={`Top ${topN} más vendidos (unidades)`}>
              <BarrasH
                rows={topUnidades.map((p, i) => barProd(p, i, "unidades"))}
                format={fUnid}
              />
            </PanelCard>
            <PanelCard titulo={`Top ${topN} por facturación (monto)`}>
              <BarrasH
                rows={topMonto.map((p, i) => barProd(p, i, "monto"))}
                format={fUSD}
              />
            </PanelCard>
          </div>

          <PanelCard titulo={`Productos menos vendidos (Top ${topN})`}>
            <BarrasH
              rows={menosVendidos.map((p, i) => barProd(p, i, "unidades"))}
              format={fUnid}
            />
          </PanelCard>
          </Plegable>

          {/* ── Ritmo y mezcla (plegable) ── */}
          <Plegable titulo="Ritmo: día de la semana y mezcla de ingreso">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard titulo="Ventas por día de la semana">
              <BarrasH
                rows={porDiaSemana.map((d, i) => ({ key: d.key, label: d.label, value: d.value, color: colorPorIndice(i), tip: `${d.label}: ${fUSD(d.value)}` }))}
                format={fUSD}
              />
            </PanelCard>
            {mixIngreso && (
              <PanelCard titulo="Mezcla de ingreso (contado / crédito / cortesías)">
                <Dona
                  segmentos={[
                    { key: "contado", label: "Contado (entró)", value: mixIngreso.contado, color: "#4B7A2F" },
                    { key: "credito", label: "Crédito (CXC)", value: mixIngreso.credito, color: "#C9A24B" },
                    { key: "cortesias", label: "Cortesías (RPP)", value: mixIngreso.cortesias, color: "#B0784F" },
                  ]}
                  format={(n) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                />
                <p className="mt-2 text-[11px] text-cacao-mute">Del período completo (todas las ventas). Muestra cuánto de lo vendido fue dinero real vs crédito y cortesías.</p>
              </PanelCard>
            )}
          </div>
          </Plegable>

          {/* ── Rentabilidad (plegable) ── */}
          <Plegable titulo="Rentabilidad (margen)">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard titulo={`Top ${topN} por ganancia (margen)`}>
              <BarrasH
                rows={topMargen.map((p, i) => ({ key: p.producto, label: p.producto, value: p.ganancia, color: colorPorIndice(i), tip: `${p.producto}: ${fUSD(p.ganancia)} de ganancia · margen ${fPct(p.pct * 100)} · ${fUSD(p.monto)} vendidos` }))}
                format={fUSD}
                emptyLabel="Sin productos con costo calculable en el período."
              />
              {margen.cobertura < 0.999 && (
                <p className="mt-2 text-[11px] text-cacao-mute">Solo se incluyen productos con costo (recetas y reventa). Cubre {fPct(margen.cobertura * 100)} de la facturación; el resto (consignación, servicios) no tiene costo cargado.</p>
              )}
            </PanelCard>
            <PanelCard titulo="Margen por categoría">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-cacao-mute uppercase tracking-widest text-left">
                      <th className="py-1 font-normal">Categoría</th>
                      <th className="py-1 font-normal text-right">Vendido</th>
                      <th className="py-1 font-normal text-right">Costo</th>
                      <th className="py-1 font-normal text-right">Ganancia</th>
                      <th className="py-1 font-normal text-right">Margen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {margenPorCategoria.length === 0 && (
                      <tr><td colSpan={5} className="py-3 text-center text-cacao-soft italic">Sin costo calculable en el período.</td></tr>
                    )}
                    {margenPorCategoria.map((c) => (
                      <tr key={c.key} className="border-t border-marfil">
                        <td className="py-1 text-cacao">{c.label}</td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fUSD(c.monto)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fUSD(c.costo)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.ganancia)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(c.pct * 100)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          </div>
          </Plegable>

          {/* ── Alquileres / eventos (categorías fuera de rankings) ── */}
          {categoriasExcluidasResumen.length > 0 && (
            <PanelCard titulo="Alquileres, eventos y otras categorías fijas (aparte)">
              <p className="text-[11px] text-cacao-mute mb-2">Estas categorías están fuera de los rankings por su valor, pero aquí las ves por separado. Sí cuentan en las ventas totales.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-cacao-mute uppercase tracking-widest text-left">
                      <th className="py-1 font-normal">Categoría</th>
                      <th className="py-1 font-normal text-right">Unid.</th>
                      <th className="py-1 font-normal text-right">Monto</th>
                      <th className="py-1 font-normal text-right">% del total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoriasExcluidasResumen.map((c) => (
                      <tr key={c.key} onClick={() => abrirCategoria(c.key, c.label)} className="border-t border-marfil cursor-pointer hover:bg-marfil-soft">
                        <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{c.label}<span className="text-cacao-mute">›</span></span></td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.unidades)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(pct(c.monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          )}

          {/* ── Productos sin ventas (menú muerto) ───────────────── */}
          {productosSinVenta.length > 0 && (
            <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <button type="button" onClick={() => setMostrarSinVenta((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
                <span className="font-cinzel text-base text-cacao">Productos sin ventas en el período</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest">{productosSinVenta.length}</span>
                  <span className={`text-cacao-mute transition-transform ${mostrarSinVenta ? "rotate-90" : ""}`}>›</span>
                </span>
              </button>
              {mostrarSinVenta && (
                <ul className="mt-3 rounded-xl ring-1 ring-marfil divide-y divide-marfil overflow-hidden max-h-96 overflow-y-auto">
                  {productosSinVenta.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span className="text-cacao min-w-0 truncate">{p.nombre}</span>
                      <span className="text-[11px] text-cacao-mute shrink-0">{p.categoria}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ── Detalle por producto (plegable) ─────────────────── */}
          <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
            <button type="button" onClick={() => setMostrarDetalle((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
              <span className="font-cinzel text-base text-cacao">Detalle por producto</span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-cacao-mute">{porProducto.length} productos</span>
                <span className={`text-cacao-mute transition-transform ${mostrarDetalle ? "rotate-90" : ""}`}>›</span>
              </span>
            </button>
            {mostrarDetalle && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-cacao-mute uppercase tracking-widest text-[11px] text-left">
                    <th className="py-2 font-normal">Producto</th>
                    <th className="py-2 font-normal">Categoría</th>
                    <SortableTh
                      label="Unidades"
                      active={orden === "unidades"}
                      onClick={() => setOrden("unidades")}
                    />
                    <SortableTh
                      label="Monto"
                      active={orden === "monto"}
                      onClick={() => setOrden("monto")}
                    />
                    <SortableTh
                      label="% del total"
                      active={orden === "monto"}
                      onClick={() => setOrden("monto")}
                    />
                  </tr>
                </thead>
                <tbody>
                  {tablaOrdenada.map((p) => (
                    <tr key={p.producto} className="border-t border-marfil">
                      <td className="py-2 text-cacao">{p.producto}</td>
                      <td className="py-2 text-cacao-soft">{p.catLabel}</td>
                      <td className="py-2 text-right tabular-nums text-cacao">
                        {fUnid(p.unidades)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-cacao">
                        {fUSD(p.monto)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-cacao-soft">
                        {fPct(pct(p.monto))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-marfil font-medium">
                    <td className="py-2 text-cacao" colSpan={2}>
                      Total ({porProducto.length} productos)
                    </td>
                    <td className="py-2 text-right tabular-nums text-cacao">
                      {fUnid(totalUnidades)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-cacao">
                      {fUSD(totalMonto)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-cacao-soft">
                      100%
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            )}
          </section>
        </>
      )}

      {/* ── Venta vs Ingresos (conciliación) · plegable, al final ── */}
      {conc && (cocinaTotalRango > 0.005 || conc.setuxNeto > 0.005) && (() => {
        // Ventas en Cocina − Ingresos = lo vendido a crédito (CXC) + cortesías,
        // todo en NETO (sin IVA). Se muestra plegado al final para consultarlo
        // cuando hace falta sin ocupar la parte de arriba del análisis.
        const diferencia = Math.round((cocinaTotalRango - conc.setuxNeto) * 100) / 100;
        const creditoYCortesias = Math.round((conc.cxcNeto + conc.rppNeto) * 100) / 100;
        const sinExplicar = Math.round((diferencia - creditoYCortesias) * 100) / 100;
        const cuadra = Math.abs(sinExplicar) <= 50; // tolerancia de 50 € (redondeos)
        const fEUR = (n: number) => `${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
        return (
          <Plegable titulo="Venta vs Ingresos" sub={cuadra ? "Cuadra" : "Revisar"}>
            <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <div className="flex items-center justify-end mb-1">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] uppercase tracking-widest ${cuadra ? "bg-[#F1F4ED] text-[#2F4A1F]" : "bg-[#FBF3E2] text-[#7A5A18]"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${cuadra ? "bg-[#4B7A2F]" : "bg-[#C9A24B]"}`} />
                  {cuadra ? "Cuadra" : "Revisar"}
                </span>
              </div>
              <p className="text-[11px] text-cacao-mute mb-3">Del período (todas las ventas, sin filtros), todo en neto (sin IVA). La diferencia es lo que se vendió a crédito y las cortesías: sale en Cocina pero todavía no es dinero.</p>
              <div className="text-sm max-w-md space-y-1">
                <Fila label="Ventas registradas" val={fEUR(cocinaTotalRango)} />
                <Fila label="Ingresos (dinero que entró)" val={fEUR(conc.setuxNeto)} />
                <div className="border-t border-marfil pt-1"><Fila label="Diferencia" val={fEUR(diferencia)} fuerte /></div>
              </div>
              <div className="text-sm max-w-md space-y-1 mt-3 rounded-xl bg-marfil-soft p-3">
                <p className="text-[11px] uppercase tracking-widest text-cacao-mute mb-1">Esa diferencia debería ser (neto):</p>
                <Fila label="Ventas a crédito (CXC)" val={fEUR(conc.cxcNeto)} />
                <Fila label="Cortesías (RPP)" val={fEUR(conc.rppNeto)} />
                <div className="border-t border-marfil pt-1"><Fila label="Juntas" val={fEUR(creditoYCortesias)} fuerte /></div>
                <div className="border-t border-marfil pt-1">
                  <Fila label={cuadra ? "Todo explicado ✓" : "Sin explicar"} val={`${sinExplicar < 0 ? "− " : ""}${fEUR(Math.abs(sinExplicar))}`} fuerte />
                </div>
              </div>
              <p className="text-[11px] text-cacao-mute mt-2">CXC y RPP aquí van en neto (sin IVA) para cuadrar con Cocina. En Cuentas por Cobrar el cliente debe el total con IVA (lo que paga al cobrarle).</p>
              {!cuadra && (
                <p className="text-[12px] text-cacao-soft mt-2">
                  {sinExplicar > 0
                    ? <>Cocina muestra más de lo que se explica con crédito y cortesías. Suele ser: falta importar la CXC del período, o se duplicó un día en Cocina. {conc.ivaSetux > 1 && <>Si este resto se parece al IVA ({fEUR(conc.ivaSetux)}), Cocina traía IVA y los ingresos no.</>}</>
                    : <>El crédito y las cortesías registrados superan la diferencia. Suele ser: faltan días de venta por importar en Cocina, o se cargó CXC de más.</>}
                </p>
              )}
              {conc.cobrosEur > 0.005 && (
                <p className="text-[11px] text-cacao-mute mt-2">Aparte: {fEUR(conc.cobrosEur)} cobrados de cuentas por cobrar en el período (cobranzas de ventas anteriores, no cuentan aquí).</p>
              )}
            </section>
          </Plegable>
        );
      })()}
    </div>
  );

  // Fila de barra para un producto (con tooltip de detalle).
  function barProd(
    p: { producto: string; catLabel: string; unidades: number; monto: number },
    i: number,
    metric: "unidades" | "monto",
  ): BarRow {
    return {
      key: p.producto,
      label: p.producto,
      value: metric === "unidades" ? p.unidades : p.monto,
      color: colorPorIndice(i),
      tip: `${p.producto} (${p.catLabel}): ${fUnid(p.unidades)} unid · ${fUSD(p.monto)} · ${fPct(pct(p.monto))} del total`,
    };
  }
}

// ── Subcomponentes ─────────────────────────────────────────────────────
function Fila({ label, val, tenue, fuerte }: { label: string; val: string; tenue?: boolean; fuerte?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={tenue ? "text-cacao-soft" : fuerte ? "text-cacao font-medium" : "text-cacao"}>{label}</span>
      <span className={`tabular-nums whitespace-nowrap ${fuerte ? "text-cacao font-medium" : tenue ? "text-cacao-soft" : "text-cacao"}`}>{val}</span>
    </div>
  );
}

function StatCard({
  titulo,
  valor,
  sub,
  tono,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  tono?: "bien" | "alerta";
}) {
  const colorValor = tono === "bien" ? "text-[#2F4A1F]" : tono === "alerta" ? "text-[#7A5A18]" : "text-cacao";
  return (
    <div className="rounded-xl bg-white ring-1 ring-marfil p-3">
      <div className="text-[9px] uppercase tracking-widest text-cacao-mute leading-tight">
        {titulo}
      </div>
      <div className={`mt-0.5 font-cinzel text-base leading-tight break-words ${colorValor}`}>
        {valor}
      </div>
      {sub && <div className="text-[11px] text-cacao-soft mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

function SortableTh({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <th className="py-2 font-normal text-right">
      <button
        type="button"
        onClick={onClick}
        className={`uppercase tracking-widest text-[11px] hover:text-cacao ${
          active ? "text-cacao" : "text-cacao-mute"
        }`}
        title="Ordenar de mayor a menor"
      >
        {label} {active ? "↓" : ""}
      </button>
    </th>
  );
}
