import { Header } from "@/components/Header";
import Link from "next/link";
import { Suspense } from "react";
import { RecetasList } from "./RecetasList";

export default function RecetasPage() {
  return (
    <>
      <Header subtitle="Recetario" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              M2 · Recetario
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Recetas
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Ficha técnica con ingredientes, procedimiento y costo automático.
              Imprimible en PDF para la cocina.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/cocina"
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              ← Volver
            </Link>
            <Link
              href="/cocina/recetas/nuevo"
              className="rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors"
            >
              + Nueva receta
            </Link>
          </div>
        </section>
        <Suspense
          fallback={
            <div className="rounded-2xl bg-white ring-1 ring-marfil p-8 text-center text-cacao-soft">
              Cargando recetas...
            </div>
          }
        >
          <RecetasList />
        </Suspense>
      </main>
    </>
  );
}
