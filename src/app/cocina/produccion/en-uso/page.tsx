import { Header } from "@/components/Header";
import Link from "next/link";
import { EnUsoClient } from "./EnUsoClient";

// En uso: lo que hay listo en la estación ahora, partido entre lo que viene de
// la jornada anterior y lo habilitado en esta. Es la última parada del flujo
// Almacén → Producción → En uso, por eso vive dentro de Producción.
export default function EnUsoPage() {
  return (
    <>
      <Header subtitle="En uso" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">
        <section className="mb-5 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Cocina · Producción</p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">En uso</h1>
          </div>
          <Link href="/cocina/produccion" className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
            ← Producción
          </Link>
        </section>
        <EnUsoClient />
      </main>
    </>
  );
}
