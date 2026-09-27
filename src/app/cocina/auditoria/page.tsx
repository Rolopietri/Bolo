import { Header } from "@/components/Header";
import Link from "next/link";
import { AuditoriaClient } from "./AuditoriaClient";

export default function AuditoriaStockPage() {
  return (
    <>
      <Header subtitle="Inventario · Auditoría de stock" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Módulo 1 · Trazabilidad
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Auditoría de stock
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Historial automático de cada cambio de stock de los insumos:
              cuándo, cuánto y de dónde vino. La red de seguridad para que
              ningún ajuste vuelva a quedar sin rastro.
            </p>
          </div>
          <Link
            href="/cocina/catalogo"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver a M1
          </Link>
        </section>
        <AuditoriaClient />
      </main>
    </>
  );
}
