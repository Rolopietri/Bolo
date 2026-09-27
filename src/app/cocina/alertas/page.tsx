import { Header } from "@/components/Header";
import Link from "next/link";
import { AlertasClient } from "./AlertasClient";

export default function AlertasPage() {
  return (
    <>
      <Header subtitle="Alertas de stock" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              M1 · Inventario
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Alertas de stock
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Insumos por debajo del mínimo configurado en su ficha.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver
          </Link>
        </section>
        <AlertasClient />
      </main>
    </>
  );
}
