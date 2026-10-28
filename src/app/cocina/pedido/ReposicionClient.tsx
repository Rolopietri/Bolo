"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { CheckIcon, WarningIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { ErrorCarga } from "@/components/ErrorCarga";
import { EstadoVacioCocina } from "@/components/EstadoVacioCocina";
import { createComprasLote, listInsumos, listProveedores } from "@/lib/data/cocina";
import { extractError } from "@/lib/data/error";
import {
  leerCantidad,
  prepararComprasReposicion,
  referenciaPedido,
  sugerirReposicion,
  type CompraDesdeReposicion,
  type LineaReposicion,
  type ResumenReposicion,
} from "@/lib/reposicion";
import { displayCantidad } from "@/lib/units";
import { hoyISO } from "@/lib/ui";

type Decision = {
  pedir: boolean;
  empaques: string;
  precio: string;
};

function decisionesIniciales(lineas: LineaReposicion[]): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const l of lineas) {
    out[l.insumoId] = {
      pedir: true,
      empaques: String(l.empaques),
      precio: l.precioCompraUsd != null ? String(Number(l.precioCompraUsd.toFixed(4))) : "",
    };
  }
  return out;
}

function dinero(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function ReposicionClient({ onVerRaciones }: { onVerRaciones: () => void }) {
  const [resumen, setResumen] = useState<ResumenReposicion | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const [referenciaAviso, setReferenciaAviso] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [insumos, proveedores] = await Promise.all([listInsumos(), listProveedores()]);
        if (cancelado) return;
        setResumen(
          sugerirReposicion(
            insumos.map((i) => ({
              id: i.id,
              nombre: i.nombre,
              activo: i.activo,
              unidadCompra: i.unidadCompra,
              unidadBase: i.unidadBase,
              cantidadPorCompra: i.cantidadPorCompra,
              stockTotal: i.stockTotal,
              stockComprometido: i.stockComprometido,
              stockMinimo: i.stockMinimo,
              precioCompraUsd: i.precioCompraUsd,
              proveedorId: i.proveedorId,
            })),
            proveedores.map((p) => ({ id: p.id, nombre: p.nombre })),
          ),
        );
        setErrorCarga(null);
      } catch (e) {
        if (!cancelado) setErrorCarga(extractError(e, "Error cargando"));
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [intento]);

  function reintentar() {
    setLoading(true);
    setErrorCarga(null);
    setIntento((n) => n + 1);
  }

  if (loading && !resumen) {
    return (
      <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
        Cargando el stock…
      </div>
    );
  }
  if (errorCarga && !resumen) {
    return (
      <ErrorCarga que="los insumos del pedido" detalle={errorCarga} onReintentar={reintentar} />
    );
  }
  if (!resumen) return null;

  const firma = resumen.lineas
    .map((l) => `${l.insumoId}:${l.stockLibre}:${l.empaques}:${l.precioCompraUsd ?? ""}`)
    .join("|");

  return (
    <div className="space-y-5">
      <p className="max-w-2xl text-sm text-cacao-soft">
        Compara el stock libre de hoy con el mínimo de cada insumo. El libre ya
        resta lo vendido y lo reservado. Ajustas la cantidad, quitas lo que no
        vas a pedir y, cuando la mercancía llega, lo registras como compra.
      </p>

      {aviso && referenciaAviso && (
        <div className="rounded-lg bg-[#F1F4ED] ring-1 ring-[#C9D6BC] p-3 text-sm text-[#2F4A1F]">
          {aviso}{" "}
          <Link href="/cocina/compras" className="font-semibold underline">
            Verla en Compras
          </Link>
          <span className="text-[#2F4A1F]/80"> · {referenciaAviso}</span>
        </div>
      )}

      {errorCarga && resumen && (
        <ErrorCarga
          que="los insumos del pedido"
          detalle={errorCarga}
          onReintentar={reintentar}
          desactualizado
        />
      )}

      {resumen.insumosActivos === 0 ? (
        <EstadoVacioCocina
          titulo="Todavía no hay insumos para pedir"
          beneficio="Cuando cargues insumos con un stock mínimo, aquí sale lo que está agotado o por debajo."
          cta="Agregar insumo"
          href="/cocina/insumos"
          onDemo={reintentar}
        />
      ) : resumen.sinMinimo === resumen.insumosActivos ? (
        <Vacio
          icono="aviso"
          titulo="Falta el mínimo"
          texto="Hay insumos, pero ninguno tiene stock mínimo. Sin eso bolo no sabe qué conviene pedir."
        >
          <Link
            href="/cocina/insumos"
            className="mt-6 inline-flex rounded-xl bg-cacao px-5 py-2.5 font-medium text-white hover:bg-terracotta"
          >
            Definir mínimos
          </Link>
        </Vacio>
      ) : resumen.lineas.length === 0 ? (
        <Vacio
          icono="ok"
          titulo="Stock en orden"
          texto="Nada está agotado ni por debajo del mínimo. No hace falta pedir hoy."
        >
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onVerRaciones}
              className="rounded-xl bg-cacao px-5 py-2.5 font-medium text-white hover:bg-terracotta"
            >
              Calcular por raciones
            </button>
            <Link
              href="/cocina/insumos"
              className="rounded-xl bg-white px-5 py-2.5 text-sm text-cacao ring-1 ring-marfil hover:bg-marfil-soft"
            >
              Ver insumos
            </Link>
          </div>
          {resumen.sinMinimo > 0 && <NotaSinMinimo n={resumen.sinMinimo} />}
        </Vacio>
      ) : (
        <Editor
          key={firma}
          lineas={resumen.lineas}
          sinMinimo={resumen.sinMinimo}
          onHecho={(mensaje, referencia) => {
            setAviso(mensaje);
            setReferenciaAviso(referencia);
            reintentar();
          }}
        />
      )}
    </div>
  );
}

function Editor({
  lineas,
  sinMinimo,
  onHecho,
}: {
  lineas: LineaReposicion[];
  sinMinimo: number;
  onHecho: (mensaje: string, referencia: string) => void;
}) {
  const [decisiones, setDecisiones] = useState(() => decisionesIniciales(lineas));
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pendiente, setPendiente] = useState<{
    compras: CompraDesdeReposicion[];
    referencia: string;
    total: number;
  } | null>(null);

  const grupos = useMemo(() => {
    const map = new Map<string, LineaReposicion[]>();
    for (const l of lineas) {
      const k = l.proveedorNombre ?? "Sin proveedor";
      const arr = map.get(k);
      if (arr) arr.push(l);
      else map.set(k, [l]);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === "Sin proveedor") return 1;
      if (b[0] === "Sin proveedor") return -1;
      return a[0].localeCompare(b[0], "es");
    });
  }, [lineas]);

  const aprobadas = lineas.flatMap((l) => {
    const d = decisiones[l.insumoId];
    if (!d?.pedir) return [];
    return [
      {
        linea: l,
        empaques: leerCantidad(d.empaques),
        precio: leerCantidad(d.precio),
      },
    ];
  });
  const conPrecio = aprobadas.filter(
    (a) => a.empaques != null && a.empaques > 0 && a.precio != null && a.precio > 0,
  );
  const total = conPrecio.reduce((s, a) => s + (a.empaques ?? 0) * (a.precio ?? 0), 0);
  const faltanPrecios = aprobadas.length - conPrecio.length;

  function patch(id: string, parcial: Partial<Decision>) {
    setDecisiones((prev) => ({ ...prev, [id]: { ...prev[id], ...parcial } }));
  }

  function marcarTodas(pedir: boolean) {
    setDecisiones((prev) => {
      const next = { ...prev };
      for (const l of lineas) next[l.insumoId] = { ...next[l.insumoId], pedir };
      return next;
    });
  }

  function abrirConfirmacion() {
    const borrador = aprobadas.map((a) => ({
      insumoId: a.linea.insumoId,
      nombre: a.linea.nombre,
      proveedorId: a.linea.proveedorId,
      motivo: a.linea.motivo,
      empaques: a.empaques ?? 0,
      precioUnitarioUsd: a.precio ?? 0,
    }));
    const referencia = referenciaPedido();
    const prep = prepararComprasReposicion(borrador, { fecha: hoyISO(), numeroFactura: referencia });
    if (prep.error) {
      setError(prep.error);
      return;
    }
    setError(null);
    setPendiente({
      compras: prep.compras,
      referencia,
      total: prep.compras.reduce((s, c) => s + c.precioTotalUsd, 0),
    });
  }

  async function registrar() {
    if (!pendiente) return;
    setGuardando(true);
    setError(null);
    try {
      await createComprasLote(
        pendiente.compras.map((c) => ({
          insumoId: c.insumoId,
          proveedorId: c.proveedorId,
          fecha: c.fecha,
          cantidad: c.cantidad,
          precioTotalUsd: c.precioTotalUsd,
          notas: c.notas,
          numeroFactura: c.numeroFactura,
          pagada: false,
        })),
      );
      const n = pendiente.compras.length;
      const ref = pendiente.referencia;
      setPendiente(null);
      onHecho(
        n === 1
          ? "Listo. Quedó 1 compra por pagar y el stock ya subió."
          : `Listo. Quedaron ${n.toLocaleString("es-VE")} compras por pagar y el stock ya subió.`,
        ref,
      );
    } catch (e) {
      setError(extractError(e, "No se pudo registrar la compra"));
      setPendiente(null);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <section className="rounded-2xl bg-marfil-soft p-5 ring-1 ring-marfil">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-cacao-mute">
              {aprobadas.length === 1 ? "1 para pedir" : `${aprobadas.length.toLocaleString("es-VE")} para pedir`}
              {lineas.length !== aprobadas.length
                ? ` · ${(lineas.length - aprobadas.length).toLocaleString("es-VE")} fuera`
                : ""}
            </div>
            <div className="mt-1 font-cinzel text-3xl text-cacao">
              {faltanPrecios > 0 && conPrecio.length === 0 ? "Sin precio" : dinero(total)}
            </div>
            {faltanPrecios > 0 && (
              <p className="mt-1 text-xs text-cacao-soft">
                {faltanPrecios === 1
                  ? "A 1 insumo le falta cantidad o precio."
                  : `A ${faltanPrecios.toLocaleString("es-VE")} insumos les falta cantidad o precio.`}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={abrirConfirmacion}
            disabled={guardando}
            className="rounded-xl bg-cacao px-5 py-2.5 font-medium text-white hover:bg-terracotta disabled:opacity-50"
          >
            Registrar compra
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs uppercase tracking-widest text-cacao-soft">
          <button type="button" onClick={() => marcarTodas(true)} className="hover:text-cacao">
            Incluir todos
          </button>
          <button type="button" onClick={() => marcarTodas(false)} className="hover:text-cacao">
            Quitar todos
          </button>
        </div>
      </section>

      {grupos.map(([proveedor, items]) => (
        <section key={proveedor} className="overflow-hidden rounded-2xl bg-white ring-1 ring-marfil">
          <h2 className="border-b border-marfil px-4 py-3 font-display text-xs uppercase tracking-[0.3em] text-cacao sm:px-5">
            {proveedor}
          </h2>
          <ul className="divide-y divide-marfil">
            {items.map((l) => {
              const d = decisiones[l.insumoId];
              const pedir = d?.pedir ?? true;
              const empaques = leerCantidad(d?.empaques ?? "");
              const cubre =
                empaques != null && empaques > 0 ? empaques * l.cantidadPorCompra : null;
              return (
                <li key={l.insumoId} className={`px-4 py-4 sm:px-5 ${pedir ? "" : "bg-marfil-soft/60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`font-medium text-cacao ${pedir ? "" : "line-through decoration-cacao-mute"}`}>
                        {l.nombre}
                      </div>
                      <p className="mt-1 text-xs text-cacao-soft">
                        {l.motivo === "agotado"
                          ? "Agotado: no queda stock libre."
                          : `Bajo el mínimo: hay ${displayCantidad(l.stockLibre, l.unidadBase)} libres.`}
                        {" "}
                        Mínimo {displayCantidad(l.stockMinimo, l.unidadBase)}.
                        {l.comprometido > 0
                          ? ` Hay ${displayCantidad(l.comprometido, l.unidadBase)} reservados.`
                          : ""}
                      </p>
                    </div>
                    <Pastilla motivo={l.motivo} />
                  </div>

                  {pedir ? (
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm text-cacao">
                        Cantidad
                        <span className="ml-1 text-xs font-normal text-cacao-mute">
                          en {l.unidadCompra || "empaque"}
                        </span>
                        <input
                          inputMode="decimal"
                          value={d?.empaques ?? ""}
                          onChange={(e) => patch(l.insumoId, { empaques: e.target.value })}
                          className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-marfil"
                        />
                        <span className="mt-1 block text-[11px] text-cacao-mute">
                          Sugerido {l.empaques.toLocaleString("es-VE")} para cubrir{" "}
                          {displayCantidad(l.faltanteBase, l.unidadBase)}.
                          {cubre != null ? ` Esto cubre ${displayCantidad(cubre, l.unidadBase)}.` : ""}
                        </span>
                      </label>
                      <label className="block text-sm text-cacao">
                        Precio del empaque
                        <span className="ml-1 text-xs font-normal text-cacao-mute">USD</span>
                        <input
                          inputMode="decimal"
                          value={d?.precio ?? ""}
                          placeholder={l.precioCompraUsd == null ? "Sin precio todavía" : undefined}
                          onChange={(e) => patch(l.insumoId, { precio: e.target.value })}
                          className="mt-1 w-full rounded-lg px-3 py-2 text-sm ring-1 ring-marfil"
                        />
                        <span className="mt-1 block text-[11px] text-cacao-mute">
                          {empaques != null &&
                          empaques > 0 &&
                          leerCantidad(d?.precio ?? "") != null &&
                          (leerCantidad(d?.precio ?? "") ?? 0) > 0
                            ? `Total ${dinero(empaques * (leerCantidad(d?.precio ?? "") ?? 0))}.`
                            : "Hace falta para registrar la compra."}
                        </span>
                      </label>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs italic text-cacao-soft">No va en este pedido.</p>
                  )}

                  <button
                    type="button"
                    onClick={() => patch(l.insumoId, { pedir: !pedir })}
                    className="mt-3 text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
                  >
                    {pedir ? "Quitar" : "Volver a incluir"}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {sinMinimo > 0 && <NotaSinMinimo n={sinMinimo} />}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-marfil">
        <p className="max-w-md text-xs text-cacao-soft">
          Al registrar, el stock sube como en Compras y queda por pagar. Si la
          mercancía todavía no llegó, espera a tenerla.
        </p>
        <button
          type="button"
          onClick={abrirConfirmacion}
          disabled={guardando}
          className="rounded-xl bg-cacao px-5 py-2.5 font-medium text-white hover:bg-terracotta disabled:opacity-50"
        >
          Registrar compra
        </button>
      </div>

      <ConfirmDialog
        open={pendiente !== null}
        danger={false}
        busy={guardando}
        title="¿Registrar la compra?"
        confirmLabel="Ya llegó, registrar"
        cancelLabel="Todavía no"
        onCancel={() => {
          if (!guardando) setPendiente(null);
        }}
        onConfirm={registrar}
        message={
          pendiente ? (
            <>
              Se anotan {pendiente.compras.length.toLocaleString("es-VE")}{" "}
              {pendiente.compras.length === 1 ? "insumo" : "insumos"} en Compras, por
              pagar, con la referencia {pendiente.referencia}. Total{" "}
              {dinero(pendiente.total)}. El stock sube ahora, igual que cuando
              registras una compra que ya llegó.
            </>
          ) : null
        }
      />
    </div>
  );
}

function Pastilla({ motivo }: { motivo: "agotado" | "bajo" }) {
  const agotado = motivo === "agotado";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest ring-1 ${
        agotado
          ? "bg-red-50 text-red-800 ring-red-200"
          : "bg-amber-50 text-amber-900 ring-amber-200"
      }`}
    >
      <span className={`size-1.5 rounded-full ${agotado ? "bg-red-500" : "bg-amber-500"}`} aria-hidden />
      {agotado ? "Agotado" : "Bajo mínimo"}
    </span>
  );
}

function NotaSinMinimo({ n }: { n: number }) {
  const texto =
    n === 1
      ? "1 insumo no tiene mínimo, así que no entra en esta lista."
      : `${n.toLocaleString("es-VE")} insumos no tienen mínimo, así que no entran en esta lista.`;
  return (
    <p className="text-sm text-cacao-soft">
      {texto}{" "}
      <Link href="/cocina/insumos" className="font-semibold text-terracotta hover:underline">
        Definir mínimos
      </Link>
    </p>
  );
}

function Vacio({
  icono,
  titulo,
  texto,
  children,
}: {
  icono: "ok" | "aviso";
  titulo: string;
  texto: string;
  children?: ReactNode;
}) {
  const ok = icono === "ok";
  return (
    <div
      className={`rounded-2xl px-6 py-12 text-center ring-1 ${
        ok ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-marfil"
      }`}
    >
      <div className={`mb-3 flex justify-center ${ok ? "text-emerald-700" : "text-terracotta"}`}>
        {ok ? <CheckIcon className="size-8" /> : <WarningIcon className="size-8" />}
      </div>
      <h2 className="font-cinzel text-xl uppercase tracking-[0.08em] text-cacao">{titulo}</h2>
      <p className="mx-auto mt-3 max-w-md font-serif italic text-cacao-soft">{texto}</p>
      {children}
    </div>
  );
}
