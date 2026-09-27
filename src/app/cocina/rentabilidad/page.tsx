import { Header } from "@/components/Header";
import Link from "next/link";
import { RentabilidadClient } from "./RentabilidadClient";

export default function RentabilidadPage() {
  return (
    <>
      <Header subtitle="Cocina · M4" />
      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina · Módulo 4
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Rentabilidad y Precio de Venta
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Margen bruto, margen neto, food cost % y semáforo por receta.
              Para fijar el precio de venta →{" "}
              <Link
                href="/cocina/costeo"
                className="underline hover:text-cacao"
              >
                Costeo (M3)
              </Link>
              .
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <RentabilidadClient />
      </main>
    </>
  );
}
