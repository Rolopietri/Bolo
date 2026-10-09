"use client";

import { useEffect, useMemo, useState } from "react";
import {
  frescuraPrecio,
  type Insumo,
  type NivelFrescuraPrecio,
  type Proveedor,
} from "@/lib/types";
import {
  listInsumos,
  createInsumo,
  updateInsumo,
  deleteInsumo,
  actualizarPrecioInsumo,
  listProveedores,
  createProveedor,
} from "@/lib/data/cocina";
import {
  listCategoriasInsumo,
  type CategoriaInsumo,
} from "@/lib/data/categoriasInsumo";
import { UnitCalculator } from "@/components/UnitCalculator";
import { PresentacionPicker } from "@/components/PresentacionPicker";
import { CantidadUnidad, factorDe } from "@/components/CantidadUnidad";
import { leerPresentacion, SUELTO, TIPOS_PRESENTACION } from "@/lib/presentacion";
import {
  convert,
  areCompatible,
  canonica,
  displayCantidad,
  getUnit,
  opcionesCantidad,
  precioLegible,
} from "@/lib/units";
import { stockLibre } from "@/lib/types";
import { normalizarBusqueda } from "@/lib/text";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WarningIcon } from "@/components/icons";
import { PerdidaInsumoDialog } from "../_PerdidaInsumoDialog";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";
import { Importador, type CampoImport } from "@/components/Importador";

/** Columnas que el importador intenta reconocer en el Excel/CSV de insumos. */
const CAMPOS_INSUMO: CampoImport[] = [
  { key: "nombre", label: "Nombre", required: true, alias: ["producto", "insumo", "ingrediente", "descripcion", "articulo", "item"] },
  { key: "categoria", label: "Categoría", alias: ["rubro", "tipo", "grupo", "familia"] },
  { key: "unidadCompra", label: "Unidad de compra", alias: ["unidad", "medida", "um", "presentacion", "empaque"] },
  { key: "cantidadPorCompra", label: "Cantidad por compra", tipo: "numero", alias: ["cantidad", "cant", "contenido", "qty", "unidades"] },
  { key: "precioCompraUsd", label: "Precio (USD)", tipo: "numero", alias: ["precio", "costo", "monto", "valor", "total"] },
  { key: "stockTotal", label: "Stock inicial", tipo: "numero", alias: ["stock", "existencia", "inventario"] },
];

/**
 * Cuántas unidadBase hay en 1 unidadCompra cuando son convertibles.
 * Ej: ratioEsperado("kg", "g") = 1000.
 * Devuelve null si no son convertibles (ej unidadCompra="saco").
 */
function ratioEsperado(
  unidadCompra: string,
  unidadBase: string,
): number | null {
  if (!unidadCompra || !unidadBase) return null;
  if (!areCompatible(unidadCompra, unidadBase)) return null;
  return convert(1, unidadCompra, unidadBase);
}

/**
 * Detecta si el insumo tiene cantidadPorCompra incoherente con sus unidades.
 * Ej: unidadCompra="kg", unidadBase="g", pero cantidadPorCompra=1 → el precio
 * sale 1000× más alto de lo real. Devolvemos el ratio esperado para sugerir
 * el fix.
 */
function detectarInsumoConProblema(
  unidadCompra: string,
  unidadBase: string,
  cantidadPorCompra: number,
): { esperado: number } | null {
  const esperado = ratioEsperado(unidadCompra, unidadBase);
  if (esperado === null) return null;
  // Tolerancia 1% para evitar falsos positivos por redondeo
  const diff = Math.abs(cantidadPorCompra - esperado) / esperado;
  if (diff < 0.01) return null;
  return { esperado };
}

type FormState = {
  nombre: string;
  categoria: string;
  unidadCompra: string;
  cantidadPorCompra: string;
  unidadBase: string;
  precioCompraUsd: string;
  stockTotal: string;
  /** Unidad en que se escriben stock y mínimo: "compra" (la presentación) o
   *  una unidad estándar (kg, g…). Se convierte a unidad base al guardar. */
  stockUnidad: string;
  stockMinimo: string;
  mermaCoccionPorc: string;
  proveedorId: string;
  notas: string;
};

const emptyForm: FormState = {
  nombre: "",
  categoria: "",
  unidadCompra: "",
  cantidadPorCompra: "1",
  unidadBase: "",
  precioCompraUsd: "",
  stockTotal: "",
  stockUnidad: "compra",
  stockMinimo: "",
  mermaCoccionPorc: "",
  proveedorId: "",
  notas: "",
};

export function InsumosClient({
  onVerAlertas,
  onVerMermas,
  onVerHistorial,
  onConteoAlertas,
}: {
  onVerAlertas?: () => void;
  onVerMermas?: () => void;
  /** Abre la auditoría de stock filtrada a este insumo. */
  onVerHistorial?: (insumoId: string) => void;
  /** Reporta agotados + bajos (para el contador de la pestaña Alertas). */
  onConteoAlertas?: (n: number) => void;
} = {}) {
  const [items, setItems] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  // Presentaciones escritas a mano en otros insumos (ej. "Cesta"), para
  // ofrecerlas en el desplegable junto a las predeterminadas.
  const tiposEnUso = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      const t = leerPresentacion(i).tipo;
      if (t && t !== SUELTO && !/\d/.test(t) && !TIPOS_PRESENTACION.includes(t)) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Error al CARGAR la pantalla (distinto de los errores de guardar/borrar). */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [importando, setImportando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  // true cuando el usuario eligió "+ Nueva categoría…" en el desplegable.
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  // Alta de proveedor en línea desde el desplegable "Proveedor" del form.
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);
  const [pendienteDesactivar, setPendienteDesactivar] = useState<string | null>(
    null,
  );
  const [showInactivos, setShowInactivos] = useState(false);
  // Insumo al que se le va a registrar una pérdida (abre el modal).
  const [perdidaInsumo, setPerdidaInsumo] = useState<Insumo | null>(null);
  // Aviso tras registrar una pérdida, con acceso a la pestaña de Mermas.
  const [avisoPerdida, setAvisoPerdida] = useState(false);
  // Lista de categorías de insumo (tipo de materia prima). Se gestiona desde
  // Análisis de Compras → Clasificar insumos. Es la lista LIMPIA, separada de
  // las categorías de venta de Administración.
  const [categoriasInsumo, setCategoriasInsumo] = useState<CategoriaInsumo[]>([]);
  // Fecha de hoy (YYYY-MM-DD) para medir la frescura de cada precio.
  const hoy = useMemo(() => hoyISO(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ins, prov] = await Promise.all([
          listInsumos(),
          listProveedores(),
        ]);
        if (!cancelled) {
          setItems(ins);
          setProveedores(prov);
        }
        try {
          const cats = await listCategoriasInsumo();
          if (!cancelled) setCategoriasInsumo(cats);
        } catch {
          // tabla pendiente
        }
      } catch (e) {
        if (!cancelled)
          setErrorCarga(extractError(e, "Error cargando"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intento]);

  function reintentarCarga() {
    setLoading(true);
    setErrorCarga(null);
    setIntento((n) => n + 1);
  }

  async function importarInsumos(filas: Record<string, unknown>[]) {
    let ok = 0;
    let errores = 0;
    for (const f of filas) {
      try {
        const nombre = String(f.nombre ?? "").trim();
        if (!nombre) {
          errores++;
          continue;
        }
        const cantRaw =
          typeof f.cantidadPorCompra === "number"
            ? f.cantidadPorCompra
            : Number(f.cantidadPorCompra);
        const cant = Number.isFinite(cantRaw) && cantRaw > 0 ? cantRaw : 1;
        const precio =
          f.precioCompraUsd == null || f.precioCompraUsd === ""
            ? null
            : typeof f.precioCompraUsd === "number"
              ? f.precioCompraUsd
              : Number(f.precioCompraUsd);
        const precioOk = precio != null && Number.isFinite(precio) ? precio : null;
        const unidadCompra = String(f.unidadCompra ?? "").trim() || "unidad";
        const unidadBase = String(f.unidadBase ?? "").trim() || unidadCompra;
        const stockRaw =
          typeof f.stockTotal === "number" ? f.stockTotal : Number(f.stockTotal);
        const stock = Number.isFinite(stockRaw) ? stockRaw : 0;
        const nuevo = await createInsumo({
          nombre,
          categoria: "",
          categoriaCompra: String(f.categoria ?? "").trim() || undefined,
          unidadCompra,
          cantidadPorCompra: cant,
          unidadBase,
          precioCompraUsd: precioOk,
          precioBaseUsd: precioOk != null ? precioOk / cant : null,
          stockTotal: stock,
          stockComprometido: 0,
          stockMinimo: null,
          activo: true,
        });
        setItems((prev) => [...prev, nuevo]);
        ok++;
      } catch {
        errores++;
      }
    }
    return { ok, errores };
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setCreandoCategoria(false);
    setCreandoProveedor(false);
    setNuevoProveedor("");
    setEditingId(null);
    setAdding(false);
  }

  // Da de alta un proveedor mínimo (solo nombre) desde el form de insumo y lo
  // deja seleccionado. Los medios de pago y contacto se completan luego en el
  // módulo de Proveedores.
  async function agregarProveedor() {
    const nombre = nuevoProveedor.trim();
    if (!nombre) return;
    setGuardandoProveedor(true);
    setError(null);
    try {
      const nuevo = await createProveedor({
        nombre,
        aceptaBsBcvDolar: false,
        aceptaBsBcvEuro: false,
        aceptaBsParalela: false,
        aceptaUsdEfectivo: false,
        aceptaUsdDivisa: false,
        activo: true,
      });
      setProveedores((prev) =>
        [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      setForm((f) => ({ ...f, proveedorId: nuevo.id }));
      setCreandoProveedor(false);
      setNuevoProveedor("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error creando proveedor");
    } finally {
      setGuardandoProveedor(false);
    }
  }

  function startEdit(ins: Insumo) {
    setEditingId(ins.id);
    setCreandoCategoria(false);
    setCreandoProveedor(false);
    setNuevoProveedor("");
    setForm({
      nombre: ins.nombre,
      // El form gestiona la categoría de INSUMO (tipo), no la de ventas.
      categoria: ins.categoriaCompra ?? "",
      unidadCompra: ins.unidadCompra,
      cantidadPorCompra: String(ins.cantidadPorCompra),
      unidadBase: ins.unidadBase,
      precioCompraUsd: ins.precioCompraUsd?.toString() ?? "",
      ...stockEnUnidadLegible(ins),
      mermaCoccionPorc: ins.mermaCoccionPorc?.toString() ?? "",
      proveedorId: ins.proveedorId ?? "",
      notas: ins.notas ?? "",
    });
    setAdding(true);
    // El form vive arriba de la lista; si editas un insumo que está más abajo,
    // parecería que el botón "no hace nada". Llevamos la vista al form.
    requestAnimationFrame(() => {
      document
        .getElementById("insumo-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Opciones para escribir stock y mínimo (presentación, kg, g…) y la elegida.
  const opcionesStock = useMemo(
    () =>
      opcionesCantidad({
        unidadBase: form.unidadBase,
        unidadCompra: form.unidadCompra,
        cantidadPorCompra: Number(form.cantidadPorCompra) || 0,
      }),
    [form.unidadBase, form.unidadCompra, form.cantidadPorCompra],
  );
  const unidadStock = opcionesStock.some((o) => o.key === form.stockUnidad)
    ? form.stockUnidad
    : (opcionesStock.find((o) => o.factor === 1)?.key ?? opcionesStock[0]?.key ?? "");
  const factorStock = factorDe(opcionesStock, unidadStock);

  // Cambia la unidad en que se escriben stock y mínimo, convirtiendo los
  // valores para que la cantidad física no cambie (2 sacos → 90 kg).
  function cambiarUnidadStock(key: string) {
    if (key === unidadStock) return;
    const nuevo = factorDe(opcionesStock, key);
    const conv = (v: string) => {
      if (v.trim() === "") return v;
      const n = Number(v) || 0;
      return String(Math.round(((n * factorStock) / nuevo) * 10000) / 10000);
    };
    setForm({
      ...form,
      stockUnidad: key,
      stockTotal: conv(form.stockTotal),
      stockMinimo: conv(form.stockMinimo),
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    if (!form.unidadCompra.trim() || !form.unidadBase.trim()) {
      setError("Elige la presentación del insumo y cuánto trae.");
      return;
    }
    setError(null);
    const cantPC = Number(form.cantidadPorCompra) || 1;
    const precioC = form.precioCompraUsd === "" ? null : Number(form.precioCompraUsd);
    const precioB = precioC === null ? null : cantPC > 0 ? precioC / cantPC : precioC;

    const original = editingId ? items.find((x) => x.id === editingId) : undefined;
    const input = {
      nombre: form.nombre.trim(),
      // La categoría de INSUMO (tipo) va en categoria_compra. El campo `categoria`
      // (usado por Análisis de Ventas para reventa) se preserva tal cual: este
      // form ya no lo maneja, para no volver a mezclar las taxonomías.
      categoria: original?.categoria ?? "",
      categoriaCompra: form.categoria.trim() || undefined,
      unidadCompra: form.unidadCompra.trim() || "unidad",
      cantidadPorCompra: cantPC,
      unidadBase: form.unidadBase.trim() || "unidad",
      precioCompraUsd: precioC,
      precioBaseUsd: precioB,
      // Stock y mínimo se escriben en la unidad elegida (saco, kg…): se pasan
      // a unidad base con su factor.
      stockTotal: (Number(form.stockTotal) || 0) * factorStock,
      // OJO: NO incluir stockComprometido acá. Es manejado por el sistema
      // (planes de producción) y al editar pisaría las reservas a cero. En
      // creación se setea 0 explícitamente abajo.
      stockMinimo:
        form.stockMinimo === ""
          ? null
          : Number(form.stockMinimo) * factorStock,
      mermaCoccionPorc:
        form.mermaCoccionPorc === "" ? null : Number(form.mermaCoccionPorc),
      proveedorId: form.proveedorId || undefined,
      notas: form.notas.trim() || undefined,
      activo: true,
    };
    try {
      // Guardamos el id del item que se va a editar/crear para hacer scroll
      // hacia él después de cerrar el form. Así el usuario no pierde el lugar
      // de la lista donde estaba trabajando.
      let scrollToId: string | null = null;
      if (editingId) {
        const patch: Partial<typeof input> = { ...input };
        // No pisar el stock físico si NO lo cambiaste: entre que abriste el form
        // y guardaste, pudieron entrar ventas/mermas que bajaron stock_actual;
        // reescribirlo con el valor viejo del form las perdería (lost update).
        if (
          original &&
          Math.abs((input.stockTotal ?? 0) - original.stockTotal) < 0.00005
        ) {
          delete patch.stockTotal;
        }
        const upd = await updateInsumo(editingId, patch);
        setItems((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
        scrollToId = editingId;
      } else {
        const nuevo = await createInsumo({ ...input, stockComprometido: 0 });
        setItems((prev) => [...prev, nuevo]);
        scrollToId = nuevo.id;
      }
      resetForm();
      // Scroll al item recién editado/creado en el próximo tick, después del
      // re-render. Usamos requestAnimationFrame para asegurarnos que el DOM
      // ya tiene el data-id actualizado.
      requestAnimationFrame(() => {
        const el = document.querySelector<HTMLElement>(
          `[data-insumo-id="${scrollToId}"]`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          // Highlight breve para que el usuario sepa cuál guardó
          el.classList.add("ring-2", "ring-terracotta");
          setTimeout(() => {
            el.classList.remove("ring-2", "ring-terracotta");
          }, 1500);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteInsumo(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  async function setActivo(id: string, activo: boolean) {
    try {
      const upd = await updateInsumo(id, { activo });
      setItems((prev) => prev.map((x) => (x.id === id ? upd : x)));
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `Error al ${activo ? "reactivar" : "desactivar"}`,
      );
    }
  }

  const filtered = useMemo(() => {
    const q = normalizarBusqueda(search.trim());
    return items.filter(
      (i) =>
        (showInactivos || i.activo) &&
        (filterCat === "todas" ||
          (filterCat === "__sin__"
            ? !i.categoriaCompra?.trim()
            : i.categoriaCompra === filterCat)) &&
        (q === "" || normalizarBusqueda(i.nombre).includes(q)),
    );
  }, [items, filterCat, search, showInactivos]);

  const inactivosCount = useMemo(
    () => items.filter((i) => !i.activo).length,
    [items],
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Insumo[]>();
    filtered.forEach((i) => {
      const k = i.categoriaCompra?.trim() || "Sin categoría";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(i);
    });
    return Array.from(map.entries());
  }, [filtered]);

  // Categorías que YA existen en el catálogo (para los pills de filtro). Usa la
  // categoría de INSUMO (categoria_compra), no la de ventas.
  const haySinCat = useMemo(
    () => items.some((i) => i.activo && !i.categoriaCompra?.trim()),
    [items],
  );
  const categoriasReales = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => i.categoriaCompra?.trim() && set.add(i.categoriaCompra));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  // Categorías sugeridas para el formulario: la lista gestionada (categoria_insumo)
  // + las que ya usan los insumos. Separada de las categorías de venta.
  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    categoriasInsumo.forEach((c) => set.add(c.nombre));
    categoriasReales.forEach((c) => set.add(c));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categoriasInsumo, categoriasReales]);

  // Alertas de stock (sobre stock libre, igual que la pestaña Alertas).
  const alertas = useMemo(() => {
    let agotados = 0;
    let bajos = 0;
    items.forEach((i) => {
      if (!i.activo || !i.stockMinimo) return;
      const libre = stockLibre(i);
      if (libre <= 0) agotados++;
      else if (libre < i.stockMinimo) bajos++;
    });
    return { agotados, bajos };
  }, [items]);

  useEffect(() => {
    if (!loading && !errorCarga)
      onConteoAlertas?.(alertas.agotados + alertas.bajos);
  }, [loading, errorCarga, alertas, onConteoAlertas]);

  return (
    <div>
      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {!loading && alertas.agotados + alertas.bajos > 0 && (
        <button
          type="button"
          onClick={onVerAlertas}
          className="mb-4 w-full flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50/60 ring-1 ring-red-200 px-4 py-2.5 text-left text-sm hover:bg-red-50"
        >
          <span className="flex flex-wrap items-center gap-3 text-cacao">
            {alertas.agotados > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                {alertas.agotados} agotado{alertas.agotados === 1 ? "" : "s"}
              </span>
            )}
            {alertas.bajos > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                {alertas.bajos} con stock bajo
              </span>
            )}
          </span>
          <span className="text-xs uppercase tracking-widest text-terracotta">
            Ver alertas →
          </span>
        </button>
      )}

      {avisoPerdida && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-marfil-soft ring-1 ring-marfil px-4 py-2.5 text-sm text-cacao">
          <span>Pérdida registrada y descontada del stock.</span>
          <span className="flex items-center gap-4 text-xs uppercase tracking-widest">
            <button type="button" onClick={onVerMermas} className="text-terracotta hover:underline">
              Ver en Mermas →
            </button>
            <button type="button" onClick={() => setAvisoPerdida(false)} className="text-cacao-mute hover:text-cacao" aria-label="Cerrar aviso">
              ✕
            </button>
          </span>
        </div>
      )}

      <UnitCalculator className="mb-5" />

      {/* Buscador */}
      <div className="mb-3 flex items-center gap-2">
        <input
          type="text"
          placeholder="Buscar insumo por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-lg ring-1 ring-marfil px-3 py-2"
        />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 mb-5">
        <button
          onClick={() => setFilterCat("todas")}
          className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
            filterCat === "todas"
              ? "bg-cacao text-white ring-cacao"
              : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
          }`}
        >
          Todas
        </button>
        {categoriasReales.map((c) => (
          <button
            key={c}
            onClick={() => setFilterCat(c)}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterCat === c
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            {c}
          </button>
        ))}
        {haySinCat && (
          <button
            onClick={() => setFilterCat("__sin__")}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterCat === "__sin__"
                ? "bg-cacao text-white ring-cacao"
                : "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100"
            }`}
          >
            Sin categoría
          </button>
        )}
      </div>

      {inactivosCount > 0 && (
        <div className="mb-5 -mt-2">
          <button
            onClick={() => setShowInactivos((v) => !v)}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              showInactivos
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
            title="Mostrar u ocultar los insumos desactivados"
          >
            {showInactivos ? "Ocultar inactivos" : "Ver inactivos"} (
            {inactivosCount})
          </button>
        </div>
      )}

      {!adding && (
        <div className="mb-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={() => setImportando(true)}
            className="w-full rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep transition-colors"
          >
            Importar insumos
          </button>
          <button
            onClick={() => setAdding(true)}
            className="w-full rounded-xl ring-1 ring-marfil bg-white text-cacao py-3 font-bold hover:bg-marfil-soft transition-colors"
          >
            + Agregar a mano
          </button>
        </div>
      )}

      {importando && (
        <Importador
          titulo="Importar insumos"
          descripcion="Sube un Excel o CSV (una lista de insumos o una factura). bolo detecta las columnas; tú confirmas y se crean todos."
          campos={CAMPOS_INSUMO}
          onImportar={importarInsumos}
          onCerrar={() => setImportando(false)}
        />
      )}

      {adding && (
        <form
          id="insumo-form"
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar insumo" : "Nuevo insumo"}
          </h2>
          <input
            type="text"
            placeholder="Nombre del insumo (ej: Café en grano)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Categoría
              <select
                value={creandoCategoria ? "__nueva__" : form.categoria}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__nueva__") {
                    setCreandoCategoria(true);
                    setForm({ ...form, categoria: "" });
                  } else {
                    setCreandoCategoria(false);
                    setForm({ ...form, categoria: v });
                  }
                }}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Sin categoría —</option>
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__nueva__">+ Nueva categoría…</option>
              </select>
              {creandoCategoria && (
                <input
                  type="text"
                  value={form.categoria}
                  onChange={(e) =>
                    setForm({ ...form, categoria: e.target.value })
                  }
                  placeholder="Nombre de la categoría nueva"
                  autoFocus
                  autoCapitalize="words"
                  spellCheck={false}
                  className="mt-2 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              )}
            </label>
            <label className="text-sm text-cacao">
              Proveedor
              <select
                value={creandoProveedor ? "__nuevo__" : form.proveedorId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__nuevo__") {
                    setCreandoProveedor(true);
                    setNuevoProveedor("");
                  } else {
                    setCreandoProveedor(false);
                    setForm({ ...form, proveedorId: v });
                  }
                }}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Ninguno —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
                <option value="__nuevo__">+ Nuevo proveedor…</option>
              </select>
              {creandoProveedor && (
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={nuevoProveedor}
                    onChange={(e) => setNuevoProveedor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        agregarProveedor();
                      }
                    }}
                    placeholder="Nombre del proveedor nuevo"
                    autoFocus
                    autoCapitalize="words"
                    spellCheck={false}
                    className="flex-1 rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                  <button
                    type="button"
                    onClick={agregarProveedor}
                    disabled={guardandoProveedor || !nuevoProveedor.trim()}
                    className="shrink-0 rounded-lg bg-cacao text-white px-3 py-2 text-sm font-medium hover:bg-terracotta transition-colors disabled:opacity-50"
                  >
                    {guardandoProveedor ? "Guardando…" : "Agregar"}
                  </button>
                </div>
              )}
            </label>
          </div>
          <PresentacionPicker
            key={editingId ?? "nuevo"}
            inicial={
              editingId
                ? {
                    unidadCompra: form.unidadCompra,
                    cantidadPorCompra: Number(form.cantidadPorCompra) || 0,
                    unidadBase: form.unidadBase,
                  }
                : undefined
            }
            baseActual={
              editingId ? items.find((x) => x.id === editingId)?.unidadBase : undefined
            }
            tiposEnUso={tiposEnUso}
            onChange={(c) =>
              setForm((f) => ({
                ...f,
                unidadCompra: c?.unidadCompra ?? "",
                cantidadPorCompra: c?.cantidadPorCompra ?? "",
                unidadBase: c?.unidadBase ?? "",
              }))
            }
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="text-sm text-cacao">
              Precio del empaque (USD)
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.precioCompraUsd}
                onChange={(e) =>
                  setForm({ ...form, precioCompraUsd: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Stock total (físico)
              <CantidadUnidad
                valor={form.stockTotal}
                unidad={unidadStock}
                opciones={opcionesStock}
                onChange={(v, u) =>
                  u !== unidadStock
                    ? cambiarUnidadStock(u)
                    : setForm({ ...form, stockTotal: v })
                }
              />
              <span className="text-[10px] text-cacao-mute block mt-1">
                {factorStock !== 1 && Number(form.stockTotal) > 0 ? (
                  <>
                    Son{" "}
                    <b>
                      {displayCantidad(
                        Number(form.stockTotal) * factorStock,
                        form.unidadBase,
                      )}
                    </b>
                    .
                  </>
                ) : (
                  <>
                    Lo que hay físicamente.
                    {/* Solo hay stock reservado cuando se usan Planes de producción. */}
                    {items.some((i) => i.stockComprometido > 0) &&
                      " El stock libre (= total − comprometido) aparece en el listado."}
                  </>
                )}
              </span>
            </label>
            <label className="text-sm text-cacao">
              Stock mínimo (alerta si baja)
              <CantidadUnidad
                valor={form.stockMinimo}
                unidad={unidadStock}
                opciones={opcionesStock}
                placeholder="Opcional"
                onChange={(v, u) =>
                  u !== unidadStock
                    ? cambiarUnidadStock(u)
                    : setForm({ ...form, stockMinimo: v })
                }
              />
              {factorStock !== 1 && Number(form.stockMinimo) > 0 && (
                <span className="text-[10px] text-cacao-mute block mt-1">
                  Alerta cuando queden menos de{" "}
                  <b>
                    {displayCantidad(
                      Number(form.stockMinimo) * factorStock,
                      form.unidadBase,
                    )}
                  </b>
                  .
                </span>
              )}
            </label>
            <label className="text-sm text-cacao">
              Merma por procesamiento (%)
              <input
                type="number"
                step="1"
                min="0"
                max="99"
                placeholder="Ej. 70 (opcional)"
                value={form.mermaCoccionPorc}
                onChange={(e) =>
                  setForm({ ...form, mermaCoccionPorc: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <span className="text-[10px] text-cacao-mute block mt-1">
                % de peso que se pierde al prepararlo: al cocinarse (tocineta ≈ 70%),
                o por la parte que se descarta (pepa del aguacate, semilla del mango).
              </span>
            </label>
          </div>
          <textarea
            placeholder="Notas (opcional)"
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            rows={2}
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta"
            >
              {editingId ? "Guardar cambios" : "Crear insumo"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          Cargando catálogo...
        </div>
      ) : errorCarga ? (
        <ErrorCarga
          que="los insumos"
          detalle={errorCarga}
          onReintentar={reintentarCarga}
        />
      ) : grouped.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          {items.length === 0
            ? "Aún no tienes insumos. Crea el primero con “+ Nuevo insumo”."
            : "Ningún insumo coincide con estos filtros."}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, ins]) => (
            <section
              key={cat}
              className="rounded-2xl bg-white ring-1 ring-marfil p-5"
            >
              <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
                {cat}
              </h2>
              <ul className="divide-y divide-marfil">
                {ins.map((i) => {
                  // El badge "bajo" compara contra stockLibre, no contra stockTotal
                  // (es lo que realmente está disponible para producir).
                  const libre = stockLibre(i);
                  const lowStock =
                    i.stockMinimo !== null &&
                    i.stockMinimo > 0 &&
                    libre < i.stockMinimo;
                  // Detección automática de problema de unidades
                  const problemaUnidades = detectarInsumoConProblema(
                    i.unidadCompra,
                    i.unidadBase,
                    i.cantidadPorCompra,
                  );
                  return (
                    <li
                      key={i.id}
                      data-insumo-id={i.id}
                      className="py-3 grid grid-cols-12 gap-2 items-start rounded-lg transition-shadow"
                    >
                      <div className="col-span-12 sm:col-span-5">
                        <div className="text-cacao font-medium">
                          {i.nombre}
                          {!i.activo && (
                            <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil">
                              Inactivo
                            </span>
                          )}
                          {lowStock && i.activo && (
                            <span className="ml-2 text-[10px] uppercase tracking-widest text-terracotta">
                              · stock bajo
                            </span>
                          )}
                          {problemaUnidades && (
                            <button
                              type="button"
                              onClick={() => startEdit(i)}
                              title={`Revisar unidades: 1 ${canonica(i.unidadCompra)} debería ser ${formatN(problemaUnidades.esperado)} ${canonica(i.unidadBase)} (tiene ${formatN(i.cantidadPorCompra)})`}
                              className="ml-2 text-[10px] uppercase tracking-widest text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100"
                            >
                              <WarningIcon className="inline size-3 align-[-0.1em] mr-0.5" />
                              revisar unidades
                            </button>
                          )}
                        </div>
                        <div className="text-xs text-cacao-mute mt-0.5">
                          {etiquetaPresentacion(i)}
                        </div>
                      </div>
                      <div className="col-span-4 sm:col-span-3">
                        <div className="text-xs text-cacao-mute uppercase tracking-widest">
                          Precio
                        </div>
                        <PrecioCelda
                          insumo={i}
                          hoy={hoy}
                          onRefreshed={(upd) =>
                            setItems((prev) =>
                              prev.map((x) => (x.id === upd.id ? upd : x)),
                            )
                          }
                          onError={setError}
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <div className="text-xs text-cacao-mute uppercase tracking-widest">
                          {i.stockComprometido > 0 ? "Stock libre" : "Stock"}
                        </div>
                        <div
                          className={`text-sm ${lowStock ? "text-terracotta font-medium" : "text-cacao"}`}
                        >
                          {displayCantidad(libre, i.unidadBase)}
                        </div>
                        {i.stockComprometido > 0 && (
                          <div className="text-xs text-cacao-mute">
                            {displayCantidad(i.stockTotal, i.unidadBase)} total ·{" "}
                            {displayCantidad(i.stockComprometido, i.unidadBase)} comp.
                          </div>
                        )}
                        {i.stockMinimo !== null && i.stockMinimo > 0 && (
                          <div className="text-xs text-cacao-mute">
                            mín. {displayCantidad(i.stockMinimo, i.unidadBase)}
                          </div>
                        )}
                      </div>
                      <div className="col-span-4 sm:col-span-2 flex flex-wrap sm:justify-end gap-x-3 gap-y-1 text-xs uppercase tracking-widest">
                        {i.activo ? (
                          <>
                            <button
                              onClick={() => setPerdidaInsumo(i)}
                              className="text-cacao-soft hover:text-terracotta"
                              title="Registrar pérdida, merma o mal estado"
                            >
                              Pérdida
                            </button>
                            <button
                              onClick={() => startEdit(i)}
                              className="text-cacao-soft hover:text-cacao"
                            >
                              Editar
                            </button>
                            {onVerHistorial && (
                              <button
                                onClick={() => onVerHistorial(i.id)}
                                className="text-cacao-soft hover:text-cacao"
                                title="Ver cada cambio de stock de este insumo (auditoría)"
                              >
                                Historial
                              </button>
                            )}
                            <button
                              onClick={() => setPendienteDesactivar(i.id)}
                              className="text-cacao-soft hover:text-terracotta"
                              title="Ocultar del catálogo sin borrar (conserva el histórico). Se puede reactivar."
                            >
                              Desactivar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(i)}
                              className="text-cacao-soft hover:text-cacao"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => setActivo(i.id, true)}
                              className="text-cacao-soft hover:text-cacao font-medium"
                              title="Volver a activar este insumo"
                            >
                              Reactivar
                            </button>
                            <button
                              onClick={() => setPendienteBorrar(i.id)}
                              className="text-cacao-soft hover:text-terracotta"
                              title="Borrar definitivamente del catálogo (no se puede deshacer)"
                            >
                              Borrar
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={pendienteDesactivar !== null}
        title="¿Desactivar insumo?"
        message={
          <>
            Se ocultará del catálogo pero <strong>conserva su histórico</strong>{" "}
            (precios, movimientos). Podrás reactivarlo cuando quieras con el
            botón &ldquo;Ver inactivos&rdquo;.
          </>
        }
        confirmLabel="Desactivar"
        onConfirm={() => {
          if (pendienteDesactivar) setActivo(pendienteDesactivar, false);
          setPendienteDesactivar(null);
        }}
        onCancel={() => setPendienteDesactivar(null)}
      />

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Eliminar insumo?"
        message={
          <>
            Esto <strong>borra el insumo definitivamente</strong> (no se puede
            deshacer). Si solo quieres dejar de usarlo, mejor desactívalo.
          </>
        }
        onConfirm={() => {
          if (pendienteBorrar) handleDelete(pendienteBorrar);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />

      {perdidaInsumo && (
        <PerdidaInsumoDialog
          key={perdidaInsumo.id}
          insumo={perdidaInsumo}
          onClose={() => setPerdidaInsumo(null)}
          onRegistered={(insumoId, nuevoStockTotal) => {
            setItems((prev) =>
              prev.map((x) =>
                x.id === insumoId ? { ...x, stockTotal: nuevoStockTotal } : x,
              ),
            );
            if (onVerMermas) setAvisoPerdida(true);
          }}
        />
      )}
    </div>
  );
}

function nivelBadgeClass(nivel: NivelFrescuraPrecio): string {
  switch (nivel) {
    case "fresco":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "revisar":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    case "viejo":
      return "bg-[#F9EBE7] text-[#7A2419] ring-[#E8C5BC]";
    default:
      return "bg-marfil-soft text-cacao-mute ring-marfil";
  }
}

function frescuraTexto(nivel: NivelFrescuraPrecio, dias: number | null): string {
  if (nivel === "sin_fecha" || dias === null) return "sin fecha";
  const cuando =
    dias === 0 ? "hoy" : dias === 1 ? "hace 1 día" : `hace ${dias} días`;
  if (nivel === "viejo") return `precio viejo · ${cuando}`;
  if (nivel === "revisar") return `revisar precio · ${cuando}`;
  return cuando;
}

/**
 * Celda de precio con indicador de frescura y refresco rápido. Muestra el
 * precio del empaque + precio por unidad base, una etiqueta de qué tan viejo
 * es (verde/amarillo/rojo según los días desde la última confirmación) y un
 * botón "Actualizar a hoy" que fija el precio de mercado actual SIN registrar
 * una compra (estampa la fecha de hoy). La frescura se mide contra
 * `precioActualizado`; si aún no existe, cae a `ultimaFecha` (última compra).
 */
function PrecioCelda({
  insumo,
  hoy,
  onRefreshed,
  onError,
}: {
  insumo: Insumo;
  hoy: string;
  onRefreshed: (upd: Insumo) => void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Confirmación breve "✓ Precio actualizado" que se desvanece sola.
  useEffect(() => {
    if (!justSaved) return;
    const t = setTimeout(() => setJustSaved(false), 2500);
    return () => clearTimeout(t);
  }, [justSaved]);

  const fechaPrecio = insumo.precioActualizado ?? insumo.ultimaFecha ?? null;
  const { nivel, dias } = frescuraPrecio(fechaPrecio, hoy);

  function abrir() {
    setText(
      insumo.precioCompraUsd !== null ? String(insumo.precioCompraUsd) : "",
    );
    setEditing(true);
  }

  async function guardar() {
    const n = Number(text.trim());
    if (!Number.isFinite(n) || n < 0) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const upd = await actualizarPrecioInsumo(
        insumo.id,
        n,
        insumo.cantidadPorCompra,
      );
      onRefreshed(upd);
      setEditing(false);
      setJustSaved(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Error actualizando precio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="text-sm text-cacao">
        {insumo.precioCompraUsd !== null
          ? `$${insumo.precioCompraUsd.toFixed(2)} / ${insumo.unidadCompra}`
          : "—"}
      </div>
      {insumo.precioBaseUsd !== null && (
        <div className="text-xs text-cacao-soft">
          {(() => {
            const p = precioLegible(insumo.precioBaseUsd, insumo.unidadBase);
            return `$${p.precio < 0.01 ? p.precio.toFixed(5) : p.precio.toFixed(2)} / ${p.unidad}`;
          })()}
        </div>
      )}
      {insumo.precioCompraUsd !== null &&
        (nivel === "revisar" || nivel === "viejo") && (
        <div className="mt-1">
          <span
            className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ring-1 ${nivelBadgeClass(nivel)}`}
          >
            {frescuraTexto(nivel, dias)}
          </span>
        </div>
      )}
      {editing ? (
        <div className="mt-1 flex items-center gap-1">
          <span className="text-cacao-mute text-xs">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardar();
              else if (e.key === "Escape") setEditing(false);
            }}
            className="w-20 rounded ring-1 ring-marfil px-2 py-1 text-sm text-right focus:ring-cacao focus:outline-none"
          />
          <button
            type="button"
            disabled={saving}
            onClick={guardar}
            className="text-[10px] uppercase tracking-widest text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
          >
            {saving ? "..." : "✓ guardar"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[10px] uppercase tracking-widest text-cacao-mute hover:text-cacao"
          >
            ✕
          </button>
        </div>
      ) : justSaved ? (
        <span className="mt-1 inline-block text-[10px] uppercase tracking-widest text-emerald-700">
          ✓ Precio actualizado
        </span>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className="mt-1 text-[10px] uppercase tracking-widest text-cacao-soft hover:text-cacao underline"
        >
          Actualizar precio a hoy
        </button>
      )}
    </>
  );
}

function stockEnUnidadLegible(ins: Insumo): {
  stockTotal: string;
  stockMinimo: string;
  stockUnidad: string;
} {
  const ops = opcionesCantidad(ins);
  const grande = ops.find((o) => o.key === "kg" || o.key === "L");
  const op =
    grande && (ins.stockTotal >= grande.factor || ins.stockTotal === 0)
      ? grande
      : (ops.find((o) => o.factor === 1) ?? ops[0]);
  const f = op?.factor ?? 1;
  const r = (n: number) => String(Math.round((n / f) * 10000) / 10000);
  return {
    stockTotal: r(ins.stockTotal),
    stockMinimo: ins.stockMinimo != null ? r(ins.stockMinimo) : "",
    stockUnidad: op?.key ?? "",
  };
}

/** Presentación para el listado: "Saco 45 kg", o "kg" si es suelto. Si el
 *  texto no dice cuánto trae, se agrega (ej. "cesta · 6 kg"). */
function etiquetaPresentacion(i: Insumo): string {
  if (getUnit(i.unidadCompra) || /\d/.test(i.unidadCompra)) return i.unidadCompra;
  return `${i.unidadCompra} · ${displayCantidad(i.cantidadPorCompra, i.unidadBase)}`;
}

function formatN(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(2).replace(/\.?0+$/, "");
}
