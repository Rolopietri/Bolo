"use client";

// Análisis de Compras — módulo ESPEJO de Análisis de Ventas, adaptado a la
// realidad de las compras (tabla `compras` de Cocina). Misma arquitectura:
// filtros globales (período, categoría, insumo, proveedor, estado, modalidad),
// KPIs con comparación vs período anterior, evolución, categorías con drill-down,
// tops, segmentaciones y detalle. Cada métrica usa sus propios datos de compras;
// no inventa nada. La utilidad real (ventas − costos) vive en el Resumen.

import { useEffect, useMemo, useState } from "react";
import type { Compra, Insumo, Proveedor } from "@/lib/types";
import {
  listComprasRango,
  listInsumos,
  listProveedores,
  setCompraProveedor,
  setInsumoCategoriaCompra,
} from "@/lib/data/cocina";
import {
  listCategoriasInsumo,
  createCategoriaInsumo,
  renameCategoriaInsumo,
  deleteCategoriaInsumo,
  setCategoriaInsumoExcluirRanking,
  type CategoriaInsumo,
} from "@/lib/data/categoriasInsumo";
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
import { Plegable } from "@/components/Plegable";

// ── Formato ──────────────────────────────────────────────────────────────
const fUSD = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fUnid = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const fPct = (n: number) => `${n.toFixed(1)}%`;
// Egresos vienen en € (admin_egreso). Se muestran en € para no mezclar.
const fEUR = (n: number) => `${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
type EgItem = { id: string; fecha: string; concepto: string | null; proveedor: string | null; categoria: string; categoria_id: string | null; usd: number; moneda: string; monto: number };
type GastosResp = { fijos: number; variables: number; insumosEgreso: number; cortesias: number; porCategoria: { categoria: string; clasificacion: string; eur: number; usd: number }[]; items?: EgItem[]; prev: { fijos: number; variables: number } };

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function diaCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
// Normaliza un nombre de categoría para agrupar (sin acentos, minúsculas).
function normCat(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
}

type Preset = "dia" | "semana" | "mes" | "rango";
function rangoDePreset(preset: Preset): { desde: string; hasta: string } {
  const hoy = new Date();
  if (preset === "dia") return { desde: isoLocal(hoy), hasta: isoLocal(hoy) };
  if (preset === "semana") {
    const d = new Date(hoy);
    d.setDate(d.getDate() - 6);
    return { desde: isoLocal(d), hasta: isoLocal(hoy) };
  }
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  return { desde: isoLocal(primero), hasta: isoLocal(hoy) };
}

const MODALIDAD: Record<string, string> = {
  bcv_dolar: "BCV dólar",
  bcv_euro: "BCV euro",
  paralela: "Paralela",
  efectivo: "Efectivo",
  divisa: "Divisa",
};

type OrdenTabla = "monto" | "compras";

// Fila de compra enriquecida (categoría de compra, proveedor, estado, monto…).
type EnrRow = {
  id: string;
  fecha: string;
  insumoId: string;
  insumo: string;
  catKey: string;
  catLabel: string;
  provKey: string;
  proveedor: string;
  modalidad: string;
  pagada: boolean;
  monto: number;
  flete: number;
};
type InsumoAgg = { id: string; nombre: string; catKey: string; catLabel: string; monto: number; veces: number };
type ProvAgg = { key: string; nombre: string; monto: number; veces: number };

function aggInsumo(rows: EnrRow[]): InsumoAgg[] {
  const m = new Map<string, InsumoAgg>();
  rows.forEach((e) => {
    const cur = m.get(e.insumoId) ?? { id: e.insumoId, nombre: e.insumo, catKey: e.catKey, catLabel: e.catLabel, monto: 0, veces: 0 };
    cur.monto += e.monto; cur.veces += 1; m.set(e.insumoId, cur);
  });
  return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
}
function aggProveedor(rows: EnrRow[]): ProvAgg[] {
  const m = new Map<string, ProvAgg>();
  rows.forEach((e) => {
    const cur = m.get(e.provKey) ?? { key: e.provKey, nombre: e.proveedor, monto: 0, veces: 0 };
    cur.monto += e.monto; cur.veces += 1; m.set(e.provKey, cur);
  });
  return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
}

export function AnalisisCompras() {
  const [preset, setPreset] = useState<Preset>("mes");
  const inicial = rangoDePreset("mes");
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [filtroCat, setFiltroCat] = useState<string>("all");
  const [filtroIns, setFiltroIns] = useState<string>("all");
  const [filtroProv, setFiltroProv] = useState<string>("all");
  const [filtroEstado, setFiltroEstado] = useState<"all" | "pagada" | "porpagar">("all");
  const [filtroModalidad, setFiltroModalidad] = useState<string>("all");
  const [topN, setTopN] = useState<5 | 10 | 20>(5);
  const [orden, setOrden] = useState<OrdenTabla>("monto");

  const [compras, setCompras] = useState<Compra[]>([]);
  const [comprasPrev, setComprasPrev] = useState<Compra[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [categorias, setCategorias] = useState<CategoriaInsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [asignando, setAsignando] = useState<string | null>(null);
  const [gastos, setGastos] = useState<GastosResp | null>(null);
  const [catsEg, setCatsEg] = useState<{ id: string; nombre: string; clasificacion: string }[]>([]);
  const [egTick, setEgTick] = useState(0); // refresca gastos tras reclasificar
  const [reasignando, setReasignando] = useState<string | null>(null);
  const [egDrill, setEgDrill] = useState<{ key: string; label: string } | null>(null);
  const [catDrill, setCatDrill] = useState<{ key: string; label: string } | null>(null);
  const [mostrarDetalle, setMostrarDetalle] = useState(false);
  const [mostrarClasif, setMostrarClasif] = useState(false);

  // Insumos + proveedores + categorías de insumo una vez (para nombres y clasificación).
  useEffect(() => {
    let cancel = false;
    listInsumos().then((i) => !cancel && setInsumos(i)).catch(() => {});
    listProveedores().then((p) => !cancel && setProveedores(p)).catch(() => {});
    listCategoriasInsumo().then((c) => !cancel && setCategorias(c)).catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Compras del rango.
  useEffect(() => {
    let cancel = false;
    async function cargar() {
      setLoading(true);
      setError(null);
      try {
        const c = await listComprasRango(desde, hasta);
        if (!cancel) setCompras(c);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error cargando compras");
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    cargar();
    return () => { cancel = true; };
  }, [desde, hasta]);

  // Período anterior (mismo largo, justo antes) para el ▲▼.
  const rangoPrev = useMemo(() => {
    const d0 = new Date(desde + "T00:00");
    const d1 = new Date(hasta + "T00:00");
    const dias = Math.round((d1.getTime() - d0.getTime()) / 86400000) + 1;
    const fin = new Date(d0); fin.setDate(fin.getDate() - 1);
    const ini = new Date(fin); ini.setDate(ini.getDate() - (dias - 1));
    return { desde: isoLocal(ini), hasta: isoLocal(fin) };
  }, [desde, hasta]);

  useEffect(() => {
    let cancel = false;
    listComprasRango(rangoPrev.desde, rangoPrev.hasta)
      .then((c) => !cancel && setComprasPrev(c))
      .catch(() => !cancel && setComprasPrev([]));
    return () => { cancel = true; };
  }, [rangoPrev.desde, rangoPrev.hasta]);

  // Egresos operativos (fijos/variables) de Administración para el mismo rango.
  useEffect(() => {
    let cancel = false;
    fetch(`/api/admin/gastos?desde=${desde}&hasta=${hasta}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((g) => { if (!cancel) setGastos(g && !g.error ? g : null); })
      .catch(() => { if (!cancel) setGastos(null); });
    return () => { cancel = true; };
  }, [desde, hasta, egTick]);

  // Categorías de egreso (para reclasificar desde el detalle del rubro).
  useEffect(() => {
    let cancel = false;
    fetch("/api/admin/categorias", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancel && d) setCatsEg(d.categorias ?? []); })
      .catch(() => {});
    return () => { cancel = true; };
  }, []);

  // Reasignar la categoría de un egreso (categorizar desde el detalle).
  async function reasignarEgreso(egresoId: string, categoriaId: string) {
    const cat = catsEg.find((c) => c.id === categoriaId);
    if (!cat) return;
    setReasignando(egresoId);
    try {
      const r = await fetch("/api/admin/egresos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ solo_categoria: true, id: egresoId, categoria_id: cat.id, categoria_nombre: cat.nombre, clasificacion: cat.clasificacion }),
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.error || "No se pudo reclasificar."); }
      setEgTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reclasificar.");
    } finally { setReasignando(null); }
  }

  const insMap = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const provMap = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores]);

  // Enriquecer cada compra (mismo patrón que Ventas): categoría del insumo,
  // proveedor, modalidad, estado de pago, monto (costo de insumos) y flete.
  const enriquecidas = useMemo<EnrRow[]>(
    () =>
      compras.map((c) => {
        const ins = insMap.get(c.insumoId);
        const catLabel = ins?.categoriaCompra?.trim() ? ins.categoriaCompra : "Sin categoría";
        return {
          id: c.id,
          fecha: c.fecha,
          insumoId: c.insumoId,
          insumo: ins?.nombre ?? "—",
          catKey: normCat(catLabel),
          catLabel,
          provKey: c.proveedorId ?? "sin",
          proveedor: c.proveedorId ? (provMap.get(c.proveedorId) ?? "Proveedor") : "Sin proveedor",
          modalidad: c.modalidadPago ?? "—",
          pagada: c.pagada,
          monto: c.precioTotalUsd || 0,
          flete: c.fleteUsd || 0,
        };
      }),
    [compras, insMap, provMap],
  );

  // Opciones de filtros (según lo que existe en el rango).
  const categoriasOpciones = useMemo(() => {
    const m = new Map<string, string>();
    enriquecidas.forEach((e) => m.set(e.catKey, e.catLabel));
    return Array.from(m.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [enriquecidas]);
  const insumosOpciones = useMemo(() => {
    const base = filtroCat === "all" ? enriquecidas : enriquecidas.filter((e) => e.catKey === filtroCat);
    return Array.from(new Set(base.map((e) => e.insumo))).sort((a, b) => a.localeCompare(b));
  }, [enriquecidas, filtroCat]);
  const proveedoresOpciones = useMemo(() => {
    const m = new Map<string, string>();
    enriquecidas.forEach((e) => m.set(e.provKey, e.proveedor));
    return Array.from(m.entries()).map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [enriquecidas]);
  const modalidadesOpciones = useMemo(() => {
    const s = new Set(enriquecidas.map((e) => e.modalidad));
    return Array.from(s).map((k) => ({ key: k, label: MODALIDAD[k] ?? k }));
  }, [enriquecidas]);

  // Aplicar todos los filtros (global — afecta KPIs, gráficos y tablas).
  const filtradas = useMemo(
    () =>
      enriquecidas.filter(
        (e) =>
          (filtroCat === "all" || e.catKey === filtroCat) &&
          (filtroIns === "all" || e.insumo === filtroIns) &&
          (filtroProv === "all" || e.provKey === filtroProv) &&
          (filtroEstado === "all" || (filtroEstado === "pagada" ? e.pagada : !e.pagada)) &&
          (filtroModalidad === "all" || e.modalidad === filtroModalidad),
      ),
    [enriquecidas, filtroCat, filtroIns, filtroProv, filtroEstado, filtroModalidad],
  );

  // ── Agregados ────────────────────────────────────────────────────────
  const totalMonto = useMemo(() => filtradas.reduce((s, e) => s + e.monto, 0), [filtradas]);
  const fleteTotal = useMemo(() => filtradas.reduce((s, e) => s + e.flete, 0), [filtradas]);
  const nCompras = filtradas.length;
  const diasConCompra = useMemo(() => new Set(filtradas.map((e) => e.fecha)).size, [filtradas]);
  const compraPromedio = nCompras > 0 ? totalMonto / nCompras : 0;
  const compraPromedioDia = diasConCompra > 0 ? totalMonto / diasConCompra : 0;
  const pct = (m: number) => (totalMonto > 0 ? (m / totalMonto) * 100 : 0);

  // Comparación vs período anterior (global, sin filtros — igual que Ventas).
  const globalTotal = useMemo(() => compras.reduce((s, c) => s + (c.precioTotalUsd || 0), 0), [compras]);

  // Egresos por categoría (gráfico principal): compras de Cocina englobadas como
  // "Cafetería/comedor" + los egresos operativos (nómina, alquiler…), todo en $.
  // Un egreso cuya categoría sea de Cocina/Cafetería/Comedor (ej. pagar una
  // factura de Cocina sin cargarla en inventario) SE SUMA a ese mismo rubro.
  const egresoRubros = useMemo(() => {
    const esCocinaCat = (nombre: string) => {
      const n = (nombre ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return n.includes("cocina") || n.includes("cafeteria") || n.includes("comedor");
    };
    let cafeteria = totalMonto > 0.005 ? totalMonto : 0;
    const otros: { key: string; label: string; monto: number }[] = [];
    for (const c of gastos?.porCategoria ?? []) {
      if (c.usd <= 0.005) continue;
      if (esCocinaCat(c.categoria)) cafeteria += c.usd;
      else otros.push({ key: `eg-${c.categoria}`, label: c.categoria, monto: c.usd });
    }
    const rows: { key: string; label: string; monto: number }[] = [];
    if (cafeteria > 0.005) rows.push({ key: "cafeteria", label: "Cafetería/comedor", monto: cafeteria });
    rows.push(...otros);
    return rows.sort((a, b) => b.monto - a.monto);
  }, [totalMonto, gastos]);
  const egresoTotal = egresoRubros.reduce((s, r) => s + r.monto, 0);
  const pctEg = (m: number) => (egresoTotal > 0 ? (m / egresoTotal) * 100 : 0);
  const prevTotal = useMemo(() => comprasPrev.reduce((s, c) => s + (c.precioTotalUsd || 0), 0), [comprasPrev]);
  const delta = prevTotal > 0 ? (globalTotal - prevTotal) / prevTotal : null;

  // Categorías excluidas de los rankings/tops (siguen contando en totales y en
  // "por categoría"). Igual que en Ventas: p.ej. una categoría atípica que
  // dominaría los tops. Se marca desde "Clasificar insumos".
  const excluidasSet = useMemo(
    () => new Set(categorias.filter((c) => c.excluirRanking).map((c) => normCat(c.nombre))),
    [categorias],
  );
  const hayExcluidas = excluidasSet.size > 0;
  const filtradasRank = useMemo(
    () => (hayExcluidas ? filtradas.filter((e) => !excluidasSet.has(e.catKey)) : filtradas),
    [filtradas, excluidasSet, hayExcluidas],
  );

  // Agregados por insumo/proveedor. La versión "…Rank" excluye las categorías
  // marcadas como fuera de ranking; se usa en tops, Pareto y "mayor gasto".
  const porInsumo = useMemo(() => aggInsumo(filtradas), [filtradas]);
  const porProveedor = useMemo(() => aggProveedor(filtradas), [filtradas]);
  const porInsumoRank = useMemo(() => (hayExcluidas ? aggInsumo(filtradasRank) : porInsumo), [filtradasRank, hayExcluidas, porInsumo]);
  const porProveedorRank = useMemo(() => (hayExcluidas ? aggProveedor(filtradasRank) : porProveedor), [filtradasRank, hayExcluidas, porProveedor]);

  const porCategoria = useMemo(() => {
    const m = new Map<string, { key: string; label: string; veces: number; monto: number }>();
    filtradas.forEach((e) => {
      const cur = m.get(e.catKey) ?? { key: e.catKey, label: e.catLabel, veces: 0, monto: 0 };
      cur.veces += 1; cur.monto += e.monto; m.set(e.catKey, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.monto - a.monto);
  }, [filtradas]);

  const porModalidad = useMemo(() => {
    const m = new Map<string, number>();
    filtradas.forEach((e) => m.set(e.modalidad, (m.get(e.modalidad) ?? 0) + e.monto));
    return Array.from(m.entries()).map(([k, monto]) => ({ key: k, label: MODALIDAD[k] ?? k, monto })).sort((a, b) => b.monto - a.monto);
  }, [filtradas]);

  const porEstado = useMemo(() => {
    let pagada = 0, porPagar = 0;
    filtradas.forEach((e) => { if (e.pagada) pagada += e.monto; else porPagar += e.monto; });
    return { pagada, porPagar };
  }, [filtradas]);
  const porPagarN = useMemo(() => filtradas.filter((e) => !e.pagada).length, [filtradas]);

  // Evolución diaria (todos los días del rango, 0 si no hubo compras).
  const porDia = useMemo(() => {
    const acc = new Map<string, number>();
    filtradas.forEach((e) => acc.set(e.fecha, (acc.get(e.fecha) ?? 0) + e.monto));
    const dias: { label: string; value: number; tip: string }[] = [];
    const d = new Date(desde + "T00:00"); const fin = new Date(hasta + "T00:00");
    let guard = 0;
    while (d <= fin && guard < 400) {
      const iso = isoLocal(d);
      dias.push({ label: diaCorto(iso), value: acc.get(iso) ?? 0, tip: iso });
      d.setDate(d.getDate() + 1); guard++;
    }
    return dias;
  }, [filtradas, desde, hasta]);

  const porDiaSemana = useMemo(() => {
    const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    const monto = new Array(7).fill(0);
    filtradas.forEach((e) => {
      const dow = (new Date(e.fecha + "T00:00").getDay() + 6) % 7;
      monto[dow] += e.monto;
    });
    return nombres.map((label, i) => ({ key: label, label, value: monto[i] }));
  }, [filtradas]);

  // Pareto 80/20: cuántos insumos concentran el 80% del gasto.
  const pareto = useMemo(() => {
    const arr = [...porInsumoRank];
    const t = arr.reduce((s, p) => s + p.monto, 0);
    let acc = 0, n = 0;
    for (const p of arr) { acc += p.monto; n++; if (t > 0 && acc / t >= 0.8) break; }
    return { n, deTotal: arr.length, pctProd: arr.length > 0 ? n / arr.length : 0 };
  }, [porInsumoRank]);

  const topInsumos = useMemo(() => porInsumoRank.slice(0, topN), [porInsumoRank, topN]);
  const topProveedores = useMemo(() => porProveedorRank.slice(0, topN), [porProveedorRank, topN]);
  const concentracion = porProveedorRank[0] ? pct(porProveedorRank[0].monto) : 0;

  // Drill-down: insumos de la categoría abierta.
  const drill = useMemo(() => {
    if (!catDrill) return null;
    const items = porInsumo.filter((p) => p.catKey === catDrill.key);
    const total = items.reduce((s, p) => s + p.monto, 0);
    return { items: [...items].sort((a, b) => b.monto - a.monto), total };
  }, [catDrill, porInsumo]);

  const tablaOrdenada = useMemo(() => {
    const arr = [...porInsumo];
    arr.sort((a, b) => (orden === "compras" ? b.veces - a.veces : b.monto - a.monto));
    return arr;
  }, [porInsumo, orden]);

  // Resumen POR FACTURA (compras-específico, se conserva): agrupa por número de
  // factura (mismo proveedor); las sin factura por proveedor+fecha. Respeta los
  // filtros activos. total = insumos + flete.
  const porFactura = useMemo(() => {
    const m = new Map<string, { key: string; factura: string; proveedor: string; fecha: string; lineas: number; insumos: number; flete: number; total: number; porPagar: boolean }>();
    filtradas.forEach((e) => {
      const c = compras.find((x) => x.id === e.id);
      const fact = c?.numeroFactura?.trim();
      const key = fact ? `f:${fact.toLowerCase()}:${e.provKey}` : `sf:${e.provKey}:${e.fecha}`;
      const cur = m.get(key) ?? { key, factura: fact || "(sin factura)", proveedor: e.proveedor, fecha: e.fecha, lineas: 0, insumos: 0, flete: 0, total: 0, porPagar: false };
      cur.lineas += 1; cur.insumos += e.monto; cur.flete += e.flete; cur.total += e.monto + e.flete;
      if (!e.pagada) cur.porPagar = true;
      if (e.fecha < cur.fecha) cur.fecha = e.fecha;
      m.set(key, cur);
    });
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [filtradas, compras]);

  // Compras sin proveedor (para completarlas asignando uno) — se conserva.
  const sinProveedor = useMemo(
    () => filtradas.filter((e) => e.provKey === "sin").map((e) => ({ id: e.id, fecha: e.fecha, monto: e.monto, insumo: e.insumo })).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.monto - a.monto),
    [filtradas],
  );
  const totalSinProv = useMemo(() => sinProveedor.reduce((s, c) => s + c.monto, 0), [sinProveedor]);

  async function asignarProveedor(compraId: string, proveedorId: string) {
    if (!proveedorId) return;
    setAsignando(compraId);
    try {
      await setCompraProveedor(compraId, proveedorId);
      setCompras((prev) => prev.map((c) => (c.id === compraId ? { ...c, proveedorId } : c)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar el proveedor");
    } finally {
      setAsignando(null);
    }
  }

  // ── Clasificar insumos (asignar categoría + gestionar la lista) ──
  async function asignarCategoria(insumoId: string, categoria: string) {
    setError(null);
    try {
      await setInsumoCategoriaCompra(insumoId, categoria || null);
      setInsumos((prev) => prev.map((i) => (i.id === insumoId ? { ...i, categoriaCompra: categoria || undefined } : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo asignar la categoría");
    }
  }
  async function agregarCategoria(nombre: string) {
    const n = nombre.trim();
    if (!n) return;
    setError(null);
    try {
      const c = await createCategoriaInsumo(n, (categorias.at(-1)?.orden ?? 0) + 10);
      setCategorias((prev) => [...prev, c].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la categoría");
    }
  }
  async function renombrarCategoria(id: string, nombreViejo: string, nombreNuevo: string) {
    const nuevo = nombreNuevo.trim();
    if (!nuevo || nuevo === nombreViejo) return;
    setError(null);
    try {
      await renameCategoriaInsumo(id, nombreViejo, nuevo);
      setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, nombre: nuevo } : c)));
      setInsumos((prev) => prev.map((i) => (i.categoriaCompra === nombreViejo ? { ...i, categoriaCompra: nuevo } : i)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo renombrar");
    }
  }
  async function borrarCategoria(id: string) {
    setError(null);
    try {
      await deleteCategoriaInsumo(id);
      setCategorias((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo borrar");
    }
  }
  async function toggleExcluir(id: string, excluir: boolean) {
    setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, excluirRanking: excluir } : c)));
    try {
      await setCategoriaInsumoExcluirRanking(id, excluir);
    } catch (e) {
      setCategorias((prev) => prev.map((c) => (c.id === id ? { ...c, excluirRanking: !excluir } : c)));
      setError(e instanceof Error ? e.message : "No se pudo actualizar");
    }
  }
  const sinClasificar = useMemo(() => insumos.filter((i) => !i.categoriaCompra?.trim()).length, [insumos]);

  function aplicarPreset(p: Preset) {
    setPreset(p);
    if (p !== "rango") { const r = rangoDePreset(p); setDesde(r.desde); setHasta(r.hasta); }
  }
  function limpiarFiltros() {
    setPreset("mes");
    const r = rangoDePreset("mes");
    setDesde(r.desde); setHasta(r.hasta);
    setFiltroCat("all"); setFiltroIns("all"); setFiltroProv("all");
    setFiltroEstado("all"); setFiltroModalidad("all");
    setTopN(5); setOrden("monto");
  }
  const hayFiltro = filtroCat !== "all" || filtroIns !== "all" || filtroProv !== "all" || filtroEstado !== "all" || filtroModalidad !== "all" || preset !== "mes";
  const pill = (active: boolean) => `px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${active ? "bg-cacao text-white ring-cacao" : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"}`;
  const selCls = "rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white";
  const hayDatos = filtradas.length > 0;

  // Fila de barra para un insumo/proveedor (con tooltip).
  function barIns(p: { id?: string; key?: string; nombre: string; monto: number; veces: number }, i: number): BarRow {
    return { key: p.id ?? p.key ?? p.nombre, label: p.nombre, value: p.monto, color: colorPorIndice(i), tip: `${p.nombre}: ${fUSD(p.monto)} · ${p.veces} compra(s) · ${fPct(pct(p.monto))} del total` };
  }

  return (
    <div className="space-y-5">
      {/* ── Filtros ─────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["dia", "semana", "mes", "rango"] as Preset[]).map((p) => (
            <button key={p} type="button" onClick={() => aplicarPreset(p)} className={pill(preset === p)}>
              {p === "dia" ? "Día" : p === "semana" ? "Semana" : p === "mes" ? "Mes" : "Rango"}
            </button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-1 text-xs text-cacao-soft">Desde
              <input type="date" value={desde} max={hasta} onChange={(e) => { setPreset("rango"); setDesde(e.target.value); }} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white" />
            </label>
            <label className="flex items-center gap-1 text-xs text-cacao-soft">Hasta
              <input type="date" value={hasta} min={desde} max={hoyISO()} onChange={(e) => { setPreset("rango"); setHasta(e.target.value); }} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-sm bg-white" />
            </label>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtroCat} onChange={(e) => { setFiltroCat(e.target.value); setFiltroIns("all"); }} className={selCls}>
            <option value="all">Todas las categorías</option>
            {categoriasOpciones.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={filtroIns} onChange={(e) => setFiltroIns(e.target.value)} className={`${selCls} max-w-[220px]`}>
            <option value="all">Todos los insumos</option>
            {insumosOpciones.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={filtroProv} onChange={(e) => setFiltroProv(e.target.value)} className={`${selCls} max-w-[200px]`}>
            <option value="all">Todos los proveedores</option>
            {proveedoresOpciones.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value as "all" | "pagada" | "porpagar")} className={selCls}>
            <option value="all">Todos los estados</option>
            <option value="pagada">Pagadas</option>
            <option value="porpagar">Por pagar</option>
          </select>
          <select value={filtroModalidad} onChange={(e) => setFiltroModalidad(e.target.value)} className={selCls}>
            <option value="all">Toda modalidad</option>
            {modalidadesOpciones.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          {hayFiltro && (
            <button type="button" onClick={limpiarFiltros} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta">↺ Limpiar filtros</button>
          )}
        </div>
      </section>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* ── Clasificar insumos (asigna categoría + gestiona la lista) ── */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
        <button type="button" onClick={() => setMostrarClasif((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
          <span className="flex items-center gap-2">
            <span className="font-cinzel text-base text-cacao">Clasificar insumos</span>
            {sinClasificar > 0 && <span className="rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-300 px-2 py-0.5 text-[10px] uppercase tracking-widest">{sinClasificar} por clasificar</span>}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[11px] text-cacao-mute">{categorias.length} categorías</span>
            <span className={`text-cacao-mute transition-transform ${mostrarClasif ? "rotate-90" : ""}`}>›</span>
          </span>
        </button>
        {mostrarClasif && (
          <ClasificarInsumos
            insumos={insumos}
            categorias={categorias}
            onAsignar={asignarCategoria}
            onCrear={agregarCategoria}
            onRenombrar={renombrarCategoria}
            onBorrar={borrarCategoria}
            onExcluir={toggleExcluir}
          />
        )}
      </section>

      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center text-cacao-soft">Cargando análisis…</div>
      ) : !hayDatos ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft">No hay compras en el período{hayFiltro ? " / filtro" : ""} seleccionado. Las compras se registran en Cocina → Compras y aquí se reflejan.</p>
        </div>
      ) : (
        <>
          {/* ── Resumen ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard titulo="Compras totales" valor={fUSD(totalMonto)} sub={fleteTotal > 0 ? `+ ${fUSD(fleteTotal)} flete` : undefined} />
            <StatCard titulo="Nº de compras" valor={fUnid(nCompras)} sub={`${diasConCompra} días con compra`} />
            <StatCard titulo="Insumos distintos" valor={fUnid(porInsumo.length)} />
            <StatCard titulo="Mayor gasto (proveedor)" valor={porProveedorRank[0]?.nombre ?? "—"} sub={porProveedorRank[0] ? fUSD(porProveedorRank[0].monto) : undefined} />
            <StatCard titulo="Mayor gasto (insumo)" valor={porInsumoRank[0]?.nombre ?? "—"} sub={porInsumoRank[0] ? fUSD(porInsumoRank[0].monto) : undefined} />
          </div>

          {/* ── KPIs adicionales ────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              titulo="vs período anterior"
              valor={delta == null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${fPct(Math.abs(delta) * 100)}`}
              sub={prevTotal > 0 ? `antes ${fUSD(prevTotal)}` : "sin datos previos"}
              tono={delta == null ? undefined : delta >= 0 ? "alerta" : "bien"}
            />
            <StatCard titulo="Compra prom./día" valor={fUSD(compraPromedioDia)} sub={`${diasConCompra} días`} />
            <StatCard titulo="Costo prom./compra" valor={fUSD(compraPromedio)} />
            <StatCard titulo="Concentración 80/20" valor={pareto.deTotal > 0 ? `${pareto.n} de ${pareto.deTotal}` : "—"} sub={pareto.deTotal > 0 ? `${fPct(pareto.pctProd * 100)} de insumos = 80% del gasto` : undefined} />
            <StatCard titulo="Por pagar" valor={fUSD(porEstado.porPagar)} sub={`${porPagarN} compra(s) pendiente(s)`} tono={porEstado.porPagar > 0 ? "alerta" : undefined} />
          </div>

          {/* Insight: concentración de proveedor */}
          {porProveedorRank[0] && concentracion >= 40 && (
            <div className="rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 text-xs text-cacao-soft">
              <strong className="text-cacao">{porProveedorRank[0].nombre}</strong> concentra el <strong className="text-cacao">{fPct(concentracion)}</strong> de tus compras del período.{concentracion >= 50 ? " Dependes fuerte de un solo proveedor — conviene tener alternativas." : ""}
            </div>
          )}

          {/* ── Evolución ───────────────────────────────────────── */}
          <PanelCard titulo="Evolución de compras (por día)">
            <LineaEvolucion puntos={porDia} format={fUSD} />
          </PanelCard>

          {/* ── Egresos por categoría (gráfico principal) ─────────── */}
          <PanelCard titulo="Egresos por categoría">
            <p className="text-[11px] text-cacao-mute mb-3">Todas las compras de Cocina englobadas como “Cafetería/comedor”, más los egresos operativos (nómina, alquiler, servicios…). En $. Toca un rubro para ver su detalle.</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Dona
                segmentos={egresoRubros.map((r, i) => ({ key: r.key, label: r.label, value: r.monto, color: colorPorIndice(i) }))}
                format={fUSD}
                sinLeyenda
                onSelect={(k) => { const r = egresoRubros.find((x) => x.key === k); if (r) setEgDrill({ key: r.key, label: r.label }); }}
              />
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-cacao-mute uppercase tracking-widest text-left">
                      <th className="py-1 font-normal">Rubro</th>
                      <th className="py-1 font-normal text-right">Monto</th>
                      <th className="py-1 font-normal text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {egresoRubros.length === 0 && <tr><td colSpan={3} className="py-3 text-center text-cacao-soft italic">Sin egresos en el período.</td></tr>}
                    {egresoRubros.map((r) => (
                      <tr key={r.key} onClick={() => setEgDrill({ key: r.key, label: r.label })} className={`border-t border-marfil cursor-pointer hover:bg-marfil-soft ${egDrill?.key === r.key ? "bg-marfil-soft" : ""}`}>
                        <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{r.label}<span className="text-cacao-mute">›</span></span></td>
                        <td className="py-1 text-right tabular-nums text-cacao">{fUSD(r.monto)}</td>
                        <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(pctEg(r.monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-marfil font-medium">
                      <td className="py-1 text-cacao">Total egresos</td>
                      <td className="py-1 text-right tabular-nums text-cacao">{fUSD(egresoTotal)}</td>
                      <td className="py-1 text-right tabular-nums text-cacao-soft">100%</td>
                    </tr>
                  </tfoot>
                </table>
                {!gastos && <p className="mt-2 text-[11px] text-[#7A5A18]">No pude leer los egresos operativos de Administración (solo se muestran las compras de Cocina).</p>}
              </div>
            </div>
          </PanelCard>

          {/* ── Detalle del rubro seleccionado ── */}
          {egDrill && (
            <section className="rounded-2xl bg-white ring-1 ring-terracotta/40 p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-cinzel text-base text-cacao">Detalle: {egDrill.label}</h3>
                <button type="button" onClick={() => setEgDrill(null)} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta">✕ Cerrar</button>
              </div>
              {egDrill.key === "cafeteria" ? (
                <>
                  <p className="text-[11px] text-cacao-mute mb-2">Compras de Cocina por categoría de insumo. El detalle por insumo está en la sección plegable de abajo.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="text-cacao-mute uppercase tracking-widest text-left"><th className="py-1 font-normal">Categoría de insumo</th><th className="py-1 font-normal text-right">Compras</th><th className="py-1 font-normal text-right">Gasto</th><th className="py-1 font-normal text-right">%</th></tr></thead>
                      <tbody>
                        {porCategoria.map((c) => (
                          <tr key={c.key} className="border-t border-marfil"><td className="py-1 text-cacao">{c.label}</td><td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.veces)}</td><td className="py-1 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td><td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(pct(c.monto))}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (() => {
                const items = (gastos?.items ?? []).filter((it) => it.categoria === egDrill.label);
                return (
                  <>
                    <p className="text-[11px] text-cacao-mute mb-2">{items.length} egreso(s). Cambia la categoría en cualquier fila para reclasificarlo (se guarda al instante).</p>
                    <div className="rounded-xl ring-1 ring-marfil overflow-hidden max-h-[26rem] overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white"><tr className="text-cacao-mute uppercase tracking-widest text-left"><th className="py-1.5 px-2 font-normal">Fecha</th><th className="py-1.5 px-2 font-normal">Concepto / Proveedor</th><th className="py-1.5 px-2 font-normal text-right">Monto</th><th className="py-1.5 px-2 font-normal">Categoría</th></tr></thead>
                        <tbody>
                          {items.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-cacao-soft italic">Sin egresos en este rubro.</td></tr>}
                          {items.map((it) => (
                            <tr key={it.id} className="border-t border-marfil">
                              <td className="py-1 px-2 text-cacao-soft whitespace-nowrap">{it.fecha}</td>
                              <td className="py-1 px-2 text-cacao min-w-0">{it.proveedor || it.concepto || "—"}</td>
                              <td className="py-1 px-2 text-right tabular-nums text-cacao">{fUSD(it.usd)}</td>
                              <td className="py-1 px-2">
                                <select defaultValue={it.categoria_id ?? ""} disabled={reasignando === it.id || catsEg.length === 0} onChange={(e) => reasignarEgreso(it.id, e.target.value)} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-xs bg-white disabled:opacity-50">
                                  <option value="" disabled>{reasignando === it.id ? "Guardando…" : "Elegir…"}</option>
                                  {catsEg.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </section>
          )}

          {/* ── Detalle de Cafetería/comedor por insumo (plegable) ── */}
          <Plegable titulo="Cafetería/comedor · compras por categoría de insumo">
          <div className="grid grid-cols-1 gap-4">
            <PanelCard titulo="Compras por categoría de insumo">
              <p className="text-[11px] text-cacao-mute mb-3">Toca una categoría (en el gráfico o en la lista) para ver su desglose.</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                <Dona
                  segmentos={porCategoria.map((c, i) => ({ key: c.key, label: c.label, value: c.monto, color: colorPorIndice(i) }))}
                  format={fUSD}
                  sinLeyenda
                  onSelect={(k) => { const c = porCategoria.find((x) => x.key === k); if (c) setCatDrill({ key: c.key, label: c.label }); }}
                />
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-cacao-mute uppercase tracking-widest text-left">
                        <th className="py-1 font-normal">Categoría</th>
                        <th className="py-1 font-normal text-right">Compras</th>
                        <th className="py-1 font-normal text-right">Gasto</th>
                        <th className="py-1 font-normal text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {porCategoria.map((c) => (
                        <tr key={c.key} onClick={() => setCatDrill({ key: c.key, label: c.label })} className={`border-t border-marfil cursor-pointer hover:bg-marfil-soft ${catDrill?.key === c.key ? "bg-marfil-soft" : ""}`}>
                          <td className="py-1 text-cacao"><span className="inline-flex items-center gap-1">{c.label}<span className="text-cacao-mute">›</span></span></td>
                          <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(c.veces)}</td>
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

          {/* ── Desglose de la categoría seleccionada (drill-down) ── */}
          {catDrill && drill && (
            <section className="rounded-2xl bg-white ring-1 ring-terracotta/40 p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <h3 className="font-cinzel text-base text-cacao">Desglose: {catDrill.label}</h3>
                <button type="button" onClick={() => setCatDrill(null)} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-terracotta">✕ Cerrar</button>
              </div>
              <p className="text-[11px] text-cacao-mute mb-3">{fUSD(drill.total)} en {drill.items.length} insumos. El % es dentro de esta categoría.</p>
              {drill.items.length === 0 ? (
                <p className="text-sm text-cacao-soft italic">Sin insumos en esta categoría en el período.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Dona segmentos={drill.items.map((p, i) => ({ key: p.id, label: p.nombre, value: p.monto, color: colorPorIndice(i) }))} format={fUSD} sinLeyenda />
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-cacao-mute uppercase tracking-widest text-left">
                          <th className="py-1 font-normal">Insumo</th>
                          <th className="py-1 font-normal text-right">Compras</th>
                          <th className="py-1 font-normal text-right">Gasto</th>
                          <th className="py-1 font-normal text-right">% cat.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {drill.items.map((p) => (
                          <tr key={p.id} className="border-t border-marfil">
                            <td className="py-1 text-cacao">{p.nombre}</td>
                            <td className="py-1 text-right tabular-nums text-cacao-soft">{fUnid(p.veces)}</td>
                            <td className="py-1 text-right tabular-nums text-cacao">{fUSD(p.monto)}</td>
                            <td className="py-1 text-right tabular-nums text-cacao-soft">{fPct(drill.total > 0 ? (p.monto / drill.total) * 100 : 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          )}
          </Plegable>

          {/* ── Top proveedores e insumos (plegable) ── */}
          <Plegable titulo="Top proveedores e insumos">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-widest text-cacao-mute">Mostrar</span>
            {([5, 10, 20] as const).map((n) => (
              <button key={n} type="button" onClick={() => setTopN(n)} className={pill(topN === n)}>Top {n}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard titulo={`Top ${topN} proveedores (gasto)`}>
              <BarrasH rows={topProveedores.map((p, i) => barIns(p, i))} format={fUSD} emptyLabel="Sin proveedores en el período." />
            </PanelCard>
            <PanelCard titulo={`Top ${topN} insumos (gasto)`}>
              <BarrasH rows={topInsumos.map((p, i) => barIns(p, i))} format={fUSD} />
            </PanelCard>
          </div>
          </Plegable>

          {/* ── Ritmo y estado (plegable) ── */}
          <Plegable titulo="Ritmo: día de la semana y estado de pago">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PanelCard titulo="Compras por día de la semana">
              <BarrasH rows={porDiaSemana.map((d, i) => ({ key: d.key, label: d.label, value: d.value, color: colorPorIndice(i), tip: `${d.label}: ${fUSD(d.value)}` }))} format={fUSD} />
            </PanelCard>
            <PanelCard titulo="Pagadas vs por pagar">
              <Dona
                segmentos={[
                  { key: "pagada", label: "Pagadas", value: porEstado.pagada, color: "#4B7A2F" },
                  { key: "porpagar", label: "Por pagar", value: porEstado.porPagar, color: "#C9A24B" },
                ]}
                format={fUSD}
              />
              <p className="mt-2 text-[11px] text-cacao-mute">{porPagarN > 0 ? `Tienes ${fUSD(porEstado.porPagar)} pendientes de pago en ${porPagarN} compra(s).` : "Todo el período está pagado."}</p>
            </PanelCard>
          </div>
          </Plegable>

          {/* ── Modalidad de pago (plegable) ── */}
          <Plegable titulo="Compras por modalidad de pago">
          <PanelCard titulo="Compras por modalidad de pago">
            <BarrasH rows={porModalidad.map((m, i) => ({ key: m.key, label: m.label, value: m.monto, color: colorPorIndice(i), tip: `${m.label}: ${fUSD(m.monto)} · ${fPct(pct(m.monto))}` }))} format={fUSD} />
          </PanelCard>
          </Plegable>

          {/* ── Compras sin proveedor (asignar inline) ──────────── */}
          {sinProveedor.length > 0 && (
            <PanelCard titulo={`Compras sin proveedor (${sinProveedor.length})`}>
              <p className="text-[11px] text-cacao-mute mb-2">{fUSD(totalSinProv)} sin proveedor asignado. Elige uno en cada fila para completarlas — se guarda al instante (no afecta stock ni precio).</p>
              <div className="rounded-xl ring-1 ring-marfil overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-cacao-mute uppercase tracking-widest text-left">
                      <th className="py-1.5 px-2 font-normal">Fecha</th>
                      <th className="py-1.5 px-2 font-normal">Insumo</th>
                      <th className="py-1.5 px-2 font-normal text-right">Monto</th>
                      <th className="py-1.5 px-2 font-normal">Proveedor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinProveedor.map((c) => (
                      <tr key={c.id} className="border-t border-marfil">
                        <td className="py-1 px-2 text-cacao-soft whitespace-nowrap">{c.fecha}</td>
                        <td className="py-1 px-2 text-cacao">{c.insumo}</td>
                        <td className="py-1 px-2 text-right tabular-nums text-cacao">{fUSD(c.monto)}</td>
                        <td className="py-1 px-2">
                          <select defaultValue="" disabled={asignando === c.id || proveedores.length === 0} onChange={(e) => asignarProveedor(c.id, e.target.value)} className="rounded-lg ring-1 ring-marfil px-2 py-1 text-xs bg-white disabled:opacity-50">
                            <option value="">{asignando === c.id ? "Guardando…" : "Elegir…"}</option>
                            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {proveedores.length === 0 && <p className="text-[11px] text-[#7A5A18] mt-2">No hay proveedores cargados. Crea alguno en Cocina → Proveedores para poder asignarlo.</p>}
            </PanelCard>
          )}

          {/* ── Por factura (plegable) ── */}
          <Plegable titulo={`Por factura (${porFactura.length})`}>
          <PanelCard titulo={`Por factura (${porFactura.length})`}>
            <p className="text-[11px] text-cacao-mute mb-2">Cada factura resumida: costo de insumos + flete = total.{fleteTotal > 0 ? ` Flete total del período: ${fUSD(fleteTotal)}.` : ""}</p>
            <div className="rounded-xl ring-1 ring-marfil overflow-hidden max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white">
                  <tr className="text-cacao-mute uppercase tracking-widest text-left">
                    <th className="py-1.5 px-2 font-normal">Factura</th>
                    <th className="py-1.5 px-2 font-normal">Proveedor</th>
                    <th className="py-1.5 px-2 font-normal">Fecha</th>
                    <th className="py-1.5 px-2 font-normal text-right">Insumos</th>
                    <th className="py-1.5 px-2 font-normal text-right">Flete</th>
                    <th className="py-1.5 px-2 font-normal text-right">Total</th>
                    <th className="py-1.5 px-2 font-normal">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {porFactura.map((f) => (
                    <tr key={f.key} className="border-t border-marfil">
                      <td className="py-1 px-2 text-cacao whitespace-nowrap">{f.factura}{f.lineas > 1 ? <span className="text-cacao-mute"> · {f.lineas} ítems</span> : null}</td>
                      <td className="py-1 px-2 text-cacao-soft">{f.proveedor}</td>
                      <td className="py-1 px-2 text-cacao-soft whitespace-nowrap">{f.fecha}</td>
                      <td className="py-1 px-2 text-right tabular-nums text-cacao-soft">{fUSD(f.insumos)}</td>
                      <td className="py-1 px-2 text-right tabular-nums text-cacao-soft">{f.flete > 0 ? fUSD(f.flete) : "—"}</td>
                      <td className="py-1 px-2 text-right tabular-nums text-cacao font-medium">{fUSD(f.total)}</td>
                      <td className="py-1 px-2">{f.porPagar ? <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200">Por pagar</span> : <span className="text-cacao-mute">Pagada</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PanelCard>
          </Plegable>

          {/* ── Detalle por insumo (plegable, ordenable) ────────── */}
          <section className="rounded-2xl bg-white ring-1 ring-marfil p-4">
            <button type="button" onClick={() => setMostrarDetalle((v) => !v)} className="w-full flex items-center justify-between gap-2 text-left">
              <span className="font-cinzel text-base text-cacao">Detalle por insumo</span>
              <span className="flex items-center gap-2">
                <span className="text-[11px] text-cacao-mute">{porInsumo.length} insumos</span>
                <span className={`text-cacao-mute transition-transform ${mostrarDetalle ? "rotate-90" : ""}`}>›</span>
              </span>
            </button>
            {mostrarDetalle && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-cacao-mute uppercase tracking-widest text-[11px] text-left">
                      <th className="py-2 font-normal">Insumo</th>
                      <th className="py-2 font-normal">Categoría</th>
                      <SortableTh label="Nº compras" active={orden === "compras"} onClick={() => setOrden("compras")} />
                      <SortableTh label="Gasto" active={orden === "monto"} onClick={() => setOrden("monto")} />
                      <SortableTh label="% del total" active={orden === "monto"} onClick={() => setOrden("monto")} />
                    </tr>
                  </thead>
                  <tbody>
                    {tablaOrdenada.map((p) => (
                      <tr key={p.id} className="border-t border-marfil">
                        <td className="py-2 text-cacao">{p.nombre}</td>
                        <td className="py-2 text-cacao-soft">{p.catLabel}</td>
                        <td className="py-2 text-right tabular-nums text-cacao">{fUnid(p.veces)}</td>
                        <td className="py-2 text-right tabular-nums text-cacao">{fUSD(p.monto)}</td>
                        <td className="py-2 text-right tabular-nums text-cacao-soft">{fPct(pct(p.monto))}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-marfil font-medium">
                      <td className="py-2 text-cacao" colSpan={2}>Total ({porInsumo.length} insumos)</td>
                      <td className="py-2 text-right tabular-nums text-cacao">{fUnid(nCompras)}</td>
                      <td className="py-2 text-right tabular-nums text-cacao">{fUSD(totalMonto)}</td>
                      <td className="py-2 text-right tabular-nums text-cacao-soft">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* ── Egresos operativos (Administración) ─────────────── */}
          {(() => {
            const egFijos = gastos?.fijos ?? 0;
            const egVariables = gastos?.variables ?? 0;
            const egresosTotal = egFijos + egVariables;
            const egresosPrev = (gastos?.prev.fijos ?? 0) + (gastos?.prev.variables ?? 0);
            const egDelta = egresosPrev > 0 ? (egresosTotal - egresosPrev) / egresosPrev : null;
            const salidasTotal = globalTotal + egresosTotal;
            const egCategorias = gastos?.porCategoria ?? [];
            return (
              <section className="rounded-2xl bg-white ring-1 ring-marfil p-4 space-y-3">
                <h3 className="font-cinzel text-base text-cacao">Egresos operativos (Administración)</h3>
                {!gastos ? (
                  <p className="text-sm text-cacao-soft italic">No pude leer los egresos de Administración para el período (o no hay ninguno cargado). Se registran en Administración → Egresos.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <CompraCard titulo="Gastos fijos" valor={fEUR(egFijos)} sub="alquiler, nómina…" />
                      <CompraCard titulo="Gastos variables" valor={fEUR(egVariables)} sub="sin insumos" />
                      <CompraCard titulo="Egresos (total)" valor={fEUR(egresosTotal)} sub={egDelta == null ? undefined : `${egDelta >= 0 ? "▲" : "▼"} ${fPct(Math.abs(egDelta) * 100)} vs antes`} tono={egDelta == null ? undefined : egDelta >= 0 ? "alerta" : "bien"} />
                      <CompraCard titulo="Salidas totales" valor={fEUR(salidasTotal)} sub="insumos + egresos" tono="alerta" />
                    </div>
                    {egCategorias.length > 0 && (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <PanelCard titulo="Egresos por categoría">
                          <BarrasH rows={egCategorias.map((c, i) => ({ key: c.categoria, label: c.categoria, value: c.eur, color: colorPorIndice(i), tip: `${c.categoria} (${c.clasificacion === "fija" ? "fijo" : "variable"}): ${fEUR(c.eur)}` }))} format={fEUR} />
                        </PanelCard>
                        <PanelCard titulo="Distribución de egresos">
                          <Dona segmentos={egCategorias.map((c, i) => ({ key: c.categoria, label: c.categoria, value: c.eur, color: colorPorIndice(i) }))} format={fEUR} />
                        </PanelCard>
                      </div>
                    )}
                    <p className="text-[11px] text-cacao-mute">Los <strong>insumos</strong> se cuentan arriba (Compras de Cocina); por eso aquí se excluye la categoría “Insumos” de Egresos para no duplicar. Las <strong>cortesías</strong> ({fEUR(gastos.cortesias)}) no se suman: son venta regalada, no un gasto. Egresos en €.</p>
                  </>
                )}
              </section>
            );
          })()}

          <p className="text-[11px] text-cacao-soft italic">El costo de insumos vs las ventas (food cost %) y la utilidad real están en la pestaña <strong>Resumen</strong>.</p>
        </>
      )}
    </div>
  );
}

function CompraCard({ titulo, valor, sub, tono }: { titulo: string; valor: string; sub?: string; tono?: "bien" | "alerta" }) {
  const color = tono === "bien" ? "text-[#2F4A1F]" : tono === "alerta" ? "text-[#7A5A18]" : "text-cacao";
  return (
    <div className="rounded-xl bg-white ring-1 ring-marfil p-3">
      <div className="text-[9px] uppercase tracking-widest text-cacao-mute leading-tight">{titulo}</div>
      <div className={`mt-0.5 font-cinzel text-base leading-tight break-words ${color}`}>{valor}</div>
      {sub && <div className="text-[11px] text-cacao-soft mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

// ── Subcomponentes (iguales a Análisis de Ventas) ──────────────────────
function StatCard({ titulo, valor, sub, tono }: { titulo: string; valor: string; sub?: string; tono?: "bien" | "alerta" }) {
  const color = tono === "bien" ? "text-[#2F4A1F]" : tono === "alerta" ? "text-[#7A5A18]" : "text-cacao";
  return (
    <div className="rounded-xl bg-white ring-1 ring-marfil p-3">
      <div className="text-[9px] uppercase tracking-widest text-cacao-mute leading-tight">{titulo}</div>
      <div className={`mt-0.5 font-cinzel text-base leading-tight break-words ${color}`}>{valor}</div>
      {sub && <div className="text-[11px] text-cacao-soft mt-0.5 leading-tight">{sub}</div>}
    </div>
  );
}

function SortableTh({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <th className="py-2 font-normal text-right">
      <button type="button" onClick={onClick} className={`uppercase tracking-widest text-[11px] hover:text-cacao ${active ? "text-cacao" : "text-cacao-mute"}`} title="Ordenar de mayor a menor">
        {label} {active ? "↓" : ""}
      </button>
    </th>
  );
}

// ── Clasificar insumos (espejo de "Clasificar productos" de Ventas) ────────
function ClasificarInsumos({
  insumos,
  categorias,
  onAsignar,
  onCrear,
  onRenombrar,
  onBorrar,
  onExcluir,
}: {
  insumos: Insumo[];
  categorias: CategoriaInsumo[];
  onAsignar: (insumoId: string, categoria: string) => void;
  onCrear: (nombre: string) => void;
  onRenombrar: (id: string, viejo: string, nuevo: string) => void;
  onBorrar: (id: string) => void;
  onExcluir: (id: string, excluir: boolean) => void;
}) {
  const [busca, setBusca] = useState("");
  const [soloSin, setSoloSin] = useState(false);
  const [nuevaCat, setNuevaCat] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return insumos
      .filter((i) => i.activo)
      .filter((i) => (soloSin ? !i.categoriaCompra?.trim() : true))
      .filter((i) => (q ? i.nombre.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const sa = a.categoriaCompra?.trim() ? 1 : 0;
        const sb = b.categoriaCompra?.trim() ? 1 : 0;
        if (sa !== sb) return sa - sb; // sin clasificar primero
        return a.nombre.localeCompare(b.nombre);
      });
  }, [insumos, busca, soloSin]);

  return (
    <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Gestionar la lista de categorías */}
      <div className="lg:col-span-1 rounded-xl ring-1 ring-marfil p-3">
        <div className="text-[11px] uppercase tracking-widest text-cacao-soft mb-2">Categorías ({categorias.length})</div>
        {categorias.length === 0 && <p className="text-[12px] text-cacao-soft italic">Aún no hay categorías. Crea la primera abajo (o corre el SQL de semilla).</p>}
        <ul className="space-y-1 max-h-72 overflow-y-auto">
          {categorias.map((c) => (
            <li key={c.id} className="flex items-center gap-2 text-sm">
              {editId === c.id ? (
                <>
                  <input
                    autoFocus
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { onRenombrar(c.id, c.nombre, editNombre); setEditId(null); } if (e.key === "Escape") setEditId(null); }}
                    className="flex-1 min-w-0 rounded-lg ring-1 ring-marfil px-2 py-1 text-sm"
                  />
                  <button type="button" onClick={() => { onRenombrar(c.id, c.nombre, editNombre); setEditId(null); }} className="text-cacao-soft hover:text-cacao text-sm" title="Guardar">✓</button>
                  <button type="button" onClick={() => setEditId(null)} className="text-cacao-mute hover:text-cacao text-sm" title="Cancelar">✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 min-w-0 truncate text-cacao">{c.nombre}</span>
                  <button
                    type="button"
                    onClick={() => onExcluir(c.id, !c.excluirRanking)}
                    title={c.excluirRanking ? "Excluida de tops/Pareto — clic para incluir" : "Incluida en tops — clic para excluir de rankings"}
                    className={`text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded-full ring-1 ${c.excluirRanking ? "bg-marfil-soft text-cacao-soft ring-marfil" : "text-cacao-mute ring-transparent hover:ring-marfil"}`}
                  >
                    {c.excluirRanking ? "sin ranking" : "ranking"}
                  </button>
                  <button type="button" onClick={() => { setEditId(c.id); setEditNombre(c.nombre); }} className="text-cacao-mute hover:text-cacao text-sm" title="Renombrar">✎</button>
                  <button type="button" onClick={() => onBorrar(c.id)} className="text-cacao-mute hover:text-terracotta text-sm" title="Borrar">✕</button>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 mt-2">
          <input
            value={nuevaCat}
            onChange={(e) => setNuevaCat(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && nuevaCat.trim()) { onCrear(nuevaCat); setNuevaCat(""); } }}
            placeholder="Nueva categoría…"
            className="flex-1 min-w-0 rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
          />
          <button type="button" onClick={() => { onCrear(nuevaCat); setNuevaCat(""); }} disabled={!nuevaCat.trim()} className="rounded-lg bg-terracotta text-white px-3 py-2 text-sm disabled:opacity-40">Agregar</button>
        </div>
      </div>

      {/* Asignar categoría a cada insumo */}
      <div className="lg:col-span-2 rounded-xl ring-1 ring-marfil p-3">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar insumo…"
            className="flex-1 min-w-[160px] rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-cacao-soft cursor-pointer">
            <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} className="accent-cacao" />
            Solo sin clasificar
          </label>
        </div>
        {lista.length === 0 ? (
          <p className="text-sm text-cacao-soft italic p-4 text-center">Sin insumos que coincidan.</p>
        ) : (
          <div className="rounded-lg ring-1 ring-marfil overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-cacao-mute uppercase tracking-widest text-[11px] text-left">
                  <th className="py-1.5 px-2 font-normal">Insumo</th>
                  <th className="py-1.5 px-2 font-normal">Categoría</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((i) => (
                  <tr key={i.id} className="border-t border-marfil">
                    <td className="py-1 px-2 text-cacao">{i.nombre}</td>
                    <td className="py-1 px-2">
                      <select
                        value={i.categoriaCompra?.trim() && categorias.some((c) => c.nombre === i.categoriaCompra) ? i.categoriaCompra : ""}
                        onChange={(e) => onAsignar(i.id, e.target.value)}
                        className={`rounded-lg ring-1 px-2 py-1 text-sm bg-white ${i.categoriaCompra?.trim() ? "ring-marfil text-cacao" : "ring-amber-300 text-cacao-soft"}`}
                      >
                        <option value="">— Sin categoría —</option>
                        {categorias.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
