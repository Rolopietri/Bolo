"use client";

// Producción: el cocinero registra, por insumo, cuánto tomó y cuánto le quedó
// útil (a mano en la app, escaneando la plantilla impresa o desde los mensajes
// del grupo de Telegram, siempre aprobando lo leído). Abajo se compara la merma real con la de la ficha y lo producido con
// lo que dicen las ventas.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Insumo, Receta } from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { listRecetas } from "@/lib/data/recetas";
import { calcularConsumoReceta } from "@/lib/data/ventas";
import { listVentasUso } from "@/lib/data/uso-diario";
import { crearLotes, faltaTablaProduccion, listLotes } from "@/lib/data/produccion";
import {
  compararCuadre,
  compararMerma,
  leerMensaje,
  leerPlantilla,
  mermaReal,
  resumirMerma,
  unidadPlantilla,
  type EstadoCuadre,
  type EstadoMerma,
  type LoteProduccion,
} from "@/lib/produccion";
import { fechaISOEnCaracas, restarDiasISO, salidasDeVenta } from "@/lib/stock-liviano";
import { displayCantidad, opcionesCantidad } from "@/lib/units";
import { extractError } from "@/lib/data/error";
import { listPendientes, marcarPendiente, urlFotoPendiente, type Pendiente } from "@/lib/data/telegram";
import { CantidadUnidad, factorDe } from "@/components/CantidadUnidad";
import { ErrorCarga } from "@/components/ErrorCarga";
import { CameraIcon, ChatIcon, ChevronIcon, DocIcon, ImageIcon, PlusIcon, TrashIcon } from "@/components/icons";

type Renglon = { key: number; insumoId: string; unidad: string; tomada: string; util: string };
type Vista = "merma" | "cuadre";
const PERIODOS = [7, 14, 30] as const;
const CLAVE_RESPONSABLE = "bolo:produccion:responsable";

let siguienteKey = 1;
const renglonVacio = (): Renglon => ({ key: siguienteKey++, insumoId: "", unidad: "", tomada: "", util: "" });

/** Unidad por defecto de un insumo en el registro (la de la plantilla). */
function unidadInicial(i: Insumo): string {
  const u = unidadPlantilla(i.unidadBase).unidad;
  return u === "unid" ? "unidad" : u;
}

function horaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function pct(n: number): string {
  return `${Math.round(n)} %`;
}

const META_MERMA: Record<EstadoMerma, { label: string; cls: string; dot: string }> = {
  cumple: { label: "Se cumple", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  peor: { label: "Más merma", cls: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
  mejor: { label: "Menos merma", cls: "bg-sky-50 text-sky-800 ring-sky-200", dot: "bg-sky-500" },
  sin_estandar: { label: "Sin estándar", cls: "bg-stone-100 text-stone-700 ring-stone-200", dot: "bg-stone-400" },
};
const META_CUADRE: Record<EstadoCuadre, { label: string; cls: string; dot: string }> = {
  cuadra: { label: "Cuadra", cls: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
  sobra: { label: "Sobra producción", cls: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  falta: { label: "Falta producción", cls: "bg-red-50 text-red-800 ring-red-200", dot: "bg-red-500" },
};

function Pill({ meta }: { meta: { label: string; cls: string; dot: string } }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ring-1 ${meta.cls}`}>
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden />
      {meta.label}
    </span>
  );
}

export function ProduccionClient() {
  const hoy = useMemo(() => fechaISOEnCaracas(), []);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [faltaTabla, setFaltaTabla] = useState(false);

  // ── Registro ───────────────────────────────────────────────────────
  const [fecha, setFecha] = useState(hoy);
  const [responsable, setResponsable] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>(() => [renglonVacio()]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Escaneo de la plantilla: progreso y foto para revisar contra lo leído.
  const [leyendo, setLeyendo] = useState<string | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [desdeEscaneo, setDesdeEscaneo] = useState(false);
  const archivoRef = useRef<HTMLInputElement | null>(null);
  // Mensajes del grupo de Telegram por revisar, y el que se está revisando.
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const [revisando, setRevisando] = useState<Pendiente | null>(null);
  // Otros mensajes que se juntaron con el que se revisa (la entrada en uno y la
  // salida en otro); se aprueban juntos.
  const [companeros, setCompaneros] = useState<Pendiente[]>([]);

  // ── Comparar ───────────────────────────────────────────────────────
  const [vista, setVista] = useState<Vista>("merma");
  const [periodo, setPeriodo] = useState<(typeof PERIODOS)[number]>(14);
  const [lotes, setLotes] = useState<LoteProduccion[]>([]);
  // Uso según ventas, guardado junto al período para el que se calculó.
  const [usoCalculado, setUsoCalculado] = useState<{ desde: string; mapa: Map<string, number> } | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const desde = restarDiasISO(hoy, periodo - 1);

  useEffect(() => {
    try {
      // Recordar quién registró la última vez (dato del navegador, fuera de React).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResponsable(localStorage.getItem(CLAVE_RESPONSABLE) ?? "");
    } catch {
      // sin almacenamiento local: se escribe cada vez
    }
    listInsumos()
      .then((ins) => setInsumos(ins.filter((i) => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))))
      .catch((e) => setErrorCarga(extractError(e, "Error cargando los insumos")))
      .finally(() => setCargando(false));
  }, []);

  useEffect(() => {
    let vivo = true;
    listLotes(desde, hoy)
      .then((l) => {
        if (!vivo) return;
        setLotes(l);
        setFaltaTabla(false);
      })
      .catch((e) => {
        if (vivo && faltaTablaProduccion(e)) setFaltaTabla(true);
      });
    return () => {
      vivo = false;
    };
  }, [desde, hoy, version]);

  useEffect(() => {
    let vivo = true;
    listPendientes()
      .then((p) => vivo && setPendientes(p))
      .catch(() => vivo && setPendientes([])); // sin SQL de Telegram: no hay bandeja
    return () => {
      vivo = false;
    };
  }, [version]);

  // Lo que las ventas dicen que se usó de cada insumo en el período.
  useEffect(() => {
    if (vista !== "cuadre" || insumos.length === 0) return;
    let vivo = true;
    Promise.all([listVentasUso(desde, hoy), listRecetas()])
      .then(([ventas, recetas]: [Awaited<ReturnType<typeof listVentasUso>>, Receta[]]) => {
        if (!vivo) return;
        const expandir = (id: string, r: number) => calcularConsumoReceta(id, r, recetas, insumos);
        const m = new Map<string, number>();
        for (const v of ventas) {
          if (v.esMerma) continue;
          for (const s of salidasDeVenta(v, expandir)) m.set(s.insumoId, (m.get(s.insumoId) ?? 0) + s.cantidad);
        }
        setUsoCalculado({ desde, mapa: m });
      })
      .catch(() => vivo && setUsoCalculado({ desde, mapa: new Map() }));
    return () => {
      vivo = false;
    };
  }, [vista, desde, hoy, insumos]);

  const insumoPorId = useMemo(() => new Map(insumos.map((i) => [i.id, i] as const)), [insumos]);
  // Qué trae cada mensaje de la bandeja: solo la entrada, solo la salida o ambas.
  const ladoDe = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pendientes) {
      const rs = leerMensaje(p.texto ?? "", insumos);
      if (rs.length === 0) continue;
      if (rs.every((r) => r.tomada != null && r.util == null)) m.set(p.id, "Solo entrada");
      else if (rs.every((r) => r.util != null && r.tomada == null)) m.set(p.id, "Solo salida");
    }
    return m;
  }, [pendientes, insumos]);
  const usoVentas = usoCalculado && usoCalculado.desde === desde ? usoCalculado.mapa : null;

  function cambiarRenglon(key: number, cambio: Partial<Renglon>) {
    setRenglones((rs) => rs.map((r) => (r.key === key ? { ...r, ...cambio } : r)));
  }

  function aRenglones(leidos: { insumoId: string; tomada: number | null; util: number | null }[]): Renglon[] {
    return leidos.map((r) => {
      const ins = insumoPorId.get(r.insumoId);
      return {
        key: siguienteKey++,
        insumoId: r.insumoId,
        unidad: ins ? unidadInicial(ins) : "",
        tomada: r.tomada != null ? String(r.tomada) : "",
        util: r.util != null ? String(r.util) : "",
      };
    });
  }

  function limpiarRevision() {
    setRenglones([renglonVacio()]);
    setDesdeEscaneo(false);
    setFotoUrl(null);
    setRevisando(null);
    setCompaneros([]);
  }

  /** Pasa un mensaje del grupo al formulario para revisarlo y aprobarlo. */
  async function revisar(p: Pendiente) {
    setError(null);
    setAviso(null);
    setLeyendo("Leyendo el mensaje");
    try {
      const leidos = leerMensaje(p.texto ?? "", insumos);
      setFotoUrl(null);
      if (p.tieneFoto) {
        const r = await fetch(urlFotoPendiente(p.id));
        if (r.ok) {
          const blob = await r.blob();
          setFotoUrl(URL.createObjectURL(blob));
          const { prepararFoto, leerTrozos } = await import("@/lib/facturas/ocr");
          const foto = await prepararFoto(new File([blob], "telegram.jpg", { type: blob.type || "image/jpeg" }));
          const trozos = await leerTrozos(foto, (etapa) => setLeyendo(etapa));
          const deFoto = leerPlantilla(trozos, insumos);
          // Lo escrito en el texto manda; la foto agrega los insumos que falten.
          for (const r2 of deFoto.renglones) {
            if (!r2.insumoId || !leidos.some((x) => x.insumoId === r2.insumoId)) leidos.push(r2);
          }
        }
      }
      // Entrada y salida en mensajes distintos: busca en la bandeja el mensaje
      // que completa cada renglón (la salida, después; la entrada, antes). Solo
      // se junta un mensaje si todo lo que dice es de insumos de este registro.
      const extra: Pendiente[] = [];
      const t0 = new Date(p.enviadoAt).getTime();
      const otros = pendientes
        .filter((o) => o.id !== p.id && o.texto)
        .map((o) => ({ o, t: new Date(o.enviadoAt).getTime(), rs: leerMensaje(o.texto ?? "", insumos) }))
        .filter((x) => x.rs.length > 0 && x.rs.every((y) => y.insumoId && leidos.some((l) => l.insumoId === y.insumoId)));
      for (const r of leidos) {
        if (!r.insumoId || (r.tomada != null && r.util != null)) continue;
        const buscaSalida = r.util == null;
        const lado = (t: number) => (buscaSalida ? (t >= t0 ? 0 : 1) : t <= t0 ? 0 : 1);
        const cercania = (t: number) => Math.abs(t - t0);
        const orden = [...otros].sort((a, b) => lado(a.t) - lado(b.t) || cercania(a.t) - cercania(b.t));
        for (const x of orden) {
          const c = x.rs.find(
            (y) =>
              y.insumoId === r.insumoId &&
              (buscaSalida ? y.util != null && y.tomada == null : y.tomada != null && y.util == null),
          );
          if (!c) continue;
          if (buscaSalida) r.util = c.util;
          else r.tomada = c.tomada;
          if (!extra.some((e) => e.id === x.o.id)) extra.push(x.o);
          break;
        }
      }
      setCompaneros(extra);
      setFecha(fechaISOEnCaracas(new Date(p.enviadoAt)));
      if (p.remitente) setResponsable(p.remitente);
      setRenglones(leidos.length > 0 ? aRenglones(leidos) : [renglonVacio()]);
      if (leidos.length === 0) setError("No reconocí cantidades en el mensaje. Complétalas a mano o descarta el mensaje.");
      setDesdeEscaneo(true);
      setRevisando(p);
    } catch (e) {
      setError(extractError(e, "No se pudo leer el mensaje."));
    } finally {
      setLeyendo(null);
    }
  }

  async function descartar() {
    const p = revisando;
    limpiarRevision();
    if (!p) return;
    try {
      await marcarPendiente(p.id, "descartado");
      setAviso("Mensaje descartado.");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(extractError(e, "No se pudo descartar el mensaje."));
    }
  }

  async function escanear(archivo: File) {
    setError(null);
    setAviso(null);
    setLeyendo("Preparando la foto");
    try {
      const { prepararFoto, leerTrozos } = await import("@/lib/facturas/ocr");
      const foto = await prepararFoto(archivo);
      const trozos = await leerTrozos(foto, (etapa) => setLeyendo(etapa));
      setFotoUrl(URL.createObjectURL(foto));
      const leido = leerPlantilla(trozos, insumos);
      if (leido.renglones.length === 0) {
        setError("No pude reconocer renglones en la foto. Prueba con más luz y la hoja completa, o escríbelos a mano.");
        return;
      }
      if (leido.fecha) setFecha(leido.fecha);
      if (leido.responsable) setResponsable(leido.responsable);
      setRenglones(aRenglones(leido.renglones));
      setRevisando(null);
      setDesdeEscaneo(true);
    } catch (e) {
      setError(extractError(e, "No se pudo leer la foto."));
    } finally {
      setLeyendo(null);
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAviso(null);
    if (renglones.some((r) => !r.insumoId && (r.tomada.trim() !== "" || r.util.trim() !== ""))) {
      setError("Hay renglones con cantidades pero sin insumo. Elige el insumo o quita el renglón.");
      return;
    }
    const nombreDe = (id: string) => insumoPorId.get(id)?.nombre ?? "un insumo";
    const sinEntrada = renglones.find((r) => r.insumoId && r.tomada.trim() === "" && r.util.trim() !== "");
    if (sinEntrada) {
      setError(`Falta cuánto entró sin procesar de ${nombreDe(sinEntrada.insumoId)}.`);
      return;
    }
    if (revisando) {
      const sinSalida = renglones.find((r) => r.insumoId && r.tomada.trim() !== "" && r.util.trim() === "");
      if (sinSalida) {
        setError(
          `Falta cuánto salió procesado de ${nombreDe(sinSalida.insumoId)}. Si todavía se está procesando, toca «Dejar pendiente» y apruébalo cuando llegue el mensaje de salida.`,
        );
        return;
      }
    }
    const completos = renglones.filter((r) => r.insumoId && r.tomada.trim() !== "");
    if (completos.length === 0) {
      setError("Agrega al menos un insumo con su cantidad sin procesar.");
      return;
    }
    const nuevos = [];
    for (const r of completos) {
      const ins = insumoPorId.get(r.insumoId);
      if (!ins) continue;
      const factor = factorDe(opcionesCantidad(ins), r.unidad || unidadInicial(ins));
      const tomada = Number(r.tomada) * factor;
      const util = (r.util.trim() === "" ? Number(r.tomada) : Number(r.util)) * factor;
      if (!(tomada > 0) || util < 0) {
        setError(`Revisa las cantidades de ${ins.nombre}.`);
        return;
      }
      if (util > tomada) {
        setError(`En ${ins.nombre}, lo procesado no puede ser más que lo sin procesar.`);
        return;
      }
      nuevos.push({
        fecha,
        insumoId: ins.id,
        tomada,
        util,
        responsable,
        notas: revisando
          ? `Telegram: ${[revisando, ...companeros].map((m) => m.texto ?? "").filter(Boolean).join(" | ")}`.slice(0, 500)
          : undefined,
        origen: revisando ? ("telegram" as const) : desdeEscaneo ? ("escaneo" as const) : ("manual" as const),
      });
    }
    setGuardando(true);
    try {
      await crearLotes(nuevos);
      if (revisando) {
        for (const m of [revisando, ...companeros]) await marcarPendiente(m.id, "aprobado");
      }
      try {
        localStorage.setItem(CLAVE_RESPONSABLE, responsable);
      } catch {
        // no pasa nada
      }
      limpiarRevision();
      setAviso(`${nuevos.length} ${nuevos.length === 1 ? "lote guardado" : "lotes guardados"}.`);
      setVersion((v) => v + 1);
    } catch (err) {
      if (faltaTablaProduccion(err)) setFaltaTabla(true);
      else setError(extractError(err, "No se pudo guardar el registro."));
    } finally {
      setGuardando(false);
    }
  }

  const resumen = useMemo(
    () =>
      resumirMerma(lotes).sort((a, b) =>
        (insumoPorId.get(a.insumoId)?.nombre ?? "").localeCompare(insumoPorId.get(b.insumoId)?.nombre ?? "", "es"),
      ),
    [lotes, insumoPorId],
  );

  if (cargando) return <p className="py-10 text-center text-cacao-soft">Cargando…</p>;
  if (errorCarga) return <ErrorCarga que="los insumos" detalle={errorCarga} onReintentar={() => location.reload()} />;

  return (
    <div className="space-y-10">
      {faltaTabla && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Falta activar el registro de producción en la base de datos (archivo
          supabase/bolo-05-produccion-lotes.sql). Mientras tanto no se pueden guardar lotes.
        </p>
      )}

      {/* ── Mensajes del grupo de Telegram por revisar ─────────── */}
      {pendientes.length > 0 && (
        <section aria-label="Mensajes por revisar" className="space-y-2">
          <h2 className="text-[11px] uppercase tracking-widest text-cacao-soft">
            Del grupo de Telegram · {pendientes.length} por revisar
          </h2>
          <ul className="divide-y divide-marfil border-y border-marfil">
            {pendientes.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                {p.tieneFoto ? (
                  <ImageIcon className="size-4 shrink-0 text-terracotta" />
                ) : (
                  <ChatIcon className="size-4 shrink-0 text-terracotta" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-cacao">{p.texto || "Foto sin texto"}</span>
                  <span className="block text-xs text-cacao-soft">
                    {p.remitente ?? "Sin nombre"} · {horaCorta(p.enviadoAt)}
                    {ladoDe.get(p.id) && <> · {ladoDe.get(p.id)}</>}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void revisar(p)}
                  disabled={leyendo !== null || revisando?.id === p.id || companeros.some((c) => c.id === p.id)}
                  className="min-h-10 shrink-0 rounded-lg px-3 text-sm text-terracotta ring-1 ring-marfil hover:bg-marfil-soft disabled:opacity-50"
                >
                  {revisando?.id === p.id || companeros.some((c) => c.id === p.id) ? "Revisando" : "Revisar"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Registro ─────────────────────────────────────────── */}
      <form onSubmit={guardar} className="space-y-4" aria-label="Registrar producción">
        <div className="flex flex-wrap gap-2">
          <Link
            href="/cocina/produccion/plantilla"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
          >
            <DocIcon className="size-4 text-terracotta" />
            Imprimir plantilla
          </Link>
          <button
            type="button"
            onClick={() => archivoRef.current?.click()}
            disabled={leyendo !== null}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft disabled:opacity-60"
          >
            <CameraIcon className="size-4 text-terracotta" />
            {leyendo ? `${leyendo}…` : "Escanear plantilla"}
          </button>
          <Link
            href="/cocina/produccion/telegram"
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-white px-3 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
          >
            <ChatIcon className="size-4 text-terracotta" />
            Grupo de Telegram
          </Link>
          <input
            ref={archivoRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void escanear(f);
              e.target.value = "";
            }}
          />
        </div>

        {desdeEscaneo && (
          <div className="flex flex-wrap items-start gap-3 rounded-xl bg-marfil-soft p-3 ring-1 ring-marfil">
            {fotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fotoUrl} alt="Plantilla escaneada" className="h-28 w-auto rounded-lg ring-1 ring-marfil" />
            )}
            <div className="min-w-0 flex-1 space-y-1 text-sm text-cacao">
              {revisando ? (
                <>
                  <p className="text-xs text-cacao-soft">
                    Mensaje de {revisando.remitente ?? "alguien del grupo"} · {horaCorta(revisando.enviadoAt)}
                  </p>
                  {revisando.texto && <p className="whitespace-pre-line">{revisando.texto}</p>}
                  {companeros.map((c) => (
                    <div key={c.id} className="border-t border-marfil pt-1">
                      <p className="text-xs text-cacao-soft">
                        Junto con el mensaje de {c.remitente ?? "alguien del grupo"} · {horaCorta(c.enviadoAt)}
                      </p>
                      <p className="whitespace-pre-line">{c.texto}</p>
                    </div>
                  ))}
                  <p>
                    Revisa cada renglón contra el mensaje, corrige lo que haga falta y toca <b>Aprobar y guardar</b>.
                  </p>
                </>
              ) : (
                <p>
                  Leí la plantilla. Revisa cada renglón contra la foto, corrige lo que haga falta y toca{" "}
                  <b>Aprobar y guardar</b>.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm text-cacao">
            Fecha
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="mt-1 w-full rounded-lg px-3 py-2 ring-1 ring-marfil"
            />
          </label>
          <label className="text-sm text-cacao">
            Responsable
            <input
              type="text"
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
              placeholder="Quién produjo"
              className="mt-1 w-full rounded-lg px-3 py-2 ring-1 ring-marfil"
            />
          </label>
        </div>

        <ul className="divide-y divide-marfil border-y border-marfil">
          {renglones.map((r) => {
            const ins = insumoPorId.get(r.insumoId);
            const opciones = ins ? opcionesCantidad(ins) : [];
            const unidad = r.unidad || (ins ? unidadInicial(ins) : "");
            const t = Number(r.tomada);
            const u = r.util.trim() === "" ? null : Number(r.util);
            const real = u != null ? mermaReal(t, u) : null;
            const estado = real != null ? compararMerma(real, ins?.mermaCoccionPorc) : null;
            return (
              <li key={r.key} className="space-y-2 py-3">
                <div className="flex items-center gap-2">
                  <select
                    value={r.insumoId}
                    onChange={(e) => {
                      const nuevo = insumoPorId.get(e.target.value);
                      cambiarRenglon(r.key, { insumoId: e.target.value, unidad: nuevo ? unidadInicial(nuevo) : "" });
                    }}
                    aria-label="Insumo"
                    className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-marfil"
                  >
                    <option value="">Elige el insumo…</option>
                    {insumos.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nombre}
                      </option>
                    ))}
                  </select>
                  {renglones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRenglones((rs) => rs.filter((x) => x.key !== r.key))}
                      aria-label="Quitar renglón"
                      className="grid size-10 shrink-0 place-items-center rounded-lg text-cacao-mute hover:bg-marfil-soft hover:text-terracotta"
                    >
                      <TrashIcon className="size-4" />
                    </button>
                  )}
                </div>
                {!ins && (r.tomada || r.util) && (
                  <p className="text-xs text-terracotta-deep">
                    Leí {r.tomada || "—"} → {r.util || "—"}, pero no reconocí el insumo. Elígelo arriba.
                  </p>
                )}
                {ins && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-xs text-cacao-soft">
                      Sin procesar
                      <CantidadUnidad
                        valor={r.tomada}
                        unidad={unidad}
                        opciones={opciones}
                        onChange={(v, un) => cambiarRenglon(r.key, { tomada: v, unidad: un })}
                      />
                    </label>
                    <label className="text-xs text-cacao-soft">
                      Procesado
                      <CantidadUnidad
                        valor={r.util}
                        unidad={unidad}
                        opciones={opciones}
                        onChange={(v, un) => cambiarRenglon(r.key, { util: v, unidad: un })}
                      />
                    </label>
                  </div>
                )}
                {ins && real != null && t > 0 && u != null && (
                  <p className="flex flex-wrap items-center gap-2 text-xs text-cacao-soft">
                    Desecho {displayCantidad((t - u) * factorDe(opciones, unidad), ins.unidadBase)} · merma{" "}
                    <b className="text-cacao">{pct(real)}</b>
                    {ins.mermaCoccionPorc != null && <>· estándar {pct(ins.mermaCoccionPorc)}</>}
                    {estado && <Pill meta={META_MERMA[estado]} />}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => setRenglones((rs) => [...rs, renglonVacio()])}
          className="inline-flex items-center gap-1.5 text-sm text-terracotta hover:underline"
        >
          <PlusIcon className="size-4" />
          Otro insumo
        </button>

        {error && <p className="text-sm text-terracotta-deep">{error}</p>}
        {aviso && <p className="text-sm text-emerald-800">{aviso}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={guardando || faltaTabla}
            className="flex-1 rounded-lg bg-terracotta py-2.5 font-semibold text-white hover:bg-terracotta-deep disabled:opacity-60"
          >
            {guardando ? "Guardando…" : desdeEscaneo ? "Aprobar y guardar" : "Guardar registro"}
          </button>
          {desdeEscaneo && (
            <button
              type="button"
              onClick={() => void descartar()}
              className="rounded-lg px-4 py-2.5 text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
            >
              {revisando ? "Descartar mensaje" : "Descartar"}
            </button>
          )}
          {revisando && (
            <button
              type="button"
              onClick={limpiarRevision}
              className="rounded-lg px-4 py-2.5 text-cacao-soft hover:bg-marfil-soft"
            >
              Dejar pendiente
            </button>
          )}
        </div>
      </form>

      {/* ── Comparar ─────────────────────────────────────────── */}
      <section className="space-y-3" aria-label="Comparar">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-marfil pb-3">
          <div className="flex gap-1">
            {(
              [
                ["merma", "Merma real vs. estándar"],
                ["cuadre", "Cuadre con ventas"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setVista(v)}
                aria-current={vista === v ? "page" : undefined}
                className={`min-h-10 rounded-full px-4 text-[11px] uppercase tracking-widest ring-1 ${
                  vista === v ? "bg-cacao text-white ring-cacao" : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(Number(e.target.value) as (typeof PERIODOS)[number])}
            aria-label="Período"
            className="rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-marfil"
          >
            {PERIODOS.map((p) => (
              <option key={p} value={p}>
                Últimos {p} días
              </option>
            ))}
          </select>
        </div>

        {resumen.length === 0 ? (
          <p className="py-6 text-center font-serif italic text-cacao-soft">
            Todavía no hay lotes registrados en este período.
          </p>
        ) : vista === "merma" ? (
          <ul className="divide-y divide-marfil">
            {resumen.map((r) => {
              const ins = insumoPorId.get(r.insumoId);
              if (!ins) return null;
              const estado = compararMerma(r.real, ins.mermaCoccionPorc);
              const open = abierto === r.insumoId;
              return (
                <li key={r.insumoId} className="py-3">
                  <button
                    type="button"
                    onClick={() => setAbierto(open ? null : r.insumoId)}
                    aria-expanded={open}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-cacao">{ins.nombre}</span>
                      <span className="block text-xs text-cacao-soft">
                        {r.lotes.length} {r.lotes.length === 1 ? "lote" : "lotes"} · sin procesar{" "}
                        {displayCantidad(r.tomada, ins.unidadBase)} · procesado {displayCantidad(r.util, ins.unidadBase)}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm text-cacao">
                        <b>{pct(r.real)}</b>
                        {ins.mermaCoccionPorc != null && (
                          <span className="text-cacao-mute"> / {pct(ins.mermaCoccionPorc)}</span>
                        )}
                      </span>
                      <Pill meta={META_MERMA[estado]} />
                    </span>
                    <ChevronIcon className={`mt-1 size-4 shrink-0 text-cacao-mute ${open ? "rotate-90" : ""}`} />
                  </button>
                  {open && (
                    <ul className="mt-2 space-y-1 border-l-2 border-marfil pl-3 text-xs text-cacao-soft">
                      {r.lotes.map((l) => (
                        <li key={l.id} className="flex justify-between gap-3">
                          <span>
                            {l.fecha.split("-").reverse().join("/")}
                            {l.responsable ? ` · ${l.responsable}` : ""}
                            {l.origen === "escaneo" ? " · escaneado" : ""}
                          </span>
                          <span className="tabular-nums text-cacao">
                            {displayCantidad(l.tomada, ins.unidadBase)} → {displayCantidad(l.util, ins.unidadBase)} ·{" "}
                            {pct(mermaReal(l.tomada, l.util) ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        ) : usoVentas === null ? (
          <p className="py-6 text-center text-cacao-soft">Calculando con las ventas…</p>
        ) : (
          <ul className="divide-y divide-marfil">
            {resumen.map((r) => {
              const ins = insumoPorId.get(r.insumoId);
              if (!ins) return null;
              const usado = usoVentas.get(r.insumoId) ?? 0;
              const c = compararCuadre(r.util, usado);
              return (
                <li key={r.insumoId} className="flex items-start justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block font-medium text-cacao">{ins.nombre}</span>
                    <span className="block text-xs text-cacao-soft">
                      Procesado {displayCantidad(r.util, ins.unidadBase)} · según ventas{" "}
                      {displayCantidad(usado, ins.unidadBase)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm tabular-nums text-cacao">
                      {c.diferencia > 0 ? "+" : c.diferencia < 0 ? "−" : ""}
                      {displayCantidad(Math.abs(c.diferencia), ins.unidadBase)}
                    </span>
                    <Pill meta={META_CUADRE[c.estado]} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
