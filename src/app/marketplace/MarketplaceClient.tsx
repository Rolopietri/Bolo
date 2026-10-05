"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listAnuncios,
  createAnuncio,
  borrarAnuncio,
  getUsuarioId,
  subirFotoAnuncio,
  type Anuncio,
  type TipoAnuncio,
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

  async function recargar() {
    try {
      const [lista, id] = await Promise.all([listAnuncios(), getUsuarioId()]);
      setAnuncios(lista);
      setUid(id);
    } catch (e) {
      setErrorCarga(
        e instanceof Error ? e.message : "No se pudo cargar el mercado.",
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    recargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = norm(query.trim());
    return anuncios.filter((a) => {
      if (filtroTipo !== "todos" && a.tipo !== filtroTipo) return false;
      if (q) {
        const texto = norm(
          [a.titulo, a.descripcion, a.categoria, a.ciudad]
            .filter(Boolean)
            .join(" "),
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
      setErrorForm(
        err instanceof Error ? err.message : "No se pudo subir la foto.",
      );
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
        precio: form.precio.trim()
          ? Number(form.precio.replace(",", "."))
          : null,
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
      setErrorForm(
        e instanceof Error ? e.message : "No se pudo publicar. Intenta de nuevo.",
      );
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await borrarAnuncio(id);
      setAnuncios((prev) => prev.filter((a) => a.id !== id));
    } catch {
      /* si falla (no es tuyo), no hacemos nada visible */
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-cinzel text-3xl text-cacao">Mercado</h1>
          <p className="mt-1 text-cacao-soft">
            Encuentra proveedores de insumos, equipos de cocina y productos para
            revender. O publica el tuyo.
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

      {/* Formulario de publicación */}
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
              onChange={(e) =>
                setForm((f) => ({ ...f, descripcion: e.target.value }))
              }
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
                    setForm((f) => ({
                      ...f,
                      precio: e.target.value.replace(/[^0-9.,]/g, ""),
                    }))
                  }
                  placeholder="0"
                  className="w-full bg-transparent py-3 text-cacao focus:outline-none tabular-nums"
                />
                <select
                  value={form.moneda}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, moneda: e.target.value }))
                  }
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
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactoNombre: e.target.value }))
                }
                placeholder="Nombre o negocio"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </Campo>
            <Campo label="WhatsApp / teléfono">
              <input
                inputMode="tel"
                value={form.contactoWhatsapp}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contactoWhatsapp: e.target.value }))
                }
                placeholder="0414 123 4567"
                className="w-full rounded-xl ring-1 ring-marfil px-3.5 py-3 text-base text-cacao placeholder:text-cacao-mute focus:outline-none focus:ring-2 focus:ring-terracotta"
              />
            </Campo>
          </div>

          <Campo label="Foto (opcional)">
            <div className="flex items-center gap-3">
              {form.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.fotoUrl}
                  alt="Foto"
                  className="h-16 w-16 rounded-lg object-cover ring-1 ring-marfil"
                />
              ) : (
                <div className="grid h-16 w-16 place-items-center rounded-lg bg-marfil-soft ring-1 ring-marfil text-cacao-mute">
                  <StoreIcon className="size-6" />
                </div>
              )}
              <label className="cursor-pointer rounded-xl ring-1 ring-marfil bg-white px-3 py-2 text-sm font-bold text-cacao hover:bg-marfil-soft">
                {subiendoFoto
                  ? "Subiendo…"
                  : form.fotoUrl
                    ? "Cambiar foto"
                    : "Agregar foto"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFoto}
                  disabled={subiendoFoto}
                  className="hidden"
                />
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
            <Chip
              key={t.v}
              activo={filtroTipo === t.v}
              onClick={() => setFiltroTipo(t.v)}
            >
              {t.chip}
            </Chip>
          ))}
        </div>
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="text-center text-cacao-soft py-10">Cargando el mercado…</p>
      ) : errorCarga ? (
        <div className="rounded-2xl bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-5 text-[#7A2419]">
          {errorCarga}
        </div>
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
              esMio={!!uid && a.publicadoPor === uid}
              onBorrar={() => borrar(a.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AnuncioCard({
  anuncio: a,
  esMio,
  onBorrar,
}: {
  anuncio: Anuncio;
  esMio: boolean;
  onBorrar: () => void;
}) {
  const precio = precioFmt(a);
  const info = tipoInfo(a.tipo);
  return (
    <div className="flex flex-col rounded-2xl bg-white ring-1 ring-marfil overflow-hidden shadow-sm">
      {a.fotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.fotoUrl}
          alt={a.titulo}
          className="h-36 w-full object-cover"
        />
      ) : (
        <div className="grid h-36 w-full place-items-center bg-marfil-soft text-cacao-mute">
          <StoreIcon className="size-10" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-4">
        <span className="self-start rounded-full bg-marfil-light px-2.5 py-0.5 text-xs font-bold text-cacao-soft">
          {info.chip}
        </span>
        <h3 className="mt-2 font-bold text-cacao leading-snug">{a.titulo}</h3>
        {precio && (
          <p className="mt-0.5 font-cinzel text-lg text-terracotta-deep tabular-nums">
            {precio}
          </p>
        )}
        {a.descripcion && (
          <p className="mt-1 text-sm text-cacao-soft line-clamp-3">
            {a.descripcion}
          </p>
        )}
        <div className="mt-2 text-xs text-cacao-mute">
          {[a.contactoNombre, a.ciudad].filter(Boolean).join(" · ")}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {a.contactoWhatsapp && (
            <a
              href={waLink(a.contactoWhatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-white py-2.5 text-sm font-bold hover:brightness-95"
            >
              <PhoneIcon className="size-4" />
              Contactar
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
