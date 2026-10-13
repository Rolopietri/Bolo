"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Panel de operador.
 * Protegido por contraseña propia (OPERADOR_PASSWORD). Todo se lee y se actúa
 * por /api/operador/* (llave de servicio del lado del servidor).
 *
 * Pestañas:
 *  • Mercado  → moderación: denuncias, todos los anuncios, reseñas.
 *  • Cuentas  → ayuda a los clientes: ver usuarios, restablecer contraseña,
 *               desactivar/eliminar cuenta.
 */

type Resumen = { anuncios: number; denuncias: number; resenas: number; anunciosDenunciados: number };
type AnuncioRow = {
  id: string;
  titulo: string;
  tipo: string;
  contacto_nombre: string | null;
  ciudad: string | null;
  activo: boolean;
  foto_url?: string | null;
};
type Motivo = { motivo: string; detalle: string | null; fecha: string };
type Grupo = { anuncioId: string; anuncio: AnuncioRow | null; count: number; motivos: Motivo[] };
type ResenaRow = {
  id: string;
  anuncio_id: string;
  calificacion: number;
  comentario: string | null;
  autor_nombre: string | null;
  created_at: string;
};
type Usuario = {
  id: string;
  email: string;
  creado: string | null;
  ultimoAcceso: string | null;
  bloqueado: boolean;
};

function fecha(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function OperadorClient() {
  const [estado, setEstado] = useState<"cargando" | "sin-config" | "bloqueado" | "abierto">("cargando");

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
        Define la variable <span className="font-mono font-bold">OPERADOR_PASSWORD</span> en Vercel
        (Settings → Environment Variables) y vuelve a desplegar.
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
  const [tab, setTab] = useState<"mercado" | "cuentas">("mercado");
  const [error, setError] = useState("");
  const [actuando, setActuando] = useState("");

  // Mercado
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [anuncios, setAnuncios] = useState<AnuncioRow[]>([]);
  const [resenas, setResenas] = useState<ResenaRow[]>([]);
  const [titulos, setTitulos] = useState<Record<string, string>>({});
  const [cargandoMkt, setCargandoMkt] = useState(true);

  // Cuentas
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [cargandoUsr, setCargandoUsr] = useState(false);
  const [usrCargado, setUsrCargado] = useState(false);
  const [tempPass, setTempPass] = useState<Record<string, string>>({});

  const manejarNoAutorizado = useCallback(
    (status: number) => {
      if (status === 401) {
        onSalir();
        return true;
      }
      return false;
    },
    [onSalir],
  );

  const cargarMercado = useCallback(async () => {
    setCargandoMkt(true);
    setError("");
    try {
      const [p, a, r] = await Promise.all([
        fetch("/api/operador/panel", { cache: "no-store" }),
        fetch("/api/operador/anuncios", { cache: "no-store" }),
        fetch("/api/operador/resenas", { cache: "no-store" }),
      ]);
      if (manejarNoAutorizado(p.status)) return;
      const pd = await p.json();
      const ad = await a.json();
      const rd = await r.json();
      if (!p.ok) throw new Error(pd.error || "No se pudo cargar.");
      setResumen(pd.resumen);
      setGrupos(pd.grupos ?? []);
      setAnuncios(ad.anuncios ?? []);
      setResenas(rd.resenas ?? []);
      setTitulos(rd.titulos ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el panel.");
    } finally {
      setCargandoMkt(false);
    }
  }, [manejarNoAutorizado]);

  const cargarUsuarios = useCallback(async () => {
    setCargandoUsr(true);
    setError("");
    try {
      const r = await fetch("/api/operador/usuarios", { cache: "no-store" });
      if (manejarNoAutorizado(r.status)) return;
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "No se pudieron cargar los usuarios.");
      setUsuarios(d.usuarios ?? []);
      setUsrCargado(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los usuarios.");
    } finally {
      setCargandoUsr(false);
    }
  }, [manejarNoAutorizado]);

  useEffect(() => {
    cargarMercado();
  }, [cargarMercado]);

  useEffect(() => {
    if (tab === "cuentas" && !usrCargado) cargarUsuarios();
  }, [tab, usrCargado, cargarUsuarios]);

  async function accionAnuncio(id: string, acc: "ocultar" | "activar" | "eliminar") {
    if (acc === "eliminar" && !window.confirm("¿Eliminar este anuncio para siempre?")) return;
    setActuando(id + acc);
    try {
      const r = await fetch("/api/operador/anuncio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, accion: acc }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo.");
      await cargarMercado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setActuando("");
    }
  }

  async function borrarResena(id: string) {
    if (!window.confirm("¿Eliminar esta reseña?")) return;
    setActuando("res" + id);
    try {
      const r = await fetch("/api/operador/resenas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "No se pudo.");
      await cargarMercado();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setActuando("");
    }
  }

  async function accionUsuario(u: Usuario, acc: "resetpass" | "desactivar" | "activar" | "eliminar") {
    if (acc === "eliminar" && !window.confirm(`¿Eliminar la cuenta ${u.email}? No se puede deshacer.`)) return;
    if (acc === "desactivar" && !window.confirm(`¿Desactivar la cuenta ${u.email}? No podrá entrar.`)) return;
    setActuando(u.id + acc);
    try {
      const r = await fetch("/api/operador/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: u.id, accion: acc }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "No se pudo.");
      if (acc === "resetpass" && d.nueva) {
        setTempPass((m) => ({ ...m, [u.id]: d.nueva }));
      } else {
        await cargarUsuarios();
      }
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
        <h1 className="font-cinzel text-2xl text-cacao">Panel de operador</h1>
        <button onClick={salir} className="text-sm font-bold text-cacao-soft hover:text-cacao">
          Salir
        </button>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1.5 rounded-2xl bg-marfil-light ring-1 ring-marfil p-1.5">
        <button
          onClick={() => setTab("mercado")}
          className={"flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " + (tab === "mercado" ? "bg-white text-cacao shadow-sm" : "text-cacao-soft")}
        >
          Mercado
        </button>
        <button
          onClick={() => setTab("cuentas")}
          className={"flex-1 rounded-xl py-2.5 font-bold text-sm transition-colors " + (tab === "cuentas" ? "bg-white text-cacao shadow-sm" : "text-cacao-soft")}
        >
          Cuentas
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-[#FBE5E1] ring-1 ring-[#F3CFC8] p-3 text-sm text-[#A5341F]">{error}</div>
      )}

      {tab === "mercado" ? (
        <>
          {resumen && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Tile k="Anuncios" v={resumen.anuncios} />
              <Tile k="Denuncias" v={resumen.denuncias} alerta={resumen.denuncias > 0} />
              <Tile k="Denunciados" v={resumen.anunciosDenunciados} alerta={resumen.anunciosDenunciados > 0} />
              <Tile k="Reseñas" v={resumen.resenas} />
            </div>
          )}

          {cargandoMkt ? (
            <p className="text-cacao-soft text-sm">Cargando…</p>
          ) : (
            <>
              {/* Denunciados */}
              <Seccion titulo="Anuncios denunciados">
                {grupos.length === 0 ? (
                  <Vacio texto="No hay denuncias pendientes. Todo tranquilo. 👌" />
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
                                {a && !a.activo && <Badge>Oculto</Badge>}
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
                          {a && <AccionesAnuncio a={a} actuando={actuando} onAccion={accionAnuncio} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Seccion>

              {/* Todos los anuncios */}
              <Seccion titulo={`Todos los anuncios (${anuncios.length})`}>
                {anuncios.length === 0 ? (
                  <Vacio texto="Aún no hay anuncios." />
                ) : (
                  <div className="space-y-2">
                    {anuncios.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white ring-1 ring-marfil px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-cacao truncate">
                            {a.titulo}
                            {!a.activo && <Badge>Oculto</Badge>}
                          </div>
                          <div className="text-xs text-cacao-mute">
                            {[a.tipo, a.contacto_nombre, a.ciudad].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                        <AccionesAnuncio a={a} actuando={actuando} onAccion={accionAnuncio} compacto />
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>

              {/* Reseñas */}
              <Seccion titulo={`Reseñas recientes (${resenas.length})`}>
                {resenas.length === 0 ? (
                  <Vacio texto="Aún no hay reseñas." />
                ) : (
                  <div className="space-y-2">
                    {resenas.map((r) => (
                      <div key={r.id} className="flex items-start gap-3 rounded-xl bg-white ring-1 ring-marfil px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-[#f5a623] text-sm tracking-tight">
                            {"★".repeat(r.calificacion)}
                            <span className="text-[#d9cfb8]">{"★".repeat(5 - r.calificacion)}</span>
                            <span className="text-cacao-mute font-bold ml-2">{r.autor_nombre || "Anónimo"}</span>
                          </div>
                          <div className="text-xs text-cacao-mute">en: {titulos[r.anuncio_id] || "(anuncio)"}</div>
                          {r.comentario && <div className="text-sm text-cacao mt-0.5">{r.comentario}</div>}
                        </div>
                        <button
                          onClick={() => borrarResena(r.id)}
                          disabled={actuando === "res" + r.id}
                          className="shrink-0 rounded-lg bg-[#D64534] text-white px-3 py-2 text-sm font-bold hover:brightness-95 disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </Seccion>
            </>
          )}
        </>
      ) : (
        /* CUENTAS */
        <Seccion titulo={`Usuarios registrados${usrCargado ? ` (${usuarios.length})` : ""}`}>
          {cargandoUsr ? (
            <p className="text-cacao-soft text-sm">Cargando usuarios…</p>
          ) : usuarios.length === 0 ? (
            <Vacio texto="Aún no hay cuentas registradas." />
          ) : (
            <div className="space-y-2">
              {usuarios.map((u) => (
                <div key={u.id} className="rounded-2xl bg-white ring-1 ring-marfil p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-bold text-cacao truncate">
                        {u.email}
                        {u.bloqueado && <Badge>Desactivada</Badge>}
                      </div>
                      <div className="text-xs text-cacao-mute mt-0.5">
                        Registrado {fecha(u.creado)} · Último acceso {fecha(u.ultimoAcceso)}
                      </div>
                    </div>
                  </div>

                  {tempPass[u.id] && (
                    <div className="mt-2 rounded-lg bg-[#E4F3EA] ring-1 ring-[#BFE0CB] p-2.5 text-sm text-[#2F7A49]">
                      Nueva contraseña temporal: <b className="font-mono">{tempPass[u.id]}</b> — cópiala y
                      dásela al cliente para que entre.
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => accionUsuario(u, "resetpass")}
                      disabled={actuando === u.id + "resetpass"}
                      className="rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
                    >
                      Restablecer contraseña
                    </button>
                    {u.bloqueado ? (
                      <button
                        onClick={() => accionUsuario(u, "activar")}
                        disabled={actuando === u.id + "activar"}
                        className="rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
                      >
                        Reactivar
                      </button>
                    ) : (
                      <button
                        onClick={() => accionUsuario(u, "desactivar")}
                        disabled={actuando === u.id + "desactivar"}
                        className="rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
                      >
                        Desactivar
                      </button>
                    )}
                    <button
                      onClick={() => accionUsuario(u, "eliminar")}
                      disabled={actuando === u.id + "eliminar"}
                      className="rounded-xl bg-[#D64534] text-white px-3 py-2 text-sm font-bold hover:brightness-95 disabled:opacity-50"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Seccion>
      )}
    </div>
  );
}

function AccionesAnuncio({
  a,
  actuando,
  onAccion,
  compacto,
}: {
  a: AnuncioRow;
  actuando: string;
  onAccion: (id: string, acc: "ocultar" | "activar" | "eliminar") => void;
  compacto?: boolean;
}) {
  return (
    <div className={compacto ? "flex gap-1.5 shrink-0" : "mt-3 flex flex-wrap gap-2"}>
      {a.activo ? (
        <button
          onClick={() => onAccion(a.id, "ocultar")}
          disabled={actuando === a.id + "ocultar"}
          className="rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
        >
          Ocultar
        </button>
      ) : (
        <button
          onClick={() => onAccion(a.id, "activar")}
          disabled={actuando === a.id + "activar"}
          className="rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft disabled:opacity-50"
        >
          Reactivar
        </button>
      )}
      <button
        onClick={() => onAccion(a.id, "eliminar")}
        disabled={actuando === a.id + "eliminar"}
        className="rounded-xl bg-[#D64534] text-white px-3 py-2 text-sm font-bold hover:brightness-95 disabled:opacity-50"
      >
        Eliminar
      </button>
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-bold text-cacao mb-2">{titulo}</h2>
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-marfil p-6 text-center text-cacao-soft text-sm">
      {texto}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="ml-2 align-middle text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil">
      {children}
    </span>
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
