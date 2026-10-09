import { Header } from "@/components/Header";
import Link from "next/link";
import { ConteoFisicoClient } from "./ConteoFisicoClient";

export default function ConteoFisicoPage() {
  return (
    <>
      <Header subtitle="Conteo físico" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-6 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Insumos e Inventario
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Conteo físico
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Cuadra el inventario con la realidad: pon el stock real (a mano o
              importando el Excel). La merma que revela cada conteo, valorada en
              dólares, la ves en{" "}
              <Link href="/cocina/insumos?vista=mermas" className="not-italic underline hover:text-terracotta">
                Insumos → Mermas y pérdidas
              </Link>
              .
            </p>
          </div>
          <Link
            href="/cocina/catalogo"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Insumos e Inventario
          </Link>
        </section>
        <ConteoFisicoClient />
      </main>
    </>
  );
}
