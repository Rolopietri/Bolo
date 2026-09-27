import { Header } from "@/components/Header";
import Link from "next/link";
import { MermaClient } from "./MermaClient";

export default function MermaPage() {
  return (
    <>
      <Header subtitle="Cocina · Inventario" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina · Inventario
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Merma por conteo
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Cuánto se pierde entre lo que el sistema espera y lo que cuentas de
              verdad, conteo por conteo, valorado en dólares. La base para
              estandarizar tu merma y afinar cuánto comprar.
            </p>
          </div>
          <Link
            href="/cocina/catalogo"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Insumos e Inventario
          </Link>
        </section>
        <MermaClient />
      </main>
    </>
  );
}
