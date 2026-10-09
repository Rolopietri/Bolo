"use client";

import { useState } from "react";
import {
  armarPresentacion,
  CONTENIDO_SUGERIDO,
  leerPresentacion,
  SUELTO,
  TIPOS_PRESENTACION,
  UNIDADES_CONTENIDO,
  type CamposInsumo,
  type Presentacion,
} from "@/lib/presentacion";
import { displayCantidad } from "@/lib/units";

const OTRA = "__otra__";

/**
 * Presentación de compra de un insumo en dos pasos: el tipo (saco, caja,
 * botella…) y cuánto trae (45 kg, 12 unidades). Arma sola la unidad de compra,
 * la cantidad por compra y la unidad base. Tipo y unidad tienen "Otra…" para
 * escribirlos a mano.
 *
 * Es no-controlado a partir de su valor inicial: el padre le pone `key` (ej. el
 * id del insumo que edita) para reiniciarlo.
 */
export function PresentacionPicker({
  inicial,
  baseActual,
  tiposEnUso = [],
  onChange,
}: {
  /** Campos guardados del insumo (al editar). */
  inicial?: { unidadCompra: string; cantidadPorCompra: number; unidadBase: string };
  /** Unidad base que ya tiene el insumo: se respeta si es compatible. */
  baseActual?: string;
  /** Tipos escritos a mano en otros insumos, para reusarlos. */
  tiposEnUso?: string[];
  /** Se llama con los campos armados, o null mientras falten datos. */
  onChange: (campos: CamposInsumo | null) => void;
}) {
  const [p, setP] = useState<Presentacion>(() =>
    inicial?.unidadCompra
      ? leerPresentacion(inicial)
      : { tipo: "", cantidad: "", unidad: "kg" },
  );
  const tipos = [
    ...TIPOS_PRESENTACION,
    ...tiposEnUso.filter(
      (t) => !TIPOS_PRESENTACION.some((x) => x.toLowerCase() === t.toLowerCase()),
    ),
  ];
  const [tipoOtro, setTipoOtro] = useState(
    () => p.tipo !== "" && p.tipo !== SUELTO && !tipos.includes(p.tipo),
  );
  const [unidadOtra, setUnidadOtra] = useState(
    () => p.unidad !== "" && !UNIDADES_CONTENIDO.includes(p.unidad),
  );

  function actualizar(next: Presentacion) {
    setP(next);
    onChange(armarPresentacion(next, baseActual));
  }

  const suelto = p.tipo === SUELTO;
  const campos = armarPresentacion(p, baseActual);
  const select =
    "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white";
  const input = "mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2";

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-sm text-cacao">
          Presentación
          <select
            value={tipoOtro ? OTRA : p.tipo}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTRA) {
                setTipoOtro(true);
                actualizar({ ...p, tipo: "" });
                return;
              }
              setTipoOtro(false);
              const sug = CONTENIDO_SUGERIDO[v];
              if (sug && !p.cantidad) {
                setUnidadOtra(false);
                actualizar({ tipo: v, ...sug });
              } else {
                actualizar({ ...p, tipo: v });
              }
            }}
            className={select}
          >
            <option value="" disabled>
              Elige…
            </option>
            <option value={SUELTO}>Suelto (por kg, L o unidad)</option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={OTRA}>Otra…</option>
          </select>
          {tipoOtro && (
            <input
              type="text"
              value={p.tipo}
              onChange={(e) => actualizar({ ...p, tipo: e.target.value })}
              placeholder="Ej: cesta, tambor, sobre"
              autoFocus
              className={input}
            />
          )}
        </label>

        {!suelto && (
          <label className="text-sm text-cacao">
            ¿Cuánto trae?
            <input
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={p.cantidad}
              onChange={(e) => actualizar({ ...p, cantidad: e.target.value })}
              placeholder="Ej: 45"
              className={input}
            />
          </label>
        )}

        <label className="text-sm text-cacao">
          {suelto ? "Se compra por" : "Unidad"}
          <select
            value={unidadOtra ? OTRA : p.unidad}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OTRA) {
                setUnidadOtra(true);
                actualizar({ ...p, unidad: "" });
                return;
              }
              setUnidadOtra(false);
              actualizar({ ...p, unidad: v });
            }}
            className={select}
          >
            {UNIDADES_CONTENIDO.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
            <option value={OTRA}>Otra…</option>
          </select>
          {unidadOtra && (
            <input
              type="text"
              value={p.unidad}
              onChange={(e) => actualizar({ ...p, unidad: e.target.value })}
              placeholder="Ej: scoops, tiras"
              autoFocus
              className={input}
            />
          )}
        </label>
      </div>

      <p className="text-[11px] text-cacao-mute">
        {campos ? (
          <>
            Se guarda como <b className="text-cacao">{campos.unidadCompra}</b>
            {!suelto && (
              <>
                {" "}
                = {displayCantidad(Number(campos.cantidadPorCompra), campos.unidadBase)}
              </>
            )}
            . Las recetas lo usan en <b>{campos.unidadBase}</b>.
          </>
        ) : (
          "Elige cómo viene y cuánto trae; bolo hace la conversión."
        )}
      </p>
    </div>
  );
}
