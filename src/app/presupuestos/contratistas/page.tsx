import { Header } from "@/components/Header";
import Link from "next/link";
import { ContratistasClient } from "./ContratistasClient";

export default function ContratistasPage() {
  return (
    <>
      <Header subtitle="Contratistas" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Presupuestos · Terceros
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Contratistas
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Red de servicios de terceros que coordinamos y ofrecemos al
              cliente para eventos.
            </p>
          </div>
          <Link
            href="/presupuestos"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver
          </Link>
        </section>
        <ContratistasClient />
      </main>
    </>
  );
}
