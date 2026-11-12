"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  createCategoriaInsumo,
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WarningIcon, CameraIcon, ImageIcon, ChevronIcon, SearchIcon } from "@/components/icons";
import { CamaraCaptura } from "./_CamaraCaptura";
import { PerdidaInsumoDialog } from "../_PerdidaInsumoDialog";
import { DetalleInsumo } from "./DetalleInsumo";
import { AyudaEtiqueta } from "@/components/AyudaEtiqueta";
import {
  PastillaEstado,
  TableroInventario,
  cargarConsumoYTasa,
  type TasaInventario,
} from "./TableroInventario";
import {
  VENTANA_CONSUMO_DIAS,
  armarStock,
  categoriaVisible,
  categoriasDe,
  filtrarLineas,
  ordenarLineas,
  textoDias,
  valorPorGrupo,
  type ConsumoInsumo,
  type FiltroEstadoStock,
  type LineaStock,
  type OrdenStock,
} from "@/lib/stock-liviano";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";
import { Importador, type CampoImport } from "@/components/Importador";
import { EstadoVacioCocina } from "@/components/EstadoVacioCocina";

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

// Reduce una foto y la convierte a base64 (JPEG) para el reconocedor por visión.
// Achicar antes de enviar baja el costo y el tiempo sin perder legibilidad.
async function archivoABase64(
  file: File,
  maxLado = 1280,
  calidad = 0.82,
): Promise<{ data: string; tipo: string }> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("sin canvas");
  ctx.drawImage(bitmap, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", calidad);
  return { data: dataUrl.split(",")[1] ?? "", tipo: "image/jpeg" };
}

/** Cuántos insumos se ven antes de "Ver todos" (sin búsqueda ni filtros). */
const TOPE_LISTA = 8;

const ESTADOS_LISTA: { id: FiltroEstadoStock; label: string }[] = [
  { id: "pronto", label: "Se acaba pronto" },
  { id: "agotado", label: "Agotado" },
  { id: "bajo", label: "Bajo mínimo" },
  { id: "ok", label: "En orden" },
  { id: "sin_minimo", label: "Sin mínimo" },
];

const ORDENES_LISTA: { id: OrdenStock; label: string }[] = [
  { id: "pronto", label: "Se acaba pronto" },
  { id: "valor", label: "Mayor valor" },
  { id: "nombre", label: "Nombre" },
  { id: "estado", label: "Estado" },
];

export function InsumosClient({
  insumoInicial = null,
  filtroInicial = null,
  onVerGeneral,
}: {
  /** Desplaza la lista hasta esta ficha (enlaces desde otras pantallas). */
  insumoInicial?: string | null;
  /** Abre la lista ya filtrada (ej. "pedir" desde un enlace de alertas). */
  filtroInicial?: "pedir" | null;
  /** Abre una vista de todos los insumos (uso diario, pérdidas, cambios). */
  onVerGeneral?: (v: "uso" | "mermas" | "auditoria") => void;
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
  const [search, setSearch] = useState("");
  // Filtros de la lista (plegados en "Filtros"). "pedir" = agotados + bajos.
  const [categoria, setCategoria] = useState("todas");
  const [estado, setEstado] = useState<FiltroEstadoStock | "pedir">(filtroInicial ?? "todos");
  const [orden, setOrden] = useState<OrdenStock>("pronto");
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  const [listaAbierta, setListaAbierta] = useState(false);
  const [masAbierto, setMasAbierto] = useState(false);
  const [verValor, setVerValor] = useState(false);
  // Consumo reciente (ventas + pérdidas) y tasa: llegan después del catálogo.
  const [consumo, setConsumo] = useState<Map<string, ConsumoInsumo> | null>(null);
  const [tasa, setTasa] = useState<TasaInventario>(null);
  const listaRef = useRef<HTMLElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [importando, setImportando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  // Reconocimiento de insumo por foto de la etiqueta.
  const [reconociendo, setReconociendo] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const [camaraAbierta, setCamaraAbierta] = useState(false);
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
  const fichaVista = useRef<string | null>(null);
  // Insumo al que se le va a registrar una pérdida (abre el modal).
  const [perdidaInsumo, setPerdidaInsumo] = useState<Insumo | null>(null);
  // Insumo cuyo detalle (uso diario, pérdidas, cambios) está abierto.
  const [detalleInsumo, setDetalleInsumo] = useState<Insumo | null>(null);
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
          // "Cuánto me dura" usa las ventas recientes: se calcula aparte para
          // no demorar la lista.
          cargarConsumoYTasa(ins)
            .then((r) => {
              if (cancelled) return;
              setConsumo(r.consumo);
              setTasa(r.tasa);
            })
            .catch(() => {
              if (!cancelled) setConsumo(new Map());
            });
          if (
            insumoInicial &&
            ins.some((i) => i.id === insumoInicial && !i.activo)
          ) {
            setShowInactivos(true);
          }
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
  }, [intento, insumoInicial]);

  useEffect(() => {
    if (loading || !insumoInicial || fichaVista.current === insumoInicial) return;
    const el = document.querySelector<HTMLElement>(
      `[data-insumo-id="${CSS.escape(insumoInicial)}"]`,
    );
    if (!el) return;
    fichaVista.current = insumoInicial;
    el.scrollIntoView({ block: "center" });
    el.classList.add("ring-2", "ring-terracotta");
    const t = window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-terracotta");
    }, 1600);
    return () => window.clearTimeout(t);
  }, [loading, insumoInicial, items, showInactivos]);

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

  // Envía una imagen (ya en base64) al reconocedor y autocompleta el formulario.
  async function enviarReconocer(data: string, tipo: string) {
    setErrorFoto(null);
    setReconociendo(true);
    try {
      const r = await fetch("/api/insumos/reconocer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagen: data, tipo }),
      });
      const json = await r.json();
      const c = json?.campos as
        | {
            nombre?: string;
            marca?: string;
            categoria?: string;
            unidadCompra?: string;
            cantidadPorCompra?: string;
            unidadBase?: string;
          }
        | undefined;
      if (!c) {
        setErrorFoto(json?.error || "No pude leer la etiqueta. Prueba con otra foto.");
        return;
      }
      setForm((f) => ({
        ...f,
        nombre: c.nombre || f.nombre,
        categoria: c.categoria || f.categoria,
        unidadCompra: c.unidadCompra || f.unidadCompra,
        cantidadPorCompra: c.cantidadPorCompra || f.cantidadPorCompra,
        unidadBase: c.unidadBase || f.unidadBase,
        notas: c.marca
          ? f.notas
            ? `${f.notas} · ${c.marca}`
            : `Marca: ${c.marca}`
          : f.notas,
      }));
      // Si la categoría reconocida no existe en la lista, habilita crearla.
      if (c.categoria && !categoriasDisponibles.includes(c.categoria)) {
        setCreandoCategoria(true);
      }
    } catch {
      setErrorFoto("No pude procesar la foto. Intenta de nuevo.");
    } finally {
      setReconociendo(false);
    }
  }

  // Desde un archivo (galería): lo reduce y lo manda a reconocer.
  async function reconocerFoto(file: File) {
    try {
      const { data, tipo } = await archivoABase64(file);
      await enviarReconocer(data, tipo);
    } catch {
      setErrorFoto("No pude procesar la foto. Intenta de nuevo.");
    }
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
    // Una categoría nueva escrita en el formulario entra a la lista oficial
    // (la de Administración), para no tener categorías "sueltas".
    const cat = form.categoria.trim();
    if (
      cat &&
      !categoriasInsumo.some((c) => c.nombre.toLowerCase() === cat.toLowerCase())
    ) {
      try {
        const nueva = await createCategoriaInsumo(cat);
        setCategoriasInsumo((prev) => [...prev, nueva]);
      } catch {
        // Si la lista oficial no está disponible, el insumo igual se guarda.
      }
    }
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

  const inactivos = useMemo(
    () => items.filter((i) => !i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [items],
  );
  const itemsPorId = useMemo(() => new Map(items.map((i) => [i.id, i] as const)), [items]);

  // Una sola fuente para estado, días y valor de cada insumo activo.
  const { lineas, resumen } = useMemo(
    () =>
      armarStock(
        items.map((i) => ({
          id: i.id,
          nombre: i.nombre,
          activo: i.activo,
          categoria: categoriaVisible(i.categoriaCompra),
          unidadBase: i.unidadBase,
          stockTotal: i.stockTotal,
          stockComprometido: i.stockComprometido,
          stockMinimo: i.stockMinimo,
          precioBaseUsd: i.precioBaseUsd,
          precioCompraUsd: i.precioCompraUsd,
          cantidadPorCompra: i.cantidadPorCompra,
        })),
        consumo ?? new Map(),
      ),
    [items, consumo],
  );
  const categoriasLista = useMemo(() => categoriasDe(lineas), [lineas]);
  const gruposValor = useMemo(() => valorPorGrupo(lineas), [lineas]);
  const visibles = useMemo(() => {
    const base =
      estado === "pedir"
        ? filtrarLineas(lineas, { texto: search, categoria, estado: "todos" }).filter(
            (l) => l.estado === "agotado" || l.estado === "bajo",
          )
        : filtrarLineas(lineas, { texto: search, categoria, estado });
    return ordenarLineas(base, orden);
  }, [lineas, search, categoria, estado, orden]);
  const filtrosActivos = [
    estado !== "todos" && {
      id: "estado",
      label: estado === "pedir" ? "Para pedir" : (ESTADOS_LISTA.find((e) => e.id === estado)?.label ?? estado),
      quitar: () => setEstado("todos"),
    },
    categoria !== "todas" && {
      id: "categoria",
      label: categoria === "__sin__" ? "Sin categoría" : categoria,
      quitar: () => setCategoria("todas"),
    },
    orden !== "pronto" && {
      id: "orden",
      label: `Orden: ${ORDENES_LISTA.find((o) => o.id === orden)?.label ?? orden}`,
      quitar: () => setOrden("pronto"),
    },
  ].filter((f): f is { id: string; label: string; quitar: () => void } => Boolean(f));
  // Con búsqueda o filtros se ve todo; sin ellos, los primeros y "Ver todos".
  const filtrando = search.trim() !== "" || filtrosActivos.length > 0;
  const mostradas = listaAbierta || filtrando ? visibles : visibles.slice(0, TOPE_LISTA);
  const hayMas = !filtrando && visibles.length > TOPE_LISTA;
  const hayStockSinDias =
    consumo !== null && resumen.conConsumo === 0 && lineas.some((l) => l.libre > 0);

  // Desde el tablero: filtra la lista de abajo y la lleva a la vista.
  function filtrarDesdeTablero(f: { estado?: "pronto" | "pedir"; categoria?: string }) {
    setEstado(f.estado ?? "todos");
    setCategoria(f.categoria ?? "todas");
    setOrden(f.categoria ? "valor" : "pronto");
    setListaAbierta(false);
    requestAnimationFrame(() =>
      listaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

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

  return (
    <div>
      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {avisoPerdida && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-marfil-soft ring-1 ring-marfil px-4 py-2.5 text-sm text-cacao">
          <span>Pérdida registrada y descontada del stock.</span>
          <button type="button" onClick={() => setAvisoPerdida(false)} className="text-cacao-mute hover:text-cacao" aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {/* ── ¿Cómo estoy? ─────────────────────────────────────── */}
      {!loading && !errorCarga && lineas.length > 0 && (
        <div className="mb-8">
          <TableroInventario
            resumen={resumen}
            grupos={gruposValor}
            tasa={tasa}
            consumoListo={consumo !== null}
            hayStockSinDias={hayStockSinDias}
            verValor={verValor}
            onVerValor={() => setVerValor((v) => !v)}
            onFiltrar={filtrarDesdeTablero}
          />
        </div>
      )}

      {/* ── ¿Qué hago? ───────────────────────────────────────── */}
      <section ref={listaRef} className="scroll-mt-24 space-y-3 mb-5" aria-label="Insumos">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-xs uppercase tracking-[0.3em] text-cacao">Insumos</h2>
          {lineas.length > 0 && (
            <p className="text-xs text-cacao-soft">
              {mostradas.length < visibles.length
                ? `Mostrando ${mostradas.length} de ${visibles.length}`
                : `${visibles.length} ${visibles.length === 1 ? "insumo" : "insumos"}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-marfil">
            <SearchIcon className="size-4 text-cacao-mute" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar insumo"
              aria-label="Buscar insumo"
              className="w-full bg-transparent text-sm text-cacao outline-none placeholder:text-cacao-mute"
            />
          </label>
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            aria-expanded={filtrosAbiertos}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-xs uppercase tracking-widest ring-1 ${
              filtrosAbiertos || filtrosActivos.length > 0
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Filtros
            {filtrosActivos.length > 0 && (
              <span className="rounded-full bg-white/25 px-1.5 text-[10px] tracking-normal">{filtrosActivos.length}</span>
            )}
          </button>
          {!adding && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex min-h-10 items-center rounded-lg bg-terracotta px-4 text-xs font-semibold uppercase tracking-widest text-white hover:bg-terracotta-deep"
            >
              + Agregar
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMasAbierto((v) => !v)}
              aria-expanded={masAbierto}
              aria-haspopup="menu"
              className="inline-flex min-h-10 items-center gap-1 rounded-lg bg-white px-3 text-xs uppercase tracking-widest text-cacao-soft ring-1 ring-marfil hover:bg-marfil-soft"
            >
              Más
              <ChevronIcon className={`size-3.5 ${masAbierto ? "-rotate-90" : "rotate-90"}`} />
            </button>
            {masAbierto && (
              <button
                type="button"
                aria-label="Cerrar menú"
                tabIndex={-1}
                onClick={() => setMasAbierto(false)}
                className="fixed inset-0 z-10 cursor-default"
              />
            )}
            {masAbierto && (
              <ul
                role="menu"
                className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-marfil"
                onClick={() => setMasAbierto(false)}
              >
                {[
                  { label: "Importar insumos (Excel)", accion: () => setImportando(true) },
                  { label: "Uso diario de todos", accion: () => onVerGeneral?.("uso") },
                  { label: "Pérdidas de todos", accion: () => onVerGeneral?.("mermas") },
                  { label: "Cambios de stock", accion: () => onVerGeneral?.("auditoria") },
                  ...(inactivos.length > 0
                    ? [
                        {
                          label: `${showInactivos ? "Ocultar" : "Ver"} inactivos (${inactivos.length})`,
                          accion: () => setShowInactivos((v) => !v),
                        },
                      ]
                    : []),
                ].map((op) => (
                  <li key={op.label}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={op.accion}
                      className="block w-full px-4 py-2.5 text-left text-cacao hover:bg-marfil-soft"
                    >
                      {op.label}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {!filtrosAbiertos && filtrosActivos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {filtrosActivos.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={f.quitar}
                className="inline-flex items-center gap-1 rounded-full bg-marfil-soft px-3 py-1 text-xs text-cacao ring-1 ring-marfil hover:ring-terracotta/40"
                title="Quitar este filtro"
              >
                {f.label}
                <span aria-hidden="true" className="text-cacao-mute">✕</span>
              </button>
            ))}
          </div>
        )}

        {filtrosAbiertos && (
          <div className="rounded-xl bg-marfil-soft/60 p-3 ring-1 ring-marfil">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Estado
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as FiltroEstadoStock | "pedir")}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil"
                >
                  <option value="todos">Todos</option>
                  <option value="pedir">Para pedir</option>
                  {ESTADOS_LISTA.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Categoría
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil"
                >
                  <option value="todas">Todas</option>
                  {categoriasLista.map((c) => (
                    <option key={c} value={c === "Sin categoría" ? "__sin__" : c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-widest text-cacao-soft">
                Ordenar por
                <select
                  value={orden}
                  onChange={(e) => setOrden(e.target.value as OrdenStock)}
                  className="mt-1 block w-full rounded-lg bg-white px-3 py-2 text-sm normal-case tracking-normal text-cacao ring-1 ring-marfil"
                >
                  {ORDENES_LISTA.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {filtrosActivos.length > 0 && (
              <button
                type="button"
                onClick={() => filtrosActivos.forEach((f) => f.quitar())}
                className="mt-3 text-[11px] uppercase tracking-widest text-terracotta hover:underline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </section>

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
          <UnitCalculator />
          {!editingId && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-2">
                {/* Cámara: abre la webcam/cámara en vivo para capturar al momento */}
                <button
                  type="button"
                  onClick={() => setCamaraAbierta(true)}
                  disabled={reconociendo}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-marfil transition-colors ${
                    reconociendo
                      ? "bg-marfil text-cacao-soft"
                      : "bg-marfil-soft text-cacao hover:bg-marfil"
                  }`}
                >
                  <CameraIcon className="size-4 text-terracotta" />
                  {reconociendo ? "Leyendo la etiqueta…" : "Tomar foto"}
                </button>
                {/* Galería: elegir una imagen existente */}
                <label
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm ring-1 ring-marfil transition-colors ${
                    reconociendo
                      ? "bg-marfil text-cacao-soft"
                      : "cursor-pointer bg-marfil-soft text-cacao hover:bg-marfil"
                  }`}
                >
                  <ImageIcon className="size-4 text-terracotta" />
                  Galería
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={reconociendo}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void reconocerFoto(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <span className="text-xs text-cacao-soft">
                Toma una foto del empaque o elige una de tu galería y relleno los datos
                por ti. Revisa antes de guardar.
              </span>
              {errorFoto && (
                <span className="text-xs text-terracotta-deep">{errorFoto}</span>
              )}
              {camaraAbierta && (
                <CamaraCaptura
                  onCapturar={(data, tipo) => void enviarReconocer(data, tipo)}
                  onCerrar={() => setCamaraAbierta(false)}
                />
              )}
            </div>
          )}
          <input
            type="text"
            placeholder="Nombre del insumo (ej: Café en grano)"
            aria-label="Nombre del insumo"
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
              {Number(form.precioCompraUsd) > 0 &&
                Number(form.cantidadPorCompra) > 0 &&
                form.unidadBase && (
                  <span className="text-[11px] text-cacao-mute block mt-1">
                    {(() => {
                      const p = precioLegible(
                        Number(form.precioCompraUsd) / Number(form.cantidadPorCompra),
                        form.unidadBase,
                      );
                      return `= $${p.precio >= 0.01 ? p.precio.toFixed(2) : p.precio.toPrecision(2)} / ${p.unidad}`;
                    })()}
                  </span>
                )}
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
            aria-label="Notas"
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
          Cargando inventario…
        </div>
      ) : errorCarga ? (
        <ErrorCarga
          que="los insumos"
          detalle={errorCarga}
          onReintentar={reintentarCarga}
        />
      ) : items.length === 0 ? (
        <EstadoVacioCocina
          titulo="Todavía no hay insumos"
          beneficio="Cada ingrediente lleva su precio y su stock. Así las recetas calculan el costo real y aquí ves qué se acaba y qué pedir."
          cta="Agregar insumo"
          onCta={() => setAdding(true)}
          onDemo={reintentarCarga}
        />
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          {lineas.length === 0
            ? "No hay insumos activos."
            : "Ningún insumo coincide con la búsqueda o los filtros."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          <ul className="divide-y divide-marfil">
            {mostradas.map((l) => {
              const i = itemsPorId.get(l.id);
              return i ? (
                <FilaInsumo
                  key={l.id}
                  linea={l}
                  insumo={i}
                  hoy={hoy}
                  consumoListo={consumo !== null}
                  onDetalle={() => setDetalleInsumo(i)}
                  onPerdida={() => setPerdidaInsumo(i)}
                  onEditar={() => startEdit(i)}
                  onPrecio={(upd) => setItems((prev) => prev.map((x) => (x.id === upd.id ? upd : x)))}
                  onError={setError}
                />
              ) : null;
            })}
          </ul>
          {hayMas && (
            <button
              type="button"
              onClick={() => setListaAbierta((v) => !v)}
              aria-expanded={listaAbierta}
              className="flex w-full items-center justify-center gap-1 border-t border-marfil px-4 py-3 text-sm font-semibold text-cacao hover:bg-marfil-soft"
            >
              {listaAbierta ? "Ver menos" : `Ver todos (${visibles.length})`}
              <ChevronIcon className={`size-4 ${listaAbierta ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>
      )}

      {showInactivos && inactivos.length > 0 && (
        <section className="mt-6" aria-label="Insumos inactivos">
          <h3 className="font-display text-xs uppercase tracking-[0.3em] text-cacao-mute">
            Inactivos
          </h3>
          <ul className="mt-2 divide-y divide-marfil border-y border-marfil">
            {inactivos.map((i) => (
              <li key={i.id} data-insumo-id={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="text-cacao-soft">{i.nombre}</span>
                <span className="flex gap-2 text-[11px] uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => setActivo(i.id, true)}
                    className="inline-flex min-h-10 items-center rounded-full bg-white px-3 font-medium text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
                  >
                    Reactivar
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendienteBorrar(i.id)}
                    className="inline-flex min-h-10 items-center rounded-full bg-white px-3 text-cacao-soft ring-1 ring-marfil hover:text-terracotta"
                    title="Borrar definitivamente (no se puede deshacer)"
                  >
                    Borrar
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
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

      {detalleInsumo && (
        <DetalleInsumo
          key={detalleInsumo.id}
          insumo={detalleInsumo}
          onClose={() => setDetalleInsumo(null)}
          onPerdida={() => {
            setPerdidaInsumo(detalleInsumo);
            setDetalleInsumo(null);
          }}
          onEditar={() => {
            startEdit(detalleInsumo);
            setDetalleInsumo(null);
          }}
          onDesactivar={() => {
            setPendienteDesactivar(detalleInsumo.id);
            setDetalleInsumo(null);
          }}
        />
      )}

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
            setAvisoPerdida(true);
          }}
        />
      )}
    </div>
  );
}

/** Explicación general de "Alcanza para" (la misma para todos los insumos). */
const AYUDA_ALCANCE = `Stock disponible ÷ consumo diario promedio (últimos ${VENTANA_CONSUMO_DIAS} días).`;

/** Una fila de la lista: estado, cuánto queda, cuánto dura y precio. Cada dato
 *  aparece una sola vez; el resto (uso diario, pérdidas, cambios) vive en el
 *  Detalle. */
function FilaInsumo({
  linea: l,
  insumo: i,
  hoy,
  consumoListo,
  onDetalle,
  onPerdida,
  onEditar,
  onPrecio,
  onError,
}: {
  linea: LineaStock;
  insumo: Insumo;
  hoy: string;
  consumoListo: boolean;
  onDetalle: () => void;
  onPerdida: () => void;
  onEditar: () => void;
  onPrecio: (upd: Insumo) => void;
  onError: (msg: string) => void;
}) {
  const problemaUnidades = detectarInsumoConProblema(i.unidadCompra, i.unidadBase, i.cantidadPorCompra);
  return (
    <li data-insumo-id={i.id} className="scroll-mt-24 px-4 py-4 sm:px-5 transition-shadow">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onDetalle}
            className="text-left font-medium text-cacao break-words hover:text-terracotta hover:underline"
            title="Ver uso diario, pérdidas y cambios de este insumo"
          >
            {i.nombre}
          </button>
          <p className="text-xs text-cacao-soft">
            {l.categoria} · {etiquetaPresentacion(i)}
          </p>
          {problemaUnidades && (
            <button
              type="button"
              onClick={onEditar}
              title={`Revisar unidades: 1 ${canonica(i.unidadCompra)} debería ser ${formatN(problemaUnidades.esperado)} ${canonica(i.unidadBase)} (tiene ${formatN(i.cantidadPorCompra)})`}
              className="mt-1 text-[10px] uppercase tracking-widest text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5 hover:bg-amber-100"
            >
              <WarningIcon className="inline size-3 align-[-0.1em] mr-0.5" />
              revisar unidades
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <PastillaEstado estado={l.estado} />
          {l.seAgotaPronto && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-amber-900 ring-1 ring-amber-200">
              <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
              Se acaba pronto
            </span>
          )}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">Queda</dt>
          <dd className="text-cacao">{displayCantidad(l.libre, l.unidadBase)}</dd>
          {l.comprometido > 0 && (
            <dd className="text-[11px] text-cacao-soft">
              {displayCantidad(l.comprometido, l.unidadBase)} reservados
            </dd>
          )}
          {l.minimo != null && l.minimo > 0 && (
            <dd className="text-[11px] text-cacao-soft">mín. {displayCantidad(l.minimo, l.unidadBase)}</dd>
          )}
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">
            <AyudaEtiqueta ayuda={AYUDA_ALCANCE}>Alcanza para</AyudaEtiqueta>
          </dt>
          <dd className={l.dias.estado === "sin_datos" || !consumoListo ? "text-cacao-soft" : "text-cacao"}>
            {consumoListo ? textoDias(l.dias) : "…"}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <dt className="text-[10px] uppercase tracking-widest text-cacao-soft">Precio</dt>
          <dd>
            <PrecioCelda insumo={i} hoy={hoy} onRefreshed={onPrecio} onError={onError} />
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-widest">
        <button
          type="button"
          onClick={onPerdida}
          className="inline-flex min-h-10 items-center rounded-full bg-white px-3 ring-1 ring-marfil text-cacao-soft hover:text-terracotta"
          title="Registrar pérdida, merma o mal estado"
        >
          Pérdida
        </button>
        <button
          type="button"
          onClick={onEditar}
          className="inline-flex min-h-10 items-center rounded-full bg-white px-3 ring-1 ring-marfil text-cacao-soft hover:text-cacao"
        >
          Editar
        </button>
      </div>
    </li>
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
