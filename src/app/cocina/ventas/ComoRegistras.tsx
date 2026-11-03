"use client";

import { useState } from "react";
import {
  guardarAjustesVentas,
  type AjustesVentas,
} from "@/lib/data/ajustes-ventas";

type Props = {
  ajustes: AjustesVentas;
  onChange: (next: AjustesVentas) => void;
};

const TARJETAS: {
  clave: "ventasManual" | "ventasPos";
  titulo: string;
  descripcion: string;
  ejemplo: string;
}[] = [
  {
    clave: "ventasManual",
    titulo: "Manual por plato y cierre de caja",
    descripcion:
      "Al final del día anotas cuántos platos vendiste y cuánto entró por cada método de pago.",
    ejemplo:
      "12 Sanduche de carne, 8 Chillicheasesandw · Efectivo $120, Pago Móvil Bs 4.500, Punto Bs 3.200.",
  },
  {
    clave: "ventasPos",
    titulo: "Importar desde tu POS",
    descripcion:
      "Subes el reporte de cierre de tu sistema de caja y Bolo carga las ventas solo.",
    ejemplo:
      "Exportas el cierre del día en Excel o CSV y lo subes.",
  },
];

export function ComoRegistras({ ajustes, onChange }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(clave: "ventasManual" | "ventasPos", valor: boolean) {
    const next: AjustesVentas = { ...ajustes, [clave]: valor, persistido: ajustes.persistido };
    onChange(next);
    setGuardando(true);
    setError(null);
    try {
      await guardarAjustesVentas(next);
      onChange({ ...next, persistido: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        /url and api key|supabaseurl is required/i.test(msg)
          ? "No hay conexión con la base de datos, así que el ajuste no se guardó. En esta pantalla sí se aplica."
          : "No se pudo guardar. Hay que aplicar la migración restaurante_ajustes en Supabase. En esta pantalla sí se aplica.",
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section id="como-registras" className="space-y-3">
      <div>
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Cómo registras tus ventas
        </h2>
        <p className="mt-1 text-sm text-cacao-soft">
          Puedes usar las dos a la vez. Las ventas, a mano o importadas, quedan en el mismo libro.
        </p>
      </div>
      {error && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {TARJETAS.map((t) => {
          const on = ajustes[t.clave];
          return (
            <article key={t.clave} className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-cinzel text-base text-cacao leading-snug">{t.titulo}</h3>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={t.titulo}
                  disabled={guardando}
                  onClick={() => cambiar(t.clave, !on)}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-cacao" : "bg-[#E4DDD4]"}`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-5" : "left-0.5"}`}
                  />
                </button>
              </div>
              <p className="mt-2 text-sm text-cacao-soft">{t.descripcion}</p>
              <p className="mt-2 text-xs text-cacao-mute">
                <span className="uppercase tracking-widest">Ejemplo. </span>
                {t.ejemplo}
              </p>
            </article>
          );
        })}
      </div>
      {!ajustes.persistido && !error && (
        <p className="text-[11px] text-cacao-mute">
          El interruptor se aplica en esta pantalla. Para que quede guardado en el restaurante, aplica la migración de ajustes.
        </p>
      )}
    </section>
  );
}
