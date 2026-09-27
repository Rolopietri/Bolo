import { Header } from "@/components/Header";
import Link from "next/link";
import { SubHubGrid, type SubModulo } from "../_SubHub";

const SUBMODULOS: SubModulo[] = [
  {
    href: "/cocina/inventario/planes",
    label: "Planes de producción",
    desc: "Reservá stock por adelantado para producciones planificadas (eventos, batches).",
  },
  {
    href: "/cocina/compras",
    label: "Compras",
    desc: "Registrar pedidos recibidos — actualiza stock y precio del insumo automáticamente.",
  },
  {
    href: "/cocina/ventas",
    label: "Ventas",
    desc: "Importar Xetux o registrar manual — descuenta stock automáticamente.",
  },
  {
    href: "/cocina/pedido",
    label: "Pedido sugerido",
    desc: "Lista de compras a partir de tus raciones objetivo. Guarda pedidos.",
  },
];

export default function InventarioHubPage() {
  return (
    <>
      <Header subtitle="Cocina · M5" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina · Módulo 5
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Producción, Compras y Ventas
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Centro de operaciones: planes de producción, registro de compras
              y ventas del POS, y el pedido sugerido. Lo que mueve el
              inventario que ves en M1.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <SubHubGrid modulos={SUBMODULOS} />
      </main>
    </>
  );
}
