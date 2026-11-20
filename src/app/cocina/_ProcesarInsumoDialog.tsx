"use client";

import { useMemo, useState } from "react";
import type { Insumo } from "@/lib/types";
import { registrarProcesamiento } from "@/lib/data/stock-movimientos";
import { updateInsumo } from "@/lib/data/cocina";
import { displayCantidad } from "@/lib/units";
import { extractError } from "@/lib/data/error";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import { umbralDesviacion } from "@/lib/merma-alertas";

/**
 * Modal para registrar un EVENTO DE PROCESAMIENTO (Fase B):
 * "procesé X crudo → obtuve Y procesado". Baja el crudo, sube el procesado y
 * registra la merma del lote (X−Y) en el libro de movimientos. La primera vez
 * que se procesa un insumo sin estándar de merma, el % medido se guarda como
 * su estándar de referencia (no se auto-promedia después).
 */
export function ProcesarInsumoDialog({
  insumo,
  onClose,
  onRegistered,
}: {
  insumo: Insumo;
  onClose: () => void;
  onRegistered: (
    insumoId: string,
    r: { stockCrudo: number; stockProcesado: number },
  ) => void;
}) {
  const [crudo, setCrudo] = useState("");
  const [procesado, setProcesado] = useState("");
  const [fecha, setFecha] = useState(hoyISO());
  const [nota, setNota] = useState("");
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calc = useMemo(() => {
    const c = Number(crudo);
    const p = Number(procesado);
    if (!Number.isFinite(c) || c <= 0) return null;
    if (!Number.isFinite(p) || p < 0) return null;
    const merma = c - p;
    const pct = c > 0 ? (merma / c) * 100 : 0;
    return { merma, pct };
  }, [crudo, procesado]);

  // Comparación contra el estándar de merma del insumo (si ya tiene uno).
  const estandar = insumo.mermaCoccionPorc ?? null;
  const desviacion =
    calc && estandar != null ? calc.pct - estandar : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(crudo);
    const p = Number(procesado);
    if (!Number.isFinite(c) || c <= 0) {
      setError("El crudo procesado debe ser mayor a 0.");
      return;
    }
    if (!Number.isFinite(p) || p < 0) {
      setError("El procesado obtenido no puede ser negativo.");
      return;
    }
    if (p > c + 0.00005) {
      setError("El procesado no puede ser mayor que el crudo que entró.");
      return;
    }
    setRegistrando(true);
    setError(null);
    try {
      const pct = c > 0 ? ((c - p) / c) * 100 : 0;
      const detalle = `Procesé ${c} ${insumo.unidadBase} crudo → ${p} ${insumo.unidadBase} procesado · merma ${(c - p).toFixed(4)} ${insumo.unidadBase} (${pct.toFixed(1)}%)`;
      const res = await registrarProcesamiento({
        insumoId: insumo.id,
        crudo: c,
        procesado: p,
        fecha,
        nota: nota ? `${nota} — ${detalle}` : detalle,
      });
      // Sembrar el ESTÁNDAR de merma la primera vez (si el insumo no tenía uno).
      // No se auto-promedia luego; solo cambia si el usuario lo edita a mano.
      if (insumo.mermaCoccionPorc == null && pct > 0 && pct < 100) {
        try {
          await updateInsumo(insumo.id, { mermaCoccionPorc: Math.round(pct) });
        } catch {
          /* no bloquear el registro si falla guardar el estándar */
        }
      }
      onRegistered(insumo.id, {
        stockCrudo: res.stockCrudo,
        stockProcesado: res.stockProcesado,
      });
      onClose();
    } catch (err) {
      setError(extractError(err, "Error registrando el procesamiento"));
    } finally {
      setRegistrando(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
      onClick={() => !registrando && onClose()}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
          Procesar insumo
        </h2>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="rounded-lg bg-marfil-soft p-3 text-sm">
          <div className="font-medium text-cacao">{insumo.nombre}</div>
          <div className="text-xs text-cacao-soft mt-0.5">
            Crudo disponible:{" "}
            <strong>{displayCantidad(insumo.stockTotal, insumo.unidadBase)}</strong>
            {insumo.stockProcesado > 0 && (
              <>
                {" · "}procesado actual:{" "}
                <strong>
                  {displayCantidad(insumo.stockProcesado, insumo.unidadBase)}
                </strong>
              </>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-cacao">
            Crudo procesado
            <input
              type="number"
              step="any"
              min="0"
              value={crudo}
              onChange={(e) => setCrudo(e.target.value)}
              required
              autoFocus
              placeholder={`En ${insumo.unidadBase}`}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <span className="text-[10px] text-cacao-mute block mt-1">
              Lo que metiste a procesar (sale del crudo).
            </span>
          </label>
          <label className="text-sm text-cacao">
            Procesado obtenido
            <input
              type="number"
              step="any"
              min="0"
              value={procesado}
              onChange={(e) => setProcesado(e.target.value)}
              required
              placeholder={`En ${insumo.unidadBase}`}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <span className="text-[10px] text-cacao-mute block mt-1">
              Lo que quedó listo para vender (entra al procesado).
            </span>
          </label>
        </div>

        <div className="rounded-lg bg-marfil-soft p-3 text-sm space-y-1">
          {calc === null ? (
            <span className="text-cacao-soft">
              Escribe el crudo y el procesado para ver la merma.
            </span>
          ) : (
            <>
              <div className="text-cacao">
                Merma del lote:{" "}
                <strong>
                  {displayCantidad(Math.max(0, calc.merma), insumo.unidadBase)}
                </strong>{" "}
                ({calc.pct.toFixed(1)}%)
              </div>
              {estandar == null ? (
                <div className="text-[11px] text-cacao-mute">
                  Primera vez: este {calc.pct.toFixed(0)}% se guardará como el
                  estándar de merma de este insumo.
                </div>
              ) : (
                <div className="text-[11px] text-cacao-mute">
                  Estándar del insumo: {estandar}%.{" "}
                  {desviacion != null && Math.abs(desviacion) > umbralDesviacion(estandar) ? (
                    <span className="text-terracotta font-medium">
                      Esta producción mermó {desviacion > 0 ? "más" : "menos"} de lo
                      normal ({desviacion > 0 ? "+" : ""}
                      {desviacion.toFixed(1)} pts). Revisa si fue algo puntual.
                    </span>
                  ) : (
                    <span className="text-cacao-soft">En línea con el estándar.</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>

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
          Nota interna{" "}
          <span className="text-cacao-mute font-normal">(opcional)</span>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={registrando}
            className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={registrando}
            className="flex-1 rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
          >
            {registrando ? "Registrando..." : "Registrar procesamiento"}
          </button>
        </div>
      </form>
    </div>
  );
}
