"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CATEGORIAS_SERVICIO,
  unidadLabel,
  type CategoriaServicio,
} from "@/lib/types";
import {
  listCatalogoUnificado,
  type CatalogoEntry,
  type CatalogoUnificado,
  type OrigenCatalogo,
} from "@/lib/data/catalogo-unificado";
import { createPresupuesto } from "@/lib/data/presupuestos";
import { normalizarBusqueda } from "@/lib/text";

type Linea = {
  key: string; // local id
  /** Solo se llena si la línea vino de services_catalog. */
  serviceId?: string;
  /** Etiqueta visual del origen (Propio · Espacios, Alquiler · Mesas, etc.) */
  origenLabel?: string;
  nombre: string;
  categoria?: CategoriaServicio;
  unidad: string;
  cantidad: number;
  precioUnitario: number;
  esManual: boolean;
};

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const ORIGENES: { value: OrigenCatalogo | "todos"; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "servicio", label: "Nuestros" },
  { value: "inventario", label: "Alquiler" },
  { value: "contratista", label: "Terceros" },
];

function origenLabelOf(entry: CatalogoEntry): string {
  if (entry.origen === "servicio") {
    return `Propio · ${
      CATEGORIAS_SERVICIO.find((c) => c.value === entry.categoria)?.label ??
      entry.categoria
    }`;
  }
  if (entry.origen === "inventario") return `Alquiler · ${entry.categoria}`;
  return `Tercero · ${entry.categoria}`;
}

export function NuevoPresupuestoForm() {
  const router = useRouter();

  const [catalogo, setCatalogo] = useState<CatalogoUnificado>({
    servicios: [],
    inventario: [],
    contratistas: [],
  });
  const [loadingCat, setLoadingCat] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cliente
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [clienteEmail, setClienteEmail] = useState("");
  const [clienteRif, setClienteRif] = useState("");

  // Evento
  const [eventoNombre, setEventoNombre] = useState("");
  const [eventoFecha, setEventoFecha] = useState("");
  const [eventoHora, setEventoHora] = useState("");
  const [cantidadPersonas, setCantidadPersonas] = useState("");
  const [montajeFecha, setMontajeFecha] = useState("");
  const [montajeHora, setMontajeHora] = useState("");
  const [desmontajeFecha, setDesmontajeFecha] = useState("");
  const [desmontajeHora, setDesmontajeHora] = useState("");

  // Negocio
  const [notas, setNotas] = useState("");
  const [validezDias, setValidezDias] = useState("15");
  const [descuento, setDescuento] = useState("0");

  // Items
  const [items, setItems] = useState<Linea[]>([]);
  const [filterOrigen, setFilterOrigen] = useState<OrigenCatalogo | "todos">(
    "todos",
  );
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCatalogoUnificado();
        if (!cancelled) setCatalogo(data);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Error cargando catálogo",
          );
      } finally {
        if (!cancelled) setLoadingCat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function addEntry(entry: CatalogoEntry) {
    setItems((prev) => [
      ...prev,
      {
        key: uid(),
        // Solo enlazamos a services_catalog cuando el origen es "servicio".
        // Inventario y contratistas se guardan como líneas con nombre
        // congelado (un presupuesto es una foto en el tiempo).
        serviceId: entry.origen === "servicio" ? entry.servicio?.id : undefined,
        origenLabel: origenLabelOf(entry),
        nombre: entry.nombre,
        categoria: entry.origen === "servicio"
          ? (entry.categoria as CategoriaServicio)
          : "otros",
        unidad: entry.unidad,
        cantidad: 1,
        precioUnitario: entry.precio ?? 0,
        esManual: entry.manual,
      },
    ]);
  }

  function addItemAdHoc() {
    setItems((prev) => [
      ...prev,
      {
        key: uid(),
        nombre: "",
        unidad: "evento",
        cantidad: 1,
        precioUnitario: 0,
        esManual: true,
      },
    ]);
  }

  function updateItem(key: string, patch: Partial<Linea>) {
    setItems((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  }

  function removeItem(key: string) {
    setItems((prev) => prev.filter((l) => l.key !== key));
  }

  const subtotal = useMemo(
    () =>
      items.reduce(
        (s, l) => s + Number(l.cantidad) * Number(l.precioUnitario),
        0,
      ),
    [items],
  );
  const descNum = Number(descuento) || 0;
  const total = Math.max(0, subtotal - descNum);

  // ── Catálogo filtrado y agrupado por origen → grupo
  // Cada "grupo" se muestra como un subheader con sus opciones debajo.
  const seccionesFiltradas = useMemo(() => {
    const q = normalizarBusqueda(search.trim());
    const allEntries: CatalogoEntry[] = [
      ...catalogo.servicios,
      ...catalogo.inventario,
      ...catalogo.contratistas,
    ].filter((e) => e.activo);

    const filtered = allEntries.filter((e) => {
      if (filterOrigen !== "todos" && e.origen !== filterOrigen) return false;
      if (q) {
        const hay =
          normalizarBusqueda(e.nombre).includes(q) ||
          normalizarBusqueda(e.categoria).includes(q) ||
          normalizarBusqueda(e.descripcion ?? "").includes(q);
        if (!hay) return false;
      }
      return true;
    });

    // Estructura: { origen → { categoria → entries[] } }
    const result: {
      origen: OrigenCatalogo;
      origenLabel: string;
      categorias: { cat: string; entries: CatalogoEntry[] }[];
    }[] = [];
    const labelByOrigen: Record<OrigenCatalogo, string> = {
      servicio: "Nuestros servicios",
      inventario: "Inventario de alquiler",
      contratista: "Contratistas / terceros",
    };
    (["servicio", "inventario", "contratista"] as OrigenCatalogo[]).forEach(
      (origen) => {
        const ofOrigen = filtered.filter((e) => e.origen === origen);
        if (ofOrigen.length === 0) return;
        const byCat = new Map<string, CatalogoEntry[]>();
        ofOrigen.forEach((e) => {
          const catKey =
            origen === "servicio"
              ? CATEGORIAS_SERVICIO.find((c) => c.value === e.categoria)
                  ?.label ?? e.categoria
              : e.categoria;
          if (!byCat.has(catKey)) byCat.set(catKey, []);
          byCat.get(catKey)!.push(e);
        });
        result.push({
          origen,
          origenLabel: labelByOrigen[origen],
          categorias: Array.from(byCat.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([cat, entries]) => ({ cat, entries })),
        });
      },
    );
    return result;
  }, [catalogo, filterOrigen, search]);

  async function handleSubmit(estado: "borrador" | "enviado") {
    setError(null);
    if (!clienteNombre.trim() || !eventoNombre.trim()) {
      setError("Falta nombre del cliente o del evento.");
      return;
    }
    if (items.length === 0) {
      setError("Agrega al menos un servicio al presupuesto.");
      return;
    }
    const validItems = items.every((l) => l.nombre.trim().length > 0);
    if (!validItems) {
      setError("Cada línea debe tener un nombre.");
      return;
    }
    setSaving(true);
    try {
      const created = await createPresupuesto({
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: clienteTelefono.trim() || undefined,
        clienteEmail: clienteEmail.trim() || undefined,
        clienteRif: clienteRif.trim() || undefined,
        eventoNombre: eventoNombre.trim(),
        eventoFecha: eventoFecha || undefined,
        eventoHora: eventoHora.trim() || undefined,
        cantidadPersonas: cantidadPersonas ? Number(cantidadPersonas) : undefined,
        montajeFecha: montajeFecha || undefined,
        montajeHora: montajeHora.trim() || undefined,
        desmontajeFecha: desmontajeFecha || undefined,
        desmontajeHora: desmontajeHora.trim() || undefined,
        notas: notas.trim() || undefined,
        validezDias: Number(validezDias) || 15,
        descuento: descNum,
        estado,
        items: items.map((l, i) => ({
          serviceId: l.serviceId,
          nombre: l.nombre.trim(),
          categoria: l.categoria,
          unidad: l.unidad as Linea["unidad"],
          cantidad: Number(l.cantidad),
          precioUnitario: Number(l.precioUnitario),
          subtotal: Number(l.cantidad) * Number(l.precioUnitario),
          orden: i,
        })) as never,
      });
      router.push(`/presupuestos/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error guardando");
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSubmit("borrador");
      }}
      className="space-y-6"
    >
      {error && (
        <div className="rounded-lg bg-[#F9EBE7] ring-1 ring-[#E8C5BC] p-3 text-sm text-[#7A2419]">
          {error}
        </div>
      )}

      {/* Cliente */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6 space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Cliente
        </h2>
        <input
          type="text"
          placeholder="Nombre del cliente o empresa"
          value={clienteNombre}
          onChange={(e) => setClienteNombre(e.target.value)}
          required
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Teléfono"
            value={clienteTelefono}
            onChange={(e) => setClienteTelefono(e.target.value)}
            className="rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <input
            type="email"
            placeholder="Correo"
            value={clienteEmail}
            onChange={(e) => setClienteEmail(e.target.value)}
            className="rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <input
            type="text"
            placeholder="RIF / Cédula"
            value={clienteRif}
            onChange={(e) => setClienteRif(e.target.value)}
            className="rounded-lg ring-1 ring-marfil px-3 py-2"
          />
        </div>
      </section>

      {/* Evento */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6 space-y-3">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Evento
        </h2>
        <input
          type="text"
          placeholder="Nombre del evento"
          value={eventoNombre}
          onChange={(e) => setEventoNombre(e.target.value)}
          required
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-cacao">
            Fecha
            <input
              type="date"
              value={eventoFecha}
              onChange={(e) => setEventoFecha(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao">
            Hora (texto libre, ej: 7pm–11pm)
            <input
              type="text"
              placeholder="7pm–11pm"
              value={eventoHora}
              onChange={(e) => setEventoHora(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao">
            Personas esperadas
            <input
              type="number"
              min="0"
              placeholder="Ej: 80"
              value={cantidadPersonas}
              onChange={(e) => setCantidadPersonas(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
        </div>

        <div className="border-t border-marfil pt-3 mt-1">
          <p className="text-[11px] uppercase tracking-widest text-cacao-mute mb-2">
            Montaje y desmontaje (opcional · aparece en términos del PDF)
          </p>
          <p className="text-xs text-cacao-soft mb-3 font-serif italic">
            Si los dejas vacíos, se usan la fecha y hora del evento.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Fecha de montaje
              <input
                type="date"
                value={montajeFecha}
                onChange={(e) => setMontajeFecha(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Hora de montaje
              <input
                type="text"
                placeholder="Ej: PM, 2pm–6pm"
                value={montajeHora}
                onChange={(e) => setMontajeHora(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Fecha de desmontaje
              <input
                type="date"
                value={desmontajeFecha}
                onChange={(e) => setDesmontajeFecha(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Hora de desmontaje
              <input
                type="text"
                placeholder="Ej: PM, 11pm–1am"
                value={desmontajeHora}
                onChange={(e) => setDesmontajeHora(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Selector de catálogo unificado */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Catálogo unificado
        </h2>
        <p className="text-xs text-cacao-soft mb-4 font-serif italic">
          Servicios propios, inventario de alquiler y contratistas — todo en
          un solo selector.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {ORIGENES.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setFilterOrigen(o.value)}
              className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-widest ring-1 transition-colors ${
                filterOrigen === o.value
                  ? "bg-cacao text-white ring-cacao"
                  : "bg-white text-cacao-soft ring-marfil hover:bg-marfil-soft"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>

        <input
          type="text"
          placeholder="Buscar por nombre o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2 mb-4 text-sm"
        />

        {loadingCat ? (
          <div className="text-sm text-cacao-soft">Cargando catálogo...</div>
        ) : seccionesFiltradas.length === 0 ? (
          <div className="text-sm text-cacao-soft font-serif italic">
            No hay opciones para mostrar con estos filtros.
          </div>
        ) : (
          <div className="space-y-5">
            {seccionesFiltradas.map((sec) => (
              <div key={sec.origen}>
                <h3 className="font-display text-[11px] tracking-[0.3em] uppercase text-cacao-mute mb-2">
                  {sec.origenLabel}
                </h3>
                <div className="space-y-3">
                  {sec.categorias.map(({ cat, entries }) => (
                    <div key={cat}>
                      <div className="text-[10px] uppercase tracking-widest text-cacao-mute mb-1.5">
                        {cat}
                      </div>
                      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {entries.map((e) => (
                          <li key={e.key}>
                            <button
                              type="button"
                              onClick={() => addEntry(e)}
                              className="w-full text-left rounded-lg ring-1 ring-marfil px-3 py-2 hover:bg-marfil-soft transition-colors"
                            >
                              <div className="text-sm font-medium text-cacao">
                                {e.nombre}
                              </div>
                              <div className="text-xs text-cacao-soft">
                                {e.precioLabel} · {unidadLabel(e.unidad)}
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={addItemAdHoc}
          className="mt-5 text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
        >
          + Agregar línea libre (fuera del catálogo)
        </button>
      </section>

      {/* Líneas seleccionadas */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute mb-3">
          Líneas del presupuesto
        </h2>
        {items.length === 0 ? (
          <div className="text-sm text-cacao-soft italic font-serif">
            Selecciona del catálogo arriba.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((l) => (
              <div
                key={l.key}
                className="rounded-lg ring-1 ring-marfil p-3 space-y-2"
              >
                {l.origenLabel && (
                  <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                    {l.origenLabel}
                  </div>
                )}
                <div className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Descripción"
                    value={l.nombre}
                    onChange={(e) =>
                      updateItem(l.key, { nombre: e.target.value })
                    }
                    className="col-span-12 sm:col-span-5 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                  />
                  <div className="col-span-4 sm:col-span-2 flex items-center gap-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={l.cantidad}
                      onChange={(e) =>
                        updateItem(l.key, {
                          cantidad: Number(e.target.value),
                        })
                      }
                      className="w-full rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                    />
                    <span className="text-xs text-cacao-soft">×</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Precio"
                    value={l.precioUnitario}
                    onChange={(e) =>
                      updateItem(l.key, {
                        precioUnitario: Number(e.target.value),
                      })
                    }
                    className="col-span-4 sm:col-span-2 rounded ring-1 ring-marfil px-2 py-1.5 text-sm"
                  />
                  <div className="col-span-3 sm:col-span-2 text-right text-sm text-cacao font-medium">
                    ${(l.cantidad * l.precioUnitario).toFixed(2)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(l.key)}
                    className="col-span-1 text-cacao-soft hover:text-terracotta"
                    aria-label="Quitar"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Notas + descuento + totales */}
      <section className="rounded-2xl bg-white ring-1 ring-marfil p-5 sm:p-6 space-y-4">
        <h2 className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
          Notas y totales
        </h2>
        <textarea
          placeholder="Notas internas o términos adicionales (opcional)"
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={3}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-cacao">
            Validez (días)
            <input
              type="number"
              min="1"
              value={validezDias}
              onChange={(e) => setValidezDias(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
          <label className="text-sm text-cacao">
            Descuento (USD)
            <input
              type="number"
              step="0.01"
              min="0"
              value={descuento}
              onChange={(e) => setDescuento(e.target.value)}
              className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />
          </label>
        </div>

        <div className="border-t border-marfil pt-4 space-y-1 text-right">
          <div className="text-sm text-cacao-soft">
            Subtotal:{" "}
            <span className="text-cacao">${subtotal.toFixed(2)}</span>
          </div>
          {descNum > 0 && (
            <div className="text-sm text-cacao-soft">
              Descuento:{" "}
              <span className="text-cacao">−${descNum.toFixed(2)}</span>
            </div>
          )}
          <div className="text-xl font-cinzel tracking-wide text-cacao">
            Total: ${total.toFixed(2)} USD
          </div>
        </div>
      </section>

      {/* Acciones */}
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
          className="rounded-xl ring-1 ring-cacao px-5 py-2.5 text-cacao hover:bg-marfil-soft disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar como borrador"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleSubmit("enviado")}
          className="rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar y generar PDF →"}
        </button>
      </div>
    </form>
  );
}
