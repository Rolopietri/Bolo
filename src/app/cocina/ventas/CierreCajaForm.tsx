"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { extractError } from "@/lib/data/error";
import { getTasaBcvPorFecha } from "@/lib/data/cocina";
import { totalesVentasPorDia } from "@/lib/data/ventas";
import {
  AVISO_MIGRACION_CIERRE,
  borrarCierre,
  esFaltaTablaCierre,
  guardarCierre,
  leerCierre,
  type CierreCaja,
} from "@/lib/data/cierre-caja";
import {
  compararCaja,
  etiquetaFecha,
  etiquetaMetodo,
  formatoMonto,
  hoyCaracas,
  monedaCanon,
  parseMonto,
  type LineaMonto,
  type MetodoCaja,
  type MonedaCaja,
} from "@/lib/cierre-caja";
import { fmtBs, fmtUsd } from "@/lib/moneda";
import { EstadoCajaPill } from "./EstadoCajaPill";

const CAMPOS: { id: Exclude<MetodoCaja, "otro">; pista: string }[] = [
  { id: "efectivo_usd", pista: "Billetes en dólares" },
  { id: "efectivo_bs", pista: "Billetes y monedas en bolívares" },
  { id: "pago_movil", pista: "Pago móvil y transferencias" },
  { id: "punto", pista: "Tarjeta por el punto de venta" },
  { id: "zelle", pista: "Zelle u otra transferencia en dólares" },
];

type Montos = Record<Exclude<MetodoCaja, "otro">, string>;

const VACIOS: Montos = {
  efectivo_usd: "",
  efectivo_bs: "",
  pago_movil: "",
  punto: "",
  zelle: "",
};

type TasaVista = { usdBs: number; fecha: string };

function mensajeError(e: unknown, fallback: string): string {
  if (esFaltaTablaCierre(e)) return AVISO_MIGRACION_CIERRE;
  const msg = extractError(e, fallback);
  if (/url and (api )?key|supabaseurl is required/i.test(msg)) {
    return "No hay conexión con la base de datos. La cuenta se ve en esta pantalla, pero no se guarda.";
  }
  return msg;
}

function leerBorrador(montos: Montos, otroMonto: string, otroMoneda: MonedaCaja, otroEtiqueta: string): {
  lineas: LineaMonto[];
  error: string | null;
} {
  const lineas: LineaMonto[] = [];
  for (const c of CAMPOS) {
    const valor = parseMonto(montos[c.id]);
    if (valor == null) return { lineas: [], error: `Revisa el monto de ${etiquetaMetodo(c.id)}.` };
    if (valor > 0) lineas.push({ metodo: c.id, moneda: monedaCanon(c.id, "Bs"), monto: valor });
  }
  const otro = parseMonto(otroMonto);
  if (otro == null) return { lineas: [], error: "Revisa el monto de Otro." };
  if (otro > 0) {
    lineas.push({
      metodo: "otro",
      moneda: otroMoneda,
      monto: otro,
      etiqueta: otroEtiqueta.trim() || undefined,
    });
  }
  return { lineas, error: null };
}

export function CierreCajaPantalla({ fechaInicial }: { fechaInicial: string | null }) {
  const valida = fechaInicial && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicial) ? fechaInicial : null;
  const [fecha, setFecha] = useState(() => valida ?? hoyCaracas());
  return <CierreCajaForm fecha={fecha} onFecha={setFecha} mostrarFecha />;
}

export function CierreCajaForm({
  fecha,
  onFecha,
  mostrarFecha = true,
  revision = 0,
}: {
  fecha: string;
  onFecha?: (iso: string) => void;
  mostrarFecha?: boolean;
  /** Sube cuando cambian las ventas del día, para refrescar la comparación. */
  revision?: number;
}) {
  const [montos, setMontos] = useState<Montos>(VACIOS);
  const [otroMonto, setOtroMonto] = useState("");
  const [otroMoneda, setOtroMoneda] = useState<MonedaCaja>("Bs");
  const [otroEtiqueta, setOtroEtiqueta] = useState("");
  const [nota, setNota] = useState("");
  const [cierreId, setCierreId] = useState<string | null>(null);
  const [tasaGuardada, setTasaGuardada] = useState<number | null>(null);
  const [tasaFechaGuardada, setTasaFechaGuardada] = useState<string | null>(null);
  const [forzarTasaNueva, setForzarTasaNueva] = useState(false);
  const [tasaHoy, setTasaHoy] = useState<TasaVista | null>(null);
  const [ventasUsd, setVentasUsd] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const [fechaActiva, setFechaActiva] = useState(fecha);
  if (fecha !== fechaActiva) {
    setFechaActiva(fecha);
    setCargando(true);
    setError(null);
    setOk(null);
    setForzarTasaNueva(false);
    setMontos(VACIOS);
    setOtroMonto("");
    setOtroMoneda("Bs");
    setOtroEtiqueta("");
    setNota("");
    setCierreId(null);
    setTasaGuardada(null);
    setTasaFechaGuardada(null);
  }

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [cierreR, tasaR, ventasR] = await Promise.allSettled([
        leerCierre(fecha),
        getTasaBcvPorFecha(fecha),
        totalesVentasPorDia(fecha, fecha),
      ]);
      if (cancel) return;

      if (cierreR.status === "fulfilled") {
        aplicar(cierreR.value);
        setAviso(null);
      } else if (esFaltaTablaCierre(cierreR.reason)) {
        setAviso(AVISO_MIGRACION_CIERRE);
      } else {
        setError(mensajeError(cierreR.reason, "No se pudo leer el cierre"));
      }

      if (tasaR.status === "fulfilled" && tasaR.value && tasaR.value.usdBs > 0) {
        setTasaHoy({ usdBs: tasaR.value.usdBs, fecha: tasaR.value.fecha });
      } else {
        setTasaHoy(null);
      }

      if (ventasR.status === "fulfilled") {
        setVentasUsd(ventasR.value[fecha.slice(0, 10)] ?? 0);
      } else {
        setVentasUsd(0);
        setError((prev) => prev ?? mensajeError(ventasR.reason, "No se pudieron leer las ventas de este día"));
      }

      if (!cancel) setCargando(false);
    })();

    return () => {
      cancel = true;
    };
  }, [fecha]);

  useEffect(() => {
    if (revision === 0) return;
    let cancel = false;
    totalesVentasPorDia(fecha, fecha)
      .then((tot) => {
        if (!cancel) setVentasUsd(tot[fecha.slice(0, 10)] ?? 0);
      })
      .catch(() => {
        /* el cierre sigue visible; la comparación usa la última venta leída */
      });
    return () => {
      cancel = true;
    };
  }, [fecha, revision]);

  function aplicar(c: CierreCaja | null) {
    const next = { ...VACIOS };
    let otro = "";
    let moneda: MonedaCaja = "Bs";
    let etiqueta = "";
    for (const l of c?.lineas ?? []) {
      if (l.metodo === "otro") {
        otro = formatoMonto(l.monto);
        moneda = l.moneda;
        etiqueta = l.etiqueta ?? "";
      } else {
        next[l.metodo] = formatoMonto(l.monto);
      }
    }
    setMontos(next);
    setOtroMonto(otro);
    setOtroMoneda(moneda);
    setOtroEtiqueta(etiqueta);
    setNota(c?.nota ?? "");
    setCierreId(c?.id ?? null);
    setTasaGuardada(c?.tasaUsdBs ?? null);
    setTasaFechaGuardada(c?.tasaFecha ?? null);
  }

  const leido = useMemo(
    () => leerBorrador(montos, otroMonto, otroMoneda, otroEtiqueta),
    [montos, otroMonto, otroMoneda, otroEtiqueta],
  );
  const tasaParaCuenta: TasaVista | null =
    !forzarTasaNueva && tasaGuardada != null
      ? { usdBs: tasaGuardada, fecha: tasaFechaGuardada ?? fecha }
      : tasaHoy;
  const hayRegistro = Boolean(cierreId) || leido.lineas.length > 0 || nota.trim() !== "" || otroEtiqueta.trim() !== "";
  const comp = compararCaja({
    lineas: leido.error ? [] : leido.lineas,
    tasaUsdBs: tasaParaCuenta?.usdBs ?? null,
    ventasUsd,
    hayRegistro: leido.error ? false : hayRegistro,
  });
  const tasaDistinta =
    tasaGuardada != null &&
    tasaHoy != null &&
    Math.abs(tasaGuardada - tasaHoy.usdBs) > 0.0001;

  async function guardar() {
    if (leido.error) {
      setError(leido.error);
      return;
    }
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      const guardado = await guardarCierre({
        fecha,
        nota,
        tasaUsdBs: tasaParaCuenta?.usdBs ?? null,
        tasaFecha: tasaParaCuenta?.fecha ?? null,
        lineas: leido.lineas,
      });
      aplicar(guardado);
      setForzarTasaNueva(false);
      setAviso(null);
      setOk(`Listo. El cierre del ${etiquetaFecha(fecha)} quedó guardado.`);
    } catch (e) {
      const msg = mensajeError(e, "No se pudo guardar el cierre");
      if (esFaltaTablaCierre(e)) setAviso(AVISO_MIGRACION_CIERRE);
      setError(msg);
    } finally {
      setGuardando(false);
    }
  }

  async function borrar() {
    if (!cierreId) return;
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      await borrarCierre(cierreId);
      aplicar(null);
      setOk("Se borró el cierre de este día.");
    } catch (e) {
      setError(mensajeError(e, "No se pudo borrar el cierre"));
    } finally {
      setGuardando(false);
      setConfirmarBorrar(false);
    }
  }

  function tocar(fn: () => void) {
    setOk(null);
    fn();
  }

  const hoy = hoyCaracas();

  return (
    <section id="cierre-caja" className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">Cierre de caja</h2>
          <p className="mt-1 text-sm text-cacao-soft">
            Anota cuánto entró por cada método. Bolo lo pasa a dólares con la tasa BCV y lo compara con las ventas del día.
          </p>
        </div>
        {!mostrarFecha && (
          <Link
            href={`/cocina/ventas/cierre?fecha=${fecha}`}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            Abrir solo el cierre
          </Link>
        )}
      </div>

      {mostrarFecha ? (
        <label className="text-sm text-cacao block max-w-xs">
          Fecha
          <input
            type="date"
            value={fecha}
            max={hoy}
            onChange={(e) => {
              if (e.target.value) onFecha?.(e.target.value);
            }}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
      ) : (
        <p className="text-sm text-cacao">
          Mismo día de los platos: <span className="font-medium capitalize">{etiquetaFecha(fecha)}</span>
        </p>
      )}

      <p className="text-[11px] text-cacao-mute">
        {tasaParaCuenta ? (
          tasaParaCuenta.fecha.slice(0, 10) === fecha.slice(0, 10) ? (
            <>BCV de este día: {fmtBs(tasaParaCuenta.usdBs)} por $1.</>
          ) : (
            <>
              No hay tasa del {etiquetaFecha(fecha)}. Se usa la del {etiquetaFecha(tasaParaCuenta.fecha)}:{" "}
              {fmtBs(tasaParaCuenta.usdBs)} por $1.
            </>
          )
        ) : (
          <>Sin tasa BCV para este día. Los bolívares no se pueden pasar a dólares.</>
        )}
        {tasaDistinta && !forzarTasaNueva && (
          <>
            {" "}
            La tasa guardada no es la que está hoy en Bolo.{" "}
            <button
              type="button"
              className="underline decoration-dotted"
              onClick={() => tocar(() => setForzarTasaNueva(true))}
            >
              Usar la tasa nueva ({fmtBs(tasaHoy?.usdBs ?? 0)})
            </button>
          </>
        )}
      </p>

      <ul className="divide-y divide-marfil rounded-xl ring-1 ring-marfil">
        {CAMPOS.map((c) => {
          const moneda = monedaCanon(c.id, "Bs");
          return (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <label htmlFor={`cierre-${c.id}`} className="text-sm text-cacao">
                  {etiquetaMetodo(c.id)}
                </label>
                <p className="text-[11px] text-cacao-mute">{c.pista}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  id={`cierre-${c.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  disabled={cargando || guardando}
                  value={montos[c.id]}
                  placeholder="0"
                  aria-label={`Monto de ${etiquetaMetodo(c.id)}`}
                  onChange={(e) => tocar(() => setMontos((prev) => ({ ...prev, [c.id]: e.target.value })))}
                  className="w-28 rounded-lg ring-1 ring-marfil px-3 py-2 text-right text-sm tabular-nums text-cacao sm:w-36"
                />
                <span className="w-8 text-xs text-cacao-mute">{moneda === "USD" ? "USD" : "Bs"}</span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="rounded-xl ring-1 ring-marfil p-3 space-y-3">
        <div>
          <p className="text-sm text-cacao">Otro</p>
          <p className="text-[11px] text-cacao-mute">Lo que no entra arriba. Elige si fue en dólares o en bolívares.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_7.5rem_9rem] sm:items-end">
          <label className="text-sm text-cacao block">
            Nombre, si quieres
            <input
              value={otroEtiqueta}
              maxLength={80}
              disabled={cargando || guardando}
              placeholder="Reservas, cambio…"
              onChange={(e) => tocar(() => setOtroEtiqueta(e.target.value))}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-cacao block">
            Moneda
            <select
              value={otroMoneda}
              disabled={cargando || guardando}
              onChange={(e) => tocar(() => setOtroMoneda(e.target.value === "USD" ? "USD" : "Bs"))}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
            >
              <option value="Bs">Bs</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="text-sm text-cacao block">
            Monto
            <input
              inputMode="decimal"
              autoComplete="off"
              disabled={cargando || guardando}
              value={otroMonto}
              placeholder="0"
              aria-label="Monto de otro método"
              onChange={(e) => tocar(() => setOtroMonto(e.target.value))}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-right text-sm tabular-nums"
            />
          </label>
        </div>
      </div>

      <p className="text-[11px] text-cacao-mute">Puedes escribir 4500 o 4.500. Los centavos van con coma o con punto: 120,50.</p>

      <label className="text-sm text-cacao block">
        Nota, si quieres
        <textarea
          value={nota}
          maxLength={500}
          rows={2}
          disabled={cargando || guardando}
          placeholder="Algo para recordar de este cierre"
          onChange={(e) => tocar(() => setNota(e.target.value))}
          className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm"
        />
      </label>

      <div className="rounded-xl bg-marfil-soft px-4 py-3 space-y-2" aria-live="polite">
        {cargando ? (
          <p className="text-sm text-cacao-soft">Cargando el cierre y las ventas de este día…</p>
        ) : leido.error ? (
          <p className="text-sm text-[#7A2419]">{leido.error}</p>
        ) : (
          <>
            <FilaTotal
              label="Ventas del día"
              principal={fmtUsd(ventasUsd)}
              secundario={
                tasaParaCuenta
                  ? fmtBs(ventasUsd * tasaParaCuenta.usdBs)
                  : "Sin tasa para verlas en bolívares"
              }
            />
            {comp.estado === "vacio" ? (
              <p className="font-serif text-sm italic text-cacao-soft">{comp.detalle}</p>
            ) : (
              <>
                <FilaTotal
                  label="Total cobrado"
                  principal={textoUsd(comp, leido.lineas, tasaParaCuenta?.usdBs ?? null)}
                  secundario={textoBs(leido.lineas, tasaParaCuenta?.usdBs ?? null)}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-marfil pt-2">
                  <EstadoCajaPill estado={comp.estado} titulo={comp.titulo} />
                  <p className="text-sm text-cacao-soft">{comp.detalle}</p>
                </div>
              </>
            )}
            {ventasUsd === 0 && comp.estado !== "vacio" && (
              <p className="text-[11px] text-cacao-mute">
                Este día no tiene ventas registradas (las mermas no cuentan). El cierre igual se puede guardar.
              </p>
            )}
          </>
        )}
      </div>

      {(aviso || error || ok) && (
        <div id="cierre-estado" className="space-y-2">
          {aviso && (
            <div className="rounded-lg bg-[#FBF3E4] ring-1 ring-[#E6D3A8] p-3 text-sm text-[#8A5A12]">{aviso}</div>
          )}
          {error && (
            <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">{error}</div>
          )}
          {ok && (
            <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">{ok}</div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {cierreId ? (
          <button
            type="button"
            onClick={() => setConfirmarBorrar(true)}
            disabled={guardando}
            className="text-sm text-terracotta hover:underline disabled:opacity-50"
          >
            Borrar este cierre
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => void guardar()}
          disabled={cargando || guardando || Boolean(leido.error)}
          className="rounded-lg bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
        >
          {guardando ? "Guardando..." : cierreId ? "Actualizar cierre" : "Guardar cierre"}
        </button>
      </div>

      <ConfirmDialog
        open={confirmarBorrar}
        title="¿Borrar el cierre de este día?"
        message="Los montos se pierden. Las ventas del día no se tocan."
        confirmLabel="Sí, borrar"
        busy={guardando}
        onConfirm={() => void borrar()}
        onCancel={() => setConfirmarBorrar(false)}
      />
    </section>
  );
}

function textoUsd(
  comp: { cajaUsd: number | null; estado: string },
  lineas: LineaMonto[],
  tasa: number | null,
): string {
  if (comp.cajaUsd != null && comp.estado !== "vacio") return fmtUsd(comp.cajaUsd);
  const usd = lineas.filter((l) => monedaCanon(l.metodo, l.moneda) === "USD").reduce((s, l) => s + l.monto, 0);
  if (comp.estado === "sin_tasa") {
    return usd > 0 ? `${fmtUsd(usd)} en dólares, bolívares sin tasa` : "Bolívares sin tasa";
  }
  return tasa ? fmtUsd(0) : fmtUsd(usd);
}

function textoBs(lineas: LineaMonto[], tasa: number | null): string {
  let usd = 0;
  let bs = 0;
  for (const l of lineas) {
    if (monedaCanon(l.metodo, l.moneda) === "USD") usd += l.monto;
    else bs += l.monto;
  }
  if (usd > 0 && !(tasa && tasa > 0)) {
    return bs > 0 ? `${fmtBs(bs)} en bolívares, dólares sin tasa` : "Dólares sin tasa para verlos en bolívares";
  }
  const total = bs + (tasa && tasa > 0 ? usd * tasa : 0);
  return fmtBs(total);
}

function FilaTotal({ label, principal, secundario }: { label: string; principal: string; secundario: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-cacao">{label}</span>
      <span className="text-right">
        <span className="block text-sm font-medium tabular-nums text-cacao">{principal}</span>
        <span className="block text-[11px] tabular-nums text-cacao-soft">{secundario}</span>
      </span>
    </div>
  );
}
