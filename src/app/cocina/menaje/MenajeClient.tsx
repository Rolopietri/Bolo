"use client";

import { useEffect, useMemo, useState } from "react";
import { DocIcon, PaperclipIcon } from "@/components/icons";
import {
  TIPOS_BAJA_MENAJE,
  CATEGORIAS_MENAJE_SUGERIDAS,
  FOTOS_MENAJE_SUGERIDAS,
  tipoMenajeLabel,
  type MenajeItem,
  type MovimientoMenaje,
} from "@/lib/types";
import { hoyISO, pillClass } from "@/lib/ui";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  listMenaje,
  listMovimientosMenaje,
  createMenajeItem,
  updateMenajeItem,
  deleteMenajeItem,
  registrarBajaMenaje,
  registrarCompraMenaje,
  subirFotoMenaje,
  getFacturaSignedUrl,
  deleteMovimientoMenaje,
} from "@/lib/data/menaje";
import { extractError } from "@/lib/data/error";
import { normalizarBusqueda } from "@/lib/text";

type TipoBaja = (typeof TIPOS_BAJA_MENAJE)[number]["value"];

type FormItem = {
  nombre: string;
  categoria: string;
  descripcion: string;
  cantidadActual: string;
  precioReposicionUsd: string;
  notas: string;
  fotoUrl: string;
};

const emptyForm: FormItem = {
  nombre: "",
  categoria: "",
  descripcion: "",
  cantidadActual: "0",
  precioReposicionUsd: "",
  notas: "",
  fotoUrl: "",
};

export function MenajeClient() {
  const [items, setItems] = useState<MenajeItem[]>([]);
  const [movs, setMovs] = useState<MovimientoMenaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState<string>("todas");

  // Form de item
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormItem>({ ...emptyForm });
  /** Solo en CREAR (no en editar): permite adjuntar la factura inicial.
   *  Si hay precio o factura, se crea un movimiento de "compra" junto con
   *  el item para que el historial nazca con el primer registro. */
  const [initialFactura, setInitialFactura] = useState<File | null>(null);
  const [initialPrecioUnit, setInitialPrecioUnit] = useState("");
  const [initialFecha, setInitialFecha] = useState(
    () => hoyISO(),
  );
  const [initialProveedor, setInitialProveedor] = useState("");
  const [creando, setCreando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  // Modal de baja
  const [bajaItem, setBajaItem] = useState<MenajeItem | null>(null);
  const [bajaCant, setBajaCant] = useState("");
  const [bajaTipo, setBajaTipo] = useState<TipoBaja>("rotura");
  const [bajaFecha, setBajaFecha] = useState(
    () => hoyISO(),
  );
  const [bajaMotivo, setBajaMotivo] = useState("");
  const [bajaNota, setBajaNota] = useState("");

  // Modal de compra
  const [compraItem, setCompraItem] = useState<MenajeItem | null>(null);
  const [compraCant, setCompraCant] = useState("");
  const [compraPrecioUnit, setCompraPrecioUnit] = useState("");
  const [compraPrecioTotal, setCompraPrecioTotal] = useState("");
  const [compraFecha, setCompraFecha] = useState(
    () => hoyISO(),
  );
  const [compraFactura, setCompraFactura] = useState<File | null>(null);
  const [compraMotivo, setCompraMotivo] = useState("");
  const [compraNota, setCompraNota] = useState("");

  const [procesando, setProcesando] = useState(false);

  // Expansión
  const [expandedId, setExpandedId] = useState<string | null>(null);

  /** Confirmaciones in-app — reemplazan al confirm() nativo del browser,
   *  que es bloqueado en algunos contextos y se ve mal en mobile. */
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<MenajeItem | null>(
    null,
  );
  const [confirmDeleteMov, setConfirmDeleteMov] = useState<
    MovimientoMenaje | null
  >(null);
  const [borrando, setBorrando] = useState(false);

  // Modal "Lista para evento" (genera PDF ad-hoc)
  const [listaOpen, setListaOpen] = useState(false);
  const [listaEvento, setListaEvento] = useState("");
  const [listaCliente, setListaCliente] = useState("");
  const [listaFecha, setListaFecha] = useState("");
  const [listaNotas, setListaNotas] = useState("");
  const [listaConPrecios, setListaConPrecios] = useState(false);
  const [listaPct, setListaPct] = useState("10");
  const [listaBuscar, setListaBuscar] = useState("");
  const [listaCat, setListaCat] = useState<string>("todas");
  // selección por item: { [itemId]: { cantidad, precio } }
  const [listaSel, setListaSel] = useState<
    Record<string, { cantidad: string; precio: string }>
  >({});
  const [generandoPdf, setGenerandoPdf] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const its = await listMenaje();
        if (cancelled) return;
        setItems(its);
        try {
          const ms = await listMovimientosMenaje({ limit: 500 });
          if (!cancelled) setMovs(ms);
        } catch {
          // Tabla pendiente — seguimos sin movimientos
        }
      } catch (e) {
        if (!cancelled) setError(extractError(e, "Error cargando"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!info) return;
    const t = setTimeout(() => setInfo(null), 4000);
    return () => clearTimeout(t);
  }, [info]);

  // Categorías disponibles (mezcla de las existentes + sugeridas)
  const categoriasDisponibles = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.categoria));
    CATEGORIAS_MENAJE_SUGERIDAS.forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [items]);

  const categoriasReales = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => set.add(i.categoria));
    return Array.from(set).sort();
  }, [items]);

  const filtered = useMemo(() => {
    const q = normalizarBusqueda(search.trim());
    return items
      .filter((i) => i.activo)
      .filter((i) => filterCat === "todas" || i.categoria === filterCat)
      .filter((i) => (q ? normalizarBusqueda(i.nombre).includes(q) : true))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [items, search, filterCat]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenajeItem[]>();
    filtered.forEach((i) => {
      if (!map.has(i.categoria)) map.set(i.categoria, []);
      map.get(i.categoria)!.push(i);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  // Mov por item
  const movsPorItem = useMemo(() => {
    const map = new Map<string, MovimientoMenaje[]>();
    movs.forEach((m) => {
      if (!map.has(m.itemId)) map.set(m.itemId, []);
      map.get(m.itemId)!.push(m);
    });
    return map;
  }, [movs]);

  // ─── Form item ───────────────────────────────────────────────
  function resetForm() {
    setForm({ ...emptyForm });
    setEditingId(null);
    setAdding(false);
    setInitialFactura(null);
    setInitialPrecioUnit("");
    setInitialFecha(hoyISO());
    setInitialProveedor("");
  }
  function startEdit(it: MenajeItem) {
    setEditingId(it.id);
    setForm({
      nombre: it.nombre,
      categoria: it.categoria,
      descripcion: it.descripcion ?? "",
      cantidadActual: String(it.cantidadActual),
      precioReposicionUsd: it.precioReposicionUsd?.toString() ?? "",
      notas: it.notas ?? "",
      fotoUrl: it.fotoUrl ?? "",
    });
    setAdding(true);
  }
  // Sube la foto elegida al bucket público y la deja en el form (vista previa
  // inmediata). Funciona igual creando o editando (no depende del id del ítem).
  async function onSelectFoto(file: File | null) {
    if (!file) return;
    setError(null);
    setSubiendoFoto(true);
    try {
      const url = await subirFotoMenaje(file);
      setForm((f) => ({ ...f, fotoUrl: url }));
    } catch (e) {
      setError(extractError(e, "Error subiendo la foto"));
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function handleSubmitItem(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nombre.trim()) return;
    setError(null);
    const cantidad = Number(form.cantidadActual) || 0;
    const precioUnit =
      initialPrecioUnit === "" ? undefined : Number(initialPrecioUnit);
    // Heurística: si estamos creando y hay factura, precio o proveedor, la
    // cantidad inicial cuenta como una compra. Se crea el item con cantidad=0
    // y se registra una compra para que quede en el historial.
    const tieneCompra =
      !editingId &&
      (initialFactura !== null ||
        precioUnit !== undefined ||
        initialProveedor.trim() !== "");

    const input = {
      nombre: form.nombre.trim(),
      categoria: form.categoria.trim() || "Otros",
      descripcion: form.descripcion.trim() || undefined,
      cantidadActual: tieneCompra ? 0 : cantidad,
      precioReposicionUsd:
        form.precioReposicionUsd === ""
          ? precioUnit  // si no se cargó manual, usar el de la compra inicial
          : Number(form.precioReposicionUsd),
      notas: form.notas.trim() || undefined,
      fotoUrl: form.fotoUrl.trim() || undefined,
      activo: true,
    };
    setCreando(true);
    try {
      if (editingId) {
        const upd = await updateMenajeItem(editingId, input);
        setItems((prev) => prev.map((x) => (x.id === editingId ? upd : x)));
      } else {
        const nuevo = await createMenajeItem(input);
        // Si hay compra inicial, registrarla (sube factura + suma stock)
        if (tieneCompra && cantidad > 0) {
          try {
            const res = await registrarCompraMenaje({
              itemId: nuevo.id,
              cantidad,
              precioUnitarioUsd: precioUnit,
              fecha: initialFecha,
              factura: initialFactura ?? undefined,
              motivo: initialProveedor || undefined,
            });
            // El item ya existe con cantidad=0; ahora viene actualizado
            const itemConCompra: MenajeItem = {
              ...nuevo,
              cantidadActual: res.cantidadActual,
              precioReposicionUsd:
                nuevo.precioReposicionUsd ?? precioUnit ?? undefined,
            };
            setItems((prev) => [...prev, itemConCompra]);
            setMovs((prev) => [res.movimiento, ...prev]);
            setInfo(
              `Item creado con compra inicial${initialFactura ? " (factura adjunta)" : ""}.`,
            );
          } catch (eCompra) {
            // Si la compra falla pero el item ya quedó, lo agregamos igual
            setItems((prev) => [...prev, nuevo]);
            setError(
              extractError(
                eCompra,
                "Item creado, pero falló la compra inicial",
              ),
            );
          }
        } else {
          setItems((prev) => [...prev, nuevo]);
          if (cantidad > 0) {
            setInfo(`Item creado con stock inicial de ${cantidad}.`);
          } else {
            setInfo("Item creado.");
          }
        }
      }
      resetForm();
    } catch (e) {
      setError(extractError(e, "Error guardando item"));
    } finally {
      setCreando(false);
    }
  }
  async function ejecutarDeleteItem() {
    if (!confirmDeleteItem) return;
    setBorrando(true);
    setError(null);
    try {
      await deleteMenajeItem(confirmDeleteItem.id);
      setItems((prev) => prev.filter((x) => x.id !== confirmDeleteItem.id));
      setMovs((prev) => prev.filter((m) => m.itemId !== confirmDeleteItem.id));
      setInfo(`"${confirmDeleteItem.nombre}" eliminado.`);
      setConfirmDeleteItem(null);
      if (expandedId === confirmDeleteItem.id) setExpandedId(null);
    } catch (e) {
      setError(extractError(e, "Error eliminando item"));
    } finally {
      setBorrando(false);
    }
  }

  // ─── Baja ────────────────────────────────────────────────────
  function openBaja(it: MenajeItem) {
    setBajaItem(it);
    setBajaCant("1");
    setBajaTipo("rotura");
    setBajaFecha(hoyISO());
    setBajaMotivo("");
    setBajaNota("");
  }
  async function handleBajaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bajaItem) return;
    const cant = Number(bajaCant);
    if (!Number.isFinite(cant) || cant < 1) {
      setError("La cantidad a dar de baja debe ser al menos 1.");
      return;
    }
    if (cant > bajaItem.cantidadActual) {
      setError(
        `No podés dar de baja ${cant}: solo hay ${bajaItem.cantidadActual} disponibles.`,
      );
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const res = await registrarBajaMenaje({
        itemId: bajaItem.id,
        cantidad: cant,
        tipo: bajaTipo,
        motivo: bajaMotivo || undefined,
        fecha: bajaFecha,
        nota: bajaNota || undefined,
      });
      setItems((prev) =>
        prev.map((x) =>
          x.id === bajaItem.id
            ? { ...x, cantidadActual: res.cantidadActual }
            : x,
        ),
      );
      setMovs((prev) => [res.movimiento, ...prev]);
      setInfo(`Baja registrada: ${cant} × ${bajaItem.nombre}.`);
      setBajaItem(null);
    } catch (e) {
      setError(extractError(e, "Error registrando baja"));
    } finally {
      setProcesando(false);
    }
  }

  // ─── Compra ──────────────────────────────────────────────────
  function openCompra(it: MenajeItem) {
    setCompraItem(it);
    setCompraCant("");
    setCompraPrecioUnit("");
    setCompraPrecioTotal("");
    setCompraFecha(hoyISO());
    setCompraFactura(null);
    setCompraMotivo("");
    setCompraNota("");
  }
  async function handleCompraSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!compraItem) return;
    const cant = Number(compraCant);
    if (!Number.isFinite(cant) || cant <= 0) {
      setError("Cantidad debe ser mayor a 0.");
      return;
    }
    setProcesando(true);
    setError(null);
    try {
      const res = await registrarCompraMenaje({
        itemId: compraItem.id,
        cantidad: cant,
        precioUnitarioUsd:
          compraPrecioUnit === "" ? undefined : Number(compraPrecioUnit),
        precioTotalUsd:
          compraPrecioTotal === "" ? undefined : Number(compraPrecioTotal),
        fecha: compraFecha,
        factura: compraFactura ?? undefined,
        motivo: compraMotivo || undefined,
        nota: compraNota || undefined,
      });
      setItems((prev) =>
        prev.map((x) =>
          x.id === compraItem.id
            ? {
                ...x,
                cantidadActual: res.cantidadActual,
                precioReposicionUsd:
                  x.precioReposicionUsd ??
                  (compraPrecioUnit ? Number(compraPrecioUnit) : undefined),
              }
            : x,
        ),
      );
      setMovs((prev) => [res.movimiento, ...prev]);
      setInfo(
        `Compra registrada: +${cant} × ${compraItem.nombre}${compraFactura ? " (factura adjunta)" : ""}.`,
      );
      setCompraItem(null);
    } catch (e) {
      setError(extractError(e, "Error registrando compra"));
    } finally {
      setProcesando(false);
    }
  }

  async function abrirFactura(path: string) {
    const url = await getFacturaSignedUrl(path);
    if (url) window.open(url, "_blank", "noopener");
    else setError("No se pudo abrir la factura.");
  }

  async function ejecutarDeleteMov() {
    if (!confirmDeleteMov) return;
    setBorrando(true);
    setError(null);
    try {
      await deleteMovimientoMenaje(confirmDeleteMov.id);
      setMovs((prev) => prev.filter((m) => m.id !== confirmDeleteMov.id));
      setInfo("Movimiento eliminado.");
      setConfirmDeleteMov(null);
    } catch (e) {
      setError(extractError(e, "Error eliminando movimiento"));
    } finally {
      setBorrando(false);
    }
  }

  function abrirLista() {
    setListaEvento("");
    setListaCliente("");
    setListaFecha(hoyISO());
    setListaNotas("");
    setListaConPrecios(false);
    setListaPct("10");
    setListaBuscar("");
    setListaCat("todas");
    setListaSel({});
    setListaOpen(true);
  }

  function setSel(id: string, patch: { cantidad?: string; precio?: string }) {
    setListaSel((prev) => {
      const cur = prev[id] ?? { cantidad: "", precio: "" };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }

  // Autollena el precio unitario = % del costo de reposición, para los ítems
  // seleccionados (cantidad > 0).
  function autollenarPrecios() {
    const pct = Number(listaPct) || 0;
    setListaSel((prev) => {
      const next = { ...prev };
      for (const it of items) {
        const sel = next[it.id];
        if (!sel || (Number(sel.cantidad) || 0) <= 0) continue;
        const base = it.precioReposicionUsd ?? 0;
        next[it.id] = {
          ...sel,
          precio: base > 0 ? ((base * pct) / 100).toFixed(2) : sel.precio,
        };
      }
      return next;
    });
  }

  async function generarListaPDF() {
    const seleccionados = items
      .filter((it) => (Number(listaSel[it.id]?.cantidad) || 0) > 0)
      .map((it) => ({
        nombre: it.nombre,
        categoria: it.categoria,
        cantidad: Number(listaSel[it.id]!.cantidad) || 0,
        disponible: it.cantidadActual,
        precioUnit: listaConPrecios
          ? Number(listaSel[it.id]?.precio) || 0
          : undefined,
        fotoUrl: it.fotoUrl,
      }));
    if (seleccionados.length === 0) {
      setError("Selecciona al menos un ítem con cantidad.");
      return;
    }
    setGenerandoPdf(true);
    setError(null);
    try {
      const res = await fetch("/api/cocina/menaje/lista-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: listaEvento || undefined,
          cliente: listaCliente || undefined,
          fecha: listaFecha || undefined,
          notas: listaNotas || undefined,
          conPrecios: listaConPrecios,
          items: seleccionados,
        }),
      });
      if (!res.ok) {
        throw new Error((await res.text()) || "Error generando el PDF");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `menaje-${listaEvento || "evento"}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setListaOpen(false);
      setInfo("PDF generado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando el PDF");
    } finally {
      setGenerandoPdf(false);
    }
  }

  const listaItemsFiltrados = items.filter(
    (it) =>
      it.activo &&
      (listaCat === "todas" || it.categoria === listaCat) &&
      (listaBuscar.trim() === "" ||
        normalizarBusqueda(it.nombre).includes(normalizarBusqueda(listaBuscar)) ||
        normalizarBusqueda(it.categoria).includes(normalizarBusqueda(listaBuscar))),
  );
  const listaSelCount = items.filter(
    (it) => (Number(listaSel[it.id]?.cantidad) || 0) > 0,
  ).length;

  if (loading) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando menaje...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {info && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">
          {info}
        </div>
      )}

      {/* Filtros */}
      <section className="space-y-2">
        <input
          type="text"
          placeholder="Buscar item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
        />
        {categoriasReales.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCat("todas")}
              className={pillClass(filterCat === "todas")}
            >
              Todas
            </button>
            {categoriasReales.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCat(c)}
                className={pillClass(filterCat === c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Lista para evento (PDF) */}
      <button
        onClick={abrirLista}
        className="w-full rounded-xl ring-1 ring-cacao text-cacao py-2.5 font-medium hover:bg-marfil-soft transition-colors"
      >
        <DocIcon className="inline size-4 align-[-0.2em] mr-1.5" />
        Lista de menaje para evento (PDF)
      </button>

      {/* Nuevo item */}
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full rounded-xl bg-cacao text-white py-3 font-medium hover:bg-terracotta transition-colors"
        >
          + Nuevo item del menaje
        </button>
      ) : (
        <form
          onSubmit={handleSubmitItem}
          className="rounded-2xl bg-white ring-1 ring-marfil p-5 space-y-3"
        >
          <h2 className="font-display text-sm tracking-[0.2em] uppercase text-cacao">
            {editingId ? "Editar item" : "Nuevo item"}
          </h2>
          <input
            type="text"
            placeholder="Nombre (ej: Copa de vino tinto)"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            autoFocus
            required
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm text-cacao">
              Categoría
              <input
                type="text"
                list="menaje-categorias-list"
                placeholder="Ej: Cristalería"
                value={form.categoria}
                onChange={(e) =>
                  setForm({ ...form, categoria: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
              <datalist id="menaje-categorias-list">
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label className="text-sm text-cacao">
              Cantidad actual
              <input
                type="number"
                min="0"
                step="1"
                value={form.cantidadActual}
                onChange={(e) =>
                  setForm({ ...form, cantidadActual: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao">
              Precio de reposición USD{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ej: 5.00"
                value={form.precioReposicionUsd}
                onChange={(e) =>
                  setForm({ ...form, precioReposicionUsd: e.target.value })
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
          </div>
          <textarea
            placeholder="Descripción / detalles (opcional)"
            value={form.descripcion}
            onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            rows={2}
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />
          <textarea
            placeholder="Notas internas (opcional)"
            value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
            rows={2}
            className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
          />

          {/* Foto del ítem — se muestra en el listado y en el PDF del cliente. */}
          <div className="rounded-lg ring-1 ring-marfil bg-marfil-soft p-3 space-y-3">
            <div className="text-sm text-cacao font-medium">
              Foto{" "}
              <span className="text-cacao-mute font-normal">
                (se muestra en la app y en el PDF del cliente)
              </span>
            </div>
            <div className="flex items-start gap-3">
              {/* Vista previa */}
              <div className="shrink-0">
                {form.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.fotoUrl}
                    alt="Foto del ítem"
                    className="size-20 rounded-lg object-contain bg-white ring-1 ring-marfil"
                  />
                ) : (
                  <div className="size-20 rounded-lg ring-1 ring-dashed ring-marfil bg-white flex items-center justify-center text-[10px] text-cacao-mute text-center px-1">
                    Sin foto
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer rounded-lg bg-white ring-1 ring-marfil px-3 py-1.5 text-sm text-cacao hover:bg-marfil-soft">
                    {subiendoFoto
                      ? "Subiendo…"
                      : form.fotoUrl
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
                  {form.fotoUrl && (
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, fotoUrl: "" })}
                      className="text-xs uppercase tracking-widest text-cacao-mute hover:text-terracotta"
                    >
                      Quitar
                    </button>
                  )}
                </div>
                {/* Fotos sugeridas (catálogo del proveedor) */}
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-cacao-mute mb-1">
                    O elige una sugerida
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {FOTOS_MENAJE_SUGERIDAS.map((f) => {
                      const activa = form.fotoUrl === f.url;
                      return (
                        <button
                          key={f.url}
                          type="button"
                          title={f.label}
                          onClick={() =>
                            setForm((prev) => ({ ...prev, fotoUrl: f.url }))
                          }
                          className={`rounded-md bg-white p-0.5 ring-1 transition-colors ${
                            activa
                              ? "ring-cacao ring-2"
                              : "ring-marfil hover:ring-cacao-soft"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={f.url}
                            alt={f.label}
                            className="size-10 object-contain"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sub-form de compra inicial — solo cuando se crea el item.
              Si dejás vacíos los campos, se crea sin compra. */}
          {!editingId && (
            <details className="rounded-lg ring-1 ring-marfil bg-marfil-soft">
              <summary className="cursor-pointer px-3 py-2 text-sm text-cacao font-medium select-none">
                Adjuntar factura de compra inicial{" "}
                <span className="text-cacao-mute font-normal">(opcional)</span>
              </summary>
              <div className="px-3 pb-3 space-y-3 border-t border-marfil pt-3">
                <p className="text-xs text-cacao-soft italic font-serif">
                  Si estás cargando este item porque acabás de comprarlo,
                  podés adjuntar la factura acá. Va a quedar como el primer
                  movimiento del historial.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm text-cacao">
                    Precio unitario USD
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Ej: 5.00"
                      value={initialPrecioUnit}
                      onChange={(e) => setInitialPrecioUnit(e.target.value)}
                      className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                    />
                  </label>
                  <label className="text-sm text-cacao">
                    Fecha de compra
                    <input
                      type="date"
                      value={initialFecha}
                      onChange={(e) => setInitialFecha(e.target.value)}
                      className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                    />
                  </label>
                </div>
                <label className="text-sm text-cacao block">
                  Proveedor / detalle
                  <input
                    type="text"
                    placeholder="Ej: Ferrum, Vivienda y Hogar"
                    value={initialProveedor}
                    onChange={(e) => setInitialProveedor(e.target.value)}
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                  />
                </label>
                <label className="text-sm text-cacao block">
                  Factura{" "}
                  <span className="text-cacao-mute font-normal">
                    (PDF o imagen, máx 10 MB)
                  </span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(e) =>
                      setInitialFactura(e.target.files?.[0] ?? null)
                    }
                    className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
                  />
                  {initialFactura && (
                    <span className="text-[10px] text-cacao-soft block mt-1">
                      Seleccionado: {initialFactura.name} (
                      {Math.round(initialFactura.size / 1024)} KB)
                    </span>
                  )}
                </label>
              </div>
            </details>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={creando}
              className="flex-1 rounded-lg bg-cacao text-white py-2 font-medium hover:bg-terracotta disabled:opacity-50"
            >
              {creando
                ? "Guardando..."
                : editingId
                  ? "Guardar"
                  : "Crear"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={creando}
              className="rounded-lg ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Lista de items agrupada */}
      {grouped.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-marfil p-12 text-center">
          <p className="font-serif italic text-cacao-soft">
            Sin items en el menaje. Agregá el primero arriba.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, list]) => (
            <section
              key={cat}
              className="rounded-2xl bg-white ring-1 ring-marfil overflow-hidden"
            >
              <header className="px-4 py-3 border-b border-marfil">
                <span className="font-display text-xs tracking-[0.3em] uppercase text-cacao-mute">
                  {cat}{" "}
                  <span className="text-cacao-mute font-normal text-[10px]">
                    ({list.length})
                  </span>
                </span>
              </header>
              <ul className="divide-y divide-marfil">
                {list.map((i) => {
                  const movsItem = movsPorItem.get(i.id) ?? [];
                  const isExpanded = expandedId === i.id;
                  return (
                    <li key={i.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : i.id)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedId(isExpanded ? null : i.id);
                          }
                        }}
                        className="p-4 grid grid-cols-12 gap-3 items-center hover:bg-marfil-soft cursor-pointer transition-colors"
                      >
                        <div className="col-span-12 sm:col-span-5 min-w-0">
                          <div className="font-medium text-cacao flex items-center gap-2">
                            <svg
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden
                              className={`size-3 text-cacao-mute transition-transform shrink-0 ${
                                isExpanded ? "rotate-90" : ""
                              }`}
                            >
                              <path
                                fillRule="evenodd"
                                d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {i.fotoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={i.fotoUrl}
                                alt=""
                                aria-hidden
                                className="size-8 rounded object-contain bg-white ring-1 ring-marfil shrink-0"
                              />
                            )}
                            <span className="truncate">{i.nombre}</span>
                          </div>
                          {i.descripcion && (
                            <div className="text-xs text-cacao-soft mt-0.5 ml-5">
                              {i.descripcion}
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                            Actual
                          </div>
                          <div className="text-sm text-cacao font-medium">
                            {i.cantidadActual.toFixed(0)}
                          </div>
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          {i.precioReposicionUsd !== undefined && (
                            <>
                              <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                                Reposición
                              </div>
                              <div className="text-xs text-cacao-soft">
                                ${i.precioReposicionUsd.toFixed(2)}
                              </div>
                            </>
                          )}
                        </div>
                        <div className="col-span-12 sm:col-span-3 flex flex-wrap gap-1.5 sm:justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openCompra(i);
                            }}
                            className="text-[10px] uppercase tracking-widest rounded-full ring-1 ring-marfil px-3 py-1.5 text-cacao-soft hover:bg-marfil-soft hover:text-cacao bg-white"
                          >
                            + Compra
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBaja(i);
                            }}
                            className="text-[10px] uppercase tracking-widest rounded-full ring-1 ring-marfil px-3 py-1.5 text-cacao-soft hover:bg-marfil-soft hover:text-cacao bg-white"
                          >
                            Registrar baja
                          </button>
                        </div>
                      </div>

                      {/* Expansión: historial completo */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pl-9 bg-marfil-soft/40 border-t border-marfil space-y-2">
                          <div className="font-display text-[10px] tracking-[0.3em] uppercase text-cacao-mute mt-3">
                            Historial
                          </div>
                          {movsItem.length === 0 ? (
                            <p className="text-xs text-cacao-soft italic font-serif py-2">
                              Sin movimientos registrados.
                            </p>
                          ) : (
                            <ul className="divide-y divide-marfil">
                              {movsItem.map((m) => {
                                const fecha = new Date(
                                  m.fecha + "T00:00",
                                ).toLocaleDateString("es-VE", {
                                  day: "numeric",
                                  month: "short",
                                  year: "numeric",
                                });
                                const esEntrada = m.cantidad > 0;
                                return (
                                  <li
                                    key={m.id}
                                    className="py-2 grid grid-cols-12 gap-2 items-start text-sm"
                                  >
                                    <div className="col-span-3 sm:col-span-2 text-xs text-cacao">
                                      {fecha}
                                    </div>
                                    <div className="col-span-6 sm:col-span-6 min-w-0">
                                      <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
                                        {tipoMenajeLabel(m.tipo)}
                                      </div>
                                      {m.motivo && (
                                        <div className="text-xs text-cacao-soft mt-0.5">
                                          {m.motivo}
                                        </div>
                                      )}
                                      {m.precioTotalUsd !== undefined && (
                                        <div className="text-xs text-cacao-soft mt-0.5">
                                          Total: ${m.precioTotalUsd.toFixed(2)}{" "}
                                          {m.precioUnitarioUsd !== undefined && (
                                            <span className="text-cacao-mute">
                                              · ${m.precioUnitarioUsd.toFixed(2)}/u
                                            </span>
                                          )}
                                        </div>
                                      )}
                                      {m.facturaUrl && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            abrirFactura(m.facturaUrl!)
                                          }
                                          className="text-[10px] uppercase tracking-widest text-cacao underline hover:text-terracotta mt-1"
                                        >
                                          <PaperclipIcon className="inline size-3.5 align-[-0.15em] mr-1" />
                                          Ver factura
                                          {m.facturaNombre && (
                                            <span className="ml-1 text-cacao-mute lowercase tracking-normal italic">
                                              ({m.facturaNombre})
                                            </span>
                                          )}
                                        </button>
                                      )}
                                      {m.nota && (
                                        <div className="text-xs text-cacao-soft italic font-serif mt-0.5">
                                          {m.nota}
                                        </div>
                                      )}
                                    </div>
                                    <div
                                      className={`col-span-2 sm:col-span-3 text-right text-sm ${
                                        esEntrada
                                          ? "text-emerald-700"
                                          : "text-terracotta"
                                      }`}
                                    >
                                      {esEntrada ? "+" : ""}
                                      {m.cantidad.toFixed(0)}
                                    </div>
                                    <div className="col-span-1 text-right">
                                      <button
                                        type="button"
                                        onClick={() => setConfirmDeleteMov(m)}
                                        title="Eliminar del historial"
                                        className="text-cacao-mute hover:text-terracotta text-lg leading-none px-1"
                                      >
                                        ×
                                      </button>
                                    </div>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                          {/* Acciones */}
                          <div className="flex gap-3 pt-2 text-[10px] uppercase tracking-widest">
                            <button
                              onClick={() => startEdit(i)}
                              className="text-cacao-soft hover:text-cacao"
                            >
                              Editar item
                            </button>
                            <button
                              onClick={() => setConfirmDeleteItem(i)}
                              className="text-cacao-soft hover:text-terracotta"
                            >
                              Eliminar item
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Modal baja */}
      {bajaItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !procesando && setBajaItem(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleBajaSubmit}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl space-y-3"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Registrar baja
            </h2>
            <p className="text-sm text-cacao-soft font-serif leading-relaxed">
              Registrar una baja te permite descontar del stock unidades que se
              rompieron, se perdieron o se deterioraron. El item sigue existiendo
              en el sistema, solo baja la cantidad disponible.
            </p>
            <div className="rounded-lg bg-marfil-soft p-3 text-sm">
              <div className="font-medium text-cacao">{bajaItem.nombre}</div>
              <div className="text-xs text-cacao-soft">
                Cantidad actual: <strong>{bajaItem.cantidadActual}</strong>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-cacao">
                Cantidad a dar de baja
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max={bajaItem.cantidadActual}
                    step="1"
                    value={bajaCant}
                    onChange={(e) => setBajaCant(e.target.value)}
                    required
                    autoFocus
                    className="w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                  />
                  <span className="shrink-0 text-xs text-cacao-mute whitespace-nowrap">
                    de {bajaItem.cantidadActual} disponibles
                  </span>
                </div>
              </label>
              <label className="text-sm text-cacao">
                Motivo
                <select
                  value={bajaTipo}
                  onChange={(e) => setBajaTipo(e.target.value as TipoBaja)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 bg-white"
                >
                  {TIPOS_BAJA_MENAJE.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm text-cacao block">
              Fecha
              <input
                type="date"
                value={bajaFecha}
                onChange={(e) => setBajaFecha(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Detalle{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="text"
                placeholder="Ej: se rompió durante el evento del sábado"
                value={bajaMotivo}
                onChange={(e) => setBajaMotivo(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Nota{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <textarea
                value={bajaNota}
                onChange={(e) => setBajaNota(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBajaItem(null)}
                disabled={procesando}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={procesando}
                className="flex-1 rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
              >
                {procesando ? "Guardando..." : "Registrar baja"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal compra */}
      {compraItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !procesando && setCompraItem(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCompraSubmit}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl space-y-3"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Registrar compra
            </h2>
            <div className="rounded-lg bg-marfil-soft p-3 text-sm">
              <div className="font-medium text-cacao">{compraItem.nombre}</div>
              <div className="text-xs text-cacao-soft">
                Stock actual: <strong>{compraItem.cantidadActual}</strong> →{" "}
                <strong className="text-emerald-700">
                  {compraItem.cantidadActual +
                    (Number(compraCant) || 0)}
                </strong>{" "}
                después de la compra
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="text-sm text-cacao">
                Cantidad
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={compraCant}
                  onChange={(e) => setCompraCant(e.target.value)}
                  required
                  autoFocus
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="text-sm text-cacao">
                Precio unitario USD
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Opcional"
                  value={compraPrecioUnit}
                  onChange={(e) => setCompraPrecioUnit(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="text-sm text-cacao">
                Total USD
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Opcional"
                  value={compraPrecioTotal}
                  onChange={(e) => setCompraPrecioTotal(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
            </div>
            <label className="text-sm text-cacao block">
              Fecha de compra
              <input
                type="date"
                value={compraFecha}
                onChange={(e) => setCompraFecha(e.target.value)}
                required
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Factura{" "}
              <span className="text-cacao-mute font-normal">
                (PDF / imagen, opcional)
              </span>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) =>
                  setCompraFactura(e.target.files?.[0] ?? null)
                }
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2 text-sm bg-white"
              />
              {compraFactura && (
                <span className="text-[10px] text-cacao-soft block mt-1">
                  Seleccionado: {compraFactura.name} (
                  {Math.round(compraFactura.size / 1024)} KB)
                </span>
              )}
            </label>
            <label className="text-sm text-cacao block">
              Proveedor / detalle{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <input
                type="text"
                placeholder="Ej: Ferrum, Vivienda y Hogar"
                value={compraMotivo}
                onChange={(e) => setCompraMotivo(e.target.value)}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <label className="text-sm text-cacao block">
              Nota{" "}
              <span className="text-cacao-mute font-normal">(opcional)</span>
              <textarea
                value={compraNota}
                onChange={(e) => setCompraNota(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
              />
            </label>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCompraItem(null)}
                disabled={procesando}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={procesando}
                className="flex-1 rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-terracotta disabled:opacity-50"
              >
                {procesando ? "Guardando..." : "Registrar compra"}
              </button>
            </div>
          </form>
        </div>
      )}
      {/* Modal: confirmar eliminar ITEM */}
      {confirmDeleteItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !borrando && setConfirmDeleteItem(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              ¿Eliminar item?
            </h2>
            <p className="mt-3 text-sm text-cacao-soft font-serif">
              Vas a borrar{" "}
              <strong className="text-cacao">{confirmDeleteItem.nombre}</strong>
              {" "}del menaje. Su historial completo de movimientos también se
              elimina.{" "}
              <span className="text-terracotta">
                Esta acción no se puede deshacer.
              </span>
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDeleteItem(null)}
                disabled={borrando}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarDeleteItem}
                disabled={borrando}
                className="rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
              >
                {borrando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirmar eliminar MOVIMIENTO */}
      {confirmDeleteMov && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cacao/40 backdrop-blur-sm"
          onClick={() => !borrando && setConfirmDeleteMov(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-md w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              ¿Eliminar movimiento?
            </h2>
            <p className="mt-3 text-sm text-cacao-soft font-serif">
              Vas a borrar este movimiento del historial.{" "}
              <span className="text-terracotta">
                La cantidad NO se restaura automáticamente — si te equivocaste,
                tendrías que ajustar el stock manualmente desde &ldquo;Editar
                item&rdquo;.
              </span>
            </p>
            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDeleteMov(null)}
                disabled={borrando}
                className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={ejecutarDeleteMov}
                disabled={borrando}
                className="rounded-xl bg-terracotta text-white px-4 py-2 font-medium hover:bg-cacao disabled:opacity-50"
              >
                {borrando ? "Eliminando..." : "Sí, eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: lista de menaje para evento (PDF) */}
      {listaOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-cacao/40 backdrop-blur-sm overflow-y-auto"
          onClick={() => !generandoPdf && setListaOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="my-6 rounded-2xl bg-white ring-1 ring-marfil p-6 max-w-2xl w-full shadow-xl"
          >
            <h2 className="font-cinzel text-xl tracking-[0.08em] text-cacao">
              Lista de menaje para evento
            </h2>
            <p className="mt-1 text-sm text-cacao-soft font-serif">
              Escoge las piezas y las cantidades. Genera un PDF como lista de
              preparación, o una cotización con precio de alquiler.
            </p>

            {/* Datos del evento */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] uppercase tracking-widest text-cacao-mute">
                  Evento
                </span>
                <input
                  type="text"
                  value={listaEvento}
                  onChange={(e) => setListaEvento(e.target.value)}
                  placeholder="Ej. Boda García"
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-widest text-cacao-mute">
                  Cliente
                </span>
                <input
                  type="text"
                  value={listaCliente}
                  onChange={(e) => setListaCliente(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-widest text-cacao-mute">
                  Fecha
                </span>
                <input
                  type="date"
                  value={listaFecha}
                  onChange={(e) => setListaFecha(e.target.value)}
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
              <label className="block">
                <span className="text-[11px] uppercase tracking-widest text-cacao-mute">
                  Notas
                </span>
                <input
                  type="text"
                  value={listaNotas}
                  onChange={(e) => setListaNotas(e.target.value)}
                  placeholder="Opcional"
                  className="mt-1 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
                />
              </label>
            </div>

            {/* Toggle precios + autollenado */}
            <div className="mt-4 rounded-xl bg-marfil-soft ring-1 ring-marfil p-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={listaConPrecios}
                  onChange={(e) => setListaConPrecios(e.target.checked)}
                  className="h-4 w-4 accent-cacao"
                />
                <span className="text-sm text-cacao font-medium">
                  Incluir precios (cotización de alquiler)
                </span>
              </label>
              {listaConPrecios && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="block">
                    <span className="text-[11px] uppercase tracking-widest text-cacao-mute">
                      % del costo de reposición
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={listaPct}
                      onChange={(e) => setListaPct(e.target.value)}
                      className="mt-1 w-24 rounded-lg ring-1 ring-marfil px-3 py-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={autollenarPrecios}
                    className="rounded-lg ring-1 ring-cacao text-cacao px-3 py-2 text-sm hover:bg-white transition-colors"
                  >
                    Autollenar precios
                  </button>
                  <span className="text-xs text-cacao-soft font-serif">
                    Aplica a los ítems con cantidad. Puedes editar cada precio.
                  </span>
                </div>
              )}
            </div>

            {/* Filtro por categoría */}
            {categoriasReales.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setListaCat("todas")}
                  className={pillClass(listaCat === "todas")}
                >
                  Todas
                </button>
                {categoriasReales.map((c) => {
                  const nSel = items.filter(
                    (it) =>
                      it.categoria === c &&
                      (Number(listaSel[it.id]?.cantidad) || 0) > 0,
                  ).length;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setListaCat(c)}
                      className={pillClass(listaCat === c)}
                    >
                      {c}
                      {nSel > 0 ? ` · ${nSel}` : ""}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Buscador */}
            <input
              type="text"
              placeholder="Buscar pieza..."
              value={listaBuscar}
              onChange={(e) => setListaBuscar(e.target.value)}
              className="mt-3 w-full rounded-lg ring-1 ring-marfil px-3 py-2"
            />

            {/* Lista de ítems */}
            <div className="mt-3 max-h-[45vh] overflow-y-auto rounded-xl ring-1 ring-marfil divide-y divide-marfil">
              {listaItemsFiltrados.length === 0 ? (
                <p className="p-4 text-sm text-cacao-soft text-center">
                  No hay piezas que coincidan.
                </p>
              ) : (
                listaItemsFiltrados.map((it) => {
                  const sel = listaSel[it.id] ?? { cantidad: "", precio: "" };
                  const cant = Number(sel.cantidad) || 0;
                  const excede = cant > it.cantidadActual;
                  return (
                    <div
                      key={it.id}
                      className="flex flex-wrap items-center gap-3 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-cacao font-medium truncate">
                          {it.nombre}
                        </p>
                        <p className="text-[11px] uppercase tracking-widest text-cacao-mute">
                          {it.categoria} · disp. {it.cantidadActual}
                        </p>
                      </div>
                      <label className="block">
                        <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
                          Cant.
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={sel.cantidad}
                          onChange={(e) =>
                            setSel(it.id, { cantidad: e.target.value })
                          }
                          className={`mt-0.5 w-20 rounded-lg ring-1 px-2 py-1.5 text-right ${
                            excede
                              ? "ring-terracotta text-terracotta"
                              : "ring-marfil"
                          }`}
                        />
                      </label>
                      {listaConPrecios && (
                        <label className="block">
                          <span className="text-[10px] uppercase tracking-widest text-cacao-mute">
                            P. unit
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={sel.precio}
                            onChange={(e) =>
                              setSel(it.id, { precio: e.target.value })
                            }
                            className="mt-0.5 w-24 rounded-lg ring-1 ring-marfil px-2 py-1.5 text-right"
                          />
                        </label>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-cacao-soft">
                {listaSelCount === 0
                  ? "Ninguna pieza seleccionada"
                  : `${listaSelCount} pieza(s) seleccionada(s)`}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setListaOpen(false)}
                  disabled={generandoPdf}
                  className="rounded-xl ring-1 ring-marfil px-4 py-2 text-cacao hover:bg-marfil-soft disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={generarListaPDF}
                  disabled={generandoPdf || listaSelCount === 0}
                  className="rounded-xl bg-cacao text-white px-4 py-2 font-medium hover:bg-cacao-soft disabled:opacity-50"
                >
                  {generandoPdf ? "Generando..." : "Generar PDF"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

