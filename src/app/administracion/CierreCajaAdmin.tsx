"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorCarga } from "@/components/ErrorCarga";
import { EstadoCajaPill } from "@/app/cocina/ventas/EstadoCajaPill";
import { extractError } from "@/lib/data/error";
import {
  AVISO_MIGRACION_CIERRE,
  esFaltaTablaCierre,
  listCierres,
  type CierreCaja,
} from "@/lib/data/cierre-caja";
import { totalesVentasPorDia } from "@/lib/data/ventas";
import { compararCaja, etiquetaFecha, hoyCaracas, type ComparacionCaja } from "@/lib/cierre-caja";
import { fmtUsd } from "@/lib/moneda";

type Fila = { cierre: CierreCaja; comp: ComparacionCaja | null };

export function CierreCajaAdmin() {
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoVentas, setAvisoVentas] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const hoy = hoyCaracas();

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const cierres = await listCierres();
        if (cancel) return;
        if (cierres.length === 0) {
          setFilas([]);
          setAviso(null);
          setAvisoVentas(null);
          return;
        }
        const fechas = [...cierres.map((c) => c.fecha)].sort();
        let ventas: Record<string, number> | null = null;
        try {
          ventas = await totalesVentasPorDia(fechas[0], fechas[fechas.length - 1]);
        } catch {
          ventas = null;
        }
        if (cancel) return;
        setAvisoVentas(ventas ? null : "No se pudieron leer las ventas, así que no se muestra la diferencia.");
        setFilas(
          cierres.map((c) => ({
            cierre: c,
            comp: ventas
              ? compararCaja({
                  lineas: c.lineas,
                  tasaUsdBs: c.tasaUsdBs,
                  ventasUsd: ventas[c.fecha] ?? 0,
                  hayRegistro: true,
                })
              : null,
          })),
        );
        setAviso(null);
      } catch (e) {
        if (cancel) return;
        setFilas([]);
        if (esFaltaTablaCierre(e)) {
          setAviso(AVISO_MIGRACION_CIERRE);
          setError(null);
        } else {
          setAviso(null);
          setError(extractError(e, "No se pudieron cargar los cierres"));
        }
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [intento]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-cacao-soft">
          Cada cierre es un día. Acá ves lo cobrado contra las ventas de Cocina, sin mermas. Para anotarlo, el encargado
          usa la misma fecha en Ventas.
        </p>
        <Link
          href={`/cocina/ventas/cierre?fecha=${hoy}`}
          className="rounded-lg bg-cacao px-4 py-2 text-sm font-medium text-white hover:bg-terracotta"
        >
          Anotar el de hoy
        </Link>
      </div>

      {aviso && (
        <div className="rounded-lg bg-[#FBF3E4] ring-1 ring-[#E6D3A8] p-3 text-sm text-[#8A5A12]">{aviso}</div>
      )}
      {avisoVentas && (
        <div className="rounded-lg bg-[#FBF3E4] ring-1 ring-[#E6D3A8] p-3 text-sm text-[#8A5A12]">{avisoVentas}</div>
      )}
      {error && (
        <ErrorCarga
          que="los cierres de caja"
          detalle={error}
          onReintentar={() => {
            setCargando(true);
            setError(null);
            setIntento((n) => n + 1);
          }}
          reintentando={cargando}
        />
      )}

      {cargando ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-10 text-center text-cacao-soft">
          Cargando los cierres…
        </div>
      ) : error ? null : filas.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center">
          <p className="font-serif italic text-cacao-soft">Todavía no hay cierres de caja.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-cacao-soft">
            Al final del día se anota el efectivo, el pago móvil, el punto y el resto. Ejemplo: Efectivo $120, Pago
            Móvil Bs 4.500, Punto Bs 3.200.
          </p>
          <Link
            href="/cocina/ventas/cierre"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-cacao px-4 py-2 text-sm text-white hover:bg-terracotta"
          >
            Anotar el primer cierre
          </Link>
        </div>
      ) : (
        <section className="rounded-2xl bg-white ring-1 ring-marfil px-4 sm:px-5">
          <div className="flex flex-wrap gap-2 pt-4">
            {(
              [
                ["cuadra", "Cuadran"],
                ["sobra", "Sobran"],
                ["falta", "Faltan"],
              ] as const
            ).map(([estado, label]) => {
              const n = filas.filter((f) => f.comp?.estado === estado).length;
              return <EstadoCajaPill key={estado} estado={estado} titulo={`${n} ${label.toLowerCase()}`} />;
            })}
          </div>
          <h2 className="pt-4 text-[10px] uppercase tracking-widest text-cacao-mute">Por día</h2>
          <ul className="divide-y divide-marfil">
            {filas.map(({ cierre, comp }) => (
              <li key={cierre.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-cacao">
                    <span className="capitalize">{etiquetaFecha(cierre.fecha)}</span>
                  </p>
                  <p className="text-xs tabular-nums text-cacao-soft">
                    {comp ? (
                      <>
                        Ventas {fmtUsd(comp.ventasUsd)}
                        {" · "}
                        Caja {comp.cajaUsd == null ? "sin pasar a dólares" : fmtUsd(comp.cajaUsd)}
                      </>
                    ) : (
                      "Caja guardada, ventas sin comparar"
                    )}
                  </p>
                  {cierre.nota && <p className="mt-0.5 max-w-md truncate text-[11px] text-cacao-mute">{cierre.nota}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {comp && <EstadoCajaPill estado={comp.estado} titulo={comp.titulo} />}
                  <Link
                    href={`/cocina/ventas/cierre?fecha=${cierre.fecha}`}
                    className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
                  >
                    Editar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
