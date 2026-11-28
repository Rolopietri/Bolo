import { Header } from "@/components/Header";
import Link from "next/link";
import { ProduccionClient } from "./ProduccionClient";

// Producción: abre directo el registro de lotes (recibido, útil, desecho) y,
// debajo, las comparaciones de merma y de cuadre con las ventas.
export default function ProduccionPage() {
  return (
    <>
      <Header subtitle="Producción" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Cocina · Recetas</p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Producción
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Cuánto entra sin procesar, cuánto queda procesado y cuánto se desecha.
            </p>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/cocina/produccion/en-uso" className="text-xs font-bold uppercase tracking-widest text-cacao hover:text-terracotta-deep">
              En uso →
            </Link>
            <Link href="/cocina" className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
              ← Cocina
            </Link>
          </div>
        </section>
        <ProduccionClient />
      </main>
    </>
  );
}
