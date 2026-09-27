"use client";

import { useMemo, useState } from "react";
import { TIPOS_PERDIDA, type Insumo } from "@/lib/types";
import { registrarPerdida } from "@/lib/data/stock-movimientos";
import { displayCantidad } from "@/lib/units";
import { extractError } from "@/lib/data/error";
import { hoyISO } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";

type TipoPerdida = (typeof TIPOS_PERDIDA)[number]["value"];

/**
 * Modal para registrar una pérdida/merma de un insumo (materia prima).
 * Extraído del módulo de stock para poder usarlo directo desde Insumos.
 * Incluye el modo "pesé cocido" que convierte el peso cocido a crudo antes de
 * descontar del stock.
 */
export function PerdidaInsumoDialog({
  insumo,
  onClose,
  onRegistered,
}: {
  insumo: Insumo;
  onClose: () => void;
  onRegistered: (insumoId: string, nuevoStockTotal: number) => void;
}) {
  const [cant, setCant] = useState("");
  const [tipo, setTipo] = useState<TipoPerdida>("perdida");
  const [fecha, setFecha] = useState(hoyISO());
  const [motivo, setMotivo] = useState("");
  const [nota, setNota] = useState("");
  const [cocido, setCocido] = useState(false);
  const [mermaPct, setMermaPct] = useState(
    insumo.mermaCoccionPorc != null ? String(insumo.mermaCoccionPorc) : "",
  );
  const [registrando, setRegistrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const conversionCocido = useMemo(() => {
    if (!cocido) return null;
    const c = Number(cant);
    const pct = Number(mermaPct);
    if (!Number.isFinite(c) || c <= 0) return { error: true as const };
    if (!Number.isFinite(pct) || pct < 0 || pct >= 100)
      return { error: true as const };
    return { error: false as const, crudo: c / (1 - pct / 100) };
  }, [cocido, cant, mermaPct]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const c = Number(cant);
    if (!Number.isFinite(c) || c <= 0) {
      setError("La cantidad debe ser mayor a 0.");
      return;
    }
    let cantidadCruda = c;
    let notaFinal = nota || undefined;
    if (cocido) {
      const pct = Number(mermaPct);
      if (!Number.isFinite(pct) || pct < 0 || pct >= 100) {
        setError("La merma por procesamiento debe estar entre 0 y 99%.");
        return;
      }
      cantidadCruda = c / (1 - pct / 100);
      const n = `Pesado cocido: ${c} ${insumo.unidadBase} · merma ${pct}% → ${cantidadCruda.toFixed(4)} ${insumo.unidadBase} crudo`;
      notaFinal = nota ? `${nota} — ${n}` : n;
    }
    setRegistrando(true);
    setError(null);
    try {
      const res = await registrarPerdida({
        insumoId: insumo.id,
        cantidad: cantidadCruda,
        tipo,
        motivo: motivo || undefined,
        fecha,
        nota: notaFinal,
      });
      onRegistered(insumo.id, res.stockTotal);
      onClose();
    } catch (err) {
      setError(extractError(err, "Error registrando pérdida"));
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
          Registrar pérdida
        </h2>
        {error && <ErrorBanner>{error}</ErrorBanner>}
        <div className="rounded-lg bg-marfil-soft p-3 text-sm">
          <div className="font-medium text-cacao">{insumo.nombre}</div>
          <div className="text-xs text-cacao-soft mt-0.5">
            Stock total actual:{" "}
            <strong>{displayCantidad(insumo.stockTotal, insumo.unidadBase)}</strong>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-cacao">
            {cocido ? "Peso cocido" : "Cantidad afectada"}
            <input
              type="number"
              step="any"
              min="0"
              value={cant}
              onChange={(e) => setCant(e.target.value)}
              required
              autoFocus
              placeholder={`En ${insumo.unidadBase}`}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
            <span className="text-[10px] text-cacao-mute block mt-1">
              {cocido ? "Lo que pesaste ya cocido." : "Se descuenta del stock."}
            </span>
          </label>
          <label className="text-sm text-cacao">
            Motivo principal
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoPerdida)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
            >
              {TIPOS_PERDIDA.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="rounded-lg ring-1 ring-marfil p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cocido}
              onChange={(e) => setCocido(e.target.checked)}
              className="h-4 w-4 accent-cacao"
            />
            <span className="text-sm text-cacao">
              Pesé el producto ya cocido (convertir a crudo)
            </span>
          </label>
          {cocido && (
            <div className="mt-3 space-y-2">
              <label className="text-sm text-cacao block">
                Merma por procesamiento (%)
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="99"
                  value={mermaPct}
                  onChange={(e) => setMermaPct(e.target.value)}
                  placeholder="Ej. 70"
                  className="mt-1 w-28 rounded-lg ring-1 ring-marfil px-3 py-2"
                />
                <span className="text-[10px] text-cacao-mute block mt-1">
                  {insumo.mermaCoccionPorc != null
                    ? "Sugerido desde la ficha del insumo — editable."
                    : "% de peso que pierde al cocinarse."}
                </span>
              </label>
              <div className="rounded-lg bg-marfil-soft p-2 text-sm">
                {conversionCocido === null ? null : conversionCocido.error ? (
                  <span className="text-cacao-soft">
                    Escribe el peso cocido y un % entre 0 y 99.
                  </span>
                ) : (
                  <span className="text-cacao">
                    Se descontarán{" "}
                    <strong>
                      {displayCantidad(conversionCocido.crudo, insumo.unidadBase)}
                    </strong>{" "}
                    en crudo.
                  </span>
                )}
              </div>
            </div>
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
          Detalle{" "}
          <span className="text-cacao-mute font-normal">(opcional)</span>
          <input
            type="text"
            placeholder="Ej: caja se mojó, pollo en mal estado al recibir, etc."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
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
            {registrando ? "Registrando..." : "Registrar pérdida"}
          </button>
        </div>
      </form>
    </div>
  );
}
