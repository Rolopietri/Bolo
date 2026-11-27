"use client";

import { useEffect, useState } from "react";
import {
  getHorarioNegocio,
  guardarHorarioNegocio,
  type HorarioNegocio,
} from "@/lib/data/negocio";

function campoHora(v: string): string | null {
  const t = v.trim();
  return t ? t : null;
}

export function NegocioForm() {
  const [carga, setCarga] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [disponible, setDisponible] = useState(true);
  const [nombre, setNombre] = useState("");
  const [apertura, setApertura] = useState("");
  const [cierre, setCierre] = useState("");
  const [nota, setNota] = useState("");
  const [zona, setZona] = useState("America/Caracas");
  const [tasaPred, setTasaPred] = useState<"usd_bs" | "eur_bs">("usd_bs");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const h: HorarioNegocio = await getHorarioNegocio();
        if (cancel) return;
        setNombre(h.nombre);
        setApertura(h.horaAperturaHabitual ?? "");
        setCierre(h.horaCierreMaxima ?? "");
        setNota(h.jornadaHorarioNota ?? "");
        setZona(h.zonaHoraria);
        setTasaPred(h.tasaPredeterminada ?? "usd_bs");
        setDisponible(h.horarioDisponible);
      } catch (e) {
        if (cancel) return;
        const msg = e instanceof Error ? e.message : "";
        setError(
          /url and api key|supabaseurl is required/i.test(msg)
            ? "No hay conexión con la base de datos."
            : "No se pudo leer el perfil del negocio.",
        );
      } finally {
        if (!cancel) setCarga(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setGuardando(true);
    setError(null);
    setOk(false);
    try {
      if (!nombre.trim()) {
        setError("El nombre del negocio no puede quedar vacío.");
        return;
      }
      const hA = campoHora(apertura);
      const hC = campoHora(cierre);
      if ((hA && !hC) || (!hA && hC)) {
        setError("Indica las dos horas, o déjalas las dos en blanco. El cierre automático solo funciona si están las dos.");
        return;
      }
      if (nota.trim().length > 500) {
        setError("La observación no puede pasar de 500 caracteres.");
        return;
      }
      await guardarHorarioNegocio({
        nombre,
        horaAperturaHabitual: hA,
        horaCierreMaxima: hC,
        jornadaHorarioNota: nota,
        tasaPredeterminada: tasaPred,
      });
      setOk(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/bolo_puede_configurar|row-level security|42501/i.test(msg)) {
        setError("No tienes permiso para cambiar los ajustes del negocio.");
      } else if (/column|horario|PGRST/i.test(msg)) {
        setError("Falta aplicar la migración de horario en la base de datos.");
      } else {
        setError("No se pudo guardar.");
      }
    } finally {
      setGuardando(false);
    }
  }

  if (carga) {
    return <p className="text-sm text-cacao-soft">Cargando el perfil del negocio…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
      {!disponible && (
        <p className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          Todavía no está la migración de horario. Puedes ver el nombre, pero las horas no se pueden guardar.
        </p>
      )}
      <div>
        <label htmlFor="negocio-nombre" className="block text-sm font-medium text-cacao">
          Nombre del negocio
        </label>
        <input
          id="negocio-nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-cacao"
          autoComplete="organization"
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="hora-apertura" className="block text-sm font-medium text-cacao">
            Hora de apertura habitual
          </label>
          <input
            id="hora-apertura"
            type="time"
            value={apertura}
            onChange={(e) => setApertura(e.target.value)}
            disabled={!disponible}
            className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-cacao disabled:opacity-50"
          />
        </div>
        <div>
          <label htmlFor="hora-cierre" className="block text-sm font-medium text-cacao">
            Hora máxima de cierre
          </label>
          <input
            id="hora-cierre"
            type="time"
            value={cierre}
            onChange={(e) => setCierre(e.target.value)}
            disabled={!disponible}
            className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-cacao disabled:opacity-50"
          />
        </div>
      </div>
      <p className="text-sm text-cacao-soft">
        Horas en la zona del negocio ({zona}). Si la de cierre es más temprano que la de apertura
        (por ejemplo, se abre a las 18:00 y se cierra a las 02:00), Bolo entiende que el turno cruza medianoche.
        Si se pasa la hora máxima y no hay cierre de caja, se cierra sola la jornada de inventario.
        Media hora antes avisa, como un despertador, para hacer el cierre o recordar en una hora.
      </p>
      <div>
        <label htmlFor="horario-nota" className="block text-sm font-medium text-cacao">
          Observación
        </label>
        <textarea
          id="horario-nota"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          disabled={!disponible}
          rows={3}
          maxLength={500}
          placeholder="Por ejemplo: los viernes se cierra más tarde."
          className="mt-1 w-full rounded-lg border border-marfil bg-white px-3 py-2 text-cacao disabled:opacity-50"
        />
        <p className="mt-1 text-xs text-cacao-mute">{nota.trim().length}/500</p>
      </div>

      <div>
        <p className="block text-sm font-medium text-cacao">Tasa predeterminada de la jornada</p>
        <p className="mt-1 text-sm text-cacao-soft">
          Cada jornada toma sola esta tasa oficial del BCV al abrir y la deja fija, aunque el banco publique otra a media jornada. Si en un turno quieren otra, se escribe al iniciar o desde el aviso de la tasa.
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-cacao">
            <input
              type="radio"
              name="tasa-predeterminada"
              checked={tasaPred === "usd_bs"}
              onChange={() => setTasaPred("usd_bs")}
              disabled={!disponible}
            />
            Dólar BCV
          </label>
          <label className="flex items-center gap-2 text-sm text-cacao">
            <input
              type="radio"
              name="tasa-predeterminada"
              checked={tasaPred === "eur_bs"}
              onChange={() => setTasaPred("eur_bs")}
              disabled={!disponible}
            />
            Euro BCV
          </label>
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">{error}</p>
      )}
      {ok && !error && (
        <p className="text-sm text-cacao">Listo, se guardó el perfil del negocio.</p>
      )}
      <button
        type="submit"
        disabled={guardando || !disponible}
        className="rounded-lg bg-cacao px-4 py-2 font-medium text-white hover:bg-terracotta disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
    </form>
  );
}
