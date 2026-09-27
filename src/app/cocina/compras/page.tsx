import { Header } from "@/components/Header";
import Link from "next/link";
import { ComprasClient } from "./ComprasClient";

export default function ComprasPage() {
  return (
    <>
      <Header subtitle="Compras" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              M5 · Compras
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Compras
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Cada compra registrada actualiza el stock y el precio del insumo
              automáticamente.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver
          </Link>
        </section>
        <ComprasClient />
      </main>
    </>
  );
}
