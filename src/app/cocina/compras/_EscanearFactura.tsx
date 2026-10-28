"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MODALIDADES_PAGO,
  type Compra,
  type Insumo,
  type ModalidadPago,
  type Proveedor,
} from "@/lib/types";
import {
  createComprasLote,
  createProveedor,
  getTasaBcvPorFecha,
  type CompraInput,
} from "@/lib/data/cocina";
import {
  guardarEquivalencias,
  listEquivalencias,
  proveedorPorRif,
  setProveedorRif,
  type Equivalencia,
} from "@/lib/data/facturas";
import {
  normalizarDescripcion,
  parseFactura,
  sugerirInsumo,
  type FacturaLeida,
} from "@/lib/facturas/parser";
import { leerFactura } from "@/lib/facturas/ocr";
import {
  CameraIcon,
  CheckIcon,
  DocIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from "@/components/icons";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import { hoyISO } from "@/lib/ui";

// Escanear factura: foto → OCR en el teléfono → reglas → preview editable →
// guardar la factura completa. Lo que se confirma queda en la memoria de la
// empresa para que la próxima factura del mismo proveedor salga ya asignada.

type Origen = "memoria" | "sugerido" | "manual" | "";

type LineaForm = {
  key: string;
  descripcion: string;
  /** Cantidad como viene en la factura. */
  cantidadFactura: string;
  /** Monto de la línea en la moneda de la factura. */
  total: string;
  exento: boolean;
  insumoId: string;
  /** Cantidad en unidades de compra del insumo (lo que se guarda). */
  cantidadInsumo: string;
  origen: Origen;
};

type Cabecera = {
  proveedorId: string;
  rif: string;
  proveedorLeido: string;
  numero: string;
  fecha: string;
  moneda: "bs" | "usd";
  modalidad: ModalidadPago;
  tasa: string;
  ivaPorc: string;
  /** true = los montos de las líneas ya traen el IVA. */
  ivaIncluido: boolean;
  fleteUsd: string;
  pagarDespues: boolean;
  totalLeido?: number;
};

const cabeceraVacia: Cabecera = {
  proveedorId: "",
  rif: "",
  proveedorLeido: "",
  numero: "",
  fecha: hoyISO(),
  moneda: "bs",
  modalidad: "bcv_dolar",
  tasa: "",
  ivaPorc: "16",
  ivaIncluido: false,
  fleteUsd: "",
  pagarDespues: false,
};

let siguienteKey = 0;
const nuevaKey = () => `l${++siguienteKey}`;

function fmtNum(n: number, dec = 2): string {
  if (!Number.isFinite(n)) return "";
  return String(Number(n.toFixed(dec)));
}

function fmtMonto(n: number, moneda: "bs" | "usd"): string {
  const s = n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "bs" ? `Bs ${s}` : `$${s}`;
}

/** Proveedor de la lista cuyo nombre se parece al leído en la factura. */
function proveedorPorNombre(proveedores: Proveedor[], nombre: string): Proveedor | undefined {
  const quitar = /\b(c ?a|s ?a|s ?r ?l|c ?por ?a|compania anonima|inversiones|distribuidora|comercial)\b/g;
  const n = normalizarDescripcion(nombre).replace(quitar, "").trim();
  if (n.length < 3) return undefined;
  return proveedores.find((p) => {
    const q = normalizarDescripcion(p.nombre).replace(quitar, "").trim();
    return q.length >= 3 && (q === n || n.includes(q) || q.includes(n));
  });
}

function Pill({ tono, children }: { tono: "verde" | "ambar" | "gris"; children: React.ReactNode }) {
  const clases = {
    verde: "bg-emerald-50 text-emerald-800",
    ambar: "bg-amber-50 text-amber-800",
    gris: "bg-marfil-soft text-cacao-soft",
  }[tono];
  const punto = { verde: "bg-emerald-500", ambar: "bg-amber-500", gris: "bg-cacao-soft/60" }[tono];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${clases}`}>
      <span className={`size-1.5 rounded-full ${punto}`} />
      {children}
    </span>
  );
}

export function EscanearFactura({
  insumos,
  proveedores,
  compras,
  onProveedorCreado,
  onGuardado,
  onCancelar,
  onManual,
}: {
  insumos: Insumo[];
  proveedores: Proveedor[];
  compras: Compra[];
  onProveedorCreado: (p: Proveedor) => void;
  onGuardado: (nuevas: Compra[]) => void | Promise<void>;
  onCancelar: () => void;
  /** Abre el formulario manual de siempre (contingencia). */
  onManual: () => void;
}) {
  const [paso, setPaso] = useState<"origen" | "pegar" | "leyendo" | "revision">("origen");
  const [progreso, setProgreso] = useState<{ etapa: string; pct: number }>({ etapa: "", pct: 0 });
  const [texto, setTexto] = useState("");
  const [cab, setCab] = useState<Cabecera>(cabeceraVacia);
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [memoria, setMemoria] = useState<Map<string, Equivalencia>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [creandoProv, setCreandoProv] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const insumoPorId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);
  const proveedorSel = proveedores.find((p) => p.id === cab.proveedorId);

  // La tasa sigue la FECHA de la factura y la forma de pago (como el formulario
  // manual): BCV € o paralela si se paga así; si no, BCV $.
  useEffect(() => {
    if (paso !== "revision" || !cab.fecha) return;
    let cancel = false;
    (async () => {
      const t = await getTasaBcvPorFecha(cab.fecha).catch(() => null);
      if (cancel || !t) return;
      const sug =
        cab.modalidad === "bcv_euro" ? t.eurBs : cab.modalidad === "paralela" ? t.paralelaBs : t.usdBs;
      if (Number(sug) > 0) setCab((c) => ({ ...c, tasa: String(sug) }));
    })();
    return () => {
      cancel = true;
    };
  }, [paso, cab.fecha, cab.modalidad]);

  /** Asigna cada línea con la memoria del proveedor (o una sugerencia por
   *  nombre). Respeta las que la persona ya eligió a mano. */
  function asignar(ls: LineaForm[], mem: Map<string, Equivalencia>): LineaForm[] {
    return ls.map((l) => {
      if (l.origen === "manual") return l;
      const cant = Number(l.cantidadFactura) || 0;
      const eq = mem.get(normalizarDescripcion(l.descripcion));
      if (eq && insumoPorId.has(eq.insumoId)) {
        return { ...l, insumoId: eq.insumoId, cantidadInsumo: fmtNum(cant * eq.factorCantidad, 4), origen: "memoria" };
      }
      const sug = sugerirInsumo(l.descripcion, insumos);
      return sug
        ? { ...l, insumoId: sug.id, cantidadInsumo: fmtNum(cant, 4), origen: "sugerido" }
        : { ...l, insumoId: "", cantidadInsumo: fmtNum(cant, 4), origen: "" };
    });
  }

  async function cambiarProveedor(id: string, base?: LineaForm[]) {
    setCab((c) => {
      const p = proveedores.find((x) => x.id === id);
      const acepta = p
        ? MODALIDADES_PAGO.map((m) => m.value).filter((m) =>
            ({
              bcv_dolar: p.aceptaBsBcvDolar,
              bcv_euro: p.aceptaBsBcvEuro,
              paralela: p.aceptaBsParalela,
              efectivo: p.aceptaUsdEfectivo,
              divisa: p.aceptaUsdDivisa,
            })[m],
          )
        : [];
      const modalidad = acepta.length > 0 && !acepta.includes(c.modalidad) ? acepta[0] : c.modalidad;
      return { ...c, proveedorId: id, modalidad };
    });
    // Primero se muestran las líneas con sugerencias por nombre; al llegar la
    // memoria del proveedor se reasignan (sin pisar lo elegido a mano).
    if (base) setLineas(asignar(base, new Map()));
    const mem = id ? await listEquivalencias(id) : new Map<string, Equivalencia>();
    setMemoria(mem);
    setLineas((prev) => asignar(prev, mem));
  }

  /** Pasa el texto (del OCR o pegado) por las reglas y arma el preview. */
  async function aplicarTexto(t: string) {
    const f: FacturaLeida = parseFactura(t);
    const prov = proveedorPorRif(proveedores, f.rif) ?? (f.proveedorNombre ? proveedorPorNombre(proveedores, f.proveedorNombre) : undefined);
    const moneda = f.moneda ?? "bs";
    setCab({
      ...cabeceraVacia,
      fecha: f.fecha ?? hoyISO(),
      rif: f.rif ?? "",
      proveedorLeido: f.proveedorNombre ?? "",
      numero: f.numero ?? "",
      moneda,
      modalidad: moneda === "bs" ? "bcv_dolar" : "divisa",
      ivaPorc: String(f.ivaPorc ?? 16),
      // Si la factura no muestra IVA aparte, asumimos que los montos ya lo traen.
      ivaIncluido: f.iva === undefined && f.ivaPorc === undefined,
      totalLeido: f.total,
    });
    const base: LineaForm[] = f.lineas.map((l) => ({
      key: nuevaKey(),
      descripcion: l.descripcion,
      cantidadFactura: fmtNum(l.cantidad, 3),
      total: fmtNum(l.total),
      exento: l.exento,
      insumoId: "",
      cantidadInsumo: fmtNum(l.cantidad, 3),
      origen: "",
    }));
    setPaso("revision");
    await cambiarProveedor(prov?.id ?? "", base);
  }

  async function leerFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setPaso("leyendo");
    setProgreso({ etapa: "Limpiando la foto", pct: 0 });
    try {
      const t = await leerFactura(archivo, (etapa, pct) => setProgreso({ etapa, pct }));
      setTexto(t);
      if (!t.trim()) {
        setError("No se pudo leer texto en la foto. Prueba con más luz, la factura plana y completa.");
        setPaso("origen");
        return;
      }
      await aplicarTexto(t);
    } catch (e) {
      setError(
        extractError(e, "No se pudo leer la foto.") +
          " Si es la primera vez, el teléfono necesita internet para descargar el lector.",
      );
      setPaso("origen");
    }
  }

  function elegirOrigen(origen: string) {
    if (origen === "foto") fotoRef.current?.click();
    else if (origen === "galeria") galeriaRef.current?.click();
    else setPaso("pegar");
  }

  function setLinea(key: string, patch: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function crearProveedorLeido() {
    const nombre = cab.proveedorLeido.trim();
    if (!nombre) return;
    setCreandoProv(true);
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
      if (cab.rif) await setProveedorRif(nuevo.id, cab.rif).catch(() => {});
      onProveedorCreado({ ...nuevo, rif: cab.rif || undefined });
      setCab((c) => ({ ...c, proveedorId: nuevo.id }));
      setMemoria(new Map());
    } catch (e) {
      setError(extractError(e, "No se pudo crear el proveedor"));
    } finally {
      setCreandoProv(false);
    }
  }

  // ── Cuentas del preview ──
  const iva = (Number(cab.ivaPorc) || 0) / 100;
  const tasaNum = Number(cab.tasa) || 0;
  const sumaBase = lineas.reduce((s, l) => s + (Number(l.total) || 0), 0);
  const ivaCalculado = cab.ivaIncluido
    ? 0
    : lineas.reduce((s, l) => s + (l.exento ? 0 : (Number(l.total) || 0) * iva), 0);
  const totalCalculado = sumaBase + ivaCalculado;
  const difiereDelTotal =
    cab.totalLeido !== undefined &&
    cab.totalLeido > 0 &&
    Math.abs(totalCalculado - cab.totalLeido) > Math.max(0.05, cab.totalLeido * 0.01);
  const sinAsignar = lineas.filter((l) => !l.insumoId).length;
  const yaRegistrada = useMemo(() => {
    const num = cab.numero.trim().toLowerCase();
    if (!num) return null;
    return (
      compras.find(
        (c) =>
          (c.numeroFactura ?? "").trim().toLowerCase() === num &&
          (!cab.proveedorId || c.proveedorId === cab.proveedorId),
      ) ?? null
    );
  }, [compras, cab.numero, cab.proveedorId]);

  /** Costo real en USD de una línea (con IVA si corresponde). */
  function costoLinea(l: LineaForm): { usd: number; bs?: number } {
    const base = Number(l.total) || 0;
    const conIva = cab.ivaIncluido || l.exento ? base : base * (1 + iva);
    if (cab.moneda === "bs") return { usd: tasaNum > 0 ? conIva / tasaNum : 0, bs: conIva };
    return { usd: conIva, bs: tasaNum > 0 ? conIva * tasaNum : undefined };
  }

  /** Aviso si el precio por unidad cambia mucho frente al actual del insumo
   *  (suele ser un número mal leído o la cantidad en otra unidad). */
  function avisoPrecio(l: LineaForm): string | null {
    const ins = insumoPorId.get(l.insumoId);
    const cant = Number(l.cantidadInsumo) || 0;
    if (!ins || !ins.precioCompraUsd || ins.precioCompraUsd <= 0 || cant <= 0) return null;
    const nuevo = costoLinea(l).usd / cant;
    if (!(nuevo > 0)) return null;
    const cambio = nuevo / ins.precioCompraUsd - 1;
    if (Math.abs(cambio) <= 0.5) return null;
    return `Queda a $${nuevo.toFixed(2)} por ${ins.unidadCompra} (hoy $${ins.precioCompraUsd.toFixed(2)}). Revisa la cantidad o el monto.`;
  }

  async function guardar(confirmado = false) {
    setError(null);
    if (lineas.length === 0) {
      setError("La factura no tiene líneas. Agrega al menos una.");
      return;
    }
    if (sinAsignar > 0) {
      setError("Elige el insumo de cada línea, o quita con ✕ las que no son insumos (bolsas, servicios…).");
      return;
    }
    if (cab.moneda === "bs" && !(tasaNum > 0)) {
      setError("Falta la tasa para pasar los bolívares a dólares.");
      return;
    }
    const malas = lineas.filter((l) => !(Number(l.total) > 0) || !(Number(l.cantidadInsumo) > 0));
    if (malas.length > 0) {
      setError("Cada línea necesita una cantidad y un monto mayores que cero.");
      return;
    }
    if (!confirmado) {
      const a: string[] = [];
      if (yaRegistrada) a.push(`La factura ${cab.numero} de este proveedor ya está registrada (${yaRegistrada.fecha}).`);
      if (difiereDelTotal && cab.totalLeido)
        a.push(
          `La suma (${fmtMonto(totalCalculado, cab.moneda)}) no coincide con el total de la factura (${fmtMonto(cab.totalLeido, cab.moneda)}). Puede faltar una línea o haber un monto mal leído.`,
        );
      if (!cab.proveedorId) a.push("La factura no tiene proveedor: Bolo no podrá recordar estas líneas para la próxima.");
      if (a.length > 0) {
        setAvisos(a);
        return;
      }
    }
    setAvisos(null);
    setGuardando(true);
    try {
      const notaIva = cab.ivaIncluido ? null : `IVA ${Number(cab.ivaPorc) || 0}% agregado`;
      const notas = ["Factura escaneada", notaIva].filter(Boolean).join(" · ");
      const flete = Number(cab.fleteUsd) > 0 ? Number(cab.fleteUsd) : undefined;
      const inputs: CompraInput[] = lineas.map((l, i) => {
        const c = costoLinea(l);
        return {
          insumoId: l.insumoId,
          proveedorId: cab.proveedorId || undefined,
          fecha: cab.fecha,
          cantidad: Math.round((Number(l.cantidadInsumo) || 0) * 1e6) / 1e6,
          precioTotalUsd: c.usd,
          precioTotalBs: c.bs,
          tasaBcvUsada: tasaNum > 0 ? tasaNum : undefined,
          modalidadPago: cab.modalidad,
          notas,
          numeroFactura: cab.numero.trim() || undefined,
          // El flete es de la factura, no de cada línea: va solo en la primera.
          fleteUsd: i === 0 ? flete : undefined,
          pagada: yaRegistrada ? yaRegistrada.pagada : !cab.pagarDespues,
        };
      });
      const nuevas = await createComprasLote(inputs);
      if (cab.proveedorId) {
        await guardarEquivalencias(
          cab.proveedorId,
          lineas.map((l) => ({
            descripcion: l.descripcion,
            insumoId: l.insumoId,
            factorCantidad: (Number(l.cantidadInsumo) || 0) / (Number(l.cantidadFactura) || 1),
          })),
          memoria,
        );
        if (cab.rif && !proveedorSel?.rif) await setProveedorRif(cab.proveedorId, cab.rif).catch(() => {});
      }
      await onGuardado(nuevas);
    } catch (e) {
      setError(extractError(e, "No se pudo guardar la factura"));
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white text-sm";

  return (
    <section className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">Escanear factura</h2>
          <p className="mt-1 text-xs text-cacao-soft">
            La foto se lee en este teléfono y no se envía a ningún lado. Lo que tu equipo confirma se queda en tu empresa.
          </p>
        </div>
        <button type="button" onClick={onCancelar} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
          Cerrar
        </button>
      </div>

      {error && <ErrorBanner className="mt-4">{error}</ErrorBanner>}

      {/* Inputs ocultos: la cámara nativa del teléfono da la foto a resolución
          completa (mejor para leer que la vista previa de video). */}
      <input
        ref={fotoRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void leerFoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void leerFoto(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {paso === "origen" && (
        <div className="mt-4">
          <ul className="divide-y divide-marfil">
            {[
              { icono: CameraIcon, titulo: "Tomar foto", detalle: "Factura plana, con buena luz y completa", accion: "foto" },
              { icono: ImageIcon, titulo: "Elegir de la galería", detalle: "Una foto que ya tomaste", accion: "galeria" },
              { icono: DocIcon, titulo: "Pegar el texto", detalle: "Si ya tienes el texto de la factura", accion: "pegar" },
            ].map(({ icono: Icono, titulo, detalle, accion }) => (
              <li key={titulo}>
                <button type="button" onClick={() => elegirOrigen(accion)} className="flex w-full items-center gap-3 py-3 text-left hover:text-terracotta">
                  <Icono className="size-5 shrink-0 text-cacao" />
                  <span>
                    <span className="block text-sm font-medium text-cacao">{titulo}</span>
                    <span className="block text-xs text-cacao-soft">{detalle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onManual} className="mt-3 inline-flex items-center gap-2 text-xs text-cacao-soft underline hover:text-cacao">
            <PencilIcon className="size-3.5" />
            Registrar a mano, sin factura
          </button>
        </div>
      )}

      {paso === "pegar" && (
        <div className="mt-4 space-y-3">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={10}
            placeholder="Pega aquí el texto de la factura"
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 font-mono text-xs"
          />
          <div className="flex gap-3">
            <button
              type="button"
              disabled={!texto.trim()}
              onClick={() => void aplicarTexto(texto)}
              className="rounded-xl bg-cacao px-5 py-2.5 text-sm font-medium text-white hover:bg-terracotta disabled:opacity-50"
            >
              Leer texto
            </button>
            <button type="button" onClick={() => setPaso("origen")} className="text-sm text-cacao-soft hover:text-cacao">
              ← Volver
            </button>
          </div>
        </div>
      )}

      {paso === "leyendo" && (
        <div className="mt-6 space-y-2" aria-live="polite">
          <p className="text-sm text-cacao">{progreso.etapa}…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-marfil">
            <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${Math.max(4, progreso.pct)}%` }} />
          </div>
          <p className="text-xs text-cacao-soft">En teléfonos más viejos puede tardar hasta medio minuto.</p>
        </div>
      )}

      {paso === "revision" && (
        <div className="mt-4 space-y-5">
          {/* ── Cabecera ── */}
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-cacao col-span-2">
              Proveedor
              <select value={cab.proveedorId} onChange={(e) => void cambiarProveedor(e.target.value)} className={campo}>
                <option value="">— Sin proveedor —</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
              {!cab.proveedorId && cab.proveedorLeido && (
                <button
                  type="button"
                  disabled={creandoProv}
                  onClick={() => void crearProveedorLeido()}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-terracotta hover:underline disabled:opacity-50"
                >
                  <PlusIcon className="size-3.5" />
                  Crear proveedor «{cab.proveedorLeido}»{cab.rif ? ` (${cab.rif})` : ""}
                </button>
              )}
            </label>
            <label className="text-sm text-cacao col-span-2 sm:col-span-1">
              Nombre leído
              <input value={cab.proveedorLeido} onChange={(e) => setCab({ ...cab, proveedorLeido: e.target.value })} className={campo} />
            </label>
            <label className="text-sm text-cacao">
              RIF
              <input value={cab.rif} onChange={(e) => setCab({ ...cab, rif: e.target.value })} placeholder="J-12345678-9" className={campo} />
            </label>
            <label className="text-sm text-cacao">
              N° de factura
              <input value={cab.numero} onChange={(e) => setCab({ ...cab, numero: e.target.value })} className={campo} />
            </label>
            <label className="text-sm text-cacao">
              Fecha
              <input type="date" value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} className={campo} />
            </label>
            <label className="text-sm text-cacao">
              Moneda de la factura
              <select
                value={cab.moneda}
                onChange={(e) => setCab({ ...cab, moneda: e.target.value as "bs" | "usd" })}
                className={campo}
              >
                <option value="bs">Bolívares (Bs)</option>
                <option value="usd">Dólares ($)</option>
              </select>
            </label>
            <label className="text-sm text-cacao">
              Forma de pago
              <select
                value={cab.modalidad}
                onChange={(e) => setCab({ ...cab, modalidad: e.target.value as ModalidadPago })}
                className={campo}
              >
                {MODALIDADES_PAGO.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-cacao">
              Tasa (Bs por $)
              <input inputMode="decimal" value={cab.tasa} onChange={(e) => setCab({ ...cab, tasa: e.target.value })} className={campo} />
            </label>
            <label className="text-sm text-cacao">
              Flete / delivery ($)
              <input inputMode="decimal" value={cab.fleteUsd} onChange={(e) => setCab({ ...cab, fleteUsd: e.target.value })} className={campo} />
            </label>
            <div className="text-sm text-cacao col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2">
              <label className="inline-flex items-center gap-2">
                IVA
                <input
                  inputMode="decimal"
                  value={cab.ivaPorc}
                  onChange={(e) => setCab({ ...cab, ivaPorc: e.target.value })}
                  className="w-16 rounded-lg ring-1 ring-marfil px-2 py-1 text-sm"
                />
                %
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={cab.ivaIncluido} onChange={(e) => setCab({ ...cab, ivaIncluido: e.target.checked })} />
                Los montos ya traen el IVA
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={yaRegistrada ? !yaRegistrada.pagada : cab.pagarDespues}
                  disabled={!!yaRegistrada}
                  onChange={(e) => setCab({ ...cab, pagarDespues: e.target.checked })}
                />
                Se paga después
              </label>
            </div>
          </div>

          {/* ── Líneas ── */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs tracking-[0.2em] uppercase text-cacao">Líneas ({lineas.length})</h3>
              {sinAsignar > 0 && <Pill tono="ambar">{sinAsignar} sin insumo</Pill>}
            </div>
            {lineas.length === 0 && (
              <p className="mt-2 text-sm text-cacao-soft">
                No se reconocieron productos. Agrégalos con el botón de abajo o revisa el texto leído.
              </p>
            )}
            <ul className="mt-2 divide-y divide-marfil">
              {lineas.map((l) => {
                const ins = insumoPorId.get(l.insumoId);
                const aviso = avisoPrecio(l);
                return (
                  <li key={l.key} className="py-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        value={l.descripcion}
                        onChange={(e) => setLinea(l.key, { descripcion: e.target.value })}
                        aria-label="Descripción en la factura"
                        className="min-w-0 flex-1 rounded-lg ring-1 ring-marfil px-3 py-1.5 text-sm font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
                        aria-label="Quitar línea"
                        className="p-2 text-cacao-soft hover:text-terracotta"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs text-cacao-soft">
                      <label>
                        Cant. factura
                        <input
                          inputMode="decimal"
                          value={l.cantidadFactura}
                          onChange={(e) => {
                            // La cantidad del insumo sigue a la de la factura con el mismo factor.
                            const vieja = Number(l.cantidadFactura) || 0;
                            const factor = vieja > 0 ? (Number(l.cantidadInsumo) || 0) / vieja : 1;
                            const nueva = Number(e.target.value) || 0;
                            setLinea(l.key, { cantidadFactura: e.target.value, cantidadInsumo: fmtNum(nueva * (factor || 1), 4) });
                          }}
                          className="mt-0.5 w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                        />
                      </label>
                      <label>
                        Monto ({cab.moneda === "bs" ? "Bs" : "$"})
                        <input
                          inputMode="decimal"
                          value={l.total}
                          onChange={(e) => setLinea(l.key, { total: e.target.value })}
                          className="mt-0.5 w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                        />
                      </label>
                      <label className="flex items-end gap-1.5 pb-2">
                        <input type="checkbox" checked={l.exento} onChange={(e) => setLinea(l.key, { exento: e.target.checked })} />
                        Exento
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                      <label className="text-xs text-cacao-soft">
                        <span className="flex items-center gap-2">
                          Es el insumo
                          {l.origen === "memoria" && <Pill tono="verde">Recordado</Pill>}
                          {l.origen === "sugerido" && <Pill tono="ambar">Sugerido, confírmalo</Pill>}
                          {!l.insumoId && <Pill tono="gris">Sin asignar</Pill>}
                        </span>
                        <select
                          value={l.insumoId}
                          onChange={(e) => setLinea(l.key, { insumoId: e.target.value, origen: "manual" })}
                          className="mt-0.5 w-full rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao bg-white"
                        >
                          <option value="">— Elige el insumo —</option>
                          {insumos.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nombre} ({i.unidadCompra})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs text-cacao-soft">
                        Cantidad que entra
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <input
                            inputMode="decimal"
                            value={l.cantidadInsumo}
                            onChange={(e) => setLinea(l.key, { cantidadInsumo: e.target.value })}
                            className="w-24 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                          />
                          <span className="text-sm text-cacao">{ins?.unidadCompra ?? ""}</span>
                        </span>
                      </label>
                    </div>
                    {aviso && (
                      <p className="flex items-start gap-1.5 text-xs text-amber-800">
                        <WarningIcon className="mt-0.5 size-3.5 shrink-0" />
                        {aviso}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() =>
                setLineas((ls) => [
                  ...ls,
                  { key: nuevaKey(), descripcion: "", cantidadFactura: "1", total: "", exento: false, insumoId: "", cantidadInsumo: "1", origen: "" },
                ])
              }
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-cacao hover:text-terracotta"
            >
              <PlusIcon className="size-4" />
              Agregar línea
            </button>
          </div>

          {/* ── Totales ── */}
          <dl className="space-y-1 border-t border-marfil pt-3 text-sm text-cacao">
            <div className="flex justify-between">
              <dt className="text-cacao-soft">Suma de líneas</dt>
              <dd>{fmtMonto(sumaBase, cab.moneda)}</dd>
            </div>
            {!cab.ivaIncluido && (
              <div className="flex justify-between">
                <dt className="text-cacao-soft">IVA {Number(cab.ivaPorc) || 0}%</dt>
                <dd>{fmtMonto(ivaCalculado, cab.moneda)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd>
                {fmtMonto(totalCalculado, cab.moneda)}
                {cab.moneda === "bs" && tasaNum > 0 && (
                  <span className="ml-2 font-normal text-cacao-soft">≈ ${(totalCalculado / tasaNum).toFixed(2)}</span>
                )}
              </dd>
            </div>
            {cab.totalLeido !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <dt className="text-cacao-soft">Total impreso en la factura</dt>
                <dd>
                  {difiereDelTotal ? (
                    <Pill tono="ambar">{fmtMonto(cab.totalLeido, cab.moneda)} · no cuadra</Pill>
                  ) : (
                    <Pill tono="verde">{fmtMonto(cab.totalLeido, cab.moneda)} · cuadra</Pill>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {avisos && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-3 text-sm text-cacao space-y-2">
              {avisos.map((a) => (
                <p key={a} className="flex items-start gap-2">
                  <WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  {a}
                </p>
              ))}
              <div className="flex gap-4 pt-1">
                <button type="button" onClick={() => void guardar(true)} className="text-sm font-semibold text-terracotta hover:underline">
                  Guardar igual
                </button>
                <button type="button" onClick={() => setAvisos(null)} className="text-sm text-cacao-soft hover:text-cacao">
                  Revisar
                </button>
              </div>
            </div>
          )}

          <details className="text-xs text-cacao-soft">
            <summary className="cursor-pointer">Ver el texto leído</summary>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="mt-2 w-full rounded-lg ring-1 ring-marfil px-3 py-2 font-mono text-xs text-cacao"
            />
            <button type="button" onClick={() => void aplicarTexto(texto)} className="mt-1 text-xs underline hover:text-cacao">
              Volver a leer este texto (se pierden los cambios del preview)
            </button>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={guardando || lineas.length === 0}
              onClick={() => void guardar()}
              className="inline-flex items-center gap-2 rounded-xl bg-cacao px-5 py-3 text-sm font-medium text-white hover:bg-terracotta disabled:opacity-50"
            >
              <CheckIcon className="size-4" />
              {guardando ? "Guardando…" : `Guardar factura (${lineas.length} ${lineas.length === 1 ? "línea" : "líneas"})`}
            </button>
            <button type="button" onClick={() => setPaso("origen")} className="text-sm text-cacao-soft hover:text-cacao">
              Escanear otra
            </button>
          </div>
          {insumos.length === 0 && (
            <p className="text-xs text-cacao-soft">
              Aún no tienes insumos. Créalos en{" "}
              <Link href="/cocina/insumos" className="underline">
                Insumos
              </Link>{" "}
              para poder asignar las líneas.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
