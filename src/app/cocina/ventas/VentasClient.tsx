"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Receta,
  Venta,
  PosClasificacion,
  TipoItem,
  Proveedor,
  Insumo,
} from "@/lib/types";
import { listRecetas } from "@/lib/data/recetas";
import { listProveedores, listInsumos } from "@/lib/data/cocina";
import {
  listVentasDiasCompletos,
  createVenta,
  createVentasBatch,
  deleteVenta,
  deleteVentasXetuxFechas,
  parseCSV,
  valoresMonto,
  clasificarFilas,
  listClasificacion,
  upsertClasificacion,
  deleteClasificacion,
  totalesVentasPorMes,
  type ClasificItem,
} from "@/lib/data/ventas";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { normalizarBusqueda } from "@/lib/text";
import { CalendarIcon, ChevronIcon, WarningIcon } from "@/components/icons";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";

/** Xetux nombra el archivo con la fecha en que se generó el reporte, ej.
 *  "Detallado_por_ProductoThu_Sep_03_22_25_34_VET_2026.xls" → 2026-09-03. El
 *  reporte por producto NO trae fechas por línea, así que esta es la única pista
 *  automática de la fecha del reporte. Devuelve YYYY-MM-DD o null. */
function fechaDesdeNombreXetux(nombre: string): string | null {
  const meses: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const m = nombre.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)_?(\d{1,2}).*?(\d{4})/i);
  if (!m) return null;
  const mm = meses[m[1].toLowerCase()];
  const dd = String(parseInt(m[2], 10)).padStart(2, "0");
  const yyyy = m[3];
  if (!mm || parseInt(dd, 10) < 1 || parseInt(dd, 10) > 31) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Fecha larga en español para los encabezados de grupo (ej. "21 jul 2026"). */
function fmtFecha(fecha: string): string {
  return new Date(fecha + "T00:00").toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Nombre del mes desde "YYYY-MM" (ej. "Agosto 2026"), sin depender de zona. */
function nombreMesVentas(iso: string): string {
  const [y, m] = iso.split("-").map((x) => parseInt(x, 10));
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${meses[m - 1] ?? ""} ${y}`;
}

// ID de lote (batch) para agrupar las ventas de un mismo import. Debe ser un
// UUID válido porque la columna ventas.batch_id es de tipo uuid.
function nuevoBatchId() {
  return crypto.randomUUID();
}

function todayISO() {
  return hoyISO();
}

type Tab = "registrar" | "importar" | "clasificacion" | "historial";

export function VentasClient() {
  const [tab, setTab] = useState<Tab>("registrar");
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  /** Ítem del POS que se está mapeando a un insumo directo (modal). */
  const [insumoDirectoItem, setInsumoDirectoItem] = useState<string | null>(
    null,
  );
  const [idInsumoSel, setIdInsumoSel] = useState("");
  const [idCantidad, setIdCantidad] = useState("1");
  const [idBuscar, setIdBuscar] = useState("");
  /** Modificador de sustitución: insumo que se DEVUELVE (opcional). */
  const [idSwapFrom, setIdSwapFrom] = useState("");
  /** Ítem del POS que se está mapeando a una receta (modal). */
  const [recetaMapItem, setRecetaMapItem] = useState<string | null>(null);
  const [rmRecetaSel, setRmRecetaSel] = useState("");
  const [rmExtraPapas, setRmExtraPapas] = useState(false);
  const [rmBuscar, setRmBuscar] = useState("");
  const [rmSwapFrom, setRmSwapFrom] = useState("");
  const [rmSwapTo, setRmSwapTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalesMes, setTotalesMes] = useState<Record<string, number>>({});
  const [tasaEurUsd, setTasaEurUsd] = useState(1.17);

  // Registro manual
  const [mFecha, setMFecha] = useState(todayISO());
  const [mRecetaId, setMRecetaId] = useState("");
  const [mCantidad, setMCantidad] = useState("1");
  const [mPrecio, setMPrecio] = useState("");
  const [saving, setSaving] = useState(false);

  // Importar
  const [iFecha, setIFecha] = useState(todayISO());
  // Fecha detectada en el nombre del archivo de Xetux (para avisarle al usuario).
  const [fechaDeArchivo, setFechaDeArchivo] = useState<string | null>(null);
  const [csvText, setCsvText] = useState("");
  const [clasif, setClasif] = useState<ClasificItem[] | null>(null);
  // Cómo interpretar la columna de dinero del CSV: total de línea o precio
  // unitario. Se inicializa con la adivinanza del parser y el usuario la puede
  // cambiar en el preview (viéndolo reflejado en los totales antes de confirmar).
  const [montoEsTotal, setMontoEsTotal] = useState(true);
  // Para reportes de varios días: usar la fecha de cada línea del archivo en vez
  // de una sola. Y opción de reemplazar lo ya cargado de esas fechas.
  const [usarFechaLinea, setUsarFechaLinea] = useState(false);
  const [reemplazarRango, setReemplazarRango] = useState(false);
  const [clasifs, setClasifs] = useState<PosClasificacion[]>([]);
  const [importing, setImporting] = useState(false);
  const [leyendoArchivo, setLeyendoArchivo] = useState(false);
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);
  // Colapsables del historial (por fecha). Guardamos solo las fechas que el
  // usuario abrió/cerró a mano; por defecto se abre la más reciente.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [r, v, c, p, ins, tm] = await Promise.all([
          listRecetas(),
          listVentasDiasCompletos(30),
          listClasificacion(),
          listProveedores(),
          listInsumos(),
          totalesVentasPorMes(),
        ]);
        if (!cancelled) {
          setRecetas(r);
          setVentas(v);
          setClasifs(c);
          setProveedores(p);
          setInsumos(ins);
          setTotalesMes(tm);
        }
        // Tasa €→USD del panel de Administración (misma conversión).
        try {
          const rt = await fetch("/api/admin/tasa", { cache: "no-store" });
          const dt = await rt.json();
          if (!cancelled && dt?.tasa) setTasaEurUsd(Number(dt.tasa));
        } catch {
          /* usa 1,17 por defecto */
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Error cargando");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRegistroManual(e: React.FormEvent) {
    e.preventDefault();
    if (!mRecetaId) return;
    // Validar la cantidad: una venta con cantidad 0/NaN/negativa descontaría
    // stock incorrectamente.
    const cant = Number(mCantidad);
    if (!Number.isFinite(cant) || cant <= 0) {
      setError("La cantidad debe ser un número mayor a 0.");
      return;
    }
    const precio = mPrecio ? Number(mPrecio) : undefined;
    if (precio !== undefined && (!Number.isFinite(precio) || precio < 0)) {
      setError("El precio no puede ser negativo.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const r = recetas.find((x) => x.id === mRecetaId);
      const nueva = await createVenta({
        fecha: mFecha,
        recetaId: mRecetaId,
        recetaNombre: r?.nombre ?? "—",
        cantidad: cant,
        precioUnitarioUsd: precio,
        totalUsd: precio ? cant * precio : undefined,
        fuente: "manual",
      });
      setVentas((prev) => [nueva, ...prev]);
      setMCantidad("1");
      setMPrecio("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  // Vendibles: no subrecetas y SOLO activas. Una receta desactivada ya no se
  // ofrece para registrar/clasificar ventas (antes seguía apareciendo y podía
  // descontar insumos de algo que ya no se vende).
  const recetasVendibles = useMemo(
    () => recetas.filter((r) => !r.esSubreceta && r.activo),
    [recetas],
  );

  function parsear(texto?: string) {
    setError(null);
    try {
      const filas = parseCSV(texto ?? csvText);
      if (filas.length === 0) {
        setError("No se pudo leer ninguna fila del archivo.");
        setClasif(null);
        return;
      }
      // Por defecto interpretamos la columna de dinero como TOTAL de línea: es
      // lo que trae el "detallado por producto" de Xetux (venta neta). Así el
      // caso común queda bien sin depender de adivinar el encabezado, y para
      // usar "precio por unidad" el usuario lo elige a propósito. Evita el bug
      // de tomar el total como unitario y multiplicarlo por la cantidad
      // (montos inflados).
      setMontoEsTotal(true);
      // Si el reporte trae fechas por línea (varios días), usarlas por defecto
      // y ofrecer reemplazar, para no estampar una sola fecha a todo.
      const conFechas = filas.filter((f) => f.fecha).length;
      const variosDias = new Set(filas.map((f) => f.fecha).filter(Boolean)).size > 1;
      setUsarFechaLinea(conFechas > 0 && variosDias);
      setReemplazarRango(conFechas > 0 && variosDias);
      setClasif(
        clasificarFilas(filas, recetasVendibles, clasifs, insumos, recetas),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error parseando CSV");
      setClasif(null);
    }
  }

  // Clasifica un ítem del POS (lo guarda y re-clasifica el preview).
  async function reclasificar(
    nombreOriginal: string,
    tipo: TipoItem,
    opts?: {
      recetaId?: string;
      extraRecetaId?: string;
      extraCantidad?: number;
      swapFromInsumoId?: string;
      swapToInsumoId?: string;
      insumoId?: string;
      cantidadPorUnidad?: number;
    },
  ) {
    setError(null);
    try {
      const saved = await upsertClasificacion({
        nombreOriginal,
        tipo,
        recetaId: opts?.recetaId,
        extraRecetaId: opts?.extraRecetaId,
        extraCantidad: opts?.extraCantidad,
        swapFromInsumoId: opts?.swapFromInsumoId,
        swapToInsumoId: opts?.swapToInsumoId,
        insumoId: opts?.insumoId,
        cantidadPorUnidad: opts?.cantidadPorUnidad,
      });
      const nuevos = [
        ...clasifs.filter((c) => c.nombreNorm !== saved.nombreNorm),
        saved,
      ];
      setClasifs(nuevos);
      if (clasif) {
        const filas = clasif.map((c) => c.fila);
        setClasif(
          clasificarFilas(filas, recetasVendibles, nuevos, insumos, recetas),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error clasificando");
    }
  }

  // Guarda/actualiza una clasificación del catálogo (con todos sus campos).
  async function saveClasif(
    nombreOriginal: string,
    next: {
      tipo: TipoItem;
      recetaId?: string;
      extraRecetaId?: string;
      extraCantidad?: number;
      insumoId?: string;
      cantidadPorUnidad?: number;
      proveedorId?: string;
      porcentajeAcuerdo?: number;
      swapFromInsumoId?: string;
      swapToInsumoId?: string;
    },
  ) {
    setError(null);
    try {
      const saved = await upsertClasificacion({ nombreOriginal, ...next });
      setClasifs((prev) => {
        const rest = prev.filter((c) => c.nombreNorm !== saved.nombreNorm);
        return [...rest, saved].sort((a, b) =>
          a.nombreOriginal.localeCompare(b.nombreOriginal),
        );
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    }
  }

  function abrirInsumoDirecto(nombre: string) {
    setIdBuscar("");
    // Prefill desde una clasificación guardada, si existe.
    const existente = clasifs.find((c) => c.nombreNorm === norm(nombre));
    setIdInsumoSel(existente?.insumoId ?? "");
    setIdCantidad(
      existente?.cantidadPorUnidad != null
        ? String(existente.cantidadPorUnidad)
        : "1",
    );
    setIdSwapFrom(existente?.swapFromInsumoId ?? "");
    setInsumoDirectoItem(nombre);
  }

  // Receta "Ración de papas fritas" (para el extra de los combos).
  const papasReceta = useMemo(
    () =>
      recetasVendibles.find((r) => {
        const n = r.nombre.toLowerCase();
        return n.includes("papas") && n.includes("frit");
      }),
    [recetasVendibles],
  );

  function nombreLlevaPapas(nombre: string): boolean {
    const n = nombre.toLowerCase();
    return n.includes("papas") && n.includes("frit");
  }

  const norm = (s: string) =>
    normalizarBusqueda(s).replace(/[^a-z0-9]/g, "");

  function abrirRecetaMap(nombre: string) {
    setRmBuscar("");
    // Prefill desde una clasificación guardada, si existe.
    const existente = clasifs.find((c) => c.nombreNorm === norm(nombre));
    setRmRecetaSel(existente?.recetaId ?? "");
    setRmSwapFrom(existente?.swapFromInsumoId ?? "");
    setRmSwapTo(existente?.swapToInsumoId ?? "");

    // Si el nombre trae "con papas fritas", pre-marcamos el extra y sugerimos
    // la receta base quitando ese texto.
    const llevaPapas = nombreLlevaPapas(nombre);
    setRmExtraPapas(
      existente ? !!existente.extraRecetaId : llevaPapas && !!papasReceta,
    );
    if (!existente && llevaPapas) {
      const base = nombre.replace(/con\s+papas\s+fritas?/i, "").trim();
      const nb = norm(base);
      const match = recetasVendibles.find(
        (r) => nb.length >= 4 && (norm(r.nombre).includes(nb) || nb.includes(norm(r.nombre))),
      );
      if (match) setRmRecetaSel(match.id);
    }

    // Si el nombre trae "leche de almendras", sugerimos la sustitución
    // leche entera → leche de almendras (si existen esos insumos).
    if (!existente && /almendra/i.test(nombre)) {
      const almendra = insumos.find((i) => /almendra/i.test(i.nombre));
      const entera = insumos.find(
        (i) => /leche/i.test(i.nombre) && !/almendra|coco|avena|soya|soja/i.test(i.nombre),
      );
      if (almendra) setRmSwapTo(almendra.id);
      if (entera) setRmSwapFrom(entera.id);
      // sugerir la receta base quitando "leche de almendras"
      const base = nombre.replace(/leche\s+de\s+almendras?/i, "").trim();
      const nb = norm(base);
      const match = recetasVendibles.find(
        (r) => nb.length >= 4 && (norm(r.nombre).includes(nb) || nb.includes(norm(r.nombre))),
      );
      if (match) setRmRecetaSel(match.id);
    }
    setRecetaMapItem(nombre);
  }

  async function confirmarRecetaMap() {
    if (!recetaMapItem || !rmRecetaSel) return;
    // Modificador sobre la receta base:
    //   • swap_from + swap_to → sustituir un insumo por otro.
    //   • swap_from sin swap_to → QUITAR ese insumo (ej. "sin pesto").
    // El swap_to solo tiene sentido si además se eligió el insumo a quitar.
    const from = rmSwapFrom || undefined;
    const to = from ? rmSwapTo || undefined : undefined;
    await reclasificar(recetaMapItem, "insumo", {
      recetaId: rmRecetaSel,
      extraRecetaId: rmExtraPapas && papasReceta ? papasReceta.id : undefined,
      extraCantidad: rmExtraPapas ? 1 : undefined,
      swapFromInsumoId: from,
      swapToInsumoId: to,
    });
    setRecetaMapItem(null);
  }

  async function confirmarInsumoDirecto() {
    if (!insumoDirectoItem || !idInsumoSel) return;
    const cant = Number(idCantidad);
    await reclasificar(insumoDirectoItem, "insumo_directo", {
      insumoId: idInsumoSel,
      cantidadPorUnidad: Number.isFinite(cant) && cant > 0 ? cant : 1,
      swapFromInsumoId: idSwapFrom || undefined,
    });
    setInsumoDirectoItem(null);
  }

  async function removeClasif(id: string) {
    setError(null);
    try {
      await deleteClasificacion(id);
      setClasifs((prev) => prev.filter((c) => c.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  const clasifsOrdenadas = useMemo(
    () =>
      [...clasifs].sort((a, b) =>
        a.nombreOriginal.localeCompare(b.nombreOriginal),
      ),
    [clasifs],
  );

  async function confirmarImport() {
    if (!clasif || clasif.length === 0) return;
    // Seguridad: no se confirma con nada sin clasificar. Si una venta entra
    // "sin clasificar" registra el ingreso pero NO descuenta stock, y eso
    // descuadraría el inventario en silencio. Hay que clasificar todo primero.
    const pendientes = clasif.filter((c) => c.tipo === "sin_clasificar").length;
    if (pendientes > 0) {
      setError(
        `Faltan ${pendientes} ítem(s) por clasificar. Clasifícalos antes de confirmar el importe.`,
      );
      return;
    }
    // Seguridad: un ítem clasificado como "insumo" cuya receta (o extra) no se
    // puede resolver —quedó sin vincular, o la receta se borró— entraría con
    // receta_id nulo y NO descontaría stock en silencio. Se frena para
    // reclasificar. (Las recetas inactivas SÍ resuelven, así que no caen aquí.)
    const recetaRota = clasif.filter(
      (c) =>
        c.tipo === "insumo" &&
        (!c.receta || (c.clasif?.extraRecetaId && !c.extraReceta)),
    );
    if (recetaRota.length > 0) {
      setError(
        `${recetaRota.length} ítem(s) están como receta pero su receta (o su extra) no se pudo resolver: ${recetaRota
          .map((c) => c.fila.nombre)
          .slice(0, 3)
          .join(", ")}${recetaRota.length > 3 ? "…" : ""}. Reclasifícalos antes de confirmar, o entrarían sin descontar stock.`,
      );
      return;
    }
    setError(null);
    setImporting(true);
    try {
      const batch = nuevoBatchId();
      // Reemplazo: borra lo ya cargado (xetux_csv) de las fechas del archivo,
      // para no duplicar ni dejar días mal fechados. Los triggers reponen stock.
      if (reemplazarRango && usarFechaLinea) {
        const fechas = Array.from(new Set(clasif.map((c) => c.fila.fecha).filter((f): f is string => !!f)));
        if (fechas.length > 0) await deleteVentasXetuxFechas(fechas);
      }
      // Se registran TODAS las filas. Los que no son insumo van sin receta
      // (receta_id null) → no descuentan stock, pero sí registran el ingreso.
      const ventasInput = clasif.map((c) => {
        const { total, precioUnitario } = valoresMonto(c.fila, montoEsTotal);
        return {
        fecha: usarFechaLinea && c.fila.fecha ? c.fila.fecha : iFecha,
        recetaId: c.tipo === "insumo" && c.receta ? c.receta.id : undefined,
        recetaNombre: c.receta?.nombre ?? c.insumo?.nombre ?? c.fila.nombre,
        cantidad: c.fila.cantidad,
        precioUnitarioUsd: precioUnitario,
        totalUsd: total,
        fuente: "xetux_csv" as const,
        batchId: batch,
        tipoItem: c.tipo,
        insumoId:
          c.tipo === "insumo_directo" && c.insumo ? c.insumo.id : undefined,
        insumoCantidad:
          c.tipo === "insumo_directo"
            ? (c.clasif?.cantidadPorUnidad ?? 1)
            : undefined,
        extraRecetaId:
          c.tipo === "insumo" && c.extraReceta ? c.extraReceta.id : undefined,
        extraCantidad:
          c.tipo === "insumo" && c.extraReceta
            ? (c.clasif?.extraCantidad ?? 1)
            : undefined,
        // swap_from: en 'insumo' es reemplazo en la receta; en
        // 'insumo_directo' es el insumo que se DEVUELVE (modificador).
        swapFromInsumoId:
          c.tipo === "insumo" || c.tipo === "insumo_directo"
            ? c.clasif?.swapFromInsumoId
            : undefined,
        swapToInsumoId:
          c.tipo === "insumo" ? c.clasif?.swapToInsumoId : undefined,
        };
      });
      const created = await createVentasBatch(ventasInput);
      // Si hubo reemplazo (o fechas de varios días), recargamos desde la BD para
      // reflejar los borrados/nuevas fechas con fidelidad; si no, basta con anteponer.
      if (reemplazarRango && usarFechaLinea) {
        const [v, tm] = await Promise.all([listVentasDiasCompletos(30), totalesVentasPorMes()]);
        setVentas(v);
        setTotalesMes(tm);
      } else {
        setVentas((prev) => [...created, ...prev]);
      }
      setCsvText("");
      setClasif(null);
      setUsarFechaLinea(false);
      setReemplazarRango(false);
      setTab("historial");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error importando");
    } finally {
      setImporting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteVenta(id);
      setVentas((prev) => prev.filter((v) => v.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  // Agrupa las ventas por fecha, conservando el orden (más recientes primero).
  // Cada grupo trae su total en USD para el encabezado.
  const ventasPorFecha = useMemo(() => {
    const map = new Map<string, Venta[]>();
    for (const v of ventas) {
      const arr = map.get(v.fecha);
      if (arr) arr.push(v);
      else map.set(v.fecha, [v]);
    }
    return Array.from(map.entries()).map(([fecha, items]) => ({
      fecha,
      items,
      totalUsd: items.reduce((s, v) => s + (v.totalUsd ?? 0), 0),
    }));
  }, [ventas]);

  function toggleGrupo(fecha: string, abiertoAhora: boolean) {
    setGruposAbiertos((prev) => ({ ...prev, [fecha]: !abiertoAhora }));
  }

  const insumoCount =
    clasif?.filter(
      (c) => c.tipo === "insumo" || c.tipo === "insumo_directo",
    ).length ?? 0;
  const noGestCount =
    clasif?.filter((c) => c.tipo === "servicio" || c.tipo === "consignacion")
      .length ?? 0;
  const sinClasCount =
    clasif?.filter((c) => c.tipo === "sin_clasificar").length ?? 0;
  const totalRows = clasif?.length ?? 0;

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { v: "registrar", l: "Registro manual" },
            { v: "importar", l: "Importar Xetux" },
            { v: "clasificacion", l: "Clasificación POS" },
            { v: "historial", l: "Historial" },
          ] as { v: Tab; l: string }[]
        ).map((t) => (
          <button
            key={t.v}
            onClick={() => setTab(t.v)}
            className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-widest ring-1 ${
              tab === t.v
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {/* TAB: Registro manual */}
      {tab === "registrar" && (
        <form
          onSubmit={handleRegistroManual}
          className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
            Registrar venta puntual
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Fecha
              <input
                type="date"
                value={mFecha}
                onChange={(e) => setMFecha(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Receta
              <select
                value={mRecetaId}
                onChange={(e) => setMRecetaId(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Selecciona —</option>
                {recetasVendibles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Cantidad vendida
              <input
                type="number"
                step="1"
                min="1"
                value={mCantidad}
                onChange={(e) => setMCantidad(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Precio unitario € (opcional)
              <input
                type="number"
                step="0.01"
                min="0"
                value={mPrecio}
                onChange={(e) => setMPrecio(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <div className="text-right">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Registrar venta"}
            </button>
          </div>
        </form>
      )}

      {/* TAB: Importar */}
      {tab === "importar" && (
        <div className="space-y-4">
          <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3">
            <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
              Importar cierre de Xetux
            </h2>
            <p className="text-xs text-cacao-soft italic font-serif">
              Sube el archivo de Xetux tal cual — acepta <strong>Excel</strong>{" "}
              (.xls/.xlsx) o CSV, y lo analiza solo. También puedes pegar el
              contenido. El sistema busca columnas tipo{" "}
              <strong>Producto</strong> y <strong>Cantidad</strong>.
            </p>
            <label className="text-sm text-cacao block">
              Fecha de la venta
              <input
                type="date"
                value={iFecha}
                onChange={(e) => setIFecha(e.target.value)}
                className="mt-1 w-full sm:w-48 rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            {fechaDeArchivo && (
              <p className="text-xs text-[#2F4A1F] -mt-1">Fecha tomada del nombre del archivo ({fmtFecha(fechaDeArchivo)}). Ajústala si no corresponde al día de las ventas.</p>
            )}
            <label className="text-sm text-cacao block">
              Archivo de Xetux (Excel .xls/.xlsx o CSV)
              <input
                type="file"
                accept=".csv,text/csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setError(null);
                  // El reporte por producto no trae fechas; si el nombre del
                  // archivo de Xetux tiene la fecha de generación, se usa como
                  // fecha de importación (el usuario la confirma abajo).
                  const detFecha = fechaDesdeNombreXetux(f.name);
                  setFechaDeArchivo(detFecha);
                  if (detFecha) setIFecha(detFecha);
                  const nombre = f.name.toLowerCase();
                  const esExcel =
                    nombre.endsWith(".xls") || nombre.endsWith(".xlsx");
                  if (esExcel) {
                    // Excel → lo convertimos a CSV en el servidor y analizamos.
                    setLeyendoArchivo(true);
                    try {
                      const res = await fetch("/api/xls-to-csv", {
                        method: "POST",
                        body: await f.arrayBuffer(),
                      });
                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        throw new Error(j.error ?? "No pude leer el Excel.");
                      }
                      const csv = await res.text();
                      setCsvText(csv);
                      parsear(csv);
                    } catch (err) {
                      setError(
                        err instanceof Error
                          ? err.message
                          : "Error leyendo el Excel.",
                      );
                    } finally {
                      setLeyendoArchivo(false);
                    }
                    return;
                  }
                  const reader = new FileReader();
                  reader.onload = () => {
                    const t = reader.result;
                    if (typeof t === "string") setCsvText(t);
                  };
                  reader.readAsText(f, "utf-8");
                }}
                className="mt-1 block text-sm text-cacao-soft"
              />
              {leyendoArchivo && (
                <span className="mt-1 block text-xs text-cacao-mute">
                  Leyendo Excel…
                </span>
              )}
            </label>
            <label className="text-sm text-cacao block">
              O pega el contenido directo
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                rows={8}
                placeholder="Producto,Cantidad,Precio&#10;Latte,15,3.50&#10;Mango Sunrise,8,7.50"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 font-mono text-xs"
              />
            </label>
            <div className="text-right">
              <button
                type="button"
                onClick={() => parsear()}
                disabled={!csvText.trim()}
                className="rounded-lg bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                Analizar →
              </button>
            </div>
          </section>

          {clasif && (
            <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
                  Preview · {totalRows} ítems
                </h3>
                <button
                  onClick={confirmarImport}
                  disabled={importing || totalRows === 0 || sinClasCount > 0}
                  title={
                    sinClasCount > 0
                      ? "Clasifica todos los ítems antes de confirmar"
                      : undefined
                  }
                  className="rounded-lg bg-cacao text-white px-4 py-2 text-sm font-medium hover:bg-terracotta disabled:opacity-50"
                >
                  {importing ? "Importando..." : "Confirmar import →"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 text-xs mb-3">
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
                  {insumoCount} insumo (descuenta stock)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 ring-1 ring-sky-200">
                  {noGestCount} no gestionados (servicio/consignación)
                </span>
                {sinClasCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-300">
                    {sinClasCount} sin clasificar
                  </span>
                )}
              </div>
              {sinClasCount > 0 && (
                <p className="text-xs text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-lg p-2 mb-3 font-serif">
                  Hay <strong>{sinClasCount} ítem(s) sin clasificar</strong>. No
                  puedes confirmar el importe hasta clasificarlos todos, para que
                  ninguna venta entre sin descontar su stock. Clasifícalos abajo
                  (insumo, insumo directo, servicio o consignación) y el botón se
                  habilitará.
                </p>
              )}
              <div className="mb-3 rounded-lg bg-marfil-soft ring-1 ring-marfil p-3">
                <p className="text-xs text-cacao font-medium mb-1">
                  La columna de dinero del archivo es…
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMontoEsTotal(true)}
                    className={
                      montoEsTotal
                        ? "rounded-lg bg-cacao text-white px-3 py-1.5 text-xs font-medium"
                        : "rounded-lg ring-1 ring-marfil bg-white px-3 py-1.5 text-xs text-cacao hover:bg-white"
                    }
                  >
                    Total de línea (venta neta)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMontoEsTotal(false)}
                    className={
                      !montoEsTotal
                        ? "rounded-lg bg-cacao text-white px-3 py-1.5 text-xs font-medium"
                        : "rounded-lg ring-1 ring-marfil bg-white px-3 py-1.5 text-xs text-cacao hover:bg-white"
                    }
                  >
                    Precio por unidad
                  </button>
                </div>
                <p className="text-[11px] text-cacao-mute mt-1.5">
                  Revisa los totales de abajo y elige el que cuadre con tu
                  reporte. En el &ldquo;detallado por producto&rdquo; de Xetux es{" "}
                  <strong>total de línea</strong>.
                </p>
                {!montoEsTotal && (
                  <p className="text-[11px] text-terracotta mt-1.5 flex items-start gap-1">
                    <WarningIcon className="inline size-3.5 shrink-0 mt-[1px]" />
                    <span>
                      Estás interpretando la columna como{" "}
                      <strong>precio por unidad</strong>: el sistema la
                      multiplicará por la cantidad. En el reporte de Xetux por
                      producto casi siempre es <strong>total de línea</strong>.
                      Confirma que los totales de abajo cuadren con tu reporte
                      antes de importar.
                    </span>
                  </p>
                )}
              </div>
              {clasif.some((c) => c.fila.fecha) && (
                <div className="mb-3 rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 space-y-2">
                  <label className="flex items-start gap-2 text-xs text-cacao">
                    <input type="checkbox" checked={usarFechaLinea} onChange={(e) => setUsarFechaLinea(e.target.checked)} className="mt-0.5 accent-[#2F4A1F]" />
                    <span>Usar la <strong>fecha de cada línea</strong> del archivo (para reportes de varios días). Se ignora la “Fecha de la venta” de arriba.</span>
                  </label>
                  {usarFechaLinea && (
                    <label className="flex items-start gap-2 text-xs text-cacao">
                      <input type="checkbox" checked={reemplazarRango} onChange={(e) => setReemplazarRango(e.target.checked)} className="mt-0.5 accent-[#2F4A1F]" />
                      <span><strong>Reemplazar</strong> las ventas ya cargadas de esas fechas (borra lo anterior de esos días y lo deja igual al reporte; evita duplicados).</span>
                    </label>
                  )}
                  {usarFechaLinea && (() => {
                    const porDia: Record<string, number> = {};
                    clasif.forEach((c) => { const f = c.fila.fecha; if (!f) return; porDia[f] = (porDia[f] ?? 0) + (valoresMonto(c.fila, montoEsTotal).total ?? 0); });
                    const dias = Object.keys(porDia).sort();
                    const total = dias.reduce((s, d) => s + porDia[d], 0);
                    const f2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                    return (
                      <div className="text-[11px] text-cacao-soft border-t border-[#C9D6BC] pt-2">
                        <p className="mb-1">Totales por día que se importarán (verifica contra tu reporte):</p>
                        <ul className="space-y-0.5">
                          {dias.map((d) => (<li key={d} className="flex justify-between tabular-nums"><span>{d}</span><span>{f2(porDia[d])} €</span></li>))}
                        </ul>
                        <div className="flex justify-between tabular-nums font-medium text-cacao border-t border-[#C9D6BC] mt-1 pt-1"><span>Total</span><span>{f2(total)} €</span></div>
                      </div>
                    );
                  })()}
                </div>
              )}
              <ul className="divide-y divide-marfil text-sm">
                {clasif.map((c, i) => {
                  const mv = valoresMonto(c.fila, montoEsTotal);
                  return (
                  <li
                    key={i}
                    className={`py-2 grid grid-cols-12 gap-2 items-center ${
                      c.tipo === "sin_clasificar" ? "bg-amber-50/60 -mx-2 px-2 rounded" : ""
                    }`}
                  >
                    <div className="col-span-4 text-cacao">{c.fila.nombre}</div>
                    <div className="col-span-1 text-cacao-soft text-xs">
                      ×{c.fila.cantidad}
                    </div>
                    <div className="col-span-2 text-cacao-soft text-xs">
                      {mv.total != null ? (
                        <>
                          {mv.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          {mv.precioUnitario != null && (
                            <span className="block text-[10px] text-cacao-mute">
                              {mv.precioUnitario.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € c/u
                            </span>
                          )}
                        </>
                      ) : (
                        ""
                      )}
                    </div>
                    <div className="col-span-5 flex flex-wrap gap-1 justify-end items-center">
                      {c.tipo === "insumo" ? (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
                            → {c.receta?.nombre ?? "insumo"}
                            {c.extraReceta ? ` + ${c.extraReceta.nombre}` : ""}
                            {c.swapFrom
                              ? c.swapTo
                                ? ` (${c.swapFrom.nombre}→${c.swapTo.nombre})`
                                : ` (sin ${c.swapFrom.nombre})`
                              : ""}
                          </span>
                          <button
                            onClick={() => abrirRecetaMap(c.fila.nombre)}
                            className="text-[11px] text-cacao-mute hover:text-terracotta underline"
                          >
                            editar
                          </button>
                        </>
                      ) : c.tipo === "insumo_directo" ? (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">
                            → {c.insumo?.nombre ?? "insumo"} (directo)
                            {c.swapFrom
                              ? ` · devuelve ${c.swapFrom.nombre}`
                              : ""}
                          </span>
                          <button
                            onClick={() => reclasificar(c.fila.nombre, "sin_clasificar")}
                            className="text-[11px] text-cacao-mute hover:text-terracotta underline"
                          >
                            cambiar
                          </button>
                        </>
                      ) : c.tipo === "servicio" || c.tipo === "consignacion" ? (
                        <>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 ring-1 ring-sky-200">
                            {c.tipo === "servicio" ? "Servicio" : "Consignación"}
                          </span>
                          <button
                            onClick={() => reclasificar(c.fila.nombre, "sin_clasificar")}
                            className="text-[11px] text-cacao-mute hover:text-terracotta underline"
                          >
                            cambiar
                          </button>
                        </>
                      ) : (
                        <>
                          {c.sugerencia && (
                            <button
                              onClick={() =>
                                reclasificar(c.fila.nombre, "insumo", {
                                  recetaId: c.sugerencia!.id,
                                })
                              }
                              className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-100"
                            >
                              ¿{c.sugerencia.nombre}?
                            </button>
                          )}
                          <button
                            onClick={() => abrirRecetaMap(c.fila.nombre)}
                            className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-emerald-200 text-emerald-800 hover:bg-emerald-50"
                          >
                            Receta…
                          </button>
                          <button
                            onClick={() => abrirInsumoDirecto(c.fila.nombre)}
                            className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-emerald-200 text-emerald-800 hover:bg-emerald-50"
                          >
                            Insumo directo
                          </button>
                          <button
                            onClick={() => reclasificar(c.fila.nombre, "servicio")}
                            className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-sky-200 text-sky-800 hover:bg-sky-50"
                          >
                            Servicio
                          </button>
                          <button
                            onClick={() => reclasificar(c.fila.nombre, "consignacion")}
                            className="text-[11px] px-2 py-0.5 rounded-full ring-1 ring-sky-200 text-sky-800 hover:bg-sky-50"
                          >
                            Consignación
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* TAB: Clasificación POS */}
      {tab === "clasificacion" && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-1">
            Clasificación de ítems del POS
          </h2>
          <p className="text-xs text-cacao-soft italic font-serif mb-4">
            Administra cómo se trata cada ítem del reporte: si descuenta
            inventario (insumo) o si es servicio/consignación (solo registra
            ingreso). En consignación puedes guardar el proveedor y el % de
            acuerdo para futuras liquidaciones.
          </p>
          {clasifsOrdenadas.length === 0 ? (
            <p className="font-serif italic text-cacao-soft text-sm">
              Todavía no hay ítems clasificados. Se crean al importar un cierre
              de Xetux (clasificando los que salen en ámbar).
            </p>
          ) : (
            <ul className="divide-y divide-marfil">
              {clasifsOrdenadas.map((c) => (
                <li
                  key={c.id}
                  className="py-3 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:items-center"
                >
                  <div className="sm:col-span-4 text-sm text-cacao font-medium">
                    {c.nombreOriginal}
                  </div>
                  <div className="sm:col-span-2">
                    <select
                      value={c.tipo}
                      onChange={(e) => {
                        const t = e.target.value as TipoItem;
                        saveClasif(c.nombreOriginal, {
                          tipo: t,
                          recetaId: t === "insumo" ? c.recetaId : undefined,
                          insumoId:
                            t === "insumo_directo" ? c.insumoId : undefined,
                          cantidadPorUnidad:
                            t === "insumo_directo"
                              ? (c.cantidadPorUnidad ?? 1)
                              : undefined,
                          proveedorId:
                            t === "consignacion" ? c.proveedorId : undefined,
                          porcentajeAcuerdo:
                            t === "consignacion"
                              ? c.porcentajeAcuerdo
                              : undefined,
                        });
                      }}
                      className="w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                    >
                      <option value="insumo">Insumo (receta)</option>
                      <option value="insumo_directo">Insumo directo</option>
                      <option value="servicio">Servicio</option>
                      <option value="consignacion">Consignación</option>
                      <option value="sin_clasificar">Sin clasificar</option>
                    </select>
                  </div>
                  <div className="sm:col-span-5">
                    {c.tipo === "insumo" ? (
                      <div className="flex flex-col gap-1">
                        <select
                          value={c.recetaId ?? ""}
                          onChange={(e) =>
                            saveClasif(c.nombreOriginal, {
                              tipo: "insumo",
                              recetaId: e.target.value || undefined,
                              extraRecetaId: c.extraRecetaId,
                              extraCantidad: c.extraCantidad,
                              // Preservar la sustitución al editar la receta inline.
                              swapFromInsumoId: c.swapFromInsumoId,
                              swapToInsumoId: c.swapToInsumoId,
                            })
                          }
                          className="w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Vincular receta —</option>
                          {recetasVendibles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.nombre}
                            </option>
                          ))}
                        </select>
                        <select
                          value={c.extraRecetaId ?? ""}
                          onChange={(e) =>
                            saveClasif(c.nombreOriginal, {
                              tipo: "insumo",
                              recetaId: c.recetaId,
                              extraRecetaId: e.target.value || undefined,
                              extraCantidad: e.target.value ? 1 : undefined,
                              // Preservar la sustitución al editar el extra inline.
                              swapFromInsumoId: c.swapFromInsumoId,
                              swapToInsumoId: c.swapToInsumoId,
                            })
                          }
                          className="w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-xs bg-white text-cacao-soft"
                        >
                          <option value="">— Sin extra —</option>
                          {recetasVendibles.map((r) => (
                            <option key={r.id} value={r.id}>
                              + {r.nombre}
                            </option>
                          ))}
                        </select>
                        {c.swapFromInsumoId &&
                          (() => {
                            const sf = insumos.find(
                              (i) => i.id === c.swapFromInsumoId,
                            );
                            if (!sf) return null;
                            const st = c.swapToInsumoId
                              ? insumos.find((i) => i.id === c.swapToInsumoId)
                              : null;
                            return (
                              <div
                                className="text-[11px] text-cacao-soft pl-0.5"
                                title="Sustitución que se aplica al descontar stock"
                              >
                                ↺ {st ? `${sf.nombre} → ${st.nombre}` : `sin ${sf.nombre}`}
                              </div>
                            );
                          })()}
                      </div>
                    ) : c.tipo === "insumo_directo" ? (
                      <div className="flex gap-2">
                        <select
                          value={c.insumoId ?? ""}
                          onChange={(e) =>
                            saveClasif(c.nombreOriginal, {
                              tipo: "insumo_directo",
                              insumoId: e.target.value || undefined,
                              cantidadPorUnidad: c.cantidadPorUnidad ?? 1,
                              swapFromInsumoId: c.swapFromInsumoId,
                            })
                          }
                          className="flex-1 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Vincular insumo —</option>
                          {insumos
                            .filter((i) => i.activo)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.nombre}
                              </option>
                            ))}
                        </select>
                        <div className="flex items-center rounded-lg ring-1 ring-marfil px-2 w-24">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            defaultValue={c.cantidadPorUnidad ?? 1}
                            title="Cantidad por unidad vendida"
                            onBlur={(e) =>
                              saveClasif(c.nombreOriginal, {
                                tipo: "insumo_directo",
                                insumoId: c.insumoId,
                                cantidadPorUnidad:
                                  e.target.value === ""
                                    ? 1
                                    : Number(e.target.value),
                                swapFromInsumoId: c.swapFromInsumoId,
                              })
                            }
                            className="w-full py-1.5 text-sm outline-none bg-transparent"
                          />
                          <span className="text-[10px] text-cacao-mute">/u</span>
                        </div>
                      </div>
                    ) : c.tipo === "consignacion" ? (
                      <div className="flex gap-2">
                        <select
                          value={c.proveedorId ?? ""}
                          onChange={(e) =>
                            saveClasif(c.nombreOriginal, {
                              tipo: "consignacion",
                              proveedorId: e.target.value || undefined,
                              porcentajeAcuerdo: c.porcentajeAcuerdo,
                            })
                          }
                          className="flex-1 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                        >
                          <option value="">— Proveedor —</option>
                          {proveedores.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                        </select>
                        <div className="flex items-center rounded-lg ring-1 ring-marfil px-2 w-24">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            defaultValue={c.porcentajeAcuerdo ?? ""}
                            placeholder="%"
                            onBlur={(e) =>
                              saveClasif(c.nombreOriginal, {
                                tipo: "consignacion",
                                proveedorId: c.proveedorId,
                                porcentajeAcuerdo:
                                  e.target.value === ""
                                    ? undefined
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full py-1.5 text-sm outline-none bg-transparent"
                          />
                          <span className="text-xs text-cacao-mute">%</span>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-cacao-soft italic">
                        Solo registra ingreso, no toca inventario.
                      </span>
                    )}
                  </div>
                  <div className="sm:col-span-1 text-right">
                    <button
                      onClick={() => removeClasif(c.id)}
                      className="text-[10px] uppercase tracking-widest text-cacao-mute hover:text-terracotta"
                    >
                      Quitar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* TAB: Historial */}
      {tab === "historial" && (
        <div className="space-y-4">
          {Object.keys(totalesMes).length > 0 && (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <div className="font-display text-[9px] tracking-[0.25em] uppercase text-cacao-mute mb-2">
                Total por mes <span className="normal-case tracking-normal text-cacao-mute">(euros · ≈ $ a {tasaEurUsd.toString()})</span>
              </div>
              <ul className="divide-y divide-marfil">
                {Object.entries(totalesMes)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([mes, total]) => (
                    <li key={mes} className="flex justify-between py-1.5 text-sm">
                      <span className="text-cacao-soft">{nombreMesVentas(mes)}</span>
                      <span className="text-cacao font-medium tabular-nums text-right">
                        {total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        <span className="block text-[11px] text-cacao-mute font-normal">≈ ${(total * tasaEurUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
          {loading ? (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
              Cargando...
            </div>
          ) : ventas.length === 0 ? (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
              <p className="font-serif italic text-cacao-soft">
                Sin ventas registradas todavía.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden divide-y divide-marfil">
              {ventasPorFecha.map((grupo, idx) => {
                const abierto = gruposAbiertos[grupo.fecha] ?? idx === 0;
                return (
                  <div key={grupo.fecha}>
                    <button
                      type="button"
                      onClick={() => toggleGrupo(grupo.fecha, abierto)}
                      aria-expanded={abierto}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-marfil-soft transition-colors"
                    >
                      <ChevronIcon
                        className={`size-4 text-cacao-mute transition-transform ${
                          abierto ? "rotate-90" : ""
                        }`}
                      />
                      <CalendarIcon className="size-4 text-cacao-mute" />
                      <span className="font-medium text-cacao">
                        {fmtFecha(grupo.fecha)}
                      </span>
                      <span className="text-xs text-cacao-mute">
                        {grupo.items.length}{" "}
                        {grupo.items.length === 1 ? "venta" : "ventas"}
                      </span>
                      <span className="ml-auto text-sm text-cacao font-medium text-right">
                        {grupo.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                        <span className="block text-[10px] text-cacao-mute font-normal">≈ ${(grupo.totalUsd * tasaEurUsd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    </button>
                    {abierto && (
                      <ul className="divide-y divide-marfil border-t border-marfil">
                        {grupo.items.map((v) => (
                          <li
                            key={v.id}
                            className="p-4 pl-11 flex flex-wrap items-start justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-cacao flex items-center gap-2 flex-wrap">
                                {v.recetaNombre}
                                {v.tipoItem && v.tipoItem !== "insumo" && (
                                  <span
                                    className={`text-[10px] px-2 py-0.5 rounded-full ring-1 ${
                                      v.tipoItem === "sin_clasificar"
                                        ? "bg-amber-50 text-amber-800 ring-amber-300"
                                        : "bg-sky-50 text-sky-800 ring-sky-200"
                                    }`}
                                  >
                                    {v.tipoItem === "servicio"
                                      ? "Servicio"
                                      : v.tipoItem === "consignacion"
                                        ? "Consignación"
                                        : v.tipoItem === "insumo_directo"
                                          ? "Insumo directo"
                                          : "Sin clasificar"}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-cacao-soft mt-0.5">
                                {v.fuente === "xetux_csv"
                                  ? "Importado Xetux"
                                  : "Manual"}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="text-cacao font-medium">
                                {v.cantidad}× ·{" "}
                                {v.totalUsd ? `${v.totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : ""}
                              </div>
                              <button
                                onClick={() => setPendienteBorrar(v.id)}
                                className="mt-1 text-[10px] uppercase tracking-widest text-cacao-mute hover:text-terracotta"
                              >
                                Borrar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Eliminar esta venta?"
        message={<>El stock se va a revertir automáticamente.</>}
        onConfirm={() => {
          if (pendienteBorrar) handleDelete(pendienteBorrar);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />

      {/* Modal: mapear ítem del POS a un insumo directo */}
      {insumoDirectoItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-cacao/40 backdrop-blur-sm overflow-y-auto"
          onClick={() => setInsumoDirectoItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-8 rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Insumo directo
            </h2>
            <p className="mt-1 text-sm text-cacao-soft font-serif">
              Vincula{" "}
              <strong className="text-cacao">{insumoDirectoItem}</strong> a un
              insumo del inventario. Al venderlo, descuenta esa cantidad del
              insumo (ideal para bebidas y reventa, sin crear receta).
            </p>

            <label className="block mt-4 text-sm text-cacao">
              Buscar insumo
              <input
                type="text"
                value={idBuscar}
                onChange={(e) => setIdBuscar(e.target.value)}
                placeholder="Ej. Pepsi, Agua…"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>

            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg ring-1 ring-marfil divide-y divide-marfil">
              {insumos
                .filter(
                  (i) =>
                    i.activo &&
                    (idBuscar.trim() === "" ||
                      normalizarBusqueda(i.nombre).includes(
                        normalizarBusqueda(idBuscar),
                      )),
                )
                .slice(0, 60)
                .map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIdInsumoSel(i.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-marfil-soft ${
                      idInsumoSel === i.id
                        ? "bg-emerald-50 text-emerald-900"
                        : "text-cacao"
                    }`}
                  >
                    {i.nombre}
                    <span className="text-cacao-mute text-xs">
                      {" "}
                      · {i.unidadBase}
                    </span>
                  </button>
                ))}
            </div>

            <label className="block mt-4 text-sm text-cacao">
              Cantidad a descontar por unidad vendida
              <input
                type="number"
                step="any"
                min="0"
                value={idCantidad}
                onChange={(e) => setIdCantidad(e.target.value)}
                className="mt-1 w-32 rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <span className="block text-[11px] text-cacao-mute mt-1">
                Normalmente 1 (una venta = una unidad del insumo). Para
                modificadores por volumen (ej. leche), pon la cantidad de la
                receta en la unidad base del insumo.
              </span>
            </label>

            {/* Modificador de sustitución: devolver otro insumo */}
            <div className="mt-4 rounded-lg ring-1 ring-marfil p-3">
              <p className="text-sm text-cacao font-medium">
                Devolver otro insumo{" "}
                <span className="text-cacao-mute font-normal">(opcional)</span>
              </p>
              <p className="text-[11px] text-cacao-soft mb-2">
                Para modificadores tipo “+X en vez de Y” (ej. + leche de
                almendras): además de descontar el de arriba, devuelve este otro
                (la leche completa que la receta ya descontó), en la misma
                cantidad.
              </p>
              <select
                value={idSwapFrom}
                onChange={(e) => setIdSwapFrom(e.target.value)}
                className="w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
              >
                <option value="">— No devolver nada —</option>
                {insumos
                  .filter((i) => i.activo && i.id !== idInsumoSel)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nombre}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setInsumoDirectoItem(null)}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarInsumoDirecto}
                disabled={!idInsumoSel}
                className="rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: mapear ítem del POS a una receta (+ extra opcional) */}
      {recetaMapItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-cacao/40 backdrop-blur-sm overflow-y-auto"
          onClick={() => setRecetaMapItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-8 rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Vincular a receta
            </h2>
            <p className="mt-1 text-sm text-cacao-soft font-serif">
              <strong className="text-cacao">{recetaMapItem}</strong> descuenta
              los insumos de la receta que elijas.
            </p>

            <label className="block mt-4 text-sm text-cacao">
              Buscar receta
              <input
                type="text"
                value={rmBuscar}
                onChange={(e) => setRmBuscar(e.target.value)}
                placeholder="Ej. Prosciutto, Falafel…"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>

            <div className="mt-2 max-h-52 overflow-y-auto rounded-lg ring-1 ring-marfil divide-y divide-marfil">
              {recetasVendibles
                .filter(
                  (r) =>
                    rmBuscar.trim() === "" ||
                    normalizarBusqueda(r.nombre).includes(
                      normalizarBusqueda(rmBuscar),
                    ),
                )
                .slice(0, 60)
                .map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRmRecetaSel(r.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-marfil-soft ${
                      rmRecetaSel === r.id
                        ? "bg-emerald-50 text-emerald-900"
                        : "text-cacao"
                    }`}
                  >
                    {r.nombre}
                  </button>
                ))}
            </div>

            {papasReceta && (
              <label className="flex items-start gap-2 mt-4 rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rmExtraPapas}
                  onChange={(e) => setRmExtraPapas(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-cacao"
                />
                <span className="text-sm text-cacao">
                  + Ración de papas fritas
                  <span className="block text-xs text-cacao-soft">
                    Para combos con papas fritas: descuenta además una ración de
                    papas, sin duplicar la receta del sándwich.
                  </span>
                </span>
              </label>
            )}

            {/* Quitar o sustituir un insumo (ej. "sin pesto" o leche → almendras) */}
            <div className="mt-4 rounded-lg ring-1 ring-marfil p-3">
              <p className="text-sm text-cacao font-medium">
                Quitar o sustituir un insumo{" "}
                <span className="text-cacao-mute font-normal">(opcional)</span>
              </p>
              <p className="text-[11px] text-cacao-soft mb-2">
                Usa la misma receta pero quita un insumo, o cámbialo por otro.
                Elige el insumo a quitar; si además pones un reemplazo, lo
                sustituye. Ej.: <b>sin pesto</b>, o leche entera → almendras.
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={rmSwapFrom}
                  onChange={(e) => setRmSwapFrom(e.target.value)}
                  className="flex-1 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— Insumo a quitar / cambiar —</option>
                  {insumos
                    .filter((i) => i.activo)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                </select>
                <span className="text-cacao-mute">→</span>
                <select
                  value={rmSwapTo}
                  onChange={(e) => setRmSwapTo(e.target.value)}
                  disabled={!rmSwapFrom}
                  className="flex-1 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm bg-white disabled:opacity-50"
                >
                  <option value="">— Reemplazo (vacío = quitar) —</option>
                  {insumos
                    .filter((i) => i.activo)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                </select>
              </div>
              {rmSwapFrom && (
                <p className="text-[11px] text-cacao-soft mt-1">
                  {rmSwapTo ? (
                    <>
                      Se cambiará{" "}
                      <b>{insumos.find((i) => i.id === rmSwapFrom)?.nombre}</b> →{" "}
                      <b>{insumos.find((i) => i.id === rmSwapTo)?.nombre}</b>.
                    </>
                  ) : (
                    <>
                      Se quitará{" "}
                      <b>{insumos.find((i) => i.id === rmSwapFrom)?.nombre}</b> de
                      la receta (no se descuenta).
                    </>
                  )}
                </p>
              )}
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRecetaMapItem(null)}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRecetaMap}
                disabled={!rmRecetaSel}
                className="rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                Vincular
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
