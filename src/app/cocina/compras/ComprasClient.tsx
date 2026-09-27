"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MODALIDADES_PAGO,
  type Compra,
  type Insumo,
  type Proveedor,
  type TasaBcv,
  type ModalidadPago,
} from "@/lib/types";
import {
  listCompras,
  createCompra,
  updateCompra,
  deleteCompra,
  marcarCompraPagada,
  marcarFacturaPagada,
  createProveedor,
  listInsumos,
  listProveedores,
  getTasaBcvActual,
  getTasaBcvPorFecha,
} from "@/lib/data/cocina";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CalendarIcon, ChevronIcon } from "@/components/icons";
import { displayCantidad } from "@/lib/units";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";

type FormState = {
  insumoId: string;
  proveedorId: string;
  fecha: string;
  cantidad: string;
  cantidadBase: string;
  modalidadPago: ModalidadPago;
  precioTotalUsd: string;
  precioTotalBs: string;
  tasaBcvUsada: string;
  // Cuál de los dos montos (Bs o $) escribió el usuario por última vez. Es la
  // fuente de verdad: al cambiar la tasa se recalcula el OTRO a partir de este.
  montoAnchor: "bs" | "usd";
  // IVA: "con" = el monto ya lo incluye (se guarda tal cual);
  // "sin" = el monto es la base y el sistema le suma el IVA para el costo real.
  ivaModo: "con" | "sin";
  ivaPorc: string;
  notas: string;
  numeroFactura: string;
  fleteUsd: string;
  /** true = la factura se paga después (cuenta por pagar). */
  pagarDespues: boolean;
};

function todayISO() {
  return hoyISO();
}

/** Formatea una cantidad evitando artefactos de coma flotante (ej. 349.9999). */
function fmtQty(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Number(n.toFixed(4)));
}

/** Formatea un monto de dinero a 2 decimales para el campo enlazado. */
function fmtMoney(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Number(n.toFixed(2)));
}

/** Fecha larga en español para los encabezados de grupo (ej. "21 jul 2026"). */
function fmtFecha(fecha: string): string {
  return new Date(fecha + "T00:00").toLocaleDateString("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const emptyForm: FormState = {
  insumoId: "",
  proveedorId: "",
  fecha: todayISO(),
  cantidad: "1",
  cantidadBase: "",
  modalidadPago: "divisa",
  precioTotalUsd: "",
  precioTotalBs: "",
  tasaBcvUsada: "",
  montoAnchor: "usd",
  ivaModo: "con",
  ivaPorc: "16",
  notas: "",
  numeroFactura: "",
  fleteUsd: "",
  pagarDespues: false,
};

export function ComprasClient() {
  const [compras, setCompras] = useState<Compra[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [tasa, setTasa] = useState<TasaBcv | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>({ ...emptyForm });
  const [pendienteBorrar, setPendienteBorrar] = useState<string | null>(null);
  // Edición de una compra existente (null = alta nueva).
  const [editingId, setEditingId] = useState<string | null>(null);
  // Alta de proveedor en línea desde el desplegable.
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  // Estado de los colapsables del historial (por fecha). Guardamos solo las
  // fechas que el usuario abrió/cerró a mano; por defecto se abre la más
  // reciente (índice 0) y el resto queda colapsado.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, ins, prov, t] = await Promise.all([
          listCompras(),
          listInsumos(),
          listProveedores(),
          getTasaBcvActual(),
        ]);
        if (!cancelled) {
          setCompras(c);
          setInsumos(ins);
          setProveedores(prov);
          setTasa(t);
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

  // La tasa BCV sugerida sigue la FECHA de la compra, no la de hoy: al cambiar la
  // fecha se carga la tasa vigente de ese día. Al AGREGAR (no editar) re-aplica esa
  // tasa a la modalidad actual, para que el convertidor use la tasa correcta del día.
  useEffect(() => {
    if (!form.fecha) return;
    let cancel = false;
    (async () => {
      const t = await getTasaBcvPorFecha(form.fecha).catch(() => null);
      if (cancel || !t) return;
      setTasa(t);
      if (editingId) return; // en edición se respeta la tasa guardada de la compra
      setForm((f) => {
        const sug = f.modalidadPago === "bcv_euro" ? t.eurBs : f.modalidadPago === "paralela" ? t.paralelaBs : t.usdBs;
        if (!(Number(sug) > 0)) return f;
        const ts = Number(sug);
        const next = { ...f, tasaBcvUsada: String(sug) };
        if (f.montoAnchor === "bs") {
          const bs = Number(f.precioTotalBs);
          if (f.precioTotalBs.trim() !== "" && Number.isFinite(bs)) next.precioTotalUsd = fmtMoney(bs / ts);
        } else {
          const usd = Number(f.precioTotalUsd);
          if (f.precioTotalUsd.trim() !== "" && Number.isFinite(usd)) next.precioTotalBs = fmtMoney(usd * ts);
        }
        return next;
      });
    })();
    return () => { cancel = true; };
  }, [form.fecha, editingId]);

  function resetForm() {
    setForm({ ...emptyForm, fecha: todayISO() });
    setAdding(false);
    setEditingId(null);
    setCreandoProveedor(false);
    setNuevoProveedor("");
  }

  // Alta rápida de proveedor (solo nombre) desde el desplegable; queda guardado
  // en la lista de proveedores y seleccionado en la compra.
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

  // Abre el formulario para editar una compra existente. Se precarga el total
  // en USD (que es el canónico ya con IVA) con ivaModo="con", así al guardar
  // queda igual salvo lo que cambies.
  function startEdit(c: Compra) {
    setEditingId(c.id);
    setAdding(true);
    setError(null);
    setCreandoProveedor(false);
    setForm({
      insumoId: c.insumoId,
      proveedorId: c.proveedorId ?? "",
      fecha: c.fecha,
      cantidad: String(c.cantidad),
      cantidadBase: "",
      modalidadPago: c.modalidadPago ?? "divisa",
      precioTotalUsd: fmtMoney(c.precioTotalUsd),
      precioTotalBs: c.precioTotalBs ? fmtMoney(c.precioTotalBs) : "",
      tasaBcvUsada: c.tasaBcvUsada ? String(c.tasaBcvUsada) : "",
      montoAnchor: "usd",
      ivaModo: "con",
      ivaPorc: "16",
      notas: c.notas ?? "",
      numeroFactura: c.numeroFactura ?? "",
      fleteUsd: c.fleteUsd ? String(c.fleteUsd) : "",
      pagarDespues: !c.pagada,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Marca el pago (no toca stock ni precio). Una factura se paga completa: si la
  // compra tiene N° de factura, marca TODAS las líneas de esa factura (mismo
  // número + proveedor) de una vez; si no tiene factura, solo esa línea.
  async function marcarPagada(id: string, pagada: boolean) {
    setError(null);
    const compra = compras.find((c) => c.id === id);
    const numFactura = compra?.numeroFactura?.trim();
    try {
      if (numFactura) {
        const idsAfectados = await marcarFacturaPagada(
          numFactura,
          compra?.proveedorId ?? null,
          pagada,
        );
        const set = new Set(idsAfectados.length ? idsAfectados : [id]);
        setCompras((prev) =>
          prev.map((c) =>
            set.has(c.id)
              ? { ...c, pagada, fechaPago: pagada ? todayISO() : undefined }
              : c,
          ),
        );
      } else {
        await marcarCompraPagada(id, pagada);
        setCompras((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, pagada, fechaPago: pagada ? todayISO() : undefined }
              : c,
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error actualizando el pago");
    }
  }

  const insumoSeleccionado = useMemo(
    () => insumos.find((i) => i.id === form.insumoId),
    [insumos, form.insumoId],
  );

  // Una factura se paga completa: si el N° de factura que se está cargando ya
  // existe (mismo número + proveedor), la nueva línea HEREDA su estado de pago.
  // No tiene sentido que unas líneas de la misma factura estén pagadas y otras
  // por pagar. `facturaLock` = la compra existente que fija ese estado (o null).
  const facturaLock = useMemo(() => {
    const num = form.numeroFactura.trim().toLowerCase();
    if (!num) return null;
    return (
      compras.find(
        (c) =>
          c.id !== editingId &&
          (c.numeroFactura ?? "").trim().toLowerCase() === num &&
          (!form.proveedorId || c.proveedorId === form.proveedorId),
      ) ?? null
    );
  }, [compras, editingId, form.numeroFactura, form.proveedorId]);

  // Estado de "pagar después" efectivo: si la factura ya existe, manda su estado.
  const pagarDespuesEfectivo = facturaLock ? !facturaLock.pagada : form.pagarDespues;

  // Modalidad que se paga en Bs (para sugerir la tasa correcta del día).
  const pagaEnBs =
    form.modalidadPago === "bcv_dolar" ||
    form.modalidadPago === "bcv_euro" ||
    form.modalidadPago === "paralela";

  // Tasa del día sugerida según la modalidad (BCV $, BCV € o paralela). Para las
  // modalidades en USD usamos la BCV $ como tasa de referencia del día.
  const tasaSugerida = useMemo(() => {
    if (!tasa) return null;
    if (form.modalidadPago === "bcv_euro") return tasa.eurBs ?? null;
    if (form.modalidadPago === "paralela") return tasa.paralelaBs ?? null;
    return tasa.usdBs;
  }, [tasa, form.modalidadPago]);

  // Factor de IVA: 1 si el monto ya lo incluye ("con"); 1 + tasa/100 si hay que
  // sumárselo ("sin"). El total con IVA es lo que realmente se pagó y lo que
  // alimenta el costo del insumo.
  const factorIva =
    form.ivaModo === "sin" ? 1 + (Number(form.ivaPorc) || 0) / 100 : 1;
  const tasaNum = Number(form.tasaBcvUsada) || 0;
  const bsBase = Number(form.precioTotalBs) || 0;
  // Monto base en USD: si el usuario ancló en Bs, se deriva dividiendo por la
  // tasa (a plena precisión); si ancló en $, es lo que escribió.
  const usdBase =
    form.montoAnchor === "bs" && tasaNum > 0
      ? bsBase / tasaNum
      : Number(form.precioTotalUsd) || 0;
  const usdConIva = usdBase * factorIva;
  const bsConIva = bsBase * factorIva;

  // Contenido del empaque del insumo elegido (unidades base por unidad de compra).
  const cantPorCompra = insumoSeleccionado?.cantidadPorCompra ?? 0;

  // Mostrar el 2do campo (unidad base) solo si aporta algo: hay conversión y no
  // es idéntico a la unidad de compra (ej. "unidad" con contenido 1).
  const mostrarBase =
    !!insumoSeleccionado &&
    cantPorCompra > 0 &&
    !!insumoSeleccionado.unidadBase &&
    !(
      insumoSeleccionado.unidadBase === insumoSeleccionado.unidadCompra &&
      cantPorCompra === 1
    );

  // Al escribir en un campo, se convierte y llena el otro (ida y vuelta).
  function onCantidadCompra(v: string) {
    const n = Number(v);
    setForm((f) => ({
      ...f,
      cantidad: v,
      cantidadBase:
        cantPorCompra > 0 && v.trim() !== "" && Number.isFinite(n)
          ? fmtQty(n * cantPorCompra)
          : "",
    }));
  }
  function onCantidadBase(v: string) {
    const n = Number(v);
    setForm((f) => ({
      ...f,
      cantidadBase: v,
      cantidad:
        cantPorCompra > 0 && v.trim() !== "" && Number.isFinite(n)
          ? fmtQty(n / cantPorCompra)
          : "",
    }));
  }

  // ── Convertidor de montos (Bs ↔ $) ──────────────────────────────────────
  // Escribes el monto en la moneda de la factura y el otro se llena solo a la
  // tasa. La "moneda de la factura" no tiene que coincidir con la modalidad de
  // pago: puedes pagar en Bs con una factura en $ (o viceversa).

  // Escribió el monto en Bs → deriva el de $.
  function onMontoBs(v: string) {
    const bs = Number(v);
    setForm((f) => {
      const t = Number(f.tasaBcvUsada);
      return {
        ...f,
        precioTotalBs: v,
        montoAnchor: "bs",
        precioTotalUsd:
          v.trim() !== "" && Number.isFinite(bs) && t > 0
            ? fmtMoney(bs / t)
            : v.trim() === ""
              ? ""
              : f.precioTotalUsd,
      };
    });
  }

  // Escribió el monto en $ → deriva el de Bs.
  function onMontoUsd(v: string) {
    const usd = Number(v);
    setForm((f) => {
      const t = Number(f.tasaBcvUsada);
      return {
        ...f,
        precioTotalUsd: v,
        montoAnchor: "usd",
        precioTotalBs:
          v.trim() !== "" && Number.isFinite(usd) && t > 0
            ? fmtMoney(usd * t)
            : v.trim() === ""
              ? ""
              : f.precioTotalBs,
      };
    });
  }

  // Cambió la tasa → recalcula el monto NO anclado a partir del anclado.
  function onTasa(v: string) {
    setForm((f) => recalcularConTasa(f, v));
  }

  // Devuelve el form con el monto derivado recalculado a partir del anclado.
  function recalcularConTasa(f: FormState, tasaStr: string): FormState {
    const t = Number(tasaStr);
    const next = { ...f, tasaBcvUsada: tasaStr };
    if (!(t > 0)) return next;
    if (f.montoAnchor === "bs") {
      const bs = Number(f.precioTotalBs);
      if (f.precioTotalBs.trim() !== "" && Number.isFinite(bs))
        next.precioTotalUsd = fmtMoney(bs / t);
    } else {
      const usd = Number(f.precioTotalUsd);
      if (f.precioTotalUsd.trim() !== "" && Number.isFinite(usd))
        next.precioTotalBs = fmtMoney(usd * t);
    }
    return next;
  }

  // Agrupa las compras por fecha, conservando el orden (más recientes primero,
  // como vienen de la lista). Cada grupo trae su total en USD para el encabezado.
  const gruposPorFecha = useMemo(() => {
    const map = new Map<string, Compra[]>();
    for (const c of compras) {
      const arr = map.get(c.fecha);
      if (arr) arr.push(c);
      else map.set(c.fecha, [c]);
    }
    return Array.from(map.entries()).map(([fecha, items]) => ({
      fecha,
      items,
      totalUsd: items.reduce((s, c) => s + c.precioTotalUsd, 0),
    }));
  }, [compras]);

  function toggleGrupo(fecha: string, abiertoAhora: boolean) {
    setGruposAbiertos((prev) => ({ ...prev, [fecha]: !abiertoAhora }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.insumoId || !form.fecha || !form.cantidad) return;
    setError(null);

    // El costo canónico siempre se guarda en USD. Si el usuario ancló en Bs, se
    // deriva dividiendo por la tasa (a plena precisión); si ancló en $, es lo
    // que escribió. Si el monto venía "sin IVA", le sumamos el IVA al total real
    // pagado (que es el que cuenta para el costo del insumo).
    const t = Number(form.tasaBcvUsada) || 0;
    const bsBaseVal = Number(form.precioTotalBs) || 0;
    const usdBaseVal = Number(form.precioTotalUsd) || 0;

    let precioUsd: number;
    let precioBs: number | undefined;
    let tasaUsada: number | undefined;

    if (form.montoAnchor === "bs" && bsBaseVal > 0 && t > 0) {
      precioBs = bsBaseVal * factorIva;
      precioUsd = precioBs / t;
      tasaUsada = t;
    } else {
      precioUsd = usdBaseVal * factorIva;
      // Si además hay un equivalente en Bs y una tasa, lo guardamos como
      // referencia (ej. pagaste en Bs una factura que venía en $).
      if (bsBaseVal > 0 && t > 0) {
        precioBs = bsBaseVal * factorIva;
        tasaUsada = t;
      }
    }

    if (!(precioUsd > 0)) {
      setError("Ingresa el monto de la factura (en Bs o en $).");
      return;
    }

    // Dejamos constancia en las notas de que el IVA se agregó (así el historial
    // explica por qué el total no coincide con el monto base de la factura).
    const notaIva =
      form.ivaModo === "sin"
        ? `IVA ${Number(form.ivaPorc) || 0}% agregado`
        : null;
    const notasFinal = [form.notas.trim() || null, notaIva]
      .filter(Boolean)
      .join(" · ");

    const input = {
      insumoId: form.insumoId,
      proveedorId: form.proveedorId || undefined,
      fecha: form.fecha,
      cantidad: Number(form.cantidad),
      precioTotalUsd: precioUsd,
      precioTotalBs: precioBs,
      tasaBcvUsada: tasaUsada,
      modalidadPago: form.modalidadPago,
      notas: notasFinal || undefined,
      numeroFactura: form.numeroFactura.trim() || undefined,
      fleteUsd: Number(form.fleteUsd) > 0 ? Number(form.fleteUsd) : undefined,
      // Si la factura ya existe, hereda su estado de pago (se paga completa).
      pagada: facturaLock ? facturaLock.pagada : !form.pagarDespues,
    };
    try {
      if (editingId) {
        // Editar = borrar + recrear: el trigger revierte el stock/precio de la
        // vieja y aplica los de la nueva (ajuste por la diferencia). Cambia el id.
        const upd = await updateCompra(editingId, input);
        setCompras((prev) => [
          upd,
          ...prev.filter((c) => c.id !== editingId),
        ]);
      } else {
        const nueva = await createCompra(input);
        setCompras((prev) => [nueva, ...prev]);
      }
      // Recargar insumos para reflejar el stock y precio actualizados.
      const fresh = await listInsumos();
      setInsumos(fresh);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteCompra(id);
      setCompras((prev) => prev.filter((c) => c.id !== id));
      // El trigger de la base revierte el stock (y, si era la última compra,
      // el precio) al borrar. Recargamos insumos para reflejarlo en la UI.
      const fresh = await listInsumos();
      setInsumos(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error eliminando");
    }
  }

  // Auto-rellenar la tasa del día cuando cambia la modalidad. Todas las
  // modalidades reciben una tasa sugerida (las de USD usan la BCV $) para que el
  // convertidor Bs↔$ funcione siempre. Recalcula el monto derivado con la tasa
  // nueva para que los dos campos queden consistentes.
  function setModalidad(m: ModalidadPago) {
    setForm((prev) => {
      let tasaDef = prev.tasaBcvUsada;
      if (m === "bcv_dolar" && tasa) tasaDef = String(tasa.usdBs);
      else if (m === "bcv_euro" && tasa?.eurBs) tasaDef = String(tasa.eurBs);
      else if (m === "paralela" && tasa?.paralelaBs)
        tasaDef = String(tasa.paralelaBs);
      else if ((m === "efectivo" || m === "divisa") && tasa)
        tasaDef = String(tasa.usdBs);
      return { ...recalcularConTasa(prev, tasaDef), modalidadPago: m };
    });
  }

  return (
    <div>
      {error && <ErrorBanner className="mb-4">{error}</ErrorBanner>}

      {!adding && (
        <button
          onClick={() => {
            // Prefijamos la tasa BCV $ del día (modalidad default: USD divisa)
            // para que el convertidor Bs↔$ funcione desde el inicio.
            setForm({
              ...emptyForm,
              fecha: todayISO(),
              tasaBcvUsada: tasa ? String(tasa.usdBs) : "",
            });
            setAdding(true);
          }}
          className="w-full mb-5 rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Registrar nueva compra
        </button>
      )}

      {adding && (
        <form
          onSubmit={handleSubmit}
          className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar compra" : "Nueva compra"}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Insumo
              <select
                required
                value={form.insumoId}
                onChange={(e) => {
                  const nuevoId = e.target.value;
                  const ins = insumos.find((i) => i.id === nuevoId);
                  const cpc = ins?.cantidadPorCompra ?? 0;
                  const n = Number(form.cantidad);
                  setForm({
                    ...form,
                    insumoId: nuevoId,
                    cantidadBase:
                      cpc > 0 && form.cantidad.trim() !== "" && Number.isFinite(n)
                        ? fmtQty(n * cpc)
                        : "",
                  });
                }}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              >
                <option value="">— Selecciona insumo —</option>
                {insumos.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.unidadCompra})
                  </option>
                ))}
              </select>
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

          <label className="text-sm text-cacao block">
            Fecha
            <input
              type="date"
              required
              value={form.fecha}
              onChange={(e) => setForm({ ...form, fecha: e.target.value })}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>

          <div className="text-sm text-cacao">
            Cantidad comprada
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  required
                  placeholder="0"
                  value={form.cantidad}
                  onChange={(e) => onCantidadCompra(e.target.value)}
                  className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
                <span className="text-xs text-cacao-mute block mt-0.5">
                  en{" "}
                  {insumoSeleccionado
                    ? insumoSeleccionado.unidadCompra
                    : "unidad de compra"}
                </span>
              </div>
              {mostrarBase && (
                <div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0"
                    value={form.cantidadBase}
                    onChange={(e) => onCantidadBase(e.target.value)}
                    className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                  <span className="text-xs text-cacao-mute block mt-0.5">
                    o en {insumoSeleccionado?.unidadBase} (más preciso)
                  </span>
                </div>
              )}
            </div>
            {mostrarBase && (
              <p className="text-[11px] text-cacao-mute mt-1.5">
                Llena el que prefieras — se convierten solos (1{" "}
                {insumoSeleccionado?.unidadCompra} = {fmtQty(cantPorCompra)}{" "}
                {insumoSeleccionado?.unidadBase}).
              </p>
            )}
          </div>

          <label className="text-sm text-cacao block">
            Modalidad de pago
            <select
              value={form.modalidadPago}
              onChange={(e) => setModalidad(e.target.value as ModalidadPago)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
            >
              {MODALIDADES_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm text-cacao">
            ¿El monto lleva IVA?
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, ivaModo: "con" })}
                className={
                  form.ivaModo === "con"
                    ? "rounded-lg bg-cacao text-white px-3 py-2 text-sm font-medium"
                    : "rounded-lg ring-1 ring-marfil px-3 py-2 text-sm text-cacao hover:bg-marfil-soft"
                }
              >
                Con IVA
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, ivaModo: "sin" })}
                className={
                  form.ivaModo === "sin"
                    ? "rounded-lg bg-cacao text-white px-3 py-2 text-sm font-medium"
                    : "rounded-lg ring-1 ring-marfil px-3 py-2 text-sm text-cacao hover:bg-marfil-soft"
                }
              >
                Sin IVA (+{Number(form.ivaPorc) || 0}%)
              </button>
              {form.ivaModo === "sin" && (
                <label className="flex items-center gap-1.5 text-xs text-cacao-mute">
                  IVA
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.ivaPorc}
                    onChange={(e) =>
                      setForm({ ...form, ivaPorc: e.target.value })
                    }
                    className="w-16 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                  />
                  %
                </label>
              )}
            </div>
            <span className="text-xs text-cacao-mute block mt-1">
              {form.ivaModo === "con"
                ? "El monto ya incluye el IVA — se guarda tal cual."
                : "El sistema le suma el IVA al monto para calcular el costo real."}
            </span>
          </div>

          <div className="text-sm text-cacao">
            Monto de la factura
            <p className="text-xs text-cacao-mute mt-0.5">
              Pon el monto tal como sale en la factura; el otro campo se calcula
              solo a la tasa. La moneda de la factura no tiene que coincidir con
              la forma de pago.
            </p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs text-cacao-mute flex items-center gap-1">
                  Monto en Bs
                  {pagaEnBs && (
                    <span className="text-[10px] uppercase tracking-widest text-terracotta">
                      · pago
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.precioTotalBs}
                  onChange={(e) => onMontoBs(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-xs text-cacao-mute flex items-center gap-1">
                  Monto en $
                  {!pagaEnBs && (
                    <span className="text-[10px] uppercase tracking-widest text-terracotta">
                      · pago
                    </span>
                  )}
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.precioTotalUsd}
                  onChange={(e) => onMontoUsd(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
            </div>
            <label className="block mt-3 text-sm text-cacao">
              Tasa del día (Bs por $)
              <input
                type="number"
                step="0.0001"
                min="0"
                inputMode="decimal"
                value={form.tasaBcvUsada}
                onChange={(e) => onTasa(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              {tasaSugerida !== null && (
                <span className="text-xs text-cacao-mute block mt-1">
                  Tasa BCV del {fmtFecha(form.fecha)}: Bs {tasaSugerida.toFixed(2)}.{" "}
                  {tasaNum > 0 &&
                  Math.abs(tasaNum - tasaSugerida) > 0.009 ? (
                    <button
                      type="button"
                      onClick={() => onTasa(String(tasaSugerida))}
                      className="underline hover:text-cacao"
                    >
                      usar la del día
                    </button>
                  ) : (
                    "Ajústala si tu factura usó otra."
                  )}
                </span>
              )}
            </label>
            {(usdConIva > 0 || bsConIva > 0) && (
              <div className="mt-3 rounded-lg bg-marfil-soft ring-1 ring-marfil px-3 py-2 text-sm">
                <span className="text-cacao-mute">Total que se guarda: </span>
                <span className="text-cacao font-medium">
                  ${usdConIva.toFixed(2)}
                </span>
                {bsConIva > 0 && tasaNum > 0 && (
                  <span className="text-cacao-soft">
                    {" · "}Bs {bsConIva.toFixed(2)}
                  </span>
                )}
                {form.ivaModo === "sin" && (
                  <span className="text-cacao-mute">
                    {" · "}incluye IVA {Number(form.ivaPorc) || 0}%
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao block">
              N° de factura{" "}
              <span className="text-cacao-soft font-normal">(opcional)</span>
              <input
                type="text"
                value={form.numeroFactura}
                onChange={(e) =>
                  setForm({ ...form, numeroFactura: e.target.value })
                }
                placeholder="Ej: 00012345"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Flete / delivery ($){" "}
              <span className="text-cacao-soft font-normal">(opcional)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.fleteUsd}
                onChange={(e) => setForm({ ...form, fleteUsd: e.target.value })}
                placeholder="0.00"
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <span className="text-[11px] text-cacao-mute">
                Cargo de entrega del proveedor. Si la factura trae varios insumos,
                ponlo en una sola línea. No infla el precio del insumo.
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

          <label
            className={`flex items-start gap-2 rounded-lg bg-marfil-soft ring-1 ring-marfil p-3 ${
              facturaLock ? "opacity-70 cursor-not-allowed" : "cursor-pointer"
            }`}
          >
            <input
              type="checkbox"
              checked={pagarDespuesEfectivo}
              disabled={!!facturaLock}
              onChange={(e) =>
                setForm({ ...form, pagarDespues: e.target.checked })
              }
              className="mt-0.5 accent-cacao"
            />
            <span className="text-sm text-cacao">
              Pagar después{" "}
              <span className="text-cacao-soft">
                (cuenta por pagar — la factura queda pendiente de pago al
                proveedor)
              </span>
            </span>
          </label>
          {facturaLock && (
            <p className="-mt-1 text-[12px] text-cacao-soft">
              La factura{" "}
              <span className="font-medium text-cacao">
                {facturaLock.numeroFactura}
              </span>{" "}
              ya existe y está{" "}
              <span
                className={`font-medium ${
                  facturaLock.pagada ? "text-oliva" : "text-terracotta"
                }`}
              >
                {facturaLock.pagada ? "pagada" : "por pagar"}
              </span>
              . Esta línea hereda ese estado (una factura se paga completa).
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta"
            >
              {editingId ? "Guardar cambios" : "Registrar compra"}
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
          Cargando compras...
        </div>
      ) : compras.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft">
            Sin compras registradas todavía.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden divide-y divide-marfil">
          {gruposPorFecha.map((grupo, idx) => {
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
                    {grupo.items.length === 1 ? "compra" : "compras"}
                  </span>
                  <span className="ml-auto text-sm text-cacao font-medium">
                    ${grupo.totalUsd.toFixed(2)}
                  </span>
                </button>
                {abierto && (
                  <ul className="divide-y divide-marfil border-t border-marfil">
                    {grupo.items.map((c) => {
                      const insumo = insumos.find((i) => i.id === c.insumoId);
                      const proveedor = proveedores.find(
                        (p) => p.id === c.proveedorId,
                      );
                      const modalidad = MODALIDADES_PAGO.find(
                        (m) => m.value === c.modalidadPago,
                      );
                      const meta = [
                        proveedor?.nombre,
                        modalidad?.label,
                        c.numeroFactura ? `Factura ${c.numeroFactura}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");
                      return (
                        <li
                          key={c.id}
                          className="p-4 pl-11 flex flex-wrap items-start gap-4 justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium text-cacao">
                              {insumo?.nombre ?? "Insumo eliminado"}
                              {!c.pagada && (
                                <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200">
                                  Por pagar
                                </span>
                              )}
                            </div>
                            {meta && (
                              <div className="text-xs text-cacao-soft mt-0.5">
                                {meta}
                              </div>
                            )}
                            {c.notas && (
                              <div className="text-xs text-cacao-soft italic mt-1 font-serif">
                                {c.notas}
                              </div>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-cacao font-medium">
                              ${c.precioTotalUsd.toFixed(2)}
                            </div>
                            {c.fleteUsd ? (
                              <div className="text-xs text-cacao-soft">
                                + flete ${c.fleteUsd.toFixed(2)}
                              </div>
                            ) : null}
                            {c.precioTotalBs && (
                              <div className="text-xs text-cacao-soft">
                                Bs {c.precioTotalBs.toFixed(2)}
                                {c.tasaBcvUsada
                                  ? ` · tasa ${c.tasaBcvUsada.toFixed(2)}`
                                  : ""}
                              </div>
                            )}
                            <div className="text-xs text-cacao-mute">
                              {c.cantidad} × {insumo?.unidadCompra ?? ""}
                              {insumo &&
                                insumo.cantidadPorCompra > 0 &&
                                insumo.unidadBase &&
                                !(
                                  insumo.unidadBase === insumo.unidadCompra &&
                                  insumo.cantidadPorCompra === 1
                                ) && (
                                  <>
                                    {" · "}
                                    {displayCantidad(
                                      c.cantidad * insumo.cantidadPorCompra,
                                      insumo.unidadBase,
                                    )}
                                  </>
                                )}
                            </div>
                            <div className="mt-1 flex items-center justify-end gap-3 text-[10px] uppercase tracking-widest">
                              <button
                                onClick={() => startEdit(c)}
                                className="text-cacao-mute hover:text-cacao"
                              >
                                Editar
                              </button>
                              {!c.pagada && (
                                <button
                                  onClick={() => marcarPagada(c.id, true)}
                                  className="text-cacao-mute hover:text-cacao"
                                  title={
                                    c.numeroFactura
                                      ? "Marca pagada toda la factura"
                                      : undefined
                                  }
                                >
                                  {c.numeroFactura
                                    ? "Pagar factura"
                                    : "Marcar pagada"}
                                </button>
                              )}
                              <button
                                onClick={() => setPendienteBorrar(c.id)}
                                className="text-cacao-mute hover:text-terracotta"
                              >
                                Borrar
                              </button>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={pendienteBorrar !== null}
        title="¿Eliminar compra?"
        message={
          <>
            ¿Eliminar este registro de compra? (No revierte el stock
            automáticamente — ajustar manualmente si hace falta)
          </>
        }
        onConfirm={() => {
          if (pendienteBorrar) handleDelete(pendienteBorrar);
          setPendienteBorrar(null);
        }}
        onCancel={() => setPendienteBorrar(null)}
      />
    </div>
  );
}
