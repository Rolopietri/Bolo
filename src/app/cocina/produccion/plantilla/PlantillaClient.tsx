"use client";

// Hoja para imprimir y llenar a mano. Trae impreso el nombre de cada insumo y
// su unidad, para que el cocinero solo escriba números; así también se lee
// mejor al escanearla.

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Insumo } from "@/lib/types";
import { listInsumos } from "@/lib/data/cocina";
import { unidadPlantilla } from "@/lib/produccion";

const RENGLONES_EN_BLANCO = 4;

export function PlantillaClient() {
  const [insumos, setInsumos] = useState<Insumo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listInsumos()
      .then((ins) =>
        setInsumos(ins.filter((i) => i.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))),
      )
      .catch(() => setError("No se pudieron cargar los insumos."));
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-8">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .hoja-produccion, .hoja-produccion * { visibility: visible !important; }
          .hoja-produccion { position: absolute; inset: 0; padding: 12mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/cocina/produccion" className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
          ← Producción
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={!insumos}
          className="rounded-lg bg-terracotta px-5 py-2.5 text-sm font-semibold text-white hover:bg-terracotta-deep disabled:opacity-50"
        >
          Imprimir
        </button>
      </div>

      {error && <p className="text-sm text-terracotta-deep print:hidden">{error}</p>}

      <div className="hoja-produccion bg-white text-black">
        <h1 className="text-2xl font-bold tracking-wide">Registro de producción</h1>
        <div className="mt-4 grid grid-cols-2 gap-6 text-base">
          <p>
            Fecha: <span className="inline-block w-40 border-b border-black align-bottom">&nbsp;</span>
          </p>
          <p>
            Responsable: <span className="inline-block w-48 border-b border-black align-bottom">&nbsp;</span>
          </p>
        </div>
        <p className="mt-3 text-sm">
          Escribe solo números, en la unidad indicada. Sin procesar = lo que sacaste tal cual. Procesado = lo que
          quedó listo para usar.
        </p>

        <table className="mt-4 w-full border-collapse text-base">
          <thead>
            <tr>
              <th className="border border-black px-2 py-2 text-left">Insumo</th>
              <th className="w-32 border border-black px-2 py-2 text-left">Sin procesar</th>
              <th className="w-32 border border-black px-2 py-2 text-left">Procesado</th>
              <th className="border border-black px-2 py-2 text-left">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {(insumos ?? []).map((i) => (
              <tr key={i.id}>
                <td className="border border-black px-2 py-3">
                  {i.nombre} <span className="text-sm">({unidadPlantilla(i.unidadBase).unidad})</span>
                </td>
                <td className="border border-black px-2 py-3" />
                <td className="border border-black px-2 py-3" />
                <td className="border border-black px-2 py-3" />
              </tr>
            ))}
            {Array.from({ length: RENGLONES_EN_BLANCO }).map((_, n) => (
              <tr key={`blanco-${n}`}>
                <td className="border border-black px-2 py-4" />
                <td className="border border-black px-2 py-4" />
                <td className="border border-black px-2 py-4" />
                <td className="border border-black px-2 py-4" />
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs">
          Al terminar, escanéala desde bolo → Cocina → Producción → Escanear plantilla.
        </p>
      </div>
    </div>
  );
}
