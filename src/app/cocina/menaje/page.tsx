import { Header } from "@/components/Header";
import Link from "next/link";
import { MenajeClient } from "./MenajeClient";

export default function MenajePage() {
  return (
    <>
      <Header subtitle="Cocina · M6" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Cocina · Módulo 6
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Menaje
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Vajilla, cristalería, cubiertos, bandejas y utensilios.
              Registrá bajas por rotura, deterioro o pérdida — y compras
              con factura adjunta para que el inventario se actualice solo.
            </p>
          </div>
          <Link
            href="/cocina"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </section>
        <MenajeClient />
      </main>
    </>
  );
}
