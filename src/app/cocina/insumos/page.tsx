import { Header } from "@/components/Header";
import Link from "next/link";
import { InsumosClient } from "./InsumosClient";

export default function InsumosPage() {
  return (
    <>
      <Header subtitle="Insumos" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              M1 · Materias primas
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Insumos
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Catálogo de ingredientes con precios, stock y proveedor.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver
          </Link>
        </section>
        <InsumosClient />
      </main>
    </>
  );
}
