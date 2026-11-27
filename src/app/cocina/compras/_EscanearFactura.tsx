"use client";

import { limpiarDecimal } from "@/lib/decimal";
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
  createInsumo,
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
  buscarEquivalencia,
  cantidadParaCuadre,
  compraConMismaFactura,
  normalizarDescripcion,
  parseFactura,
  sugerirInsumo,
  variantesDigito,
  totalProductos,
  type FacturaLeida,
  type UnidadLeida,
} from "@/lib/facturas/parser";
import { modalidadAlElegirProveedor } from "@/lib/modalidad-pago";
import { desgloseIva, modoIvaDeFactura, notaIvaAutomatica } from "@/lib/iva-compra";
import { sugerirCategoria } from "@/lib/sugerir-categoria";
import { SUELTO, armarPresentacion } from "@/lib/presentacion";
import { FotoIlegible, fotoDerecha, leerFactura, prepararFoto, type FilaLeida } from "@/lib/facturas/ocr";
import { CameraIcon, DocIcon, ImageIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, WarningIcon } from "@/components/icons";
import { CantidadUnidad, factorDe } from "@/components/CantidadUnidad";
import { cantidadEnBase, dimension, displayCantidad, opcionesCantidad, precioLegible } from "@/lib/units";
import { ErrorBanner } from "@/components/ErrorBanner";
import { CamaraGuiada } from "./_CamaraGuiada";
import { extractError } from "@/lib/data/error";
import { useJornadaHoy } from "@/components/JornadaProvider";

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
  /** Alícuota venezolana: (R) reducida u (A) adicional. Sin marca, la general. */
  alicuota?: "G" | "R" | "A";
  /** Viene de una nota de entrega sin precios: el monto lo escribe la persona. */
  sinPrecio?: boolean;
  /** La factura traía la cantidad con decimales: es peso o volumen. */
  pesable: boolean;
  /** Precio unitario impreso (sin IVA). Sirve para ver si cantidad × precio
   *  da el importe del renglón. */
  precioUnit?: number;
  /** Unidad que la factura escribe junto a la cantidad, si la escribe. */
  unidadLeida?: UnidadLeida;
  /** Unidades por empaque y contenido de cada una, si el nombre lo dice. */
  porEmpaque?: number;
  contenido?: { valor: number; unidad: string };
  origen: Origen;
};

type Cabecera = {
  proveedorId: string;
  fecha: string;
  modalidadPago: ModalidadPago;
  moneda: "bs" | "usd";
  ivaModo: "con" | "sin" | "exento";
  ivaPorc: string;
  tasa: string;
  numeroFactura: string;
  fleteUsd: string;
  notas: string;
  pagarDespues: boolean;
};

/** Lo leído de la factura que no va en el formulario: sirve para reconocer
 *  al proveedor y para cuadrar contra la fórmula impresa. */
type Leido = {
  nombre: string;
  rif: string;
  resumen: Pick<FacturaLeida, "subtotal" | "base" | "iva" | "exento" | "igtf" | "descuento" | "total" | "ivaPorc">;
  alicuotas?: FacturaLeida["alicuotas"];
  tipo?: FacturaLeida["tipo"];
  monedaOtra?: string;
  numeroControl?: string;
};

const cabeceraVacia: Cabecera = {
  proveedorId: "",
  fecha: "",
  modalidadPago: "bcv_dolar",
  moneda: "bs",
  ivaModo: "exento",
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
  diferencia,
  pista,
  avisoCantidad,
}: {
  resumen: Leido["resumen"];
  moneda: "bs" | "usd";
  cuadra: boolean | null;
  /** Lo que falta (positivo) o sobra (negativo) para cuadrar. */
  diferencia?: number;
  /** El renglón que probablemente explica la diferencia. */
  pista?: string;
  /** Cantidad × precio no da el importe de algún renglón. */
  avisoCantidad?: string;
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
            : avisoCantidad && (diferencia === undefined || Math.abs(diferencia) <= Math.max(0.05, (resumen.total ?? 0) * 0.01))
              ? avisoCantidad
              : diferencia !== undefined
              ? `${diferencia > 0 ? "Faltan" : "Sobran"} ${fmtMonto(Math.abs(diferencia), moneda)} para cuadrar con la factura${resumen.igtf ? " (sin contar el IGTF)" : ""}.`
              : `Los productos no cuadran con la factura${resumen.igtf ? " (sin contar el IGTF)" : ""}: revisa montos o si falta alguno.`}
          {!cuadra && pista && <span className="block font-normal">{pista}</span>}
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

/** Cantidad según el empaque que dice la factura y la presentación del
 *  insumo. "PEPSI ZERO LAT355x24U" × 1: si el insumo es "Caja 24 unidades"
 *  → 1 caja; si es por lata → 24. "HARINA PAN 1KG" × 20: si el insumo es
 *  "Bulto 20 kg" → 1 bulto. null si la factura no dice empaque ni contenido. */
function cantidadPorEmpaque(p: Producto, ins: Insumo): { cantidad: string; unidad: string } | null {
  const dimIns = dimension(ins.unidadBase);
  // "24 UND": la cantidad ya está en unidades sueltas (no en empaques).
  const enUnidades = p.unidadLeida === "unidad" && dimIns === "conteo";
  // "4,265 KG" leído como contenido del paquete: es la cantidad, no el tamaño.
  const contenido =
    p.contenido &&
    p.unidadLeida &&
    p.unidadLeida !== "unidad" &&
    dimension(p.contenido.unidad) === dimension(p.unidadLeida) &&
    Math.abs(p.contenido.valor - p.cantidadFactura) <= Math.max(0.001, p.cantidadFactura * 0.02)
      ? undefined
      : p.contenido;
  if (!p.porEmpaque && !contenido && !enUnidades) return null;
  const opciones = opcionesCantidad(ins);
  const cpc = ins.cantidadPorCompra ?? 0;
  let total = 0; // en la unidad base del insumo
  if (enUnidades) {
    total = p.cantidadFactura;
  } else if (contenido && dimIns !== "conteo" && dimension(contenido.unidad) === dimIns) {
    total =
      (p.cantidadFactura * (p.porEmpaque ?? 1) * cantidadEnBase(contenido.valor, contenido.unidad)) /
      cantidadEnBase(1, ins.unidadBase);
  } else if (dimIns === "conteo" && p.porEmpaque) {
    total = p.cantidadFactura * p.porEmpaque;
  }
  if (!(total > 0)) return null;
  // Presentaciones enteras del insumo: lo más natural ("1 caja", "1 bulto").
  if (cpc > 0) {
    const pres = total / cpc;
    const clave = opciones.find((o) => Math.abs(o.factor - cpc) < 1e-9)?.key;
    if (clave && Math.round(pres) >= 1 && Math.abs(pres - Math.round(pres)) < 0.01)
      return { cantidad: fmtQty(Math.round(pres)), unidad: clave };
  }
  // Si no, en la unidad estándar: kg, L o unidades.
  const estandar = dimIns === "peso" ? "kg" : dimIns === "volumen" ? "L" : "unidad";
  const op = opciones.find((o) => o.key === estandar) ?? opciones.find((o) => o.factor === 1);
  return op ? { cantidad: fmtQty(total / op.factor), unidad: op.key } : null;
}

/** ¿El insumo coincide con el empaque de la factura? (para preferirlo entre
 *  parecidos: "Pepsi Zero caja 24" antes que "Pepsi Zero lata"). */
function coincideEmpaque(p: Producto, ins: Insumo): boolean {
  if (!p.porEmpaque) return false;
  const n = p.porEmpaque;
  if (dimension(ins.unidadBase) === "conteo" && ins.cantidadPorCompra === n) return true;
  return new RegExp(`(^|\\D)${n}(\\D|$)`).test(`${ins.nombre} ${ins.unidadCompra ?? ""}`);
}

/** Unidad efectiva y conversión de un producto (igual que el formulario manual:
 *  la cantidad se escribe en la unidad que se tenga a mano y se guarda en
 *  unidades de compra).
 *
 *  Si nadie eligió la unidad y no hay memoria del proveedor, se deduce de la
 *  factura, en este orden:
 *   1. La unidad que la factura escribe ("1,1895 KG", "500 GR", "2 LT").
 *   2. Cantidad con decimales sin unidad escrita: es peso o volumen; entre kg y
 *      g (o L y ml) gana la que deja el precio más parecido al actual del
 *      insumo (`usd` = lo pagado por ese producto).
 *   3. Cantidad entera: unidades de la presentación del insumo. */
function conversion(p: Producto, ins: Insumo | undefined, usd = 0) {
  if (!ins) return { opciones: [], unidad: "", enBase: 0, enCompra: Number(p.cantidad) || 0 };
  const opciones = opcionesCantidad(ins);
  const cpc = ins.cantidadPorCompra ?? 0;
  let unidad = opciones.some((o) => o.key === p.unidad)
    ? p.unidad
    : (opciones.find((o) => Math.abs(o.factor - cpc) < 1e-9)?.key ?? opciones[0]?.key ?? "");
  if (p.unidad === "" && p.origen !== "memoria") {
    const medidas = opciones.filter((o) => ["kg", "g", "L", "ml"].includes(o.key));
    if (p.unidadLeida && p.unidadLeida !== "unidad" && medidas.some((o) => o.key === p.unidadLeida)) {
      unidad = p.unidadLeida;
    } else if (p.pesable && medidas.length > 0) {
      const cant = Number(p.cantidad) || 0;
      const actual = ins.precioBaseUsd ?? 0;
      if (usd > 0 && cant > 0 && actual > 0) {
        const distancia = (factor: number) => Math.abs(Math.log(usd / (cant * factor) / actual));
        unidad = medidas.reduce((mejor, o) => (distancia(o.factor) < distancia(mejor.factor) ? o : mejor)).key;
      } else {
        unidad = (medidas.find((o) => o.key === "kg" || o.key === "L") ?? medidas[0]).key;
      }
    }
  }
  const enBase = (Number(p.cantidad) || 0) * factorDe(opciones, unidad);
  const enCompra = cpc > 0 ? enBase / cpc : Number(p.cantidad) || 0;
  return { opciones, unidad, enBase, enCompra };
}

/** Cantidad escrita, pasada a la unidad de la factura (kg, g, L, ml). */
function cantidadEnUnidadFactura(p: Producto, ins: Insumo | undefined): number | null {
  if (!p.unidadLeida || p.unidadLeida === "unidad") return null;
  if (!ins || dimension(ins.unidadBase) !== dimension(p.unidadLeida)) {
    const n = Number(p.cantidad);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const { enBase } = conversion(p, ins, 0);
  const factor = cantidadEnBase(1, p.unidadLeida);
  if (!(enBase > 0) || !(factor > 0)) return null;
  return (enBase * cantidadEnBase(1, ins.unidadBase)) / factor;
}

/** true si cantidad × precio unitario da el importe del renglón. Sin precio
 *  impreso no se puede saber y se da por bueno (no es el cuadre de montos). */
function importeLineaCuadra(p: Producto, ins: Insumo | undefined): boolean {
  const precio = p.precioUnit;
  const monto = Number(p.monto);
  if (!(precio && precio > 0) || !(monto > 0)) return true;
  const cant = cantidadParaCuadre({
    cantidadFactura: p.cantidadFactura,
    contenido: p.contenido,
    unidadLeida: p.unidadLeida,
    cantidadConvertida: cantidadEnUnidadFactura(p, ins),
  });
  if (!(cant && cant > 0)) return true;
  return Math.abs(cant * precio - monto) <= Math.max(0.05, monto * 0.02);
}

/** Unidad con la que se propone un insumo nuevo a partir del renglón. */
function unidadInferida(p: Producto): "kg" | "g" | "L" | "ml" | "unidad" {
  if (p.unidadLeida) return p.unidadLeida;
  if (p.contenido && (p.contenido.unidad === "kg" || p.contenido.unidad === "g" || p.contenido.unidad === "L" || p.contenido.unidad === "ml"))
    return p.contenido.unidad;
  if (p.pesable) return "kg";
  return "unidad";
}

function textoEspera(segundos: number): string {
  if (segundos >= 45) return `Sigue leyendo (${segundos} s). Con una foto puede pasar de un minuto.`;
  if (segundos >= 20) return `Sigue leyendo… van ${segundos} segundos.`;
  return "Puede tardar cerca de un minuto, sobre todo la primera vez o con una foto.";
}

export function EscanearFactura({
  insumos,
  proveedores,
  compras,
  onProveedorCreado,
  onInsumoCreado,
  recuperaIva,
  onGuardado,
  onCancelar,
  onManual,
}: {
  insumos: Insumo[];
  proveedores: Proveedor[];
  compras: Compra[];
  onProveedorCreado: (p: Proveedor) => void;
  onInsumoCreado: (i: Insumo) => void;
  /** El negocio recupera el IVA de las compras: el costo del insumo queda sin IVA. */
  recuperaIva: boolean;
  onGuardado: (nuevas: Compra[]) => void | Promise<void>;
  onCancelar: () => void;
  /** Abre el formulario manual de siempre (contingencia). */
  onManual: () => void;
}) {
  const hoy = useJornadaHoy();
  const [paso, setPaso] = useState<"origen" | "pegar" | "leyendo" | "formulario">("origen");
  const [progreso, setProgreso] = useState<{ etapa: string; pct: number }>({ etapa: "", pct: 0 });
  const [texto, setTexto] = useState("");
  const [cab, setCab] = useState<Cabecera>(cabeceraVacia);
  const [leido, setLeido] = useState<Leido>({ nombre: "", rif: "", resumen: {} });
  /** La foto, solo en la memoria del teléfono (nunca se sube). */
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [verFoto, setVerFoto] = useState(false);
  const [zoom, setZoom] = useState(false);
  /** Filas leídas con su altura en la foto, para mostrar dónde está cada producto. */
  const [filas, setFilas] = useState<FilaLeida[]>([]);
  const [region, setRegion] = useState<{ y0: number; y1: number } | null>(null);
  const fotoGrandeRef = useRef<HTMLDivElement>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  /** Renglones leídos que no parecen productos: se pueden rescatar. */
  const [otras, setOtras] = useState<Producto[]>([]);
  const [memoria, setMemoria] = useState<Map<string, Equivalencia>>(new Map());
  const [tasaDia, setTasaDia] = useState<TasaBcv | null>(null);
  /** Tasa que trae impresa la factura ("Tipo de cambio BCV Bs. 827,7371"). */
  const [tasaFactura, setTasaFactura] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [creandoProveedor, setCreandoProveedor] = useState(false);
  /** Insumos creados desde un renglón, antes de que el padre recargue la lista. */
  const [insumosNuevos, setInsumosNuevos] = useState<Insumo[]>([]);
  const [creandoInsumoKey, setCreandoInsumoKey] = useState<string | null>(null);
  const [borradorInsumo, setBorradorInsumo] = useState<{ nombre: string; unidad: string }>({ nombre: "", unidad: "unidad" });
  const [guardandoInsumo, setGuardandoInsumo] = useState(false);
  const [segundosLectura, setSegundosLectura] = useState(0);
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [guardandoProveedor, setGuardandoProveedor] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const insumosTodos = useMemo(() => {
    const ids = new Set(insumos.map((i) => i.id));
    return [...insumos, ...insumosNuevos.filter((i) => !ids.has(i.id))];
  }, [insumos, insumosNuevos]);
  const insumoPorId = useMemo(() => new Map(insumosTodos.map((i) => [i.id, i])), [insumosTodos]);

  // Memoria de compras por proveedor: qué insumos se le compran y a qué precio
  // se le compró cada uno la última vez (USD por unidad de compra).
  const historial = useMemo(() => {
    const compradosA = new Map<string, Set<string>>();
    const ultimo = new Map<string, { usd: number; fecha: string }>();
    for (const c of compras) {
      const montoCosto = c.costoUsd ?? c.precioTotalUsd;
      if (!c.proveedorId || !(c.cantidad > 0) || !(montoCosto > 0)) continue;
      if (!compradosA.has(c.proveedorId)) compradosA.set(c.proveedorId, new Set());
      compradosA.get(c.proveedorId)!.add(c.insumoId);
      const k = `${c.proveedorId}|${c.insumoId}`;
      const previo = ultimo.get(k);
      if (!previo || c.fecha > previo.fecha) ultimo.set(k, { usd: montoCosto / c.cantidad, fecha: c.fecha });
    }
    return { compradosA, ultimo };
  }, [compras]);

  // Liberar la foto de la memoria al cambiarla o al cerrar.
  useEffect(() => {
    return () => {
      if (fotoUrl) URL.revokeObjectURL(fotoUrl);
    };
  }, [fotoUrl]);

  // El aviso de "medio minuto" se queda corto: se cuenta el tiempo real.
  // El cero se pone al empezar a leer (no aquí: un setState sincrónico en el
  // efecto dispara un render de más).
  useEffect(() => {
    if (paso !== "leyendo") return;
    const t0 = Date.now();
    const id = window.setInterval(() => setSegundosLectura(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [paso]);

  // La tasa sigue la FECHA de la factura (como el formulario manual).
  useEffect(() => {
    if (paso !== "formulario" || !cab.fecha) return;
    let cancel = false;
    (async () => {
      const t = await getTasaBcvPorFecha(hoy).catch(() => null);
      if (cancel || !t) return;
      setTasaDia(t);
      setCab((c) => {
        // Si la factura trae su propia tasa, manda esa (es con la que se facturó).
        if (tasaFactura && c.modalidadPago !== "bcv_euro" && c.modalidadPago !== "paralela") return c;
        const sug = c.modalidadPago === "bcv_euro" ? t.eurBs : c.modalidadPago === "paralela" ? t.paralelaBs : t.usdBs;
        return Number(sug) > 0 ? { ...c, tasa: String(sug) } : c;
      });
    })();
    return () => {
      cancel = true;
    };
  }, [paso, cab.fecha, tasaFactura, hoy]);

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
      if (tasaFactura && m !== "bcv_euro" && m !== "paralela") tasa = String(tasaFactura);
      else if (tasaDia) {
        const sug = m === "bcv_euro" ? tasaDia.eurBs : m === "paralela" ? tasaDia.paralelaBs : tasaDia.usdBs;
        if (Number(sug) > 0) tasa = String(sug);
      }
      return { ...c, modalidadPago: m, tasa };
    });
  }

  /** Asigna insumo y cantidad a cada renglón con la memoria del proveedor (o
   *  una sugerencia por nombre). Respeta lo que la persona ya cambió a mano. */
  function asignar(lista: Producto[], mem: Map<string, Equivalencia>, proveedorId = cab.proveedorId): Producto[] {
    const habituales = historial.compradosA.get(proveedorId);
    return lista.map((p) => {
      if (p.origen === "" && p.insumoId) return p; // elegido a mano
      // Primero la memoria del proveedor (aunque el nombre traiga la cantidad
      // de más o de menos); si no hay, se sugiere por nombre y hay que confirmar.
      const eq = buscarEquivalencia(p.descripcion, mem.values());
      if (eq && insumoPorId.has(eq.insumoId)) {
        return { ...p, insumoId: eq.insumoId, cantidad: fmtQty(p.cantidadFactura * eq.factorCantidad), unidad: "", origen: "memoria" };
      }
      if (p.origen === "memoria" || !p.insumoId) {
        // Entre nombres parecidos gana el que ya se le compra a este proveedor.
        const sug = sugerirInsumo(p.descripcion, insumosTodos, (ins) => coincideEmpaque(p, ins) || !!habituales?.has(ins.id));
        const porEmpaque = sug ? cantidadPorEmpaque(p, sug) : null;
        return sug
          ? {
              ...p,
              insumoId: sug.id,
              cantidad: porEmpaque?.cantidad ?? fmtQty(p.cantidadFactura),
              unidad: porEmpaque?.unidad ?? "",
              origen: "sugerido",
            }
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
      return {
        ...c,
        proveedorId: id,
        modalidadPago: modalidadAlElegirProveedor(c.modalidadPago, acepta, c.moneda),
      };
    });
    const mem = id ? await listEquivalencias(id) : new Map<string, Equivalencia>();
    setMemoria(mem);
    if (leida) repartir(asignar(leida.lista, mem, id), leida.confianza);
    else setProductos((ps) => asignar(ps, mem, id));
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
      alicuotas: f.alicuotas,
      tipo: f.tipo,
      monedaOtra: f.monedaOtra,
      numeroControl: f.numeroControl,
    });
    setCab({
      ...cabeceraVacia,
      fecha: f.fecha ?? hoy,
      moneda,
      modalidadPago: moneda === "bs" ? "bcv_dolar" : "divisa",
      notas: f.numeroControl ? `N° de control ${f.numeroControl}` : "",
      // Si la factura muestra el IVA aparte, los montos de los productos son
      // la base: "Sin IVA" (el sistema lo suma). Si no, ya lo traen.
      // Sin IVA impreso (nota de entrega, ticket) el monto es el costo: no se divide entre 1,16.
      ivaModo: modoIvaDeFactura(f),
      ivaPorc: String(f.ivaPorc ?? 16),
      numeroFactura: f.numero ?? "",
      tasa: f.tasa ? String(f.tasa) : "",
      // El flete del formulario va en $: si la factura es en Bs se pasa con su tasa.
      fleteUsd:
        f.flete && moneda === "usd"
          ? String(f.flete)
          : f.flete && f.tasa
            ? String(Number((f.flete / f.tasa).toFixed(2)))
            : "",
    });
    setTasaFactura(f.tasa ?? null);
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
        monto: l.sinPrecio ? "" : String(Number(l.total.toFixed(2))),
        alicuota: l.alicuota,
        sinPrecio: l.sinPrecio,
        exento: l.exento,
        pesable: l.pesable,
        precioUnit: l.precioUnit,
        porEmpaque: l.porEmpaque,
        contenido: l.contenido,
        unidadLeida: l.unidadLeida,
        origen: "",
      };
    });
    // Primero con sugerencias por nombre; al llegar la memoria se reasigna.
    repartir(asignar(base, new Map(), prov?.id ?? ""), confianza);
    setPaso("formulario");
    if (prov) await elegirProveedor(prov.id, { lista: base, confianza });
  }

  async function leerFoto(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    setSegundosLectura(0);
    setPaso("leyendo");
    setProgreso({ etapa: "Preparando la foto", pct: 0 });
    try {
      // HEIC (iPhone) se convierte a JPG aquí; sirve para leer y para mostrar.
      const foto = await prepararFoto(archivo);
      const { texto: t, giro, filas: f, aplanada } = await leerFactura(foto, (etapa, pct) => setProgreso({ etapa, pct }));
      // La foto se muestra derecha aunque se haya tomado de lado o al revés; si
      // la hoja se aplanó, se muestra aplanada (las filas están medidas en ella).
      setFotoUrl(URL.createObjectURL(aplanada ?? (await fotoDerecha(foto, giro).catch(() => foto))));
      setFilas(f);
      setTexto(t);
      if (!t.trim()) {
        setError("No se pudo leer texto en la foto. Prueba con más luz, la factura plana y completa.");
        setPaso("origen");
        return;
      }
      await aplicarTexto(t);
    } catch (e) {
      setError(
        e instanceof FotoIlegible
          ? e.message
          : `No se pudo cargar el lector de facturas. La primera vez necesita internet para descargarlo (unos MB). Detalle: ${extractError(e, "error desconocido")}`,
      );
      setPaso("origen");
    }
  }

  function elegirOrigen(origen: string) {
    // Cámara guiada si el navegador la permite; si no, la cámara del teléfono.
    if (origen === "foto") {
      if (typeof navigator !== "undefined" && "mediaDevices" in navigator) setCamara(true);
      else fotoRef.current?.click();
    }
    else if (origen === "galeria") galeriaRef.current?.click();
    else {
      setFotoUrl(null); // el texto pegado no trae foto
      setFilas([]);
      setPaso("pegar");
    }
  }

  /** La fila de la foto donde está un producto (por su texto leído). */
  function filaDe(descripcion: string): FilaLeida | null {
    const palabras = normalizarDescripcion(descripcion).split(" ").filter((w) => w.length >= 3);
    if (palabras.length === 0) return null;
    let mejor: FilaLeida | null = null;
    let puntaje = 0.5;
    for (const f of filas) {
      const enFila = new Set(normalizarDescripcion(f.texto).split(" "));
      const pt = palabras.filter((w) => enFila.has(w)).length / palabras.length;
      if (pt > puntaje) {
        puntaje = pt;
        mejor = f;
      }
    }
    return mejor;
  }

  function verEnFoto(fila: FilaLeida) {
    setRegion({ y0: fila.y0, y1: fila.y1 });
    setZoom(true);
    setVerFoto(true);
  }

  // Al abrir la foto en un producto, se desplaza hasta su fila.
  function centrarRegion() {
    const el = fotoGrandeRef.current;
    if (!el || !region || !zoom) return;
    el.scrollTop = Math.max(0, region.y0 * el.scrollHeight - el.clientHeight * 0.35);
    el.scrollLeft = 0;
  }
  useEffect(() => {
    const el = fotoGrandeRef.current;
    if (!el || !region || !zoom || !verFoto) return;
    el.scrollTop = Math.max(0, region.y0 * el.scrollHeight - el.clientHeight * 0.35);
    el.scrollLeft = 0;
  }, [region, zoom, verFoto]);

  function setProducto(key: string, patch: Partial<Producto>) {
    setProductos((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  }

  function empezarInsumo(p: Producto) {
    const unidad = unidadInferida(p);
    setCreandoInsumoKey(p.key);
    setBorradorInsumo({
      nombre: p.descripcion.trim(),
      unidad: p.porEmpaque && p.porEmpaque >= 2 && unidad === "unidad" ? "unidad" : unidad,
    });
    setError(null);
  }

  async function guardarInsumo(p: Producto) {
    const nombre = borradorInsumo.nombre.trim();
    if (!nombre) return;
    const ya = insumosTodos.find(
      (i) => normalizarDescripcion(i.nombre) === normalizarDescripcion(nombre),
    );
    if (ya) {
      const porEmpaque = cantidadPorEmpaque(p, ya);
      setProducto(p.key, {
        insumoId: ya.id,
        origen: "",
        cantidad: porEmpaque?.cantidad ?? fmtQty(p.cantidadFactura),
        unidad: porEmpaque?.unidad ?? "",
      });
      setCreandoInsumoKey(null);
      return;
    }
    const unidad = borradorInsumo.unidad || "unidad";
    const presentacion =
      p.porEmpaque && p.porEmpaque >= 2 && unidad === "unidad"
        ? armarPresentacion({ tipo: "Paquete", cantidad: String(p.porEmpaque), unidad: "unidad" })
        : armarPresentacion({ tipo: SUELTO, cantidad: "1", unidad });
    if (!presentacion) {
      setError("Elige la unidad del insumo.");
      return;
    }
    const cant = Number(presentacion.cantidadPorCompra) || 1;
    setGuardandoInsumo(true);
    setError(null);
    try {
      const nuevo = await createInsumo({
        nombre,
        categoria: "",
        categoriaCompra: sugerirCategoria(nombre) ?? undefined,
        unidadCompra: presentacion.unidadCompra,
        cantidadPorCompra: cant,
        unidadBase: presentacion.unidadBase,
        precioCompraUsd: null,
        precioBaseUsd: null,
        stockTotal: 0,
        seProcesa: false,
        stockComprometido: 0,
        stockMinimo: null,
        proveedorId: cab.proveedorId || undefined,
        activo: true,
      });
      setInsumosNuevos((prev) => [...prev, nuevo]);
      onInsumoCreado(nuevo);
      const porEmpaque = cantidadPorEmpaque(p, nuevo);
      setProducto(p.key, {
        insumoId: nuevo.id,
        origen: "",
        cantidad: porEmpaque?.cantidad ?? fmtQty(p.cantidadFactura),
        unidad: porEmpaque?.unidad ?? "",
      });
      setCreandoInsumoKey(null);
    } catch (e) {
      setError(extractError(e, "No se pudo crear el insumo"));
    } finally {
      setGuardandoInsumo(false);
    }
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
  // Moneda en que se PAGA (según la modalidad), para marcarla como en el
  // formulario manual: "Bs · BCV $/€/paralela" se paga en Bs; el resto en $.
  const pagaEnBs = cab.modalidadPago === "bcv_dolar" || cab.modalidadPago === "bcv_euro" || cab.modalidadPago === "paralela";
  const monedaPago: "bs" | "usd" = pagaEnBs ? "bs" : "usd";
  /** De dónde sale la tasa, para mostrarla junto al total. */
  const origenTasa =
    tasaFactura !== null && Math.abs(tasaNum - tasaFactura) <= 0.00001
      ? "tasa impresa en la factura"
      : tasaSugerida !== null && Math.abs(tasaNum - Number(tasaSugerida)) <= 0.009
      ? `${cab.modalidadPago === "bcv_euro" ? "BCV €" : cab.modalidadPago === "paralela" ? "paralela" : "BCV"} del ${fmtFecha(cab.fecha)}`
      : "tasa puesta a mano";

  /** IVA del producto: la general, o la reducida / adicional si la factura lo
   *  marca con (R) / (A) (Venezuela: 8 % y 16 % + 15 %). */
  function ivaDe(p: Producto): number {
    if (p.alicuota === "R") return (leido.alicuotas?.R ?? 8) / 100;
    if (p.alicuota === "A") return (leido.alicuotas?.A ?? 31) / 100;
    return iva;
  }

  /** Pagado (con IVA si corresponde) y costo del insumo (sin IVA si se recupera). */
  function montos(p: Producto) {
    const m = Number(p.monto) || 0;
    const porc = ivaDe(p) * 100;
    const enMoneda = cab.ivaModo === "sin" && !p.exento ? m * (1 + ivaDe(p)) : m;
    const montoUsd = cab.moneda === "bs" ? (tasaNum > 0 ? m / tasaNum : 0) : m;
    const d = desgloseIva({
      monto: montoUsd,
      ivaModo: cab.ivaModo,
      exento: p.exento,
      ivaPorc: porc,
      recuperaIva,
    });
    const bs = cab.moneda === "bs" ? enMoneda : tasaNum > 0 ? d.pagado * tasaNum : undefined;
    return { ...d, bs, enMoneda };
  }

  const totalMoneda = productos.reduce((s, p) => s + montos(p).enMoneda, 0);
  const totalUsd = productos.reduce((s, p) => s + montos(p).pagado, 0);
  const totalCostoUsd = productos.reduce((s, p) => s + montos(p).costo, 0);
  const esperado = totalProductos(leido.resumen);
  const cuadraMontos =
    esperado === undefined ? null : Math.abs(totalMoneda - esperado) <= Math.max(0.05, esperado * 0.01);
  const lineasSinCuadrar = productos.filter((p) => !importeLineaCuadra(p, insumoPorId.get(p.insumoId)));
  // Los montos pueden sumar el total y, aun así, una cantidad no dar el
  // importe de su renglón (cantidad × precio). Eso también es "no cuadra".
  const cuadra = lineasSinCuadrar.length > 0 ? false : cuadraMontos;
  /** Qué renglón explica la diferencia: uno leído aparte que falta, un
   *  producto que sobra, o un monto con un dígito o una coma mal leídos. */
  const pistaCuadre = useMemo(() => {
    if (cuadra !== false || esperado === undefined) return undefined;
    const dif = esperado - totalMoneda;
    const igual = (a: number) => Math.abs(a - Math.abs(dif)) <= Math.max(0.05, Math.abs(dif) * 0.005);
    if (dif > 0) {
      const falta = otras.find((o) => igual(Number(o.monto) || 0));
      if (falta) return `Puede ser «${falta.descripcion}», que quedó aparte: agrégalo abajo.`;
    } else {
      const sobra = productos.find((p) => igual(montos(p).enMoneda));
      if (sobra) return `Puede sobrar «${sobra.descripcion || insumoPorId.get(sobra.insumoId)?.nombre}».`;
    }
    for (const p of productos) {
      const m = Number(p.monto) || 0;
      if (!(m > 0)) continue;
      const bueno = [...variantesDigito(m), m * 10, m / 10].find((v) => Math.abs(v - m - dif) <= 0.05);
      if (bueno !== undefined)
        return `Revisa «${p.descripcion || insumoPorId.get(p.insumoId)?.nombre}»: con ${fmtMonto(bueno, cab.moneda)} cuadra.`;
    }
    return undefined;
    // costo depende de la cabecera y los productos, ya incluidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuadra, esperado, totalMoneda, otras, productos, cab]);

  // Una factura se paga completa: si ya existe (mismo número en el negocio),
  // se avisa en el formulario. El estado de pago se hereda si es el mismo proveedor.
  const duplicada = useMemo(
    () => compraConMismaFactura(compras, cab.numeroFactura, cab.proveedorId || null),
    [compras, cab.numeroFactura, cab.proveedorId],
  );
  const facturaLock = duplicada?.mismoProveedor ? duplicada.compra : null;
  const pagarDespuesEfectivo = facturaLock ? !facturaLock.pagada : cab.pagarDespues;

  /** Precio por unidad que deja el producto, frente al de la última compra a
   *  este proveedor (o, si nunca se le compró, al actual del insumo). Si el
   *  salto es grande y un dígito o una coma del monto lo explican, propone el
   *  monto corregido (el OCR confunde 8/6/3, 1/7, 5/6 y corre comas). */
  function precioInfo(p: Producto) {
    const ins = insumoPorId.get(p.insumoId);
    const usd = montos(p).costo;
    const { enBase, enCompra } = conversion(p, ins, usd);
    if (!ins || !(enBase > 0) || !(usd > 0)) return null;
    const nuevo = usd / enBase;
    const delProveedor = cab.proveedorId ? historial.ultimo.get(`${cab.proveedorId}|${ins.id}`) : undefined;
    // Precio de antes, por unidad base.
    const cpc = ins.cantidadPorCompra > 0 ? ins.cantidadPorCompra : 1;
    const actual = delProveedor ? delProveedor.usd / cpc : (ins.precioBaseUsd ?? null);
    const cambio = actual && actual > 0 ? nuevo / actual - 1 : null;
    const fuerte = cambio !== null && Math.abs(cambio) > 0.5;
    let montoSugerido: number | null = null;
    const monto = Number(p.monto) || 0;
    if (fuerte && actual && monto > 0 && enCompra > 0) {
      const candidatos = [...variantesDigito(monto), monto * 10, monto / 10, monto * 100, monto / 100];
      let mejor = 0.2; // a menos de un 20 % del precio de antes
      for (const m of candidatos) {
        const desvio = Math.abs((nuevo * m) / monto / actual - 1);
        if (desvio < mejor) {
          mejor = desvio;
          montoSugerido = Math.round(m * 100) / 100;
        }
      }
    }
    return {
      ahora: precioLegible(nuevo, ins.unidadBase),
      antes: actual && actual > 0 ? precioLegible(actual, ins.unidadBase) : null,
      deProveedor: !!delProveedor,
      cambio,
      fuerte,
      montoSugerido,
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
    if (productos.some((p) => p.sinPrecio && !(Number(p.monto) > 0))) {
      setError("La nota de entrega no trae precios: escribe el monto de cada producto.");
      return;
    }
    if (productos.some((p) => !(Number(p.monto) > 0) || !(conversion(p, insumoPorId.get(p.insumoId), montos(p).costo).enCompra > 0))) {
      setError("Cada producto necesita una cantidad y un monto mayores que cero.");
      return;
    }
    if (cab.moneda === "bs" && !(tasaNum > 0)) {
      setError("Falta la tasa del día para pasar los bolívares a dólares.");
      return;
    }
    if (!confirmado) {
      const a: string[] = [];
      if (leido.tipo === "nota_credito")
        a.push("Este documento es una NOTA DE CRÉDITO (una devolución o un descuento del proveedor), no una compra: si lo registras, sumará stock.");
      if (duplicada)
        a.push(
          duplicada.mismoProveedor
            ? `La factura ${cab.numeroFactura} de este proveedor ya tiene compras registradas (${fmtFecha(duplicada.compra.fecha)}).`
            : `La factura ${cab.numeroFactura} ya está registrada (${fmtFecha(duplicada.compra.fecha)}).`,
        );
      if (cuadraMontos === false && esperado !== undefined)
        a.push(
          `La suma (${fmtMonto(totalMoneda, cab.moneda)}) no coincide con la factura (${fmtMonto(esperado, cab.moneda)}). Puede faltar un producto o haber un monto mal leído.`,
        );
      if (lineasSinCuadrar.length > 0)
        a.push(
          lineasSinCuadrar.length === 1
            ? `${lineasSinCuadrar[0].descripcion || insumoPorId.get(lineasSinCuadrar[0].insumoId)?.nombre || "Un renglón"}: la cantidad por el precio no da el importe de la factura.`
            : `${lineasSinCuadrar.length} renglones: la cantidad por el precio no da el importe de la factura.`,
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
      const notaIva = notaIvaAutomatica(
        cab.ivaModo,
        Number(cab.ivaPorc) || 0,
        recuperaIva,
        cab.ivaModo !== "exento" && productos.some((p) => montos(p).iva > 0.0001),
      );
      const notas = [cab.notas.trim() || null, "Factura escaneada", notaIva].filter(Boolean).join(" · ");
      const flete = Number(cab.fleteUsd) > 0 ? Number(cab.fleteUsd) : undefined;
      const inputs: CompraInput[] = productos.map((p, i) => {
        const c = montos(p);
        const { enCompra } = conversion(p, insumoPorId.get(p.insumoId), c.costo);
        return {
          insumoId: p.insumoId,
          proveedorId: cab.proveedorId || undefined,
          fecha: hoy,
          fechaDocumento: cab.fecha || null,
          cantidad: Math.round(enCompra * 1e6) / 1e6,
          precioTotalUsd: c.pagado,
          precioTotalBs: c.bs,
          baseUsd: c.base,
          ivaUsd: c.iva,
          exentoUsd: c.exento,
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
            factorCantidad: conversion(p, insumoPorId.get(p.insumoId), montos(p).costo).enCompra / (p.cantidadFactura || 1),
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
          {paso !== "formulario"
            ? "Escanear factura"
            : leido.tipo === "nota_entrega"
              ? "Nueva compra · nota de entrega"
              : leido.tipo === "nota_credito"
                ? "Nota de crédito"
                : "Nueva compra"}
        </h2>
        <button type="button" onClick={onCancelar} className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
          Cerrar
        </button>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {camara && (
        <CamaraGuiada
          onCapturar={(foto) => void leerFoto(foto)}
          onCerrar={() => setCamara(false)}
          onCamaraDelTelefono={() => fotoRef.current?.click()}
        />
      )}

      {/* La cámara nativa del teléfono da la foto a resolución completa. */}
      <input
        ref={fotoRef}
        type="file"
        accept="image/*,.heic,.heif"
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
        accept="image/*,.heic,.heif,.pdf"
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
              { icono: ImageIcon, titulo: "Elegir una foto", detalle: "De la galería del teléfono o de la computadora", accion: "galeria" },
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
          <p className="text-xs text-cacao-soft">{textoEspera(segundosLectura)}</p>
        </div>
      )}

      {paso === "formulario" && (leido.monedaOtra || leido.tipo === "nota_credito") && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-3 py-2 text-sm text-cacao">
          <WarningIcon className="mt-0.5 size-4 shrink-0 text-amber-700" />
          {leido.monedaOtra
            ? `La factura está en ${leido.monedaOtra}. Bolo registra en Bs o en $: pasa los montos a una de esas monedas${leido.monedaOtra === "EUR" ? " (o elige la forma de pago «Bs · BCV €»)" : ""}.`
            : "Este documento es una nota de crédito (devolución o descuento del proveedor), no una compra. Revisa antes de registrar."}
        </p>
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
                  onClick={() => {
                    setVerFoto(false);
                    setRegion(null);
                  }}
                  aria-label="Cerrar la foto"
                  className="rounded-lg bg-white px-4 py-1.5 text-sm font-medium text-cacao"
                >
                  Volver al formulario
                </button>
              </div>
              <div ref={fotoGrandeRef} className="min-h-0 flex-1 overflow-auto">
                {zoom ? (
                  <div className="relative" style={{ width: "250%" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:) */}
                    <img src={fotoUrl} alt="Factura" onClick={() => setZoom(false)} onLoad={centrarRegion} className="block w-full" />
                    {/* La fila del producto, marcada sobre la foto. */}
                    {region && (
                      <div
                        className="pointer-events-none absolute inset-x-0 bg-amber-300/25 ring-2 ring-amber-500"
                        style={{ top: `${region.y0 * 100}%`, height: `${(region.y1 - region.y0) * 100}%` }}
                      />
                    )}
                  </div>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element -- foto local (blob:) */
                  <img
                    src={fotoUrl}
                    alt="Factura"
                    onClick={() => setZoom(true)}
                    className="mx-auto h-full w-auto max-w-full object-contain"
                  />
                )}
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
              <button type="button" onClick={() => setCab({ ...cab, ivaModo: "exento" })} className={boton(cab.ivaModo === "exento")}>
                Sin IVA
              </button>
              <button type="button" onClick={() => setCab({ ...cab, ivaModo: "sin" })} className={boton(cab.ivaModo === "sin")}>
                IVA aparte (+{Number(cab.ivaPorc) || 0}%)
              </button>
              <button type="button" onClick={() => setCab({ ...cab, ivaModo: "con" })} className={boton(cab.ivaModo === "con")}>
                Con IVA
              </button>
              {cab.ivaModo !== "exento" && (
                <label className="flex items-center gap-1.5 text-xs text-cacao-mute">
                  IVA
                  <input
                    type="text"
                    inputMode="decimal"
                    value={cab.ivaPorc}
                    onChange={(e) => setCab({ ...cab, ivaPorc: limpiarDecimal(e.target.value) })}
                    className="w-16 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-sm text-cacao"
                  />
                  %
                </label>
              )}
            </div>
            <span className="text-xs text-cacao-mute block mt-1">
              {cab.ivaModo === "exento"
                ? "La factura no muestra IVA. Los montos se guardan tal cual y no se les resta nada."
                : cab.ivaModo === "con"
                  ? recuperaIva
                    ? "Los montos ya incluyen el IVA. Como lo recuperas, el costo queda sin esa parte."
                    : "Los montos ya incluyen el IVA. Como no lo recuperas, el costo queda con el IVA."
                  : recuperaIva
                    ? "Los montos son la base. El IVA se guarda aparte y no entra en el costo, porque lo recuperas. Lo exento no lleva IVA."
                    : "Los montos son la base. El IVA se guarda aparte y sí entra en el costo, porque no lo recuperas. Lo exento no lleva IVA."}
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
              type="text"
              inputMode="decimal"
              value={cab.tasa}
              onChange={(e) => setCab({ ...cab, tasa: limpiarDecimal(e.target.value) })}
              className={campo}
            />
            {tasaSugerida !== null && (
              <span className="text-xs text-cacao-mute block mt-1">
                Tasa de la jornada: Bs {Number(tasaSugerida).toFixed(2)}.{" "}
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
              {leido.numeroControl && (
                <span className="text-[11px] text-cacao-mute block mt-1">N° de control: {leido.numeroControl}</span>
              )}
              {duplicada && (
                <span className="text-[12px] text-cacao-soft block mt-1">
                  La factura{" "}
                  <span className="font-medium text-cacao">{duplicada.compra.numeroFactura}</span>{" "}
                  {duplicada.mismoProveedor ? "ya existe y está " : "ya está registrada (con otro proveedor) y está "}
                  <span className={`font-medium ${duplicada.compra.pagada ? "text-oliva" : "text-terracotta"}`}>
                    {duplicada.compra.pagada ? "pagada" : "por pagar"}
                  </span>
                  {duplicada.mismoProveedor ? ". Los productos heredan ese estado." : "."}
                </span>
              )}
            </label>
            <label className="text-sm text-cacao block">
              Flete / delivery ($) <span className="text-cacao-soft font-normal">(opcional)</span>
              <input
                type="text"
                inputMode="decimal"
                value={cab.fleteUsd}
                onChange={(e) => setCab({ ...cab, fleteUsd: limpiarDecimal(e.target.value) })}
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
                const conv = conversion(p, ins, montos(p).costo);
                const info = precioInfo(p);
                const fila = p.descripcion ? filaDe(p.descripcion) : null;
                return (
                  <li key={p.key} className="py-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={creandoInsumoKey === p.key ? "__nuevo__" : p.insumoId}
                        onChange={(e) => {
                          if (e.target.value === "__nuevo__") {
                            empezarInsumo(p);
                            return;
                          }
                          setCreandoInsumoKey((k) => (k === p.key ? null : k));
                          // Al elegir el insumo a mano, la cantidad se ajusta a su
                          // presentación si la factura dice el empaque.
                          const elegido = insumoPorId.get(e.target.value);
                          const porEmpaque = elegido ? cantidadPorEmpaque(p, elegido) : null;
                          setProducto(p.key, {
                            insumoId: e.target.value,
                            origen: "",
                            cantidad: porEmpaque?.cantidad ?? (p.descripcion ? fmtQty(p.cantidadFactura) : p.cantidad),
                            unidad: porEmpaque?.unidad ?? "",
                          });
                        }}
                        aria-label="Insumo"
                        className={`min-w-0 flex-1 rounded-lg px-3 py-2 bg-white text-sm ${
                          p.origen === "sugerido" || !p.insumoId ? "ring-2 ring-amber-300" : "ring-1 ring-marfil"
                        }`}
                      >
                        <option value="">— Selecciona insumo —</option>
                        {insumosTodos.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.nombre} ({i.unidadCompra})
                          </option>
                        ))}
                        <option value="__nuevo__">+ Crear insumo…</option>
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
                    {creandoInsumoKey === p.key && (
                      <div className="rounded-lg bg-marfil-soft ring-1 ring-marfil p-2 space-y-2">
                        <p className="text-xs text-cacao">Insumo nuevo, con el nombre de la factura.</p>
                        <input
                          type="text"
                          value={borradorInsumo.nombre}
                          onChange={(e) => setBorradorInsumo({ ...borradorInsumo, nombre: e.target.value })}
                          aria-label="Nombre del insumo"
                          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white text-sm"
                        />
                        <label className="text-xs text-cacao block">
                          Unidad
                          <select
                            value={borradorInsumo.unidad}
                            onChange={(e) => setBorradorInsumo({ ...borradorInsumo, unidad: e.target.value })}
                            aria-label="Unidad del insumo"
                            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white text-sm"
                          >
                            <option value="kg">kg</option>
                            <option value="g">g</option>
                            <option value="L">L</option>
                            <option value="ml">ml</option>
                            <option value="unidad">unidad</option>
                          </select>
                        </label>
                        <p className="text-[11px] text-cacao-mute">
                          {p.porEmpaque && p.porEmpaque >= 2 && borradorInsumo.unidad === "unidad"
                            ? `Se guarda como paquete de ${p.porEmpaque}.`
                            : `Se guarda suelto, por ${borradorInsumo.unidad}.`}
                        </p>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            disabled={guardandoInsumo || !borradorInsumo.nombre.trim()}
                            onClick={() => void guardarInsumo(p)}
                            className="rounded-lg bg-cacao text-white px-3 py-1.5 text-sm font-medium hover:bg-terracotta disabled:opacity-50"
                          >
                            {guardandoInsumo ? "Guardando…" : "Crear y usar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreandoInsumoKey(null)}
                            className="text-sm text-cacao-soft hover:text-cacao"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
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
                      <div>
                        <label
                          className={`mt-1 flex rounded-lg bg-white focus-within:ring-terracotta/60 ${
                            info?.fuerte || (p.sinPrecio && !(Number(p.monto) > 0))
                              ? "ring-2 ring-amber-400 bg-amber-50"
                              : cab.moneda === monedaPago
                                ? "ring-2 ring-terracotta/50"
                                : "ring-1 ring-marfil"
                          }`}
                        >
                          <input
                            type="text"
                            inputMode="decimal"
                            value={p.monto}
                            onChange={(e) => setProducto(p.key, { monto: limpiarDecimal(e.target.value) })}
                            aria-label="Monto"
                            className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2 outline-none"
                          />
                          <span className="shrink-0 self-center px-3 text-sm text-cacao-soft">
                            {cab.moneda === "bs" ? "Bs" : "$"}
                            {cab.moneda === monedaPago && (
                              <span className="ml-1 text-[10px] uppercase tracking-widest text-terracotta">· pago</span>
                            )}
                          </span>
                        </label>
                        {/* Equivalente en vivo en la otra moneda (lo que se guarda, con IVA). */}
                        {Number(p.monto) > 0 && tasaNum > 0 && (
                          <span className="mt-0.5 block text-right text-[11px] text-cacao-soft">
                            ={" "}
                            <b className="font-medium text-cacao">
                              {cab.moneda === "bs" ? fmtMonto(montos(p).pagado, "usd") : fmtMonto(montos(p).bs ?? 0, "bs")}
                            </b>
                            {cab.moneda !== monedaPago && (
                              <span className="ml-1 text-[10px] uppercase tracking-widest text-terracotta">· pago</span>
                            )}
                            {cab.ivaModo === "sin" && !p.exento && <span> con IVA</span>}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-cacao-mute">
                      {p.descripcion && <>«{p.descripcion}» · </>}
                      {fotoUrl && fila && (
                        <>
                          <button type="button" onClick={() => verEnFoto(fila)} className="inline-flex items-center gap-0.5 underline">
                            <SearchIcon className="size-3" />
                            ver en la foto
                          </button>
                          {" · "}
                        </>
                      )}
                      {p.origen === "memoria" && <span className="text-oliva">recordado</span>}
                      {p.origen === "sugerido" && <span className="text-terracotta">sugerido, confírmalo</span>}
                      {p.sinPrecio && !(Number(p.monto) > 0) && (
                        <span className="text-terracotta"> · sin precio en la nota: escribe el monto</span>
                      )}
                      {cab.ivaModo === "sin" && !p.exento && p.alicuota && (
                        <span> · IVA {Math.round(ivaDe(p) * 100)}%</span>
                      )}
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
                    {!importeLineaCuadra(p, ins) && (
                      <p className="text-[11px] text-terracotta font-medium">
                        <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                        La cantidad por el precio no da {fmtMonto(Number(p.monto) || 0, cab.moneda)}. Revisa la cantidad.
                      </p>
                    )}
                    {info && !info.fuerte && (
                      <p className="text-[11px] text-cacao-soft">
                        Queda a {fmtPrecio(info.ahora.precio)} / {info.ahora.unidad}
                        {info.antes && (
                          <>
                            {" "}(antes {fmtPrecio(info.antes.precio)} / {info.antes.unidad})
                          </>
                        )}
                      </p>
                    )}
                    {info?.fuerte && (
                      <p className="text-[11px] text-terracotta font-medium">
                        <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                        Queda a {fmtPrecio(info.ahora.precio)} / {info.ahora.unidad}
                        {info.antes && (
                          <>
                            {" "}(antes {fmtPrecio(info.antes.precio)} / {info.antes.unidad}
                            {info.cambio !== null && `, ${info.cambio > 0 ? "+" : ""}${Math.round(info.cambio * 100)} %`}
                            {info.deProveedor && " con este proveedor"})
                          </>
                        )}
                        {info.montoSugerido !== null && (
                          <>
                            {" · "}
                            <button
                              type="button"
                              onClick={() => setProducto(p.key, { monto: String(info.montoSugerido) })}
                              className="underline"
                            >
                              ¿el monto es {fmtMonto(info.montoSugerido, cab.moneda)}?
                            </button>
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
              <span className="text-cacao-mute">Lo que se paga</span>
              <div className="mt-1 grid grid-cols-2 gap-3">
                {(["bs", "usd"] as const).map((m) => {
                  const valor = m === "usd" ? totalUsd : cab.moneda === "bs" ? totalMoneda : totalUsd * tasaNum;
                  return (
                    <div key={m} className={`rounded-lg bg-white px-3 py-2 ${m === monedaPago ? "ring-2 ring-terracotta/50" : "ring-1 ring-marfil"}`}>
                      <span className="text-xs text-cacao-mute flex items-center gap-1">
                        {m === "bs" ? "En Bs" : "En $"}
                        {m === monedaPago && <span className="text-[10px] uppercase tracking-widest text-terracotta">· pago</span>}
                      </span>
                      <span className="block font-medium text-cacao tabular-nums">
                        {m === "bs" && !(tasaNum > 0) && cab.moneda !== "bs" ? "—" : fmtMonto(valor, m)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <span className="mt-1 block text-xs text-cacao-mute">
                {tasaNum > 0 ? `A Bs ${tasaNum.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} por $ · ${origenTasa}` : "Falta la tasa del día"}
                {cab.ivaModo === "sin" && ` · el IVA va aparte`}
              </span>
              <span className="mt-1 block text-xs text-cacao">
                Costo de los insumos: <b>{fmtMonto(totalCostoUsd, "usd")}</b>
                {recuperaIva ? " (sin el IVA, porque lo recuperas)" : " (con el IVA, porque no lo recuperas)"}
              </span>
              <ResumenFactura
                resumen={leido.resumen}
                moneda={cab.moneda}
                cuadra={cuadra}
                diferencia={esperado !== undefined ? esperado - totalMoneda : undefined}
                pista={pistaCuadre}
                avisoCantidad={
                  lineasSinCuadrar.length > 0
                    ? "La cantidad por el precio no da el importe de algún renglón. Revisa las cantidades marcadas."
                    : undefined
                }
              />
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
          {insumosTodos.length === 0 && (
            <p className="text-xs text-cacao-soft">
              Aún no tienes insumos. En cada renglón puedes crear uno con «+ Crear insumo…», o hacerlo en{" "}
              <Link href="/cocina/insumos" className="underline">
                Insumos
              </Link>
              .
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
