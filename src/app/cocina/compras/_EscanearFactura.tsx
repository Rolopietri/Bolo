"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MODALIDADES_PAGO,
  type Compra,
  type Insumo,
  type ModalidadPago,
  type Proveedor,
  type TasaBcv,
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
import { normalizarDescripcion, parseFactura, sugerirInsumo, totalProductos, type FacturaLeida } from "@/lib/facturas/parser";
import { leerFactura } from "@/lib/facturas/ocr";
import { CameraIcon, DocIcon, ImageIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, WarningIcon } from "@/components/icons";
import { CantidadUnidad, factorDe } from "@/components/CantidadUnidad";
import { displayCantidad, opcionesCantidad, precioLegible } from "@/lib/units";
import { ErrorBanner } from "@/components/ErrorBanner";
import { extractError } from "@/lib/data/error";
import { hoyISO } from "@/lib/ui";

// Escanear factura: foto → OCR en el teléfono → el MISMO formulario de
// "Registrar compra", ya lleno. Los datos de la factura (proveedor, fecha, N°,
// pago, IVA, tasa, flete) van una sola vez arriba; abajo, un renglón por
// producto (insumo, cantidad, monto). Un solo botón registra todos. Lo que se
// confirma queda en la memoria de la empresa para la próxima factura.

type Origen = "memoria" | "sugerido" | "";

type Producto = {
  key: string;
  /** Cómo venía en la factura (para la memoria). */
  descripcion: string;
  /** Cantidad tal cual la factura (para aprender el factor). */
  cantidadFactura: number;
  insumoId: string;
  cantidad: string;
  /** Opción de unidad del insumo ("" = su presentación de compra). */
  unidad: string;
  /** Monto en la moneda de la factura. */
  monto: string;
  exento: boolean;
  /** La factura traía la cantidad con decimales: es peso (kg). */
  pesable: boolean;
  origen: Origen;
};

type Cabecera = {
  proveedorId: string;
  fecha: string;
  modalidadPago: ModalidadPago;
  moneda: "bs" | "usd";
  ivaModo: "con" | "sin";
  ivaPorc: string;
  tasa: string;
  numeroFactura: string;
  fleteUsd: string;
  notas: string;
  pagarDespues: boolean;
};

/** Lo leído de la factura que no va en el formulario: sirve para reconocer
 *  al proveedor y para cuadrar contra la fórmula impresa. */
type Leido = { nombre: string; rif: string; resumen: Pick<FacturaLeida, "subtotal" | "base" | "iva" | "exento" | "igtf" | "descuento" | "total" | "ivaPorc"> };

const cabeceraVacia: Cabecera = {
  proveedorId: "",
  fecha: hoyISO(),
  modalidadPago: "bcv_dolar",
  moneda: "bs",
  ivaModo: "con",
  ivaPorc: "16",
  tasa: "",
  numeroFactura: "",
  fleteUsd: "",
  notas: "",
  pagarDespues: false,
};

let siguienteKey = 0;
const nuevaKey = () => `p${++siguienteKey}`;

function fmtQty(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  return String(Number(n.toFixed(4)));
}
function fmtPrecio(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n >= 0.01 ? n.toFixed(2) : n.toPrecision(2)}`;
}
function fmtFecha(fecha: string): string {
  return new Date(fecha + "T00:00").toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMonto(n: number, moneda: "bs" | "usd"): string {
  const s = n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return moneda === "bs" ? `Bs ${s}` : `$${s}`;
}

/** La fórmula impresa en la factura (subtotal, base, IVA, exento, IGTF, total),
 *  solo de lectura, para comparar con lo que se va a guardar. */
function ResumenFactura({
  resumen,
  moneda,
  cuadra,
}: {
  resumen: Leido["resumen"];
  moneda: "bs" | "usd";
  cuadra: boolean | null;
}) {
  const partes: [string, number | undefined][] = [
    ["Subtotal", resumen.subtotal],
    ["Descuento", resumen.descuento],
    ["Exento", resumen.exento],
    ["Base imponible", resumen.base],
    [`IVA${resumen.ivaPorc ? ` ${resumen.ivaPorc}%` : ""}`, resumen.iva],
    ["IGTF", resumen.igtf],
    ["Total", resumen.total],
  ];
  const visibles = partes.filter((x): x is [string, number] => x[1] !== undefined);
  if (visibles.length === 0) return null;
  return (
    <div className="mt-2 border-t border-marfil pt-2 text-xs">
      <span className="text-cacao-mute">Según la factura:</span>
      <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-cacao-soft">
        {visibles.map(([nombre, valor]) => (
          <div key={nombre} className="contents">
            <dt>{nombre}</dt>
            <dd className="text-right tabular-nums">{fmtMonto(valor, moneda)}</dd>
          </div>
        ))}
      </dl>
      {cuadra !== null && (
        <span className={`mt-1 block ${cuadra ? "text-oliva" : "text-terracotta font-medium"}`}>
          {!cuadra && <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />}
          {cuadra
            ? "Los productos cuadran con la factura."
            : `Los productos no cuadran con la factura${resumen.igtf ? " (sin contar el IGTF)" : ""}: revisa montos o si falta alguno.`}
        </span>
      )}
    </div>
  );
}

function modalidadesQueAcepta(p: Proveedor): ModalidadPago[] {
  const acepta: Record<ModalidadPago, boolean> = {
    bcv_dolar: p.aceptaBsBcvDolar,
    bcv_euro: p.aceptaBsBcvEuro,
    paralela: p.aceptaBsParalela,
    efectivo: p.aceptaUsdEfectivo,
    divisa: p.aceptaUsdDivisa,
  };
  return MODALIDADES_PAGO.map((m) => m.value).filter((m) => acepta[m]);
}

/** Proveedor de la lista cuyo nombre se parece al leído en la factura. */
function proveedorPorNombre(proveedores: Proveedor[], nombre: string): Proveedor | undefined {
  const quitar = /\b(c ?a|s ?a|s ?r ?l|compania anonima|inversiones|distribuidora|comercial)\b/g;
  const n = normalizarDescripcion(nombre).replace(quitar, "").trim();
  if (n.length < 3) return undefined;
  return proveedores.find((p) => {
    const q = normalizarDescripcion(p.nombre).replace(quitar, "").trim();
    return q.length >= 3 && (q === n || n.includes(q) || q.includes(n));
  });
}

/** Unidad efectiva y conversión de un producto (igual que el formulario manual:
 *  la cantidad se escribe en la unidad que se tenga a mano y se guarda en
 *  unidades de compra).
 *
 *  Si nadie eligió la unidad y no hay memoria, se sigue la costumbre de las
 *  facturas venezolanas: una cantidad escrita con decimales ("1,1895") es peso
 *  en kg (o L); una entera ("2") son unidades de la presentación del insumo. */
function conversion(p: Producto, ins: Insumo | undefined) {
  if (!ins) return { opciones: [], unidad: "", enBase: 0, enCompra: Number(p.cantidad) || 0 };
  const opciones = opcionesCantidad(ins);
  const cpc = ins.cantidadPorCompra ?? 0;
  let unidad = opciones.some((o) => o.key === p.unidad)
    ? p.unidad
    : (opciones.find((o) => Math.abs(o.factor - cpc) < 1e-9)?.key ?? opciones[0]?.key ?? "");
  if (p.unidad === "" && p.origen !== "memoria" && p.pesable) {
    unidad = opciones.find((o) => o.key === "kg" || o.key === "L")?.key ?? unidad;
  }
  const enBase = (Number(p.cantidad) || 0) * factorDe(opciones, unidad);
  const enCompra = cpc > 0 ? enBase / cpc : Number(p.cantidad) || 0;
  return { opciones, unidad, enBase, enCompra };
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
  const [paso, setPaso] = useState<"origen" | "pegar" | "leyendo" | "formulario">("origen");
  const [progreso, setProgreso] = useState<{ etapa: string; pct: number }>({ etapa: "", pct: 0 });
  const [texto, setTexto] = useState("");
  const [cab, setCab] = useState<Cabecera>(cabeceraVacia);
  const [leido, setLeido] = useState<Leido>({ nombre: "", rif: "", resumen: {} });
  /** La foto, solo en la memoria del teléfono (nunca se sube). */
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [verFoto, setVerFoto] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [productos, setProductos] = useState<Producto[]>([]);
  /** Renglones leídos que no parecen productos: se pueden rescatar. */
  const [otras, setOtras] = useState<Producto[]>([]);
  const [memoria, setMemoria] = useState<Map<string, Equivalencia>>(new Map());
  const [tasaDia, setTasaDia] = useState<TasaBcv | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const insumoPorId = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  // Liberar la foto de la memoria al cambiarla o al cerrar.
  useEffect(() => {
    return () => {
      if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    };
  }, [fotoUrl]);

  // La tasa sigue la FECHA de la factura (como el formulario manual).
  useEffect(() => {
    if (paso !== "formulario" || !cab.fecha) return;
    let cancel = false;
    (async () => {
      const t = await getTasaBcvPorFecha(cab.fecha).catch(() => null);
      if (cancel || !t) return;
      setTasaDia(t);
      setCab((c) => {
        const sug = c.modalidadPago === "bcv_euro" ? t.eurBs : c.modalidadPago === "paralela" ? t.paralelaBs : t.usdBs;
        return Number(sug) > 0 ? { ...c, tasa: String(sug) } : c;
      });
    })();
    return () => {
      cancel = true;
    };
  }, [paso, cab.fecha]);

  const tasaSugerida = !tasaDia
    ? null
    : cab.modalidadPago === "bcv_euro"
      ? (tasaDia.eurBs ?? null)
      : cab.modalidadPago === "paralela"
        ? (tasaDia.paralelaBs ?? null)
        : tasaDia.usdBs;

  function setModalidad(m: ModalidadPago) {
    setCab((c) => {
      let tasa = c.tasa;
      if (tasaDia) {
        const sug = m === "bcv_euro" ? tasaDia.eurBs : m === "paralela" ? tasaDia.paralelaBs : tasaDia.usdBs;
        if (Number(sug) > 0) tasa = String(sug);
      }
      return { ...c, modalidadPago: m, tasa };
    });
  }

  /** Asigna insumo y cantidad a cada renglón con la memoria del proveedor (o
   *  una sugerencia por nombre). Respeta lo que la persona ya cambió a mano. */
  function asignar(lista: Producto[], mem: Map<string, Equivalencia>): Producto[] {
    return lista.map((p) => {
      if (p.origen === "" && p.insumoId) return p; // elegido a mano
      const eq = mem.get(normalizarDescripcion(p.descripcion));
      if (eq && insumoPorId.has(eq.insumoId)) {
        return { ...p, insumoId: eq.insumoId, cantidad: fmtQty(p.cantidadFactura * eq.factorCantidad), unidad: "", origen: "memoria" };
      }
      if (p.origen === "memoria" || !p.insumoId) {
        const sug = sugerirInsumo(p.descripcion, insumos);
        return sug
          ? { ...p, insumoId: sug.id, cantidad: fmtQty(p.cantidadFactura), unidad: "", origen: "sugerido" }
          : { ...p, insumoId: "", origen: "" };
      }
      return p;
    });
  }

  /** Separa los renglones: arriba los que son productos; aparte los dudosos
   *  que no se parecen a ningún insumo. */
  function repartir(lista: Producto[], confianza: Map<string, "alta" | "baja">) {
    const prod: Producto[] = [];
    const resto: Producto[] = [];
    for (const p of lista) {
      if (p.insumoId || confianza.get(p.key) === "alta") prod.push(p);
      else resto.push(p);
    }
    setProductos(prod);
    setOtras(resto);
  }

  /** `leida`: los renglones recién leídos (al escanear se reparten de nuevo
   *  con la memoria; al cambiar de proveedor a mano solo se reasignan). */
  async function elegirProveedor(
    id: string,
    leida?: { lista: Producto[]; confianza: Map<string, "alta" | "baja"> },
  ) {
    setCab((c) => {
      const p = proveedores.find((x) => x.id === id);
      const acepta = p ? modalidadesQueAcepta(p) : [];
      return acepta.length > 0 && !acepta.includes(c.modalidadPago)
        ? { ...c, proveedorId: id, modalidadPago: acepta[0] }
        : { ...c, proveedorId: id };
    });
    const mem = id ? await listEquivalencias(id) : new Map<string, Equivalencia>();
    setMemoria(mem);
    if (leida) repartir(asignar(leida.lista, mem), leida.confianza);
    else setProductos((ps) => asignar(ps, mem));
  }

  /** Pasa el texto (del OCR o pegado) por las reglas y llena el formulario. */
  async function aplicarTexto(t: string) {
    const f = parseFactura(t);
    const prov =
      proveedorPorRif(proveedores, f.rif) ?? (f.proveedorNombre ? proveedorPorNombre(proveedores, f.proveedorNombre) : undefined);
    const moneda = f.moneda ?? "bs";
    setLeido({
      nombre: f.proveedorNombre ?? "",
      rif: f.rif ?? "",
      resumen: { subtotal: f.subtotal, base: f.base, iva: f.iva, exento: f.exento, igtf: f.igtf, descuento: f.descuento, total: f.total, ivaPorc: f.ivaPorc },
    });
    setCab({
      ...cabeceraVacia,
      fecha: f.fecha ?? hoyISO(),
      moneda,
      modalidadPago: moneda === "bs" ? "bcv_dolar" : "divisa",
      // Si la factura muestra el IVA aparte, los montos de los productos son
      // la base: "Sin IVA" (el sistema lo suma). Si no, ya lo traen.
      ivaModo: f.iva !== undefined || f.base !== undefined || f.ivaPorc !== undefined ? "sin" : "con",
      ivaPorc: String(f.ivaPorc ?? 16),
      numeroFactura: f.numero ?? "",
    });
    // Si no se reconoce, el proveedor queda en blanco (el nombre leído solo se
    // propone si la persona elige "+ Nuevo proveedor…").
    setCreandoProveedor(false);
    setNuevoProveedor("");
    const confianza = new Map<string, "alta" | "baja">();
    const base: Producto[] = f.lineas.map((l) => {
      const key = nuevaKey();
      confianza.set(key, l.confianza);
      return {
        key,
        descripcion: l.descripcion,
        cantidadFactura: l.cantidad,
        insumoId: "",
        cantidad: fmtQty(l.cantidad),
        unidad: "",
        monto: String(Number(l.total.toFixed(2))),
        exento: l.exento,
        pesable: l.pesable,
        origen: "",
      };
    });
    // Primero con sugerencias por nombre; al llegar la memoria se reasigna.
    repartir(asignar(base, new Map()), confianza);
    setPaso("formulario");
    if (prov) await elegirProveedor(prov.id, { lista: base, confianza });
  }

  async function leerFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setFotoUrl(URL.createObjectURL(archivo));
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
    else {
      setFotoUrl(null); // el texto pegado no trae foto
      setPaso("pegar");
    }
  }

  function setProducto(key: string, patch: Partial<Producto>) {
    setProductos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

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
      if (leido.rif) await setProveedorRif(nuevo.id, leido.rif).catch(() => {});
      onProveedorCreado({ ...nuevo, rif: leido.rif || undefined });
      setCab((c) => ({ ...c, proveedorId: nuevo.id }));
      setMemoria(new Map());
      setCreandoProveedor(false);
      setNuevoProveedor("");
    } catch (e) {
      setError(extractError(e, "No se pudo crear el proveedor"));
    } finally {
      setGuardandoProveedor(false);
    }
  }

  // ── Cuentas ──
  const iva = (Number(cab.ivaPorc) || 0) / 100;
  const tasaNum = Number(cab.tasa) || 0;

  /** Lo que realmente se pagó por un producto, con IVA si corresponde. */
  function costo(p: Producto): { usd: number; bs?: number; enMoneda: number } {
    const m = Number(p.monto) || 0;
    const enMoneda = cab.ivaModo === "sin" && !p.exento ? m * (1 + iva) : m;
    if (cab.moneda === "bs") return { usd: tasaNum > 0 ? enMoneda / tasaNum : 0, bs: enMoneda, enMoneda };
    return { usd: enMoneda, bs: tasaNum > 0 ? enMoneda * tasaNum : undefined, enMoneda };
  }

  const totalMoneda = productos.reduce((s, p) => s + costo(p).enMoneda, 0);
  const totalUsd = productos.reduce((s, p) => s + costo(p).usd, 0);
  const esperado = totalProductos(leido.resumen);
  const cuadra =
    esperado === undefined ? null : Math.abs(totalMoneda - esperado) <= Math.max(0.05, esperado * 0.01);

  // Una factura se paga completa: si ya existe, los productos heredan su estado.
  const facturaLock = useMemo(() => {
    const num = cab.numeroFactura.trim().toLowerCase();
    if (!num) return null;
    return (
      compras.find(
        (c) =>
          (c.numeroFactura ?? "").trim().toLowerCase() === num &&
          (!cab.proveedorId || c.proveedorId === cab.proveedorId),
      ) ?? null
    );
  }, [compras, cab.numeroFactura, cab.proveedorId]);
  const pagarDespuesEfectivo = facturaLock ? !facturaLock.pagada : cab.pagarDespues;

  /** Precio por unidad que deja el producto, frente al actual del insumo. */
  function precioInfo(p: Producto) {
    const ins = insumoPorId.get(p.insumoId);
    const { enBase } = conversion(p, ins);
    const usd = costo(p).usd;
    if (!ins || !(enBase > 0) || !(usd > 0)) return null;
    const nuevo = usd / enBase;
    const actual = ins.precioBaseUsd ?? null;
    const cambio = actual && actual > 0 ? nuevo / actual - 1 : null;
    return {
      ahora: precioLegible(nuevo, ins.unidadBase),
      antes: actual && actual > 0 ? precioLegible(actual, ins.unidadBase) : null,
      cambio,
      fuerte: cambio !== null && Math.abs(cambio) > 0.5,
    };
  }

  async function registrarTodas(confirmado = false) {
    setError(null);
    if (productos.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }
    if (productos.some((p) => !p.insumoId)) {
      setError("Elige el insumo de cada producto, o quítalo con el botón de la papelera.");
      return;
    }
    if (productos.some((p) => !(Number(p.monto) > 0) || !(conversion(p, insumoPorId.get(p.insumoId)).enCompra > 0))) {
      setError("Cada producto necesita una cantidad y un monto mayores que cero.");
      return;
    }
    if (cab.moneda === "bs" && !(tasaNum > 0)) {
      setError("Falta la tasa del día para pasar los bolívares a dólares.");
      return;
    }
    if (!confirmado) {
      const a: string[] = [];
      if (facturaLock) a.push(`La factura ${cab.numeroFactura} de este proveedor ya tiene compras registradas (${fmtFecha(facturaLock.fecha)}).`);
      if (cuadra === false && esperado !== undefined)
        a.push(
          `La suma (${fmtMonto(totalMoneda, cab.moneda)}) no coincide con la factura (${fmtMonto(esperado, cab.moneda)}). Puede faltar un producto o haber un monto mal leído.`,
        );
      for (const p of productos) {
        const info = precioInfo(p);
        if (info?.fuerte && info.cambio !== null)
          a.push(
            `${insumoPorId.get(p.insumoId)?.nombre}: el precio ${info.cambio > 0 ? "sube" : "baja"} ${Math.abs(Math.round(info.cambio * 100))} %. Revisa la cantidad o el monto.`,
          );
      }
      if (a.length > 0) {
        setAvisos(a);
        return;
      }
    }
    setAvisos(null);
    setGuardando(true);
    try {
      const notaIva = cab.ivaModo === "sin" ? `IVA ${Number(cab.ivaPorc) || 0}% agregado` : null;
      const notas = [cab.notas.trim() || null, "Factura escaneada", notaIva].filter(Boolean).join(" · ");
      const flete = Number(cab.fleteUsd) > 0 ? Number(cab.fleteUsd) : undefined;
      const inputs: CompraInput[] = productos.map((p, i) => {
        const c = costo(p);
        const { enCompra } = conversion(p, insumoPorId.get(p.insumoId));
        return {
          insumoId: p.insumoId,
          proveedorId: cab.proveedorId || undefined,
          fecha: cab.fecha,
          cantidad: Math.round(enCompra * 1e6) / 1e6,
          precioTotalUsd: c.usd,
          precioTotalBs: c.bs,
          tasaBcvUsada: tasaNum > 0 ? tasaNum : undefined,
          modalidadPago: cab.modalidadPago,
          notas,
          numeroFactura: cab.numeroFactura.trim() || undefined,
          // El flete es de la factura, no de cada producto: va solo en el primero.
          fleteUsd: i === 0 ? flete : undefined,
          pagada: facturaLock ? facturaLock.pagada : !cab.pagarDespues,
        };
      });
      const nuevas = await createComprasLote(inputs);
      if (cab.proveedorId) {
        await guardarEquivalencias(
          cab.proveedorId,
          productos.map((p) => ({
            descripcion: p.descripcion,
            insumoId: p.insumoId,
            factorCantidad: conversion(p, insumoPorId.get(p.insumoId)).enCompra / (p.cantidadFactura || 1),
          })),
          memoria,
        );
        const prov = proveedores.find((x) => x.id === cab.proveedorId);
        if (leido.rif && !prov?.rif) await setProveedorRif(cab.proveedorId, leido.rif).catch(() => {});
      }
      await onGuardado(nuevas);
    } catch (e) {
      setError(extractError(e, "No se pudo registrar la factura"));
    } finally {
      setGuardando(false);
    }
  }

  const campo = "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white";
  const boton = (activo: boolean) =>
    activo
      ? "rounded-lg bg-cacao text-white px-3 py-2 text-sm font-medium"
      : "rounded-lg ring-1 ring-marfil px-3 py-2 text-sm text-cacao hover:bg-marfil-soft";

  return (
    <div className="mb-5 rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
          {paso === "formulario" ? "Nueva compra" : "Escanear factura"}
        </h2>
        <button type="button" onClick={onCancelar} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
          Cerrar
        </button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {/* La cámara nativa del teléfono da la foto a resolución completa. */}
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
        <div>
          <p className="text-xs text-cacao-soft">
            La foto se lee en este teléfono y no se envía a ningún lado. Lo que tu equipo confirma se queda en tu empresa.
          </p>
          <ul className="mt-2 divide-y divide-marfil">
            {[
              { icono: CameraIcon, titulo: "Tomar foto", detalle: "Factura plana, con buena luz y completa", accion: "foto" },
              { icono: ImageIcon, titulo: "Elegir de la galería", detalle: "Una foto que ya tomaste", accion: "galeria" },
              { icono: DocIcon, titulo: "Pegar el texto", detalle: "Si ya tienes el texto de la factura", accion: "pegar" },
            ].map(({ icono: Icono, titulo, detalle, accion }) => (
              <li key={titulo}>
                <button type="button" onClick={() => elegirOrigen(accion)} className="flex w-full items-center gap-3 py-3 text-left">
                  <Icono className="size-5 shrink-0 text-cacao" />
                  <span>
                    <span className="block text-sm font-medium text-cacao">{titulo}</span>
                    <span className="block text-xs text-cacao-soft">{detalle}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={onManual} className="mt-2 inline-flex items-center gap-2 text-xs text-cacao-soft underline hover:text-cacao">
            <PencilIcon className="size-3.5" />
            Registrar a mano, sin factura
          </button>
        </div>
      )}

      {paso === "pegar" && (
        <div className="space-y-3">
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
              className="rounded-lg bg-cacao px-5 py-2 text-sm font-medium text-white hover:bg-terracotta disabled:opacity-50"
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
        <div className="space-y-2 py-3" aria-live="polite">
          <p className="text-sm text-cacao">{progreso.etapa}…</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-marfil">
            <div className="h-full rounded-full bg-terracotta transition-all" style={{ width: `${Math.max(4, progreso.pct)}%` }} />
          </div>
          <p className="text-xs text-cacao-soft">En teléfonos más viejos puede tardar hasta medio minuto.</p>
        </div>
      )}

      {paso === "formulario" && fotoUrl && (
        <>
          {/* La foto, para comparar mientras se confirma. En pantallas anchas va
              al lado del formulario; en el teléfono, como miniatura fija. */}
          <button
            type="button"
            onClick={() => setVerFoto(true)}
            className="sticky top-2 z-10 flex w-full items-center gap-2.5 rounded-lg bg-white/95 ring-1 ring-marfil px-2 py-1.5 text-left shadow-sm backdrop-blur lg:hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:), no pasa por el optimizador */}
            <img src={fotoUrl} alt="Factura" className="h-9 w-7 shrink-0 rounded object-cover ring-1 ring-marfil" />
            <span className="text-sm text-cacao">Ver la factura</span>
            <SearchIcon className="ml-auto size-4 text-cacao-soft" />
          </button>
          {verFoto && (
            <div role="dialog" aria-label="Foto de la factura" className="fixed inset-0 z-50 flex flex-col bg-black/90">
              <div className="flex items-center justify-between gap-3 p-3 text-white">
                <button type="button" onClick={() => setZoom((z) => !z)} className="rounded-lg ring-1 ring-white/40 px-3 py-1.5 text-sm">
                  {zoom ? "Ver completa" : "Acercar"}
                </button>
                <button
                  type="button"
                  onClick={() => setVerFoto(false)}
                  aria-label="Cerrar la foto"
                  className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-cacao"
                >
                  Volver al formulario
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:) */}
                <img
                  src={fotoUrl}
                  alt="Factura"
                  onClick={() => setZoom((z) => !z)}
                  className={zoom ? "max-w-none" : "mx-auto h-full w-auto max-w-full object-contain"}
                  style={zoom ? { width: "250%" } : undefined}
                />
              </div>
            </div>
          )}
        </>
      )}

      {paso === "formulario" && (
        <div className={fotoUrl ? "lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-6" : ""}>
          {fotoUrl && (
            <aside className="hidden lg:block">
              <div className="sticky top-4 max-h-[85vh] overflow-auto rounded-lg ring-1 ring-marfil">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:) */}
                <img src={fotoUrl} alt="Factura" className="w-full cursor-zoom-in" onClick={() => setVerFoto(true)} />
              </div>
            </aside>
          )}
          <div className="space-y-3">
          {/* ── Datos de la factura (una sola vez) — mismos campos y orden que
              el formulario manual. ── */}
          <label className="text-sm text-cacao block">
            Proveedor
            <select
              value={creandoProveedor ? "__nuevo__" : cab.proveedorId}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__nuevo__") {
                  setCreandoProveedor(true);
                  setNuevoProveedor(leido.nombre);
                } else {
                  setCreandoProveedor(false);
                  void elegirProveedor(v);
                }
              }}
              className={campo}
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
                  placeholder="Nombre del proveedor nuevo"
                  autoCapitalize="words"
                  spellCheck={false}
                  className="flex-1 rounded-lg ring-1 ring-marfil px-3 py-2"
                />
                <button
                  type="button"
                  onClick={() => void agregarProveedor()}
                  disabled={guardandoProveedor || !nuevoProveedor.trim()}
                  className="shrink-0 rounded-lg bg-cacao text-white px-3 py-2 text-sm font-medium hover:bg-terracotta transition-colors disabled:opacity-50"
                >
                  {guardandoProveedor ? "Guardando…" : "Agregar"}
                </button>
              </div>
            )}
            {creandoProveedor && leido.rif && (
              <span className="text-[11px] text-cacao-mute block mt-1">
                No está en tu lista. Se guardará con su RIF {leido.rif} para reconocerlo la próxima vez.
              </span>
            )}
          </label>

          <label className="text-sm text-cacao block">
            Fecha
            <input type="date" required value={cab.fecha} onChange={(e) => setCab({ ...cab, fecha: e.target.value })} className={campo} />
          </label>

          <label className="text-sm text-cacao block">
            Modalidad de pago
            <select value={cab.modalidadPago} onChange={(e) => setModalidad(e.target.value as ModalidadPago)} className={campo}>
              {MODALIDADES_PAGO.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div className="text-sm text-cacao">
            ¿Los montos llevan IVA?
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setCab({ ...cab, ivaModo: "con" })} className={boton(cab.ivaModo === "con")}>
                Con IVA
              </button>
              <button type="button" onClick={() => setCab({ ...cab, ivaModo: "sin" })} className={boton(cab.ivaModo === "sin")}>
                Sin IVA (+{Number(cab.ivaPorc) || 0}%)
              </button>
              {cab.ivaModo === "sin" && (
                <label className="flex items-center gap-1.5 text-xs text-cacao-mute">
                  IVA
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={cab.ivaPorc}
                    onChange={(e) => setCab({ ...cab, ivaPorc: e.target.value })}
                    className="w-16 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                  />
                  %
                </label>
              )}
            </div>
            <span className="text-xs text-cacao-mute block mt-1">
              {cab.ivaModo === "con"
                ? "Los montos ya incluyen el IVA — se guardan tal cual."
                : "El sistema le suma el IVA a cada monto (salvo los exentos) para calcular el costo real."}
            </span>
          </div>

          <div className="text-sm text-cacao">
            Moneda de la factura
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setCab({ ...cab, moneda: "bs" })} className={boton(cab.moneda === "bs")}>
                Bs
              </button>
              <button type="button" onClick={() => setCab({ ...cab, moneda: "usd" })} className={boton(cab.moneda === "usd")}>
                $
              </button>
            </div>
          </div>

          <label className="text-sm text-cacao block">
            Tasa del día (Bs por $)
            <input
              type="number"
              step="0.0001"
              min="0"
              inputMode="decimal"
              value={cab.tasa}
              onChange={(e) => setCab({ ...cab, tasa: e.target.value })}
              className={campo}
            />
            {tasaSugerida !== null && (
              <span className="text-xs text-cacao-mute block mt-1">
                Tasa BCV del {fmtFecha(cab.fecha)}: Bs {Number(tasaSugerida).toFixed(2)}.{" "}
                {tasaNum > 0 && Math.abs(tasaNum - Number(tasaSugerida)) > 0.009 ? (
                  <button type="button" onClick={() => setCab({ ...cab, tasa: String(tasaSugerida) })} className="underline hover:text-cacao">
                    usar la del día
                  </button>
                ) : (
                  "Ajústala si tu factura usó otra."
                )}
              </span>
            )}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao block">
              N° de factura <span className="text-cacao-soft font-normal">(opcional)</span>
              <input
                type="text"
                value={cab.numeroFactura}
                onChange={(e) => setCab({ ...cab, numeroFactura: e.target.value })}
                placeholder="Ej: 00012345"
                className={campo}
              />
            </label>
            <label className="text-sm text-cacao block">
              Flete / delivery ($) <span className="text-cacao-soft font-normal">(opcional)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cab.fleteUsd}
                onChange={(e) => setCab({ ...cab, fleteUsd: e.target.value })}
                placeholder="0.00"
                className={campo}
              />
            </label>
          </div>

          {/* ── Productos: solo insumo, cantidad y monto. ── */}
          <div className="pt-2">
            <p className="text-sm text-cacao">Productos ({productos.length})</p>
            <ul className="mt-1 divide-y divide-marfil">
              {productos.map((p) => {
                const ins = insumoPorId.get(p.insumoId);
                const conv = conversion(p, ins);
                const info = precioInfo(p);
                return (
                  <li key={p.key} className="py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={p.insumoId}
                        onChange={(e) => setProducto(p.key, { insumoId: e.target.value, unidad: "", origen: "" })}
                        aria-label="Insumo"
                        className="min-w-0 flex-1 rounded-lg ring-1 ring-marfil px-3 py-2 bg-white text-sm"
                      >
                        <option value="">— Selecciona insumo —</option>
                        {insumos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} ({i.unidadCompra})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setProductos((ps) => ps.filter((x) => x.key !== p.key))}
                        aria-label="Quitar producto"
                        className="p-2 text-cacao-soft hover:text-terracotta"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {ins ? (
                        <CantidadUnidad
                          valor={p.cantidad}
                          unidad={conv.unidad}
                          opciones={conv.opciones}
                          onChange={(v, u) => {
                            if (u !== conv.unidad) {
                              // Igual que el manual: al cambiar de unidad se convierte el número.
                              const f = factorDe(conv.opciones, u);
                              setProducto(p.key, {
                                unidad: u,
                                cantidad: p.cantidad.trim() === "" ? "" : fmtQty(conv.enBase / f),
                              });
                            } else setProducto(p.key, { cantidad: v, unidad: conv.unidad });
                          }}
                        />
                      ) : (
                        <input disabled placeholder="Elige el insumo" className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-marfil-soft text-sm" />
                      )}
                      <label className="mt-1 flex rounded-lg ring-1 ring-marfil bg-white focus-within:ring-terracotta/60">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          value={p.monto}
                          onChange={(e) => setProducto(p.key, { monto: e.target.value })}
                          aria-label="Monto"
                          className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 outline-none"
                        />
                        <span className="shrink-0 self-center px-3 text-sm text-cacao-soft">{cab.moneda === "bs" ? "Bs" : "$"}</span>
                      </label>
                    </div>
                    <p className="text-[11px] text-cacao-mute">
                      {p.descripcion && <>«{p.descripcion}» · </>}
                      {p.origen === "memoria" && <span className="text-oliva">recordado</span>}
                      {p.origen === "sugerido" && <span className="text-terracotta">sugerido, confírmalo</span>}
                      {ins && conv.enBase > 0 && (
                        <>
                          {p.origen ? " · " : ""}entran <b>{displayCantidad(conv.enBase, ins.unidadBase)}</b>
                        </>
                      )}
                      {cab.ivaModo === "sin" && p.exento && (
                        <>
                          {" · "}
                          <button type="button" onClick={() => setProducto(p.key, { exento: false })} className="underline">
                            exento de IVA
                          </button>
                        </>
                      )}
                    </p>
                    {/* El precio solo se muestra cuando cambia mucho (suele ser un
                        número mal leído o la cantidad en otra unidad). */}
                    {info?.fuerte && (
                      <p className="text-[11px] text-terracotta font-medium">
                        <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                        Queda a {fmtPrecio(info.ahora.precio)} / {info.ahora.unidad}
                        {info.antes && (
                          <>
                            {" "}(antes {fmtPrecio(info.antes.precio)} / {info.antes.unidad}
                            {info.cambio !== null && `, ${info.cambio > 0 ? "+" : ""}${Math.round(info.cambio * 100)} %`})
                          </>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() =>
                setProductos((ps) => [
                  ...ps,
                  { key: nuevaKey(), descripcion: "", cantidadFactura: 1, insumoId: "", cantidad: "", unidad: "", monto: "", exento: false, pesable: false, origen: "" },
                ])
              }
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-cacao hover:text-terracotta"
            >
              <PlusIcon className="size-4" />
              Agregar producto
            </button>
            {otras.length > 0 && (
              <details className="mt-2 text-xs text-cacao-soft">
                <summary className="cursor-pointer">
                  {otras.length} {otras.length === 1 ? "renglón leído no parece" : "renglones leídos no parecen"} un producto
                </summary>
                <ul className="mt-1 divide-y divide-marfil">
                  {otras.map((o) => (
                    <li key={o.key} className="flex items-center justify-between gap-2 py-1.5">
                      <span className="min-w-0 truncate">
                        «{o.descripcion}» · {fmtMonto(Number(o.monto) || 0, cab.moneda)}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setOtras((os) => os.filter((x) => x.key !== o.key));
                          setProductos((ps) => [...ps, o]);
                        }}
                        className="shrink-0 underline hover:text-cacao"
                      >
                        Es un producto
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          {productos.length > 0 && (
            <div className="rounded-lg bg-marfil-soft ring-1 ring-marfil px-3 py-2 text-sm">
              <span className="text-cacao-mute">Total que se guarda: </span>
              <span className="text-cacao font-medium">${totalUsd.toFixed(2)}</span>
              {cab.moneda === "bs" && <span className="text-cacao-soft"> · {fmtMonto(totalMoneda, "bs")}</span>}
              {cab.ivaModo === "sin" && <span className="text-cacao-mute"> · incluye IVA {Number(cab.ivaPorc) || 0}%</span>}
              <ResumenFactura resumen={leido.resumen} moneda={cab.moneda} cuadra={cuadra} />
            </div>
          )}

          <textarea
            placeholder="Notas (opcional)"
            value={cab.notas}
            onChange={(e) => setCab({ ...cab, notas: e.target.value })}
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
              onChange={(e) => setCab({ ...cab, pagarDespues: e.target.checked })}
              className="mt-0.5 accent-cacao"
            />
            <span className="text-sm text-cacao">
              Pagar después{" "}
              <span className="text-cacao-soft">(cuenta por pagar — la factura queda pendiente de pago al proveedor)</span>
            </span>
          </label>

          {avisos && (
            <div className="rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-3 text-sm text-cacao space-y-2">
              {avisos.map((a) => (
                <p key={a} className="flex items-start gap-2">
                  <WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
                  {a}
                </p>
              ))}
              <div className="flex gap-4 pt-1">
                <button type="button" onClick={() => void registrarTodas(true)} className="text-sm font-semibold text-terracotta hover:underline">
                  Registrar igual
                </button>
                <button type="button" onClick={() => setAvisos(null)} className="text-sm text-cacao-soft hover:text-cacao">
                  Revisar
                </button>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              disabled={guardando || productos.length === 0}
              onClick={() => void registrarTodas()}
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta disabled:opacity-50"
            >
              {guardando ? "Registrando…" : `Registrar ${productos.length === 1 ? "compra" : `todas (${productos.length})`}`}
            </button>
            <button type="button" onClick={onCancelar} className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft">
              Cancelar
            </button>
          </div>

          <details className="text-xs text-cacao-soft">
            <summary className="cursor-pointer">Ver el texto leído de la foto</summary>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={8}
              className="mt-2 w-full rounded-lg ring-1 ring-marfil px-3 py-2 font-mono text-xs text-cacao"
            />
            <button type="button" onClick={() => void aplicarTexto(texto)} className="mt-1 underline hover:text-cacao">
              Volver a leer este texto (se pierden los cambios)
            </button>
          </details>
          {insumos.length === 0 && (
            <p className="text-xs text-cacao-soft">
              Aún no tienes insumos. Créalos en{" "}
              <Link href="/cocina/insumos" className="underline">
                Insumos
              </Link>{" "}
              para poder registrar la factura.
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
