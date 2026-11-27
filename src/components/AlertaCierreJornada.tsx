"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  esFaltaTablaJornada,
  posponerCierreJornada,
  revisarJornadaCocina,
  type EstadoJornadaCocina,
} from "@/lib/data/jornada-cocina";

function horaLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("es-VE", {
    timeZone: "America/Caracas",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AlertaCierreJornada() {
  const [estado, setEstado] = useState<EstadoJornadaCocina | null>(null);
  const [avisoAuto, setAvisoAuto] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const e = await revisarJornadaCocina();
        if (cancel || !e) return;
        setEstado(e);
        if (e.cerroJornadaId) {
          setAvisoAuto(
            "Bolo cerró sola la jornada anterior porque se pasó la hora máxima de cierre. Puedes guardar el cierre de caja cuando quieras; no se cierra otra vez la jornada nueva.",
          );
        }
      } catch (err) {
        if (cancel) return;
        if (esFaltaTablaJornada(err)) return;
        // Sin sesión o sin cliente: no interrumpir la app.
        const msg = err instanceof Error ? err.message : String(err);
        if (/session|jwt|not authenticated|api key|supabaseurl/i.test(msg)) return;
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function recordar() {
    setPendiente(true);
    setError(null);
    try {
      const r = await posponerCierreJornada();
      if (!r.ok) {
        setError(
          r.error === "tope"
            ? "Ya recordaste 6 veces. Hay que hacer el cierre, o Bolo lo hará sola al llegar la hora."
            : r.error === "sin_horario"
              ? "Falta la hora de cierre en el perfil del negocio."
              : "No se pudo posponer el aviso.",
        );
        return;
      }
      setEstado((prev) =>
        prev
          ? {
              ...prev,
              posposiciones: r.posposiciones,
              limiteEfectivo: r.limiteEfectivo,
              puedePosponer: r.posposiciones < 6,
              mostrarAlerta: false,
              debeCerrar: false,
            }
          : prev,
      );
    } catch (err) {
      if (esFaltaTablaJornada(err)) return;
      setError("No se pudo posponer el aviso.");
    } finally {
      setPendiente(false);
    }
  }

  const mostrarAlerta = !!estado?.mostrarAlerta;
  const mostrarAviso = !!avisoAuto && !mostrarAlerta;
  if (!mostrarAlerta && !mostrarAviso) return null;

  const hrefCierre = estado?.fecha
    ? `/cocina/ventas/cierre?fecha=${estado.fecha}`
    : "/cocina/ventas/cierre";
  const hora = horaLocal(estado?.limiteEfectivo ?? null);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-14 z-40 flex justify-center px-4">
      <div
        role={mostrarAlerta ? "alertdialog" : "status"}
        aria-labelledby="alerta-cierre-jornada-titulo"
        className="pointer-events-auto w-full max-w-lg rounded-2xl bg-white p-4 shadow-lg ring-1 ring-[#E8C5BC]"
      >
        {mostrarAlerta ? (
          <>
            <p
              id="alerta-cierre-jornada-titulo"
              className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute"
            >
              Aviso de cierre
            </p>
            <p className="mt-2 text-sm text-cacao">
              {estado?.debeCerrar
                ? `Ya pasó la hora máxima de cierre${hora ? ` (${hora})` : ""}. Si no guardas el cierre de caja, Bolo cerrará sola la jornada de inventario.`
                : `En media hora, o al llegar ${hora || "la hora máxima"}, si no hay cierre de caja Bolo cerrará sola la jornada de inventario.`}
            </p>
            {estado && estado.posposiciones > 0 && (
              <p className="mt-1 text-xs text-cacao-soft">
                Ya recordaste {estado.posposiciones} {estado.posposiciones === 1 ? "vez" : "veces"}
                {estado.puedePosponer ? " (hasta 6)." : ". No se puede posponer más."}
              </p>
            )}
            {error && <p className="mt-2 text-sm text-[#7A2419]">{error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={hrefCierre}
                className="rounded-lg bg-cacao px-4 py-2 text-sm font-medium text-white hover:bg-terracotta"
              >
                Hacer cierre
              </Link>
              <button
                type="button"
                disabled={pendiente || !estado?.puedePosponer}
                onClick={recordar}
                className="rounded-lg px-4 py-2 text-sm font-medium text-cacao ring-1 ring-marfil hover:bg-marfil-light disabled:opacity-50"
              >
                Recordar en 1 hora
              </button>
            </div>
          </>
        ) : (
          <>
            <p
              id="alerta-cierre-jornada-titulo"
              className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute"
            >
              Jornada cerrada
            </p>
            <p className="mt-2 text-sm text-cacao">{avisoAuto}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={hrefCierre}
                className="rounded-lg bg-cacao px-4 py-2 text-sm font-medium text-white hover:bg-terracotta"
              >
                Hacer cierre
              </Link>
              <button
                type="button"
                onClick={() => setAvisoAuto(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-cacao ring-1 ring-marfil hover:bg-marfil-light"
              >
                Entendido
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
