"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { WarningIcon } from "@/components/icons";
import {
  CATEGORIAS_RECETA,
  SECCIONES,
  precioConIva,
  precioSinIva,
  categoriaInsumoLabel,
  categoriaRecetaLabel,
  type Insumo,
  type Receta,
  type RecetaIngrediente,
  type Seccion,
} from "@/lib/types";
import {
  createReceta,
  updateReceta,
  subirFotoReceta,
  listRecetas,
  costoPorUnidadSubreceta,
} from "@/lib/data/recetas";
import { listInsumos } from "@/lib/data/cocina";
import { getCocinaConfig } from "@/lib/data/cocinaConfig";
import { listCategoriasProducto, createCategoriaProducto, type CategoriaProducto } from "@/lib/data/categorias";
import { extractError } from "@/lib/data/error";
import { normalizarBusqueda } from "@/lib/text";
import { UnitCalculator } from "@/components/UnitCalculator";
import { UnidadSelect } from "@/components/UnidadSelect";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  convertirParaCosto,
  areCompatible,
  dimension,
  ordenarPorCantidadDesc,
  unidadesEnUso,
} from "@/lib/units";

type LineForm = {
  key: string;
  insumoId?: string;
  subrecetaId?: string;
  nombre: string;
  cantidad: string;
  unidad: string;
  observaciones: string;
  costoManual: string; // precio manual por unidad para ad-hoc
  sinInsumoOk: boolean; // ingrediente libre a propósito (agua, etc.)
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function lineFromIng(i: RecetaIngrediente): LineForm {
  return {
    key: uid(),
    insumoId: i.insumoId,
    subrecetaId: i.subrecetaId,
    nombre: i.nombre,
    cantidad: String(i.cantidad),
    unidad: i.unidad,
    observaciones: i.observaciones ?? "",
    costoManual:
      i.costoManualUsd !== undefined ? String(i.costoManualUsd) : "",
    sinInsumoOk: i.sinInsumoOk ?? false,
  };
}

export function RecetaForm({
  existing,
  onSaved,
}: {
  existing?: Receta;
  onSaved?: (r: Receta) => void;
}) {
  const router = useRouter();
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [recetasContexto, setRecetasContexto] = useState<Receta[]>([]);
  // Categorías definidas por el usuario (gestionadas en Administración). Se
  // comparten entre módulos; aquí alimentan el desplegable de categoría.
  const [categoriasUser, setCategoriasUser] = useState<CategoriaProducto[]>([]);
  const [loadingIns, setLoadingIns] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  /** Quick search dentro del catálogo de insumos. */
  const [insumoSearch, setInsumoSearch] = useState("");

  const [nombre, setNombre] = useState(existing?.nombre ?? "");
  const [seccion, setSeccion] = useState<Seccion>(existing?.seccion ?? "cafetin");
  const [categoria, setCategoria] = useState<string>(
    existing?.categoria ?? "",
  );
  // true cuando el usuario eligió "+ Nueva categoría…" en el desplegable.
  const [creandoCategoria, setCreandoCategoria] = useState(false);
  const [perfil, setPerfil] = useState(existing?.perfil ?? "");
  const [porciones, setPorciones] = useState(
    String(existing?.porciones ?? 1),
  );
  const [tiempoPrep, setTiempoPrep] = useState(
    existing?.tiempoPrepMin ? String(existing.tiempoPrepMin) : "",
  );
  const [tiempoCoc, setTiempoCoc] = useState(
    existing?.tiempoCoccionMin ? String(existing.tiempoCoccionMin) : "",
  );
  const [temperatura, setTemperatura] = useState(existing?.temperatura ?? "");
  const [procedimiento, setProcedimiento] = useState(
    existing?.procedimiento ?? "",
  );
  const [presentacion, setPresentacion] = useState(existing?.presentacion ?? "");
  const [notasChef, setNotasChef] = useState(existing?.notasChef ?? "");
  const [variaciones, setVariaciones] = useState(existing?.variaciones ?? "");
  // Foto de la receta (se muestra en el detalle y en el PDF).
  const [fotoUrl, setFotoUrl] = useState(existing?.fotoUrl ?? "");
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // Precio sugerido SIN IVA (es el canónico que se guarda en DB).
  const [precioSugerido, setPrecioSugerido] = useState(
    existing?.precioSugeridoUsd ? String(existing.precioSugeridoUsd) : "",
  );
  // % IVA cargado desde cocina_config (default 16). Lo usamos para sincronizar
  // sin↔con IVA en el input.
  const [ivaPorc, setIvaPorc] = useState(16);
  // Sub-receta flags
  const [esSubreceta, setEsSubreceta] = useState<boolean>(
    existing?.esSubreceta ?? false,
  );
  const [rendimiento, setRendimiento] = useState(
    existing?.rendimiento ? String(existing.rendimiento) : "",
  );
  const [rendimientoUnidad, setRendimientoUnidad] = useState(
    existing?.rendimientoUnidad ?? "g",
  );

  const [lineas, setLineas] = useState<LineForm[]>(
    existing?.ingredientes.map(lineFromIng) ?? [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ins, recs, cfg, cats] = await Promise.all([
          listInsumos(),
          listRecetas(),
          getCocinaConfig(),
          listCategoriasProducto().catch(() => [] as CategoriaProducto[]),
        ]);
        if (!cancelled) {
          setInsumos(ins);
          setRecetasContexto(recs);
          setIvaPorc(cfg.ivaPorc);
          setCategoriasUser(cats);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      } finally {
        if (!cancelled) setLoadingIns(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Subrecetas disponibles (excluyendo la actual si estás editándola)
  const subrecetasDisponibles = useMemo(() => {
    return recetasContexto
      .filter((r) => r.esSubreceta && r.activo && r.id !== existing?.id)
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [recetasContexto, existing?.id]);

  const subrecetasMap = useMemo(
    () => new Map(subrecetasDisponibles.map((r) => [r.id, r])),
    [subrecetasDisponibles],
  );

  const insumosMap = useMemo(
    () => new Map(insumos.map((i) => [i.id, i])),
    [insumos],
  );

  // Unidades base que ya existen en el sistema (insumos + recetas), para el
  // desplegable, además de las estándar (ej. "scoops"). Las recetas se miden en
  // unidad base, así que aquí NO van unidades de compra.
  const unidadesBase = useMemo(
    () => unidadesEnUso(insumos, recetasContexto).base,
    [insumos, recetasContexto],
  );

  // Categorías para el desplegable: las sugeridas (por su slug) + cualquier
  // categoría nueva que ya exista en otras recetas. Cada opción se muestra con
  // su etiqueta legible vía categoriaRecetaLabel().
  const categoriasDisponibles = useMemo(() => {
    // Base: solo las categorías marcadas como de RECETA (aplica_receta). Las de
    // solo-venta (alquileres, pádel, reventa, consignación) no salen aquí.
    // Si la tabla está vacía o sin migrar, caemos a la lista fija de código.
    const recetaCats = categoriasUser.filter((c) => c.aplicaReceta !== false);
    const conocidas =
      categoriasUser.length > 0
        ? recetaCats.map((c) => c.nombre)
        : CATEGORIAS_RECETA.map((c) => c.value as string);
    const conocidasNorm = new Set(
      conocidas.map((c) => c.trim().toLowerCase()),
    );
    // Cualquier categoría ya usada por otra receta que no esté en la lista.
    const set = new Set<string>();
    recetasContexto.forEach((r) => {
      if (r.categoria && !conocidasNorm.has(r.categoria.trim().toLowerCase()))
        set.add(r.categoria);
    });
    const nuevas = Array.from(set).sort((a, b) =>
      categoriaRecetaLabel(a).localeCompare(categoriaRecetaLabel(b)),
    );
    return [...conocidas, ...nuevas];
  }, [recetasContexto, categoriasUser]);

  // Agrupar insumos por categoría, ordenados según CATEGORIAS_INSUMO
  const insumosPorCategoria = useMemo(() => {
    // Quick search: match por nombre del insumo o por label de su categoría.
    // Normalizamos (lowercase + sin acentos) para que "cafe" matchee "Café".
    const q = normalizarBusqueda(insumoSearch.trim());
    const normalize = normalizarBusqueda;

    const map = new Map<string, Insumo[]>();
    for (const ins of insumos) {
      if (!ins.activo) continue;
      if (q) {
        const catLabel = categoriaInsumoLabel(ins.categoria);
        const haystack = `${normalize(ins.nombre)} ${normalize(catLabel)}`;
        if (!haystack.includes(q)) continue;
      }
      if (!map.has(ins.categoria)) map.set(ins.categoria, []);
      map.get(ins.categoria)!.push(ins);
    }
    // Ordenar cada grupo alfabéticamente
    for (const arr of map.values()) {
      arr.sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    // Devolver agrupado por categoría (cualquiera, incluidas las nuevas),
    // ordenado por etiqueta de categoría.
    return Array.from(map.entries())
      .map(([categoria, items]) => ({ categoria, items }))
      .filter((g) => g.items.length > 0)
      .sort((a, b) =>
        categoriaInsumoLabel(a.categoria).localeCompare(
          categoriaInsumoLabel(b.categoria),
        ),
      );
  }, [insumos, insumoSearch]);

  /** Clave de la última línea agregada — se usa para hacer scroll + focus
   *  automático al input de cantidad. Así el usuario no tiene que bajar a
   *  ver si se agregó el ingrediente: el sistema lo lleva. */
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null);

  function addLineFromSubreceta(sub: Receta) {
    const key = uid();
    setLineas((prev) => [
      ...prev,
      {
        key,
        subrecetaId: sub.id,
        nombre: sub.nombre,
        cantidad: "1",
        // Arranca con la unidad de rendimiento de la subreceta (ej: "g" de pesto).
        // Es la unidad natural de la subreceta, así el cálculo cuadra por defecto.
        // El usuario puede cambiarla con un toque en los chips (kg, ml...).
        unidad: sub.rendimientoUnidad ?? "",
        observaciones: "",
        costoManual: "",
        sinInsumoOk: false,
      },
    ]);
    setLastAddedKey(key);
  }

  function addLineFromInsumo(insumo: Insumo) {
    const key = uid();
    setLineas((prev) => [
      ...prev,
      {
        key,
        insumoId: insumo.id,
        nombre: insumo.nombre,
        cantidad: "1",
        // Arranca con la unidad BASE del propio insumo (ej: "g", "ml", "unidad").
        // Es seguro por construcción: al ser la unidad propia del insumo, la
        // conversión es factor 1 y nunca se descuadra. Si el usuario quiere otra
        // (kg, L...), la cambia con un toque en los chips y el sistema convierte.
        // Antes quedaba en blanco y, sin unidad, el costo/consumo asumía la base
        // en silencio → error de 1000× (2 "kg" tratados como 2 g).
        unidad: insumo.unidadBase,
        observaciones: "",
        costoManual: "",
        sinInsumoOk: false,
      },
    ]);
    setLastAddedKey(key);
  }

  function addLineAdHoc() {
    const key = uid();
    setLineas((prev) => [
      ...prev,
      {
        key,
        nombre: "",
        cantidad: "1",
        unidad: "g",
        observaciones: "",
        costoManual: "",
        sinInsumoOk: false,
      },
    ]);
    setLastAddedKey(key);
  }

  // Cuando agregamos una línea: scroll suave hacia ella + focus + select del
  // input de cantidad para que el usuario escriba directo (sobrescribe el "1").
  useEffect(() => {
    if (!lastAddedKey) return;
    requestAnimationFrame(() => {
      const wrapper = document.querySelector<HTMLElement>(
        `[data-linea-key="${lastAddedKey}"]`,
      );
      if (!wrapper) return;
      wrapper.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight breve para confirmación visual
      wrapper.classList.add("ring-2", "ring-terracotta");
      setTimeout(() => {
        wrapper.classList.remove("ring-2", "ring-terracotta");
      }, 1500);
      // Focus + select del primer input de cantidad
      const cantInput = wrapper.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      if (cantInput) {
        cantInput.focus({ preventScroll: true });
        cantInput.select();
      }
      setLastAddedKey(null);
    });
  }, [lastAddedKey]);

  function updateLine(key: string, patch: Partial<LineForm>) {
    setLineas((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const next = { ...l, ...patch };
        // Si cambia insumoId, autorrellenar unidad
        if (patch.insumoId !== undefined) {
          const ins = insumosMap.get(patch.insumoId);
          if (ins) {
            next.unidad = ins.unidadBase;
            if (!l.nombre.trim()) next.nombre = ins.nombre;
          }
        }
        return next;
      }),
    );
  }

  function removeLine(key: string) {
    setLineas((prev) => prev.filter((l) => l.key !== key));
  }

  // Sube la foto elegida al bucket público y la deja en el form (vista previa).
  async function onSelectFoto(file: File | null) {
    if (!file) return;
    setError(null);
    setSubiendoFoto(true);
    try {
      const url = await subirFotoReceta(file);
      setFotoUrl(url);
    } catch (e) {
      setError(extractError(e, "Error subiendo la foto"));
    } finally {
      setSubiendoFoto(false);
    }
  }

  // Costo por unidad base de cada subreceta, con la MISMA función recursiva del
  // backend (costoPorUnidadSubreceta). Así el costo en vivo incluye subrecetas
  // anidadas (antes se ignoraban y contaban como $0). Se calcula una sola vez y
  // se reutiliza en los 3 lugares del form que muestran costo de subrecetas.
  const costoUnidadSub = useMemo(() => {
    const m = new Map<string, number>();
    for (const sub of subrecetasDisponibles) {
      m.set(sub.id, costoPorUnidadSubreceta(sub.id, recetasContexto, insumos));
    }
    return m;
  }, [subrecetasDisponibles, recetasContexto, insumos]);

  // Cálculo en vivo del costo de la receta (insumo + subreceta + ad-hoc).
  const costo = useMemo(() => {
    let total = 0;
    lineas.forEach((l) => {
      const cant = Number(l.cantidad) || 0;
      if (l.insumoId) {
        const ins = insumosMap.get(l.insumoId);
        if (ins && ins.precioBaseUsd !== null) {
          // Convertimos la cantidad declarada en la receta a la unidad base
          // del insumo antes de multiplicar por el precio.
          const conv = convertirParaCosto(cant, l.unidad, ins.unidadBase);
          const cantBase = conv?.resultado ?? cant;
          total += cantBase * ins.precioBaseUsd;
          return;
        }
      }
      if (l.subrecetaId) {
        const u = costoUnidadSub.get(l.subrecetaId);
        if (u && u > 0) {
          // Si la receta padre pide la subreceta en L y la subreceta rinde en ml,
          // convertimos antes de multiplicar.
          const subR = subrecetasMap.get(l.subrecetaId);
          const unidadDest = subR?.rendimientoUnidad ?? l.unidad;
          const conv = convertirParaCosto(cant, l.unidad, unidadDest);
          const cantBase = conv?.resultado ?? cant;
          total += cantBase * u;
          return;
        }
      }
      const manual = Number(l.costoManual) || 0;
      if (manual > 0) total += cant * manual;
    });
    const porc = Number(porciones) || 1;
    return { total, porPorcion: total / porc };
  }, [lineas, insumosMap, porciones, costoUnidadSub, subrecetasMap]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) {
      setError("La receta necesita un nombre.");
      return;
    }
    // Validaciones específicas para sub-receta
    if (esSubreceta) {
      const rendNum = Number(rendimiento);
      if (!rendimiento || !Number.isFinite(rendNum) || rendNum <= 0) {
        setError(
          "Las sub-recetas requieren un rendimiento mayor a 0 (ej: 200 g, 500 ml). Llénalo en la sección de Tipo de receta.",
        );
        return;
      }
      if (!rendimientoUnidad || !rendimientoUnidad.trim()) {
        setError(
          "Las sub-recetas requieren una unidad de rendimiento (ej: g, ml, unidad).",
        );
        return;
      }
    }
    // Red de seguridad: ninguna línea con cantidad puede quedar sin unidad.
    // Sin unidad el costo/consumo asume la unidad base en silencio y puede dar
    // un error de 1000× (ej: 2 "kg" tratados como 2 g). Mejor frenar y avisar.
    const sinUnidad = lineas.find(
      (l) =>
        l.nombre.trim().length > 0 &&
        (Number(l.cantidad) || 0) > 0 &&
        !l.unidad.trim(),
    );
    if (sinUnidad) {
      setError(
        `Falta la unidad en "${sinUnidad.nombre.trim()}". Elígela en el desplegable (g, kg, ml, unidad...) antes de guardar.`,
      );
      return;
    }
    // Prevención: un ingrediente sin insumo del catálogo NO descuenta stock al
    // vender. Se frena el guardado hasta que se decida a conciencia: vincularlo
    // a un insumo, o marcar la casilla "va así a propósito" (agua de filtro, etc.).
    const sinDecidir = lineas.find(
      (l) =>
        !l.insumoId &&
        !l.subrecetaId &&
        l.nombre.trim() !== "" &&
        !l.sinInsumoOk,
    );
    if (sinDecidir) {
      setError(
        `"${sinDecidir.nombre.trim()}" no está vinculado a un insumo del catálogo, así que no descontaría stock al vender. Vincúlalo desde el buscador de insumos, o —si es intencional (ej: agua de filtro)— marca la casilla "Ingrediente sin insumo (intencional)" en esa línea.`,
      );
      return;
    }
    setError(null);
    setSaving(true);
    try {
      // Si el usuario tipeó una categoría nueva, la registramos en el catálogo
      // compartido (Administración) para que quede disponible en todos lados.
      const catNueva = categoria.trim();
      if (
        catNueva &&
        !categoriasUser.some(
          (c) => c.nombre.trim().toLowerCase() === catNueva.toLowerCase(),
        )
      ) {
        try {
          // Creada desde el Recetario → es categoría de receta.
          const c = await createCategoriaProducto(catNueva, 500, true);
          setCategoriasUser((prev) => [...prev, c]);
        } catch {
          /* si falla (tabla ausente, duplicada), la receta igual se guarda */
        }
      }
      const rendNum = Number(rendimiento);
      const input = {
        nombre: nombre.trim(),
        seccion,
        categoria: categoria.trim() || undefined,
        perfil: perfil.trim() || undefined,
        porciones: Number(porciones) || 1,
        tiempoPrepMin: tiempoPrep ? Number(tiempoPrep) : undefined,
        tiempoCoccionMin: tiempoCoc ? Number(tiempoCoc) : undefined,
        temperatura: temperatura.trim() || undefined,
        procedimiento: procedimiento.trim() || undefined,
        presentacion: presentacion.trim() || undefined,
        notasChef: notasChef.trim() || undefined,
        variaciones: variaciones.trim() || undefined,
        fotoUrl: fotoUrl.trim() || undefined,
        precioSugeridoUsd: precioSugerido
          ? Number(precioSugerido)
          : undefined,
        esSubreceta,
        rendimiento:
          esSubreceta && Number.isFinite(rendNum) && rendNum > 0
            ? rendNum
            : undefined,
        rendimientoUnidad:
          esSubreceta && rendimientoUnidad.trim()
            ? rendimientoUnidad.trim()
            : undefined,
        // Se guardan ordenados de MAYOR a MENOR cantidad (en unidad base),
        // así el orden queda persistido y se re-ordena solo al agregar uno.
        ingredientes: ordenarPorCantidadDesc(
          lineas
            .filter((l) => l.nombre.trim().length > 0)
            .map((l) => ({
              insumoId: l.insumoId,
              subrecetaId: l.subrecetaId,
              nombre: l.nombre.trim(),
              cantidad: Number(l.cantidad) || 0,
              unidad: l.unidad,
              observaciones: l.observaciones.trim() || undefined,
              costoManualUsd:
                !l.insumoId && !l.subrecetaId && l.costoManual.trim() !== ""
                  ? Number(l.costoManual)
                  : undefined,
              // Solo tiene sentido en líneas libres (sin insumo ni subreceta).
              sinInsumoOk:
                !l.insumoId && !l.subrecetaId ? l.sinInsumoOk : false,
            })),
        ).map((ing, i) => ({ ...ing, orden: i })),
      };
      if (existing) {
        const upd = await updateReceta(existing.id, input);
        if (onSaved) {
          onSaved(upd);
        } else {
          // Quedarse en el form de edición con banner de éxito en vez de
          // navegar al detalle — así el usuario no pierde su scroll/posición.
          setInfo(
            `Receta guardada (${upd.ingredientes.length} ingredientes).`,
          );
          // Auto-cerrar el banner en 4s
          setTimeout(() => setInfo(null), 4000);
        }
        setSaving(false);
      } else {
        const created = await createReceta(input);
        // Redirigir a la lista con highlight para que la página haga scroll
        // automático a la receta recién creada (mismo patrón que insumos).
        router.push(`/cocina/recetas?highlight=${created.id}`);
        // No reseteamos saving — navegamos away
      }
    } catch (e) {
      // Log completo en consola para diagnóstico
      console.error("Error guardando receta:", e);
      setError(extractError(e, "Error guardando receta"));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <ErrorBanner className="sticky top-4 z-30 shadow-sm">{error}</ErrorBanner>
      )}
      {info && (
        <div className="sticky top-4 z-30 rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F] shadow-sm">
          ✓ {info}
        </div>
      )}

      <UnitCalculator />

      {/* Tipo de receta — toggle entre normal y subreceta */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Tipo de receta
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setEsSubreceta(false)}
            className={`text-left p-4 rounded-xl ring-1 transition-colors ${
              !esSubreceta
                ? "bg-marfil-soft ring-cacao"
                : "bg-white ring-marfil hover:bg-marfil-soft"
            }`}
          >
            <div className="font-medium text-cacao">Receta normal</div>
            <div className="text-xs text-cacao-soft mt-1">
              Plato, bebida o snack que se vende directamente al cliente.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setEsSubreceta(true)}
            className={`text-left p-4 rounded-xl ring-1 transition-colors ${
              esSubreceta
                ? "bg-marfil-soft ring-cacao"
                : "bg-white ring-marfil hover:bg-marfil-soft"
            }`}
          >
            <div className="font-medium text-cacao">Sub-receta</div>
            <div className="text-xs text-cacao-soft mt-1">
              Preparación (salsa, mezcla, masa) que se usa como ingrediente de
              otras recetas. No se vende sola.
            </div>
          </button>
        </div>
        {esSubreceta && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Rendimiento (cuánto produce 1 batch)
              <input
                type="number"
                step="0.0001"
                min="0"
                placeholder="200"
                value={rendimiento}
                onChange={(e) => setRendimiento(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Unidad del rendimiento
              <UnidadSelect
                value={rendimientoUnidad}
                onChange={(v) => setRendimientoUnidad(v)}
                unidadesExtra={unidadesBase}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
              />
            </label>
            <p className="sm:col-span-2 text-xs text-cacao-soft italic font-serif">
              Ej: la salsa pesto rinde <strong>200 g</strong> por batch. Cuando
              la uses en otra receta, podrás decir &ldquo;30 g de pesto&rdquo; y
              el sistema sabrá qué fracción de los ingredientes consumir.
            </p>
          </div>
        )}
      </section>

      {/* Datos básicos */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Datos
        </h2>
        <input
          type="text"
          placeholder="Nombre de la receta"
          required
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <input
          type="text"
          placeholder="Perfil (ej: tropical · cremoso · refrescante)"
          value={perfil}
          onChange={(e) => setPerfil(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />

        {/* Foto del plato — se muestra en el detalle y grande en el PDF. */}
        <div className="rounded-lg ring-1 ring-marfil bg-marfil-soft p-3">
          <div className="text-sm text-cacao font-medium mb-2">
            Foto del plato{" "}
            <span className="text-cacao-mute font-normal">
              (se muestra en el detalle y en el PDF)
            </span>
          </div>
          <div className="flex items-start gap-3">
            <div className="shrink-0">
              {fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={fotoUrl}
                  alt="Foto de la receta"
                  className="h-28 w-40 rounded-lg object-cover bg-white ring-1 ring-marfil"
                />
              ) : (
                <div className="h-28 w-40 rounded-lg ring-1 ring-dashed ring-marfil bg-white flex items-center justify-center text-xs text-cacao-mute">
                  Sin foto
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="cursor-pointer rounded-lg bg-white ring-1 ring-marfil px-3 py-1.5 text-sm text-cacao hover:bg-marfil-soft text-center">
                {subiendoFoto
                  ? "Subiendo…"
                  : fotoUrl
                    ? "Cambiar foto"
                    : "Subir foto"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendoFoto}
                  onChange={(e) => {
                    onSelectFoto(e.target.files?.[0] ?? null);
                    e.target.value = "";
                  }}
                />
              </label>
              {fotoUrl && (
                <button
                  type="button"
                  onClick={() => setFotoUrl("")}
                  className="text-xs uppercase tracking-widest text-cacao-mute hover:text-terracotta"
                >
                  Quitar
                </button>
              )}
              <span className="text-[10px] text-cacao-mute">
                Horizontal se ve mejor. Máx 5 MB.
              </span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm text-cacao">
            Sección
            <select
              value={seccion}
              onChange={(e) => setSeccion(e.target.value as Seccion)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
            >
              {SECCIONES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-cacao">
            Categoría
            <select
              value={creandoCategoria ? "__nueva__" : categoria}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__nueva__") {
                  setCreandoCategoria(true);
                  setCategoria("");
                } else {
                  setCreandoCategoria(false);
                  setCategoria(v);
                }
              }}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
            >
              <option value="">— Sin categoría —</option>
              {categoriasDisponibles.map((c) => (
                <option key={c} value={c}>
                  {categoriaRecetaLabel(c)}
                </option>
              ))}
              <option value="__nueva__">+ Nueva categoría…</option>
            </select>
            {creandoCategoria && (
              <input
                type="text"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Nombre de la categoría nueva"
                autoFocus
                autoCapitalize="words"
                spellCheck={false}
                className="mt-2 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            )}
          </label>
          <label className="text-sm text-cacao">
            Porciones
            <input
              type="number"
              min="1"
              value={porciones}
              onChange={(e) => setPorciones(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
        </div>
        {esSubreceta &&
          (() => {
            const rN = Number(rendimiento);
            const pN = Number(porciones);
            if (!(rN > 0) || !(pN > 0)) return null;
            const pp = rN / pN;
            return (
              <p className="text-xs text-cacao-soft italic font-serif">
                Cada porción de esta subreceta = {formatCantConv(rN)} ÷ {pN} ={" "}
                <strong className="not-italic text-cacao">
                  {formatCantConv(pp)} {rendimientoUnidad}
                </strong>
                . Para que su plan de producción baje{" "}
                <strong className="not-italic text-cacao">1 por venta</strong>,
                los platos que la usen deberían llevar ~{formatCantConv(pp)}{" "}
                {rendimientoUnidad}.
              </p>
            );
          })()}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <label className="text-sm text-cacao">
            Tiempo prep (min)
            <input
              type="number"
              min="0"
              value={tiempoPrep}
              onChange={(e) => setTiempoPrep(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao">
            Tiempo cocción (min)
            <input
              type="number"
              min="0"
              value={tiempoCoc}
              onChange={(e) => setTiempoCoc(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao">
            Temperatura
            <input
              type="text"
              placeholder="180°C"
              value={temperatura}
              onChange={(e) => setTemperatura(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          {!esSubreceta && (
            <div className="sm:col-span-2 text-sm text-cacao space-y-1">
              <div className="text-sm">Precio sugerido (USD)</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
                    Sin IVA
                  </span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    placeholder="Ej: 8.62"
                    value={precioSugerido}
                    onChange={(e) => setPrecioSugerido(e.target.value)}
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
                    Con IVA {ivaPorc}% (carta)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ej: 10.00"
                    value={
                      precioSugerido
                        ? precioConIva(
                            Number(precioSugerido),
                            ivaPorc,
                          ).toFixed(2)
                        : ""
                    }
                    onChange={(e) => {
                      const conIva = Number(e.target.value);
                      if (!Number.isFinite(conIva) || conIva <= 0) {
                        setPrecioSugerido("");
                        return;
                      }
                      // Derivamos el sin IVA y lo guardamos (es lo canónico).
                      setPrecioSugerido(
                        precioSinIva(conIva, ivaPorc).toFixed(4),
                      );
                    }}
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                </label>
              </div>
              <span className="text-[10px] text-cacao-mute block">
                Edita cualquiera de los dos — el otro se calcula. El sistema
                guarda el precio sin IVA; el IVA se aplica solo en carta.
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Selector de sub-recetas (separado del catálogo de insumos) */}
      {subrecetasDisponibles.length > 0 && (
        <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
          <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-1">
            Agregar sub-receta como ingrediente
          </h2>
          <p className="text-xs text-cacao-soft italic font-serif mb-3">
            Preparaciones (salsas, mezclas) que se usan dentro de esta receta.
          </p>
          <div className="max-h-64 overflow-y-auto border border-marfil rounded-lg divide-y divide-marfil">
            {subrecetasDisponibles.map((sub) => {
              // Costo por unidad (recursivo, incluye subrecetas anidadas).
              const costoUnit = costoUnidadSub.get(sub.id) ?? 0;
              const unidadDisplay = sub.rendimientoUnidad ?? "porción";
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => addLineFromSubreceta(sub)}
                  className="w-full text-left px-3 py-2 hover:bg-marfil-soft transition-colors flex items-baseline justify-between gap-3"
                >
                  <span className="text-sm text-cacao">{sub.nombre}</span>
                  <span className="text-xs text-cacao-mute shrink-0">
                    {costoUnit > 0
                      ? `$${costoUnit.toFixed(5)}/${unidadDisplay}`
                      : "sin costo (revisar ingredientes)"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Selector de insumos */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Agregar ingredientes del catálogo
        </h2>
        {/* Quick search */}
        {!loadingIns && insumos.some((i) => i.activo) && (
          <div className="relative mb-2">
            <input
              type="text"
              placeholder="Buscar insumo por nombre o categoría…"
              value={insumoSearch}
              onChange={(e) => setInsumoSearch(e.target.value)}
              className="w-full rounded-lg ring-1 ring-marfil pl-9 pr-9 py-2 text-sm bg-marfil-soft focus:bg-white focus:ring-cacao focus:outline-none transition-colors"
            />
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-cacao-mute text-sm pointer-events-none"
              aria-hidden
            >
              ⌕
            </span>
            {insumoSearch && (
              <button
                type="button"
                onClick={() => setInsumoSearch("")}
                aria-label="Limpiar búsqueda"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-cacao-mute hover:text-cacao text-lg leading-none px-1"
              >
                ×
              </button>
            )}
          </div>
        )}
        {loadingIns ? (
          <div className="text-sm text-cacao-soft">Cargando catálogo...</div>
        ) : insumosPorCategoria.length === 0 ? (
          <div className="text-sm text-cacao-soft italic font-serif">
            {insumoSearch
              ? `Sin resultados para "${insumoSearch}".`
              : "No hay insumos activos en el catálogo."}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto border border-marfil rounded-lg divide-y divide-marfil">
            {insumosPorCategoria.map(({ categoria, items }) => (
              <div key={categoria}>
                <div className="sticky top-0 z-10 px-3 py-2 bg-marfil-light border-b border-marfil">
                  <span className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute">
                    {categoriaInsumoLabel(categoria)}
                  </span>
                  <span className="ml-2 text-[10px] text-cacao-mute">
                    ({items.length})
                  </span>
                </div>
                <ul className="divide-y divide-marfil/70">
                  {items.map((ins) => (
                    <li key={ins.id}>
                      <button
                        type="button"
                        onClick={() => addLineFromInsumo(ins)}
                        className="w-full text-left px-3 py-2 hover:bg-marfil-soft transition-colors flex items-baseline justify-between gap-3"
                      >
                        <span className="text-sm text-cacao">{ins.nombre}</span>
                        <span className="text-xs text-cacao-mute shrink-0">
                          {ins.precioBaseUsd !== null
                            ? `$${ins.precioBaseUsd.toFixed(5)}/${ins.unidadBase}`
                            : "sin precio"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={addLineAdHoc}
          className="mt-3 text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
        >
          + Agregar ingrediente libre (fuera del catálogo)
        </button>
      </section>

      {/* Líneas de la receta */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Ingredientes de la receta
        </h2>
        {lineas.length === 0 ? (
          <p className="text-sm text-cacao-soft italic font-serif">
            Selecciona ingredientes del catálogo arriba.
          </p>
        ) : (
          <div className="space-y-2">
            {lineas.map((l) => {
              const ins = l.insumoId ? insumosMap.get(l.insumoId) : null;
              const subR = l.subrecetaId
                ? subrecetasMap.get(l.subrecetaId)
                : null;
              const cant = Number(l.cantidad) || 0;
              const manual = Number(l.costoManual) || 0;
              // Precio por unidad de la subreceta (recursivo, incluye
              // subrecetas anidadas). Ej: aderezo cesar cuesta $6.34 y rinde
              // 500g → $0.01269/g.
              const subUnitPrice = subR
                ? (costoUnidadSub.get(subR.id) ?? 0)
                : 0;
              // Calculamos el subtotal usando la misma lógica de conversión
              // que el backend (recetas.ts → calcularCostoRecetaInterno). Si la
              // unidad del ingrediente difiere de la del insumo (o de la
              // unidad de rendimiento de la subreceta), se convierte.
              let sub = 0;
              let conversionInfo: {
                cantidadConvertida: number;
                unidadDestino: string;
                compatibles: boolean;
              } | null = null;

              if (ins && ins.precioBaseUsd !== null) {
                const conv = convertirParaCosto(
                  cant,
                  l.unidad,
                  ins.unidadBase,
                );
                const cantBase = conv?.resultado ?? cant;
                sub = cantBase * ins.precioBaseUsd;
                conversionInfo = {
                  cantidadConvertida: cantBase,
                  unidadDestino: ins.unidadBase,
                  compatibles:
                    l.unidad === ins.unidadBase ||
                    areCompatible(l.unidad, ins.unidadBase) ||
                    !conv?.usoFallback, // misma unidad textual cae acá
                };
              } else if (subR && subUnitPrice > 0) {
                const unidadDest = subR.rendimientoUnidad ?? l.unidad;
                const conv = convertirParaCosto(cant, l.unidad, unidadDest);
                const cantBase = conv?.resultado ?? cant;
                sub = cantBase * subUnitPrice;
                conversionInfo = {
                  cantidadConvertida: cantBase,
                  unidadDestino: unidadDest,
                  compatibles:
                    l.unidad === unidadDest ||
                    areCompatible(l.unidad, unidadDest) ||
                    !conv?.usoFallback,
                };
              } else if (manual > 0) {
                sub = cant * manual;
              }

              // Mostramos hint solo cuando hubo conversión real (diferente unidad)
              const mostrarEquivalencia =
                conversionInfo !== null &&
                cant > 0 &&
                l.unidad &&
                l.unidad.trim() !== conversionInfo.unidadDestino.trim() &&
                conversionInfo.compatibles;
              const mostrarWarning =
                conversionInfo !== null &&
                cant > 0 &&
                l.unidad &&
                l.unidad.trim() !== conversionInfo.unidadDestino.trim() &&
                !conversionInfo.compatibles &&
                dimension(l.unidad) !== "desconocida" &&
                dimension(conversionInfo.unidadDestino) !== "desconocida";

              // Aviso de "raciones por venta": si esta línea usa una subreceta
              // con plan de producción, cuánto baja su plan cada vez que se
              // vende 1 de esta receta. Ideal = un número redondo (típicamente
              // 1). Un decimal cercano a 1 (ej. 0,98) suele ser un desajuste
              // entre el gramaje del plato y las porciones de la subreceta.
              let subPorPorcion: number | null = null;
              let racionesPorVenta: number | null = null;
              if (subR && subR.rendimiento && subR.porciones && cant > 0) {
                subPorPorcion = subR.rendimiento / subR.porciones;
                const porcThis = Number(porciones) || 1;
                const convSub = convertirParaCosto(
                  cant,
                  l.unidad,
                  subR.rendimientoUnidad ?? l.unidad,
                );
                const cantSub = convSub?.resultado ?? cant;
                if (subPorPorcion > 0 && porcThis > 0) {
                  racionesPorVenta = cantSub / porcThis / subPorPorcion;
                }
              }
              const racionDesajustada =
                racionesPorVenta !== null &&
                racionesPorVenta > 0.5 &&
                racionesPorVenta < 1.5 &&
                Math.abs(racionesPorVenta - 1) > 0.01;
              return (
                <div
                  key={l.key}
                  data-linea-key={l.key}
                  className="rounded-lg ring-1 ring-marfil p-3 space-y-2 transition-all"
                >
                  {/* Fila 1: nombre + badge + remover */}
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Nombre del ingrediente"
                      value={l.nombre}
                      onChange={(e) =>
                        updateLine(l.key, { nombre: e.target.value })
                      }
                      className="flex-1 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                    />
                    {l.subrecetaId && (
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil shrink-0">
                        Sub-receta
                      </span>
                    )}
                    {!l.insumoId &&
                      !l.subrecetaId &&
                      l.nombre.trim() !== "" &&
                      (l.sinInsumoOk ? (
                        <span
                          title="Ingrediente sin insumo del catálogo, marcado como intencional (ej: agua de filtro): no descuenta stock ni suma costo."
                          className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-marfil-light text-cacao-soft ring-1 ring-marfil shrink-0"
                        >
                          Sin insumo · intencional
                        </span>
                      ) : (
                        <span
                          title="Este ingrediente no está vinculado a un insumo del catálogo, así que NO descuenta stock al vender. Vincúlalo desde el buscador de insumos, o marca la casilla de abajo si es intencional."
                          className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-amber-50 text-amber-800 ring-1 ring-amber-200 shrink-0 flex items-center gap-1"
                        >
                          <WarningIcon className="size-3" />
                          No descuenta stock
                        </span>
                      ))}
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-cacao-soft hover:text-terracotta text-xl px-1"
                      aria-label="Quitar"
                    >
                      ×
                    </button>
                  </div>
                  {/* Fila 2: cantidad / unidad / precio / observación / subtotal */}
                  <div className="grid grid-cols-12 gap-2 items-center">
                    <input
                      type="number"
                      step="0.0001"
                      min="0"
                      placeholder="Cant."
                      value={l.cantidad}
                      onChange={(e) =>
                        updateLine(l.key, { cantidad: e.target.value })
                      }
                      className="col-span-3 sm:col-span-2 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                    />
                    {/* Unidad: desplegable nativo (limpio y de un toque en iPad).
                        La unidad ya viene autocompletada con la base del insumo;
                        esto solo sirve para cambiarla si hace falta. */}
                    <div className="col-span-3 sm:col-span-2">
                      <UnidadSelect
                        value={l.unidad}
                        onChange={(v) => updateLine(l.key, { unidad: v })}
                        unidadesExtra={unidadesBase}
                        className="w-full rounded ring-1 ring-marfil px-2 py-1.5 text-sm bg-white"
                      />
                    </div>
                    {/* Precio: editable solo si ad-hoc; viene del catálogo o de la subreceta si aplica */}
                    <div className="col-span-6 sm:col-span-3">
                      {l.insumoId ? (
                        <div
                          className="rounded ring-1 ring-marfil bg-marfil-soft px-2 py-1.5 text-xs text-cacao-soft"
                          title="Precio viene del catálogo"
                        >
                          {ins && ins.precioBaseUsd !== null
                            ? `$${ins.precioBaseUsd.toFixed(5)} / ${ins.unidadBase}`
                            : "—"}
                        </div>
                      ) : l.subrecetaId ? (
                        <div
                          className="rounded ring-1 ring-marfil bg-marfil-soft px-2 py-1.5 text-xs text-cacao-soft"
                          title="Precio calculado desde los ingredientes de la sub-receta"
                        >
                          {subUnitPrice > 0
                            ? `$${subUnitPrice.toFixed(5)} / ${l.unidad}`
                            : "—"}
                        </div>
                      ) : (
                        <input
                          type="number"
                          step="0.000001"
                          min="0"
                          placeholder={`$ / ${l.unidad}`}
                          value={l.costoManual}
                          onChange={(e) =>
                            updateLine(l.key, { costoManual: e.target.value })
                          }
                          className="w-full rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                          title="Precio por unidad (ad-hoc)"
                        />
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Observación"
                      value={l.observaciones}
                      onChange={(e) =>
                        updateLine(l.key, { observaciones: e.target.value })
                      }
                      className="col-span-12 sm:col-span-3 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                    />
                    <div className="col-span-12 sm:col-span-2 text-right text-sm text-cacao font-medium">
                      {sub > 0 ? `$${sub.toFixed(3)}` : "—"}
                    </div>
                  </div>
                  {/* Feedback de conversión: equivalencia o warning */}
                  {mostrarEquivalencia && conversionInfo && (
                    <div className="text-[11px] text-cacao-soft italic font-serif pl-1">
                      ≈ {formatCantConv(conversionInfo.cantidadConvertida)}{" "}
                      {conversionInfo.unidadDestino} (convertido para el costo)
                    </div>
                  )}
                  {mostrarWarning && conversionInfo && (
                    <div className="text-[11px] text-terracotta pl-1">
                      <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                      &ldquo;{l.unidad}&rdquo; y &ldquo;
                      {conversionInfo.unidadDestino}&rdquo; no son convertibles.
                      El costo asume misma unidad — revisa para evitar errores.
                    </div>
                  )}
                  {racionesPorVenta !== null && subPorPorcion !== null && (
                    <div
                      className={`text-[11px] pl-1 ${
                        racionDesajustada
                          ? "text-terracotta"
                          : "text-cacao-soft italic font-serif"
                      }`}
                    >
                      {racionDesajustada && (
                        <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                      )}
                      1 porción de {subR?.nombre} ≈{" "}
                      {formatCantConv(subPorPorcion)}{" "}
                      {subR?.rendimientoUnidad ?? ""} · su plan baja ≈{" "}
                      <strong className="not-italic">
                        {formatCantConv(racionesPorVenta)}
                      </strong>{" "}
                      por venta
                      {racionDesajustada &&
                        " — debería ser 1; ajusta el gramaje o las porciones de la subreceta"}
                    </div>
                  )}
                  {/* Casilla: marcar un ingrediente libre como intencional (agua,
                      etc.) para quitar el aviso y poder guardar. */}
                  {!l.insumoId &&
                    !l.subrecetaId &&
                    l.nombre.trim() !== "" && (
                      <label className="flex items-start gap-2 text-[11px] text-cacao-soft pl-1 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={l.sinInsumoOk}
                          onChange={(e) =>
                            updateLine(l.key, {
                              sinInsumoOk: e.target.checked,
                            })
                          }
                          className="mt-0.5 accent-cacao"
                        />
                        <span>
                          Ingrediente sin insumo (intencional) — no descuenta
                          stock ni costo.
                        </span>
                      </label>
                    )}
                </div>
              );
            })}
          </div>
        )}

        {(() => {
          // Solo los que faltan por DECIDIR (sin insumo y sin marcar como
          // intencional). Los marcados "a propósito" no cuentan como problema.
          const sinDecidir = lineas.filter(
            (l) =>
              !l.insumoId &&
              !l.subrecetaId &&
              l.nombre.trim() !== "" &&
              !l.sinInsumoOk,
          );
          if (sinDecidir.length === 0) return null;
          return (
            <div className="mt-4 rounded-lg ring-1 ring-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <WarningIcon className="inline size-3.5 align-[-0.15em] mr-1" />
              <strong>
                {sinDecidir.length} ingrediente
                {sinDecidir.length === 1 ? "" : "s"} no descuenta
                {sinDecidir.length === 1 ? "" : "n"} stock:
              </strong>{" "}
              {sinDecidir.map((l) => l.nombre.trim()).join(", ")}. Para guardar,
              vincúlalos a un insumo del catálogo (para que resten del inventario
              al vender), o marca &ldquo;sin insumo (intencional)&rdquo; en cada
              uno si son ingredientes libres (ej: agua de filtro).
            </div>
          );
        })()}

        <div className="mt-4 border-t border-marfil pt-3 text-right space-y-1">
          <div className="text-sm text-cacao-soft">
            Costo total:{" "}
            <span className="text-cacao">${costo.total.toFixed(3)}</span>
          </div>
          <div className="text-lg font-cinzel tracking-wide text-cacao">
            Costo por porción: ${costo.porPorcion.toFixed(2)}
          </div>
          {precioSugerido && Number(precioSugerido) > 0 && (
            <div className="text-sm">
              Margen sobre precio sugerido:{" "}
              <span className="text-cacao font-medium">
                {(
                  ((Number(precioSugerido) - costo.porPorcion) /
                    Number(precioSugerido)) *
                  100
                ).toFixed(1)}
                %
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Procedimiento, presentación, notas */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Preparación
        </h2>
        <label className="block text-sm text-cacao">
          Procedimiento
          <textarea
            value={procedimiento}
            onChange={(e) => setProcedimiento(e.target.value)}
            rows={6}
            placeholder="1. Paso uno...&#10;2. Paso dos..."
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 font-serif"
          />
        </label>
        <label className="block text-sm text-cacao">
          Presentación / emplatado
          <textarea
            value={presentacion}
            onChange={(e) => setPresentacion(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        <label className="block text-sm text-cacao">
          Notas del chef
          <textarea
            value={notasChef}
            onChange={(e) => setNotasChef(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
        <label className="block text-sm text-cacao">
          Variaciones
          <textarea
            value={variaciones}
            onChange={(e) => setVariaciones(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </label>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-xl ring-1 ring-marfil px-5 py-2.5 text-cacao hover:bg-marfil-soft"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta disabled:opacity-50"
        >
          {saving
            ? "Guardando..."
            : existing
              ? "Guardar cambios"
              : "Crear receta"}
        </button>
      </div>

    </form>
  );
}

// Formato compacto para mostrar la cantidad convertida (sin ceros sobrantes).
function formatCantConv(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const dec = abs >= 100 ? 1 : abs >= 1 ? 2 : abs >= 0.01 ? 3 : 5;
  return n.toFixed(dec).replace(/\.?0+$/, "");
}
