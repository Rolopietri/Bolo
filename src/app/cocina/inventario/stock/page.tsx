import { Header } from "@/components/Header";
import Link from "next/link";
import { StockClient } from "./StockClient";

export default function StockPage() {
  return (
    <>
      <Header subtitle="Stock" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10">
        <section className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Cocina</p>
            <h1 className="mt-2 font-cinzel text-2xl uppercase tracking-[0.12em] text-cacao sm:text-3xl">
              Stock
            </h1>
            <p className="mt-3 max-w-2xl font-serif italic text-cacao-soft">
              Lo que hay libre, lo que vale y lo que se acaba pronto.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Hoy
          </Link>
        </section>
        <StockClient />
      </main>
    </>
  );
}
