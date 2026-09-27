import { Header } from "@/components/Header";
import Link from "next/link";
import { PresupuestosList } from "../PresupuestosList";

export default function PresupuestosListaPage() {
  return (
    <>
      <Header subtitle="Presupuestos" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Documentos
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Presupuestos
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Histórico de presupuestos generados.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/presupuestos"
              className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
            >
              ← Volver
            </Link>
            <Link
              href="/presupuestos/nuevo"
              className="rounded-xl bg-cacao text-white px-5 py-2.5 font-medium hover:bg-terracotta transition-colors"
            >
              + Nuevo presupuesto
            </Link>
          </div>
        </section>

        <PresupuestosList />
      </main>
    </>
  );
}
