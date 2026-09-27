import { Header } from "@/components/Header";
import Link from "next/link";
import { CosteoClient } from "./CosteoClient";

export default function CosteoPage() {
  return (
    <>
      <Header subtitle="Cocina · M3" />
      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina · Módulo 3
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Costeo
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Costo de producción por receta y decisión del precio de venta.
              Editá el precio sin / con IVA directamente desde acá — sin entrar
              a la receta.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <CosteoClient />
      </main>
    </>
  );
}
