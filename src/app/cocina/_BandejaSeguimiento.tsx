"use client";

import { useEffect, useState } from "react";
import { CaraAgente } from "@/components/CaraAgente";
import { DESTINOS, EVENTO_GUIAR, type ClaveDestino } from "./_destinos";
import { publicarGuia } from "./_guiaAccion";
import {
  EVENTO_SEGUIMIENTO,
  listarSeguimientos,
  marcarSeguimientosLeidos,
  quitarSeguimiento,
  type Seguimiento,
} from "./_seguimientos";

// Bandeja del asistente, en la esquina. No es correo: son los pendientes
// que bolo deja en este navegador.

function cuando(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hoy = new Date();
  const misma =
    d.getDate() === hoy.getDate() &&
    d.getMonth() === hoy.getMonth() &&
    d.getFullYear() === hoy.getFullYear();
  if (misma) return d.toLocaleTimeString("es-VE", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("es-VE", { day: "numeric", month: "short" });
}

function llevar(destino: ClaveDestino) {
  const d = DESTINOS[destino];
  if (!d) return;
  if (d.preparar) publicarGuia({ preparar: d.preparar });
  else publicarGuia(null);
  window.dispatchEvent(new CustomEvent(EVENTO_GUIAR, { detail: destino }));
}

export function BandejaSeguimiento() {
  const [abierta, setAbierta] = useState(false);
  const [items, setItems] = useState<Seguimiento[]>([]);

  useEffect(() => {
    const leer = () => setItems(listarSeguimientos());
    leer();
    window.addEventListener(EVENTO_SEGUIMIENTO, leer);
    window.addEventListener("storage", leer);
    return () => {
      window.removeEventListener(EVENTO_SEGUIMIENTO, leer);
      window.removeEventListener("storage", leer);
    };
  }, []);

  const sinLeer = items.filter((i) => !i.leido).length;

  function alternar() {
    setAbierta((v) => {
      const abre = !v;
      if (abre) marcarSeguimientosLeidos();
      return abre;
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={alternar}
        aria-label={abierta ? "Cerrar pendientes" : "Abrir pendientes del asistente"}
        aria-expanded={abierta}
        className="fixed bottom-5 left-5 z-40 flex h-12 items-center gap-2 rounded-full bg-white px-3 text-cacao shadow-lg ring-1 ring-marfil transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
      >
        <CaraAgente className="h-8 w-auto" />
        <span className="hidden text-xs font-medium sm:inline">Pendientes</span>
        {sinLeer > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-terracotta px-1.5 py-0.5 text-[10px] font-medium text-white">
            <span className="inline-block size-1.5 rounded-full bg-white" />
            {sinLeer}
          </span>
        )}
      </button>

      {abierta && (
        <div
          role="dialog"
          aria-label="Pendientes del asistente"
          className="fixed bottom-20 left-5 z-50 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-marfil"
          style={{ maxHeight: "min(24rem, calc(100vh - 8rem))" }}
        >
          <div className="flex items-center gap-2 border-b border-marfil px-4 py-3">
            <CaraAgente className="h-7 w-auto text-cacao" />
            <div>
              <p className="font-cinzel text-sm leading-none text-cacao">Pendientes</p>
              <p className="mt-0.5 text-[11px] text-cacao-soft">Recordatorios de bolo, en la app</p>
            </div>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
            {items.length === 0 ? (
              <p className="px-1 py-3 text-sm text-cacao-soft">
                Cuando te deje algo a medias, aparece aquí. Prueba en el chat: “recuérdame revisar el stock”.
              </p>
            ) : (
              items.map((item) => (
                <article key={item.id} className="rounded-xl bg-marfil-soft px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-cacao">{item.titulo}</p>
                    <span className="shrink-0 text-[10px] text-cacao-mute">{cuando(item.creado)}</span>
                  </div>
                  <p className="mt-1 text-xs text-cacao-soft">{item.detalle}</p>
                  <div className="mt-2 flex items-center gap-2">
                    {item.destino && DESTINOS[item.destino] && (
                      <button
                        type="button"
                        onClick={() => llevar(item.destino!)}
                        className="rounded-full bg-cacao px-2.5 py-1 text-[11px] font-medium text-white hover:bg-terracotta"
                      >
                        Te muestro
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => quitarSeguimiento(item.id)}
                      className="rounded-full px-2.5 py-1 text-[11px] text-cacao-soft hover:bg-white hover:text-cacao"
                    >
                      Listo
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
