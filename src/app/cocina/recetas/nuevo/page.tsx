import { Header } from "@/components/Header";
import { RecetaForm } from "../RecetaForm";

export default function NuevaRecetaPage() {
  return (
    <>
      <Header subtitle="Nueva receta" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            M2 · Recetario
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Nueva receta
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft">
            Selecciona ingredientes del catálogo, define las cantidades, y el
            costo se calcula automáticamente.
          </p>
        </section>
        <RecetaForm />
      </main>
    </>
  );
}
