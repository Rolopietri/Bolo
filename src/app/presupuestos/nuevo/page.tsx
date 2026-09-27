import { Header } from "@/components/Header";
import { NuevoPresupuestoForm } from "./NuevoPresupuestoForm";

export default function NuevoPresupuestoPage() {
  return (
    <>
      <Header subtitle="Nuevo presupuesto" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Documentos
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Nuevo Presupuesto
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft">
            Datos del cliente, evento y servicios. El PDF se genera al guardar.
          </p>
        </section>
        <NuevoPresupuestoForm />
      </main>
    </>
  );
}
