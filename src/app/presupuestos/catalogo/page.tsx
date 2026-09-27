import { Header } from "@/components/Header";
import Link from "next/link";
import { ServiciosClient } from "./ServiciosClient";

export default function CatalogoServiciosPage() {
  return (
    <>
      <Header subtitle="Catálogo de servicios" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Presupuestos · Catálogo
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Catálogo de Servicios
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Espacios, personal y servicios propios con sus tarifas. Al crear
              un presupuesto, los seleccionas con un clic.
            </p>
          </div>
          <Link
            href="/presupuestos"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver
          </Link>
        </section>
        <ServiciosClient />
      </main>
    </>
  );
}
