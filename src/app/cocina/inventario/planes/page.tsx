import { Header } from "@/components/Header";
import Link from "next/link";
import { PlanesClient } from "./PlanesClient";

export default function PlanesProduccionPage() {
  return (
    <>
      <Header subtitle="Inventario · Planes" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Módulo 5 · Producción
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Planes de producción
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Reservá stock por adelantado para producciones planificadas. Al
              crear un plan, los ingredientes pasan de libre a comprometido. Al
              completarlo, salen del stock total.
            </p>
          </div>
          <Link
            href="/cocina/inventario"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver a M5
          </Link>
        </section>
        <PlanesClient />
      </main>
    </>
  );
}
