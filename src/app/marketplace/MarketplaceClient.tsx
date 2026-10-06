"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listAnuncios,
  createAnuncio,
  borrarAnuncio,
  getUsuarioId,
  subirFotoAnuncio,
  listResenasMini,
  listResenasDeAnuncio,
  crearResena,
  borrarResena,
  type Anuncio,
  type TipoAnuncio,
  type Resena,
  type ResenaMini,
} from "@/lib/data/marketplace";
import { SearchIcon, PlusIcon, PhoneIcon, TrashIcon, StoreIcon } from "@/components/icons";

const TIPOS: { v: TipoAnuncio; chip: string; label: string }[] = [
  { v: "insumo", chip: "Insumos", label: "Proveedor de insumos" },
  { v: "equipo", chip: "Equipos", label: "Equipo de cocina" },
  { v: "reventa", chip: "Reventa", label: "Producto para revender" },
];

function tipoInfo(t: TipoAnuncio) {
  return TIPOS.find((x) => x.v === t) ?? TIPOS[0];
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function precioFmt(a: Anuncio): string | null {
  if (a.precio == null) return null;
  const simbolo = a.moneda === "Bs" ? "Bs " : "$";
  return simbolo + a.precio.toLocaleString("es-VE");
}

function waLink(num: string): string {
  const digits = num.replace(/[^0-9]/g, "");
  return "https://wa.me/" + digits;
}

type Agg = { sum: number; count: number };
const prom = (a: Agg | undefined) => (a && a.count > 0 ? a.sum / a.count : 0);

/** Estrellas de solo lectura (usa el glifo ★, permitido por AGENTS.md). */
function Estrellas({ valor, className = "" }: { valor: number; className?: string }) {
  const llenas = Math.round(valor);
  return (
    <span className={"tracking-tight " + className} aria-label={`${valor.toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= llenas ? "text-[#f5a623]" : "text-[#d9cfb8]"}>
          ★
        </span>
      ))}
    </span>
  );
}

function ResumenRating({ agg, className = "" }: { agg: Agg | undefined; className?: string }) {
  if (!agg || agg.count === 0) {
    return <span className={"text-xs text-cacao-mute " + className}>Sin reseñas aún</span>;
  }
  return (
    <span className={"inline-flex items-center gap-1.5 " + className}>
      <Estrellas valor={prom(agg)} className="text-sm" />
      <span className="text-xs font-bold text-cacao-soft tabular-nums">
        {prom(agg).toFixed(1)} ({agg.count})
      </span>
    </span>
  );
}

type Form = {
  tipo: TipoAnuncio;
  titulo: string;
  descripcion: string;
  precio: string;
  moneda: string;
  ciudad: string;
  contactoNombre: string;
  contactoWhatsapp: string;
  fotoUrl: string;
};

const FORM_VACIO: Form = {
  tipo: "insumo",
  titulo: "",
  descripcion: "",
  precio: "",
  moneda: "USD",
  ciudad: "",
  contactoNombre: "",
  contactoWhatsapp: "",
  fotoUrl: "",
};

export function MarketplaceClient() {
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [resenasMini, setResenasMini] = useState<ResenaMini[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState("");

  const [filtroTipo, setFiltroTipo] = useState<TipoAnuncio | "todos">("todos");
  const [query, setQuery] = useState("");

  const [publicando, setPublicando] = useState(false);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState("");

  const [seleccionado, setSeleccionado] = useState<Anuncio | null>(null);

  async function cargarAnuncios() {
    try {
      const [lista, id, minis] = await Promise.all([
        listAnuncios(),
        getUsuarioId(),
        listResenasMini(),
      ]);
      setAnuncios(lista);
      setUid(id);
      setResenasMini(minis);
    } catch (e) {
      setErrorCarga(
        e instanceof Error ? e.message : "No se pudo cargar el mercado.",
      );
    } finally {
      setCargando(false);
    }
  }

  async function refrescarMinis() {
    try {
      setResenasMini(await listResenasMini());
    } catch {
      /* no romper la vista si falla el refresco de promedios */
    }
  }

  useEffect(() => {
    cargarAnuncios();
  }, []);

  // Promedios por anuncio y por vendedor
  const ratingAnuncio = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const r of resenasMini) {
      const e = m.get(r.anuncioId) ?? { sum: 0, count: 0 };
      e.sum += r.calificacion;
      e.count += 1;
      m.set(r.anuncioId, e);
    }
    return m;
  }, [resenasMini]);

  const vendedorDeAnuncio = useMemo(
    () => new Map(anuncios.map((a) => [a.id, a.publicadoPor ?? null])),
    [anuncios],
  );

  const ratingVendedor = useMemo(() => {
    const m = new Map<string, Agg>();
    for (const r of resenasMini) {
      const v = vendedorDeAnuncio.get(r.anuncioId);
      if (!v) continue;
      const e = m.get(v) ?? { sum: 0, count: 0 };
      e.sum += r.calificacion;
      e.count += 1;
      m.set(v, e);
    }
    return m;
  }, [resenasMini, vendedorDeAnuncio]);

  const filtrados = useMemo(() => {
    const q = norm(query.trim());
    return anuncios.filter((a) => {
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      if (q) {
        const texto = norm(
          [a.titulo, a.descripcion, a.categoria, a.ciudad].filter(Boolean).join(" "),
        );
        if (!texto.includes(q)) return false;
      }
      return true;
    });
  }, [anuncios, filtroTipo, query]);

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorForm("");
    setSubiendoFoto(true);
    try {
      const url = await subirFotoAnuncio(file);
      setForm((f) => ({ ...f, fotoUrl: url }));
    } catch (err) {
      setErrorForm(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function publicar() {
    setErrorForm("");
    if (!form.titulo.trim()) {
      setErrorForm("Ponle un título al anuncio.");
      return;
    }
    if (!form.contactoWhatsapp.trim()) {
      setErrorForm("Pon un WhatsApp o teléfono para que te contacten.");
      return;
    }
    setGuardando(true);
    try {
      const nuevo = await createAnuncio({
        tipo: form.tipo,
        titulo: form.titulo.trim(),
        descripcion: form.descripcion.trim() || undefined,
        precio: form.precio.trim() ? Number(form.precio.replace(",", ".")) : null,
        moneda: form.moneda,
        ciudad: form.ciudad.trim() || undefined,
        contactoNombre: form.contactoNombre.trim() || undefined,
        contactoWhatsapp: form.contactoWhatsapp.trim(),
        fotoUrl: form.fotoUrl || undefined,
      });
      setAnuncios((prev) => [nuevo, ...prev]);
      setForm(FORM_VACIO);
      setPublicando(false);
    } catch (e) {
      setErrorForm(e instanceof Error ? e.message : "No se pudo publicar. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await borrarAnuncio(id);
      setAnuncios((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* si no es tuyo, no pasa nada visible */
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-cinzel text-3xl text-cacao">Mercado</h1>
          <p className="mt-1 text-cacao-soft">
            Encuentra proveedores de insumos, equipos de cocina y productos para
            revender. Fíjate en las estrellas: dan confianza.
          </p>
        </div>
        <StoreIcon className="size-8 text-terracotta shrink-0 mt-1" />
      </header>

      {!publicando && (
        <button
          onClick={() => setPublicando(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-terracotta text-white py-3.5 font-cinzel text-lg hover:bg-terracotta-deep transition-colors shadow-[0_4px_14px_rgba(248,144,0,.32)]"
        >
          <PlusIcon className="size-5" />
          Publicar un anuncio
        </button>
      )}

      {publicando && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-cinzel text-xl text-cacao">Publicar anuncio</h2>
            <button
              onClick={() => {
                setPublicando(false);
                setErrorForm("");
              }}
              className="text-sm font-bold text-cacao-soft hover:text-cacao"
            >
              Cancelar
            </button>
          </div>

          <div>
            <span className="text-sm font-bold text-cacao-soft">¿Qué ofreces?</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {TIPOS.map((t) => (
                <button
                  key={t.v}
                  onClick={() => setForm((f) => ({ ...f, tipo: t.v }))}
                  className={
                    "rounded-full px-3 py-1.5 text-sm font-bold transition-colors " +
                    (form.tipo === t.v
                      ? "bg-cacao text-white"
                      : "bg-marfil-soft ring-1 ring-marfil text-cacao-soft hover:text-cacao")
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Campo label="Título">
            <input
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder="Ej.: Harina de trigo por saco · Cocina industrial 4 hornillas"
              className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
            />
          </Campo>

          <Campo label="Descripción (opcional)">
            <textarea
              value={form.descripcion}
              onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
              rows={2}
              placeholder="Detalles, marca, estado, cantidad mínima…"
              className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
            />
          </Campo>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Precio (opcional)">
              <div className="flex items-center rounded-xl ring-1 ring-marfil bg-white px-2">
                <input
                  inputMode="decimal"
                  value={form.precio}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, precio: e.target.value.replace(/[^0-9.,]/g, "") }))
                  }
                  placeholder="0"
                  className="w-full bg-transparent py-3 text-cacao focus:outline-none tabular-nums"
                />
                <select
                  value={form.moneda}
                  onChange={(e) => setForm((f) => ({ ...f, moneda: e.target.value }))}
                  className="bg-transparent py-3 pl-1 text-sm font-bold text-cacao-soft focus:outline-none"
                >
                  <option value="USD">$</option>
                  <option value="Bs">Bs</option>
                </select>
              </div>
            </Campo>
            <Campo label="Ciudad (opcional)">
              <input
                value={form.ciudad}
                onChange={(e) => setForm((f) => ({ ...f, ciudad: e.target.value }))}
                placeholder="Caracas"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </Campo>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tu nombre (opcional)">
              <input
                value={form.contactoNombre}
                onChange={(e) => setForm((f) => ({ ...f, contactoNombre: e.target.value }))}
                placeholder="Nombre o negocio"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </Campo>
            <Campo label="WhatsApp / teléfono">
              <input
                inputMode="tel"
                value={form.contactoWhatsapp}
                onChange={(e) => setForm((f) => ({ ...f, contactoWhatsapp: e.target.value }))}
                placeholder="0414 123 4567"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </Campo>
          </div>

          <Campo label="Foto (opcional)">
            <div className="flex items-center gap-3">
              {form.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.fotoUrl} alt="Foto" className="h-16 w-16 rounded-lg object-cover ring-1 ring-marfil" />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg bg-marfil-soft ring-1 ring-marfil text-cacao-mute">
                  <StoreIcon className="size-6" />
                </div>
              )}
              <label className="cursor-pointer rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft">
                {subiendoFoto ? "Subiendo…" : form.fotoUrl ? "Cambiar foto" : "Agregar foto"}
                <input type="file" accept="image/*" onChange={onFoto} disabled={subiendoFoto} className="hidden" />
              </label>
              {form.fotoUrl && (
                <button
                  onClick={() => setForm((f) => ({ ...f, fotoUrl: "" }))}
                  className="text-sm font-bold text-cacao-soft hover:text-[#c0472f]"
                >
                  Quitar
                </button>
              )}
            </div>
          </Campo>

          {errorForm && (
            <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
              {errorForm}
            </div>
          )}

          <button
            onClick={publicar}
            disabled={guardando || subiendoFoto}
            className="w-full rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
          >
            {guardando ? "Publicando…" : "Publicar anuncio"}
          </button>
        </section>
      )}

      {/* Buscador + filtros */}
      <div className="space-y-3">
        <div className="flex items-center rounded-2xl ring-1 ring-marfil bg-white px-3.5">
          <SearchIcon className="size-5 text-cacao-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar en el mercado…"
            className="w-full bg-transparent py-3 pl-2.5 text-cacao placeholder:text-cacao-mute focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Chip activo={filtroTipo === "todos"} onClick={() => setFiltroTipo("todos")}>
            Todos
          </Chip>
          {TIPOS.map((t) => (
            <Chip key={t.v} activo={filtroTipo === t.v} onClick={() => setFiltroTipo(t.v)}>
              {t.chip}
            </Chip>
          ))}
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-center text-cacao-soft py-10">Cargando el mercado…</p>
      ) : errorCarga ? (
        <div className="rounded-2xl bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-5 text-[#7A2419]">{errorCarga}</div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
          {anuncios.length === 0
            ? "Todavía no hay anuncios. ¡Sé el primero en publicar!"
            : "No encontramos anuncios con ese filtro."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtrados.map((a) => (
            <AnuncioCard
              key={a.id}
              anuncio={a}
              agg={ratingAnuncio.get(a.id)}
              esMio={!!uid && a.publicadoPor === uid}
              onAbrir={() => setSeleccionado(a)}
              onBorrar={() => borrar(a.id)}
            />
          ))}
        </div>
      )}

      {seleccionado && (
        <DetalleAnuncio
          anuncio={seleccionado}
          uid={uid}
          aggProducto={ratingAnuncio.get(seleccionado.id)}
          aggVendedor={
            seleccionado.publicadoPor ? ratingVendedor.get(seleccionado.publicadoPor) : undefined
          }
          onCerrar={() => setSeleccionado(null)}
          onCambioResenas={refrescarMinis}
        />
      )}
    </div>
  );
}

function AnuncioCard({
  anuncio: a,
  agg,
  esMio,
  onAbrir,
  onBorrar,
}: {
  anuncio: Anuncio;
  agg: Agg | undefined;
  esMio: boolean;
  onAbrir: () => void;
  onBorrar: () => void;
}) {
  const precio = precioFmt(a);
  const info = tipoInfo(a.tipo);
  return (
    <div className="flex flex-col rounded-2xl bg-white ring-1 ring-marfil overflow-hidden shadow-sm">
      <button onClick={onAbrir} className="text-left">
        {a.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={a.fotoUrl} alt={a.titulo} className="h-36 w-full object-cover" />
        ) : (
          <div className="grid h-36 w-full place-items-center bg-marfil-soft text-cacao-mute">
            <StoreIcon className="size-10" />
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col p-4">
        <span className="self-start rounded-full bg-marfil-light px-2.5 py-0.5 text-xs font-bold text-cacao-soft">
          {info.chip}
        </span>
        <button onClick={onAbrir} className="mt-2 text-left">
          <h3 className="font-bold text-cacao leading-snug hover:text-terracotta-deep">
            {a.titulo}
          </h3>
        </button>
        <div className="mt-1">
          <ResumenRating agg={agg} />
        </div>
        {precio && (
          <p className="mt-1 font-cinzel text-lg text-terracotta-deep tabular-nums">{precio}</p>
        )}
        <div className="mt-1 text-xs text-cacao-mute">
          {[a.contactoNombre, a.ciudad].filter(Boolean).join(" · ")}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={onAbrir}
            className="flex-1 rounded-xl ring-1 ring-marfil py-2.5 text-sm font-bold text-cacao hover:bg-marfil-soft"
          >
            Ver y reseñas
          </button>
          {a.contactoWhatsapp && (
            <a
              href={waLink(a.contactoWhatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] text-white px-3 py-2.5 text-sm font-bold hover:brightness-95"
            >
              <PhoneIcon className="size-4" />
              WhatsApp
            </a>
          )}
          {esMio && (
            <button
              onClick={onBorrar}
              aria-label="Borrar mi anuncio"
              className="rounded-xl ring-1 ring-marfil px-3 py-2.5 text-cacao-mute hover:text-[#c0472f] hover:bg-marfil-soft"
            >
              <TrashIcon className="size-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetalleAnuncio({
  anuncio: a,
  uid,
  aggProducto,
  aggVendedor,
  onCerrar,
  onCambioResenas,
}: {
  anuncio: Anuncio;
  uid: string | null;
  aggProducto: Agg | undefined;
  aggVendedor: Agg | undefined;
  onCerrar: () => void;
  onCambioResenas: () => void;
}) {
  const [resenas, setResenas] = useState<Resena[]>([]);
  const [cargando, setCargando] = useState(true);
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState("");
  const [nombre, setNombre] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorR, setErrorR] = useState("");

  // Agregados locales (incluyen lo que se acaba de publicar en este detalle)
  const agg = useMemo<Agg>(() => {
    if (resenas.length === 0) return aggProducto ?? { sum: 0, count: 0 };
    return {
      sum: resenas.reduce((s, r) => s + r.calificacion, 0),
      count: resenas.length,
    };
  }, [resenas, aggProducto]);

  async function cargar() {
    setCargando(true);
    try {
      setResenas(await listResenasDeAnuncio(a.id));
    } catch {
      /* deja la lista vacía si falla */
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.id]);

  const esMiAnuncio = !!uid && a.publicadoPor === uid;
  const miResena = resenas.find((r) => r.autor && r.autor === uid);

  async function enviar() {
    setErrorR("");
    if (estrellas < 1) {
      setErrorR("Toca las estrellas para calificar.");
      return;
    }
    setEnviando(true);
    try {
      await crearResena({
        anuncioId: a.id,
        calificacion: estrellas,
        comentario: comentario.trim() || undefined,
        autorNombre: nombre.trim() || undefined,
      });
      setEstrellas(0);
      setComentario("");
      setNombre("");
      await cargar();
      onCambioResenas();
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      setErrorR(
        msg.includes("duplicate") || msg.includes("una_por_persona")
          ? "Ya dejaste una reseña en este anuncio."
          : "No se pudo enviar la reseña. Intenta de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function quitarMiResena(id: string) {
    try {
      await borrarResena(id);
      await cargar();
      onCambioResenas();
    } catch {
      /* ignora */
    }
  }

  const precio = precioFmt(a);
  const info = tipoInfo(a.tipo);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-marfil-soft">
        {/* Encabezado */}
        <div className="sticky top-0 z-10 flex items-center justify-between bg-marfil-soft/95 backdrop-blur px-4 py-3 border-b border-marfil">
          <span className="font-cinzel text-lg text-cacao">Anuncio</span>
          <button
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-full ring-1 ring-marfil bg-white size-9 grid place-items-center text-cacao-soft hover:text-cacao"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Producto */}
          <div className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden">
            {a.fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.fotoUrl} alt={a.titulo} className="h-44 w-full object-cover" />
            ) : (
              <div className="grid h-44 w-full place-items-center bg-marfil-soft text-cacao-mute">
                <StoreIcon className="size-12" />
              </div>
            )}
            <div className="p-4">
              <span className="rounded-full bg-marfil-light px-2.5 py-0.5 text-xs font-bold text-cacao-soft">
                {info.chip}
              </span>
              <h2 className="mt-2 font-cinzel text-2xl text-cacao">{a.titulo}</h2>
              <div className="mt-1">
                <ResumenRating agg={agg} />
              </div>
              {precio && (
                <p className="mt-1 font-cinzel text-xl text-terracotta-deep tabular-nums">{precio}</p>
              )}
              {a.descripcion && <p className="mt-2 text-cacao-soft">{a.descripcion}</p>}
              {a.ciudad && <p className="mt-2 text-sm text-cacao-mute">📍 {a.ciudad}</p>}

              {a.contactoWhatsapp && (
                <a
                  href={waLink(a.contactoWhatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white py-3 font-bold hover:brightness-95"
                >
                  <PhoneIcon className="size-4" />
                  Contactar por WhatsApp
                </a>
              )}
            </div>
          </div>

          {/* Reputación del vendedor */}
          <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
            <p className="text-sm font-bold text-cacao-soft">Vendedor</p>
            <p className="font-bold text-cacao">{a.contactoNombre || "Vendedor"}</p>
            {a.publicadoPor && aggVendedor && aggVendedor.count > 0 ? (
              <div className="mt-1 flex items-center gap-2">
                <Estrellas valor={prom(aggVendedor)} />
                <span className="text-sm font-bold text-cacao-soft tabular-nums">
                  {prom(aggVendedor).toFixed(1)} · {aggVendedor.count} reseña
                  {aggVendedor.count === 1 ? "" : "s"} en total
                </span>
              </div>
            ) : (
              <p className="mt-1 text-sm text-cacao-mute">Vendedor nuevo (aún sin reseñas).</p>
            )}
          </div>

          {/* Dejar reseña */}
          {esMiAnuncio ? (
            <div className="rounded-2xl bg-marfil-light ring-1 ring-marfil p-4 text-sm text-cacao-soft">
              Este es tu anuncio. Las reseñas las dejan otros compradores.
            </div>
          ) : miResena ? (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-4">
              <p className="text-sm font-bold text-cacao-soft">Tu reseña</p>
              <div className="mt-1 flex items-center justify-between">
                <Estrellas valor={miResena.calificacion} />
                <button
                  onClick={() => quitarMiResena(miResena.id)}
                  className="text-sm font-bold text-cacao-soft hover:text-[#c0472f]"
                >
                  Borrar
                </button>
              </div>
              {miResena.comentario && (
                <p className="mt-1 text-sm text-cacao">{miResena.comentario}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-4 space-y-3">
              <p className="font-bold text-cacao">Deja tu reseña</p>
              <div className="flex items-center gap-1 text-3xl">
                {[1, 2, 3, 4, 5].map((i) => (
                  <button
                    key={i}
                    onClick={() => setEstrellas(i)}
                    aria-label={`${i} estrellas`}
                    className={i <= estrellas ? "text-[#f5a623]" : "text-[#d9cfb8]"}
                  >
                    ★
                  </button>
                ))}
              </div>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={2}
                placeholder="¿Cómo fue tu experiencia? (opcional)"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre (opcional)"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
              {errorR && (
                <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
                  {errorR}
                </div>
              )}
              <button
                onClick={enviar}
                disabled={enviando}
                className="w-full rounded-xl bg-terracotta text-white py-3 font-bold hover:bg-terracotta-deep disabled:opacity-50 transition-colors"
              >
                {enviando ? "Enviando…" : "Publicar reseña"}
              </button>
            </div>
          )}

          {/* Lista de reseñas */}
          <div className="space-y-2">
            <p className="font-bold text-cacao">
              Reseñas {agg.count > 0 && `(${agg.count})`}
            </p>
            {cargando ? (
              <p className="text-sm text-cacao-soft">Cargando reseñas…</p>
            ) : resenas.length === 0 ? (
              <p className="text-sm text-cacao-mute">
                Aún no hay reseñas. Sé el primero en dejar una.
              </p>
            ) : (
              resenas.map((r) => (
                <div key={r.id} className="rounded-xl bg-white ring-1 ring-marfil p-3">
                  <div className="flex items-center justify-between">
                    <Estrellas valor={r.calificacion} className="text-sm" />
                    <span className="text-xs font-bold text-cacao-mute">
                      {r.autorNombre || "Anónimo"}
                    </span>
                  </div>
                  {r.comentario && <p className="mt-1 text-sm text-cacao">{r.comentario}</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-cacao-soft">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors " +
        (activo
          ? "bg-cacao text-white"
          : "bg-white ring-1 ring-marfil text-cacao-soft hover:text-cacao")
      }
    >
      {children}
    </button>
  );
}
