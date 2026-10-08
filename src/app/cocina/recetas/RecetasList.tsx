"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  precioConIva,
  categoriaRecetaLabel,
  type Receta,
  type Insumo,
} from "@/lib/types";
import {
  listRecetas,
  calcularCostoReceta,
  setPrecioSugeridoUsd,
} from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { listCategoriasProducto, type CategoriaProducto } from "@/lib/data/categorias";
import { getCocinaConfig } from "@/lib/data/cocinaConfig";
import { normalizarBusqueda } from "@/lib/text";
import { extractError } from "@/lib/data/error";
import { ErrorCarga } from "@/components/ErrorCarga";

const SIN_CATEGORIA = "__sin_categoria__";

export function RecetasList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightId = searchParams.get("highlight");

  const [items, setItems] = useState<Receta[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [categoriasUser, setCategoriasUser] = useState<CategoriaProducto[]>([]);
  /** % de IVA configurado (default 16). Lo usamos para mostrar el precio
   *  con IVA al lado del precio sin IVA. */
  const [ivaPorc, setIvaPorc] = useState(16);
  // Umbrales del semáforo de margen (configurables). Se usan para colorear el
  // margen igual que en Rentabilidad, en vez de valores fijos 70/50.
  const [margenVerdeMin, setMargenVerdeMin] = useState(70);
  const [margenAmarilloMin, setMargenAmarilloMin] = useState(50);
  const [loading, setLoading] = useState(true);
  /** Error al CARGAR la pantalla (distinto de los errores al guardar). */
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [q, setQ] = useState("");
  /** El filtro puede ser: "todas", "subreceta" (categoría virtual: recetas con
   *  esSubreceta=true), SIN_CATEGORIA (recetas sin categoría) o el nombre de
   *  una categoría del negocio. Por eso el tipo es string. */
  const [filterCat, setFilterCat] = useState<string>("todas");
  const [showInactivas, setShowInactivas] = useState(false);
  // Vista: "fichas" (tarjetas) o "costeo" (lista compacta con precio + semáforo).
  const [vista, setVista] = useState<"fichas" | "costeo">("fichas");
  // Borrador del precio que se edita inline en la vista Costeo (string mientras
  // se escribe; se persiste al salir del campo).
  const [precioDraft, setPrecioDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rec, ins, cfg, cats] = await Promise.all([
          listRecetas(),
          listInsumos(),
          getCocinaConfig(),
          listCategoriasProducto().catch(() => [] as CategoriaProducto[]),
        ]);
        if (!cancelled) {
          setItems(rec);
          setInsumos(ins);
          setIvaPorc(cfg.ivaPorc);
          setMargenVerdeMin(cfg.margenVerdeMin);
          setMargenAmarilloMin(cfg.margenAmarilloMin);
          setCategoriasUser(cats);
        }
      } catch (e) {
        if (!cancelled)
          setErrorCarga(extractError(e, "Error cargando"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [intento]);

  function reintentarCarga() {
    setLoading(true);
    setErrorCarga(null);
    setIntento((n) => n + 1);
  }

  /**
   * Después de crear una receta (o cuando alguien comparte el link con
   * ?highlight=...), hacemos scroll suave a esa card y un highlight visual
   * por 2 segundos. Después limpiamos el query param para que no quede en
   * la URL si recargás.
   */
  useEffect(() => {
    if (!highlightId || loading || items.length === 0) return;
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(
        `[data-receta-id="${highlightId}"]`,
      );
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-terracotta");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-terracotta");
        }, 2000);
      }
      // Limpiar el query param para que la URL quede limpia
      router.replace("/cocina/recetas", { scroll: false });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, items.length, highlightId]);

  const filtered = useMemo(() => {
    const qq = normalizarBusqueda(q.trim());
    return items.filter((r) => {
      if (!showInactivas && !r.activo) return false;
      if (filterCat === "subreceta") {
        if (!r.esSubreceta) return false;
      } else if (filterCat === SIN_CATEGORIA) {
        if (r.esSubreceta || r.categoria) return false;
      } else if (filterCat !== "todas") {
        // Para categorías normales, excluir subrecetas (tienen su propia "categoría")
        if (r.esSubreceta) return false;
        if (r.categoria !== filterCat) return false;
      }
      if (qq) {
        const txt = normalizarBusqueda(
          `${r.nombre} ${r.perfil ?? ""} ${r.ingredientes.map((i) => i.nombre).join(" ")}`,
        );
        if (!txt.includes(qq)) return false;
      }
      return true;
    });
  }, [items, q, filterCat, showInactivas]);

  const inactivasCount = useMemo(
    () => items.filter((r) => !r.activo).length,
    [items],
  );

  // Categorías para los pills de filtro: las categorías de RECETA (aplica_receta)
  // + cualquier categoría que alguna receta use pero no esté marcada (para no
  // esconder recetas). Sin lista fija de ejemplo: un negocio nuevo solo ve las
  // categorías que crea.
  const categoriasFiltro = useMemo(() => {
    const recetaCats = categoriasUser.filter((c) => c.aplicaReceta !== false);
    const conocidas = recetaCats.map((c) => c.nombre);
    const conocidasNorm = new Set(conocidas.map((c) => c.trim().toLowerCase()));
    const set = new Set<string>();
    items.forEach((r) => {
      if (
        r.categoria &&
        !r.esSubreceta &&
        !conocidasNorm.has(r.categoria.trim().toLowerCase())
      )
        set.add(r.categoria);
    });
    const nuevas = Array.from(set).sort((a, b) =>
      categoriaRecetaLabel(a).localeCompare(categoriaRecetaLabel(b)),
    );
    return [...conocidas, ...nuevas];
  }, [items, categoriasUser]);

  const haySinCategoria = useMemo(
    () => items.some((r) => !r.esSubreceta && !r.categoria),
    [items],
  );

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando recetas...
      </div>
    );
  }
  if (errorCarga) {
    return (
      <ErrorCarga
        que="las recetas"
        detalle={errorCarga}
        onReintentar={reintentarCarga}
      />
    );
  }


  function onPrecioInput(id: string, value: string) {
    setPrecioDraft((d) => ({ ...d, [id]: value }));
    const n = value.trim() === "" ? null : Number(value.replace(",", "."));
    setItems((prev) =>
      prev.map((x) =>
        x.id === id
          ? { ...x, precioSugeridoUsd: n != null && Number.isFinite(n) ? n : undefined }
          : x,
      ),
    );
  }
  async function onPrecioBlur(id: string) {
    const raw = precioDraft[id];
    if (raw === undefined) return;
    const n = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    const val = n != null && Number.isFinite(n) ? n : null;
    try {
      await setPrecioSugeridoUsd(id, val);
    } catch {
      /* si falla, el valor local queda; el usuario puede reintentar */
    }
    setPrecioDraft((d) => {
      const c = { ...d };
      delete c[id];
      return c;
    });
  }

  return (
    <div>
      <div className="space-y-3 mb-5">
        <input
          type="text"
          placeholder="Buscar receta o ingrediente..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterCat("todas")}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterCat === "todas"
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Todas
          </button>
          {categoriasFiltro.map((c) => (
            <button
              key={c}
              onClick={() => setFilterCat(c)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
                filterCat === c
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {categoriaRecetaLabel(c)}
            </button>
          ))}
          {haySinCategoria && (
            <button
              onClick={() => setFilterCat(SIN_CATEGORIA)}
              className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
                filterCat === SIN_CATEGORIA
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              Sin categoría
            </button>
          )}
          <button
            onClick={() => setFilterCat("subreceta")}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              filterCat === "subreceta"
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
          >
            Sub-recetas
          </button>
        </div>
      </div>

      <div className="flex gap-1 rounded-xl bg-marfil-light ring-1 ring-marfil p-1 mb-4 max-w-[240px]">
        <button
          onClick={() => setVista("fichas")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-widest ${vista === "fichas" ? "bg-white text-cacao shadow-sm" : "text-cacao-soft"}`}
        >
          Fichas
        </button>
        <button
          onClick={() => setVista("costeo")}
          className={`flex-1 rounded-lg py-1.5 text-xs font-bold uppercase tracking-widest ${vista === "costeo" ? "bg-white text-cacao shadow-sm" : "text-cacao-soft"}`}
        >
          Costeo
        </button>
      </div>

      {inactivasCount > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowInactivas((v) => !v)}
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-widest ring-1 ${
              showInactivas
                ? "bg-cacao text-white ring-cacao"
                : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
            }`}
            title="Mostrar u ocultar las recetas desactivadas"
          >
            {showInactivas ? "Ocultar inactivas" : "Ver inactivas"} (
            {inactivasCount})
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft mb-4">
            {items.length === 0
              ? "Aún no hay recetas. Crea la primera."
              : "Sin resultados en esta búsqueda."}
          </p>
          {items.length === 0 && (
            <Link
              href="/cocina/recetas/nuevo"
              className="inline-block rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors"
            >
              + Nueva receta
            </Link>
          )}
        </div>
      ) : vista === "costeo" ? (
        <div className="space-y-2">
          {filtered.map((r) => {
            const { porPorcion } = calcularCostoReceta(r, insumos, items);
            if (r.esSubreceta) {
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl bg-marfil-light ring-1 ring-marfil px-4 py-3"
                >
                  <Link href={`/cocina/recetas/${r.id}`} className="flex-1 min-w-0">
                    <div className="font-medium text-cacao">
                      {r.nombre}
                      <span className="ml-2 text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-white text-cacao-mute ring-1 ring-marfil">
                        sub-receta
                      </span>
                    </div>
                    <div className="text-xs text-cacao-mute">no se vende directo</div>
                  </Link>
                  <div className="text-right">
                    <div className="font-cinzel text-cacao">${porPorcion.toFixed(2)}</div>
                    <div className="text-[10px] text-cacao-mute">costo /porc.</div>
                  </div>
                </div>
              );
            }
            const precio = r.precioSugeridoUsd;
            const margen =
              precio && precio > 0 && porPorcion > 0
                ? ((precio - porPorcion) / precio) * 100
                : null;
            const sem =
              margen == null
                ? { cls: "bg-marfil-light text-cacao-soft", dot: "bg-cacao-mute", txt: "Sin precio" }
                : margen >= margenVerdeMin
                  ? { cls: "bg-[#E4F3EA] text-[#2E9E5B]", dot: "bg-[#2E9E5B]", txt: "Buena ganancia" }
                  : margen >= margenAmarilloMin
                    ? { cls: "bg-[#FBEEDD] text-[#A16207]", dot: "bg-[#E0892A]", txt: "Cuidado" }
                    : { cls: "bg-[#FBE5E1] text-[#D64534]", dot: "bg-[#D64534]", txt: "Casi no ganas" };
            return (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-xl bg-white ring-1 ring-marfil px-4 py-3"
              >
                <Link href={`/cocina/recetas/${r.id}`} className="flex-1 min-w-0">
                  <div className="font-medium text-cacao truncate">{r.nombre}</div>
                  <div className="text-xs text-cacao-mute">
                    Costo ${porPorcion.toFixed(2)} /porc.
                    {margen != null && ` · margen ${margen.toFixed(0)}%`}
                  </div>
                </Link>
                <div className="flex flex-col items-end gap-1.5">
                  <div className="flex items-center rounded-lg ring-1 ring-marfil bg-marfil-soft px-2 h-9">
                    <span className="text-cacao-mute font-bold text-sm">$</span>
                    <input
                      inputMode="decimal"
                      aria-label={`Precio de ${r.nombre}`}
                      value={
                        precioDraft[r.id] ??
                        (r.precioSugeridoUsd != null ? String(r.precioSugeridoUsd) : "")
                      }
                      onChange={(e) => onPrecioInput(r.id, e.target.value)}
                      onBlur={() => onPrecioBlur(r.id)}
                      placeholder="0.00"
                      className="w-16 bg-transparent text-right font-bold text-cacao focus:outline-none tabular-nums"
                    />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${sem.cls}`}
                  >
                    <span className={`h-2 w-2 rounded-full ${sem.dot}`} />
                    {sem.txt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map((r) => {
            const { total, porPorcion } = calcularCostoReceta(r, insumos, items);
            const margen =
              r.precioSugeridoUsd && r.precioSugeridoUsd > 0 && porPorcion > 0
                ? ((r.precioSugeridoUsd - porPorcion) / r.precioSugeridoUsd) *
                  100
                : null;
            return (
              <Link
                key={r.id}
                data-receta-id={r.id}
                href={`/cocina/recetas/${r.id}`}
                className={`block rounded-2xl ring-1 p-5 transition-all ${
                  r.esSubreceta
                    ? "bg-marfil-light ring-marfil hover:bg-marfil"
                    : "bg-white ring-marfil hover:bg-marfil-soft"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute">
                    {r.esSubreceta
                      ? "Sub-receta"
                      : r.categoria
                        ? categoriaRecetaLabel(r.categoria)
                        : "Receta"}
                  </div>
                  <div className="text-xs text-cacao-soft">
                    {r.esSubreceta && r.rendimiento
                      ? `rinde ${r.rendimiento} ${r.rendimientoUnidad ?? ""}`
                      : `${r.porciones} porc.`}
                  </div>
                </div>
                <h2 className="mt-2 font-cinzel text-lg text-cacao">
                  {r.nombre}
                  {!r.activo && (
                    <span className="align-middle ml-2 text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil">
                      Inactiva
                    </span>
                  )}
                </h2>
                {r.perfil && (
                  <p className="mt-1 font-serif italic text-sm text-cacao-soft">
                    {r.perfil}
                  </p>
                )}
                <div className="mt-3 text-xs text-cacao-mute">
                  {r.ingredientes.length} ingrediente
                  {r.ingredientes.length !== 1 && "s"}
                </div>
                <div className="mt-3 border-t border-marfil pt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-cacao-mute uppercase tracking-widest">
                      Costo
                    </div>
                    <div className="text-cacao font-medium">
                      ${porPorcion.toFixed(2)}
                      <span className="text-cacao-mute"> /porc.</span>
                    </div>
                    {r.porciones > 1 && (
                      <div className="text-cacao-mute">
                        ${total.toFixed(2)} total
                      </div>
                    )}
                  </div>
                  <div>
                    {r.precioSugeridoUsd ? (
                      <>
                        <div className="text-cacao-mute uppercase tracking-widest">
                          P. sugerido
                        </div>
                        <div className="text-cacao font-medium">
                          ${r.precioSugeridoUsd.toFixed(2)}
                          <span className="text-[10px] text-cacao-mute ml-1">
                            s/IVA
                          </span>
                        </div>
                        <div className="text-[10px] text-cacao-soft">
                          ${precioConIva(r.precioSugeridoUsd, ivaPorc).toFixed(2)}{" "}
                          c/IVA
                        </div>
                        {margen !== null && (
                          <div
                            className={`text-[10px] mt-0.5 ${margen >= margenVerdeMin ? "text-[#15803D]" : margen >= margenAmarilloMin ? "text-[#A16207]" : "text-terracotta"}`}
                          >
                            margen {margen.toFixed(0)}%
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-cacao-mute text-[10px]">
                        Sin precio definido
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
