"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Panel de operador · v1 = moderación del Mercado.
 * Protegido por contraseña propia (OPERADOR_PASSWORD en Vercel). Todo se lee y
 * se actúa por /api/operador/* (service-role del lado del servidor), así las
 * denuncias quedan privadas y las acciones (ocultar/eliminar) son seguras.
 */
type Resumen = {
  anuncios: number;
  denuncias: number;
  resenas: number;
  anunciosDenunciados: number;
};
type AnuncioRow = {
  id: string;
  titulo: string;
  tipo: string;
  contacto_nombre: string | null;
  ciudad: string | null;
  activo: boolean;
  foto_url: string | null;
};
type Motivo = { motivo: string; detalle: string | null; fecha: string };
type Grupo = {
  anuncioId: string;
  anuncio: AnuncioRow | null;
  count: number;
  motivos: Motivo[];
};

export function OperadorClient() {
  const [estado, setEstado] = useState<"cargando" | "sin-config" | "bloqueado" | "abierto">(
    "cargando",
  );

  useEffect(() => {
    fetch("/api/operador/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { configurado: boolean; authed: boolean }) => {
        setEstado(!d.configurado ? "sin-config" : d.authed ? "abierto" : "bloqueado");
      })
      .catch(() => setEstado("bloqueado"));
  }, []);

  if (estado === "cargando") return <p className="text-cacao-soft">Cargando…</p>;
  if (estado === "sin-config") return <SinConfig />;
  if (estado === "bloqueado") return <Puerta onEntrar={() => setEstado("abierto")} />;
  return <Panel onSalir={() => setEstado("bloqueado")} />;
}

function SinConfig() {
  return (
    <div className="rounded-2xl bg-[#FBEEDD] ring-1 ring-[#F0D4A6] p-6 text-[#8A5A12]">
      <h2 className="font-cinzel text-xl mb-1">Falta configurar</h2>
      <p className="text-sm">
        Define la variable <span className="font-mono font-bold">OPERADOR_PASSWORD</span> en
        Vercel (Settings → Environment Variables) y vuelve a desplegar. Con eso aparece el
        candado del panel.
      </p>
    </div>
  );
}

function Puerta({ onEntrar }: { onEntrar: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function entrar() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/operador/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      if (r.ok) onEntrar();
      else {
        const d = await r.json().catch(() => ({}));
        setError(d.error || "Contraseña incorrecta.");
      }
    } catch {
      setError("Error de conexión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-6 rounded-2xl bg-white ring-1 ring-marfil p-6 shadow-sm">
      <h2 className="font-cinzel text-xl text-cacao mb-1">Panel de operador</h2>
      <p className="text-sm text-cacao-soft mb-4">Zona privada. Ingresa la contraseña.</p>
      {error && (
        <div className="rounded-lg bg-[#FBE5E1] ring-1 ring-[#F3CFC8] p-2.5 text-sm text-[#A5341F] mb-3">
          {error}
        </div>
      )}
      <input
        type="password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && pw && entrar()}
        placeholder="Contraseña"
        autoFocus
        className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-cacao focus:outline-none focus:ring-2 focus:ring-terracotta"
      />
      <button
        onClick={entrar}
        disabled={busy || !pw}
        className="mt-3 w-full rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
      >
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </div>
  );
}

function Panel({ onSalir }: { onSalir: () => void }) {
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [actuando, setActuando] = useState<string>("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const r = await fetch("/api/operador/panel", { cache: "no-store" });
      if (r.status === 401) {
        onSalir();
        return;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudo cargar.");
      setResumen(d.resumen);
      setGrupos(d.grupos ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el panel.");
    } finally {
      setCargando(false);
    }
  }, [onSalir]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function accion(id: string, acc: "ocultar" | "activar" | "eliminar") {
    if (acc === "eliminar" && !window.confirm("¿Eliminar este anuncio para siempre?")) return;
    setActuando(id + acc);
    try {
      const r = await fetch("/api/operador/anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accion: acc }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "No se pudo.");
      }
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setActuando("");
    }
  }

  async function salir() {
    await fetch("/api/operador/logout", { method: "POST" }).catch(() => {});
    onSalir();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-cinzel text-2xl text-cacao">Moderación del Mercado</h1>
        <button onClick={salir} className="text-sm font-bold text-cacao-soft hover:text-cacao">
          Salir
        </button>
      </div>

      {/* Resumen */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Tile k="Anuncios" v={resumen.anuncios} />
          <Tile k="Denuncias" v={resumen.denuncias} alerta={resumen.denuncias > 0} />
          <Tile k="Anuncios denunciados" v={resumen.anunciosDenunciados} alerta={resumen.anunciosDenunciados > 0} />
          <Tile k="Reseñas" v={resumen.resenas} />
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-[#FBE5E1] ring-1 ring-[#F3CFC8] p-3 text-sm text-[#A5341F]">
          {error}
        </div>
      )}

      <div>
        <h2 className="font-bold text-cacao mb-2">Anuncios denunciados</h2>
        {cargando ? (
          <p className="text-cacao-soft text-sm">Cargando…</p>
        ) : grupos.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
            No hay denuncias pendientes. Todo tranquilo. 👌
          </div>
        ) : (
          <div className="space-y-3">
            {grupos.map((g) => {
              const a = g.anuncio;
              return (
                <div key={g.anuncioId} className="rounded-2xl bg-white ring-1 ring-marfil p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-cacao">
                        {a ? a.titulo : "(anuncio eliminado)"}
                        {a && !a.activo && (
                          <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil">
                            Oculto
                          </span>
                        )}
                      </div>
                      {a && (
                        <div className="text-xs text-cacao-mute mt-0.5">
                          {[a.tipo, a.contacto_nombre, a.ciudad].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-[#FBE5E1] text-[#D64534] px-2.5 py-0.5 text-xs font-bold">
                      {g.count} denuncia{g.count === 1 ? "" : "s"}
                    </span>
                  </div>

                  <ul className="mt-2 space-y-1">
                    {g.motivos.map((m, i) => (
                      <li key={i} className="text-sm text-cacao-soft">
                        • <span className="font-semibold text-cacao">{m.motivo}</span>
                        {m.detalle ? ` — ${m.detalle}` : ""}
                      </li>
                    ))}
                  </ul>

                  {a && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.activo ? (
                        <button
                          onClick={() => accion(a.id, "ocultar")}
                          disabled={actuando === a.id + "ocultar"}
                          className="rounded-xl ring-1 ring-marfil bg-white px-4 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
                        >
                          Ocultar
                        </button>
                      ) : (
                        <button
                          onClick={() => accion(a.id, "activar")}
                          disabled={actuando === a.id + "activar"}
                          className="rounded-xl ring-1 ring-marfil bg-white px-4 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
                        >
                          Reactivar
                        </button>
                      )}
                      <button
                        onClick={() => accion(a.id, "eliminar")}
                        disabled={actuando === a.id + "eliminar"}
                        className="rounded-xl bg-[#D64534] text-white px-4 py-2 text-sm font-bold hover:brightness-95 disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Tile({ k, v, alerta }: { k: string; v: number; alerta?: boolean }) {
  return (
    <div className={`rounded-2xl ring-1 p-4 ${alerta ? "bg-[#FBE5E1] ring-[#F3CFC8]" : "bg-white ring-marfil"}`}>
      <div className={`font-cinzel text-2xl ${alerta ? "text-[#D64534]" : "text-cacao"}`}>{v}</div>
      <div className="text-xs font-bold text-cacao-soft mt-0.5">{k}</div>
    </div>
  );
}
