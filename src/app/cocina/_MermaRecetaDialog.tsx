"use client";

import { useMemo, useState } from "react";
import {
  MOTIVOS_MERMA_PRODUCCION,
  type Receta,
  type Insumo,
  type PlanProduccion,
} from "@/lib/types";
import { registrarMerma } from "@/lib/data/ventas";
import { calcularCostoReceta } from "@/lib/data/recetas";
import { extractError } from "@/lib/data/error";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";

/**
 * Modal para registrar una merma de producción (una ración pre-producida que
 * se perdió por un fallo interno). Descuenta insumos del stock y libera el
 * compromiso del plan. Extraído del módulo de stock para vivir en Planes.
 */
export function MermaRecetaDialog({
  recetas,
  insumos,
  planes,
  onClose,
  onRegistered,
}: {
  recetas: Receta[];
  insumos: Insumo[];
  planes: PlanProduccion[];
  onClose: () => void;
  onRegistered: (detalle: string) => void;
}) {
  const [recetaId, setRecetaId] = useState("");
  const [raciones, setRaciones] = useState("1");
  const [unidad, setUnidad] = useState<"raciones" | "gramos">("raciones");
  const [gramos, setGramos] = useState("");
  const [motivo, setMotivo] = useState<string>(MOTIVOS_MERMA_PRODUCCION[0]);
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recetasOpciones = useMemo(
    () =>
      recetas
        .filter((r) => r.activo)
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [recetas],
  );

  const receta = useMemo(
    () => recetas.find((r) => r.id === recetaId) ?? null,
    [recetas, recetaId],
  );
  const gramosPorRacion =
    receta &&
    typeof receta.rendimiento === "number" &&
    receta.rendimiento > 0 &&
    receta.porciones > 0
      ? receta.rendimiento / receta.porciones
      : null;
  const rendUnidad = receta?.rendimientoUnidad || "g";

  const racionesEnPlanes = useMemo(() => {
    if (!recetaId) return null;
    const activos = planes.filter(
      (p) =>
        p.recetaId === recetaId &&
        (p.estado === "pendiente" || p.estado === "completado") &&
        p.racionesConsumidas < p.raciones,
    );
    const total = activos.reduce(
      (acc, p) => acc + (p.raciones - p.racionesConsumidas),
      0,
    );
    return { total, planes: activos.length };
  }, [recetaId, planes]);

  const racionesCalc = useMemo(() => {
    if (unidad === "gramos") {
      if (!gramosPorRacion) return NaN;
      const g = Number(gramos);
      if (!Number.isFinite(g) || g <= 0) return NaN;
      return g / gramosPorRacion;
    }
    const r = Number(raciones);
    return Number.isFinite(r) && r > 0 ? r : NaN;
  }, [unidad, gramos, raciones, gramosPorRacion]);

  const costoPreview = useMemo(() => {
    if (!receta || !Number.isFinite(racionesCalc) || racionesCalc <= 0)
      return null;
    const { porPorcion } = calcularCostoReceta(receta, insumos, recetas);
    return porPorcion * racionesCalc;
  }, [receta, racionesCalc, insumos, recetas]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receta) {
      setError("Elegí una receta.");
      return;
    }
    if (!Number.isFinite(racionesCalc) || racionesCalc <= 0) {
      setError(
        unidad === "gramos"
          ? "Ingresá un gramaje válido (la receta debe tener rendimiento definido)."
          : "Ingresá una cantidad de raciones válida.",
      );
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      await registrarMerma({
        recetaId: receta.id,
        recetaNombre: receta.nombre,
        raciones: racionesCalc,
        motivo,
        fecha,
        nota: nota || undefined,
      });
      const detalle =
        unidad === "gramos"
          ? `${Number(gramos)} ${rendUnidad} (≈ ${racionesCalc.toFixed(2)} raciones)`
          : `${racionesCalc} ración${racionesCalc === 1 ? "" : "es"}`;
      onRegistered(`Merma registrada: ${detalle} de ${receta.nombre}.`);
      onClose();
    } catch (err) {
      setError(extractError(err, "Error registrando merma"));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
      onClick={() => !procesando && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
          Merma de producción
        </h2>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <p className="text-sm text-cacao-soft font-serif leading-relaxed">
          Registrá una ración (o varias) de algo pre-producido que se perdió por
          un fallo interno (no es una venta). Descuenta los insumos del stock y
          libera el compromiso del plan, sin sumar ingresos.
        </p>
        <label className="text-sm text-cacao block">
          Receta
          <select
            value={recetaId}
            onChange={(e) => setRecetaId(e.target.value)}
            required
            autoFocus
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
          >
            <option value="">— Seleccioná —</option>
            {recetasOpciones.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.esSubreceta ? " · subreceta" : ` (${r.seccion})`}
              </option>
            ))}
          </select>
        </label>
        {racionesEnPlanes && racionesEnPlanes.total > 0 && (
          <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-2.5 text-sm text-[#2F4A1F] flex items-center justify-between gap-2 flex-wrap">
            <span>
              Quedan{" "}
              <strong>{Number(racionesEnPlanes.total.toFixed(2))} raciones</strong>{" "}
              reservadas en{" "}
              {racionesEnPlanes.planes === 1
                ? "1 plan activo"
                : `${racionesEnPlanes.planes} planes activos`}
              .
            </span>
            <button
              type="button"
              onClick={() => {
                setUnidad("raciones");
                setRaciones(String(Number(racionesEnPlanes.total.toFixed(2))));
              }}
              className="rounded-lg ring-1 ring-[#C9D6BC] px-2.5 py-1 text-xs font-medium hover:bg-white"
            >
              Usar todas
            </button>
          </div>
        )}
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setUnidad("raciones")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${
              unidad === "raciones"
                ? "bg-terracotta text-white"
                : "ring-1 ring-marfil text-cacao hover:bg-marfil-soft"
            }`}
          >
            Por raciones
          </button>
          <button
            type="button"
            onClick={() => setUnidad("gramos")}
            className={`flex-1 rounded-lg px-3 py-1.5 transition ${
              unidad === "gramos"
                ? "bg-terracotta text-white"
                : "ring-1 ring-marfil text-cacao hover:bg-marfil-soft"
            }`}
          >
            Por gramos
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {unidad === "gramos" ? (
            <label className="text-sm text-cacao">
              Cantidad perdida ({rendUnidad})
              <input
                type="number"
                min="0"
                step="any"
                value={gramos}
                onChange={(e) => setGramos(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          ) : (
            <label className="text-sm text-cacao">
              Raciones perdidas
              <input
                type="number"
                min="0"
                step="any"
                value={raciones}
                onChange={(e) => setRaciones(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          )}
          <label className="text-sm text-cacao">
            Motivo
            <select
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
            >
              {MOTIVOS_MERMA_PRODUCCION.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
        {unidad === "gramos" && receta && !gramosPorRacion && (
          <p className="text-xs text-terracotta font-serif leading-relaxed">
            Esta receta no tiene rendimiento definido. Registrá por raciones, o
            agregá el rendimiento (g/ml) en la ficha de la receta.
          </p>
        )}
        {unidad === "gramos" && gramosPorRacion && (
          <p className="text-xs text-cacao-soft font-serif leading-relaxed">
            Rendimiento: {gramosPorRacion.toFixed(0)} {rendUnidad}/ración
            {Number.isFinite(racionesCalc)
              ? ` · equivale a ≈ ${racionesCalc.toFixed(2)} raciones`
              : ""}
            .
          </p>
        )}
        <label className="text-sm text-cacao block">
          Fecha
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        <label className="text-sm text-cacao block">
          Nota <span className="text-cacao-mute font-normal">(opcional)</span>
          <input
            type="text"
            placeholder="Ej: se quemó por falla de la freidora"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        {costoPreview !== null && (
          <div className="rounded-lg bg-marfil-soft p-3 text-xs text-cacao-soft">
            Costo estimado de la merma:{" "}
            <strong className="text-cacao">${costoPreview.toFixed(2)} USD</strong>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={procesando}
            className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={procesando}
            className="flex-1 rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
          >
            {procesando ? "Registrando..." : "Registrar merma"}
          </button>
        </div>
      </form>
    </div>
  );
}
