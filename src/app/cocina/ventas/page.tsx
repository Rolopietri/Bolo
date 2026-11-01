import { Header } from "@/components/Header";
import Link from "next/link";
import { VentasClient } from "./VentasClient";

export default function VentasPage() {
  return (
    <>
      <Header subtitle="Ventas" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Compras, Ventas y Pedidos
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Ventas del día
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Anota los platos del día o sube el cierre del POS. Las dos formas
              guardan en el mismo libro y el stock se descuenta solo.
            </p>
          </div>
          <Link
            href="/cocina/inventario"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Compras, Ventas y Pedidos
          </Link>
        </section>
        <VentasClient />
      </main>
    </>
  );
}
