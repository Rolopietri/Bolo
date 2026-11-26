import { Header } from "@/components/Header";
import { NegocioForm } from "./NegocioForm";

export const metadata = { title: "Perfil del negocio · bolo" };
export const dynamic = "force-dynamic";

export default function NegocioPage() {
  return (
    <>
      <Header subtitle="Negocio" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <section className="mb-8">
          <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
            Ajustes
          </p>
          <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
            Perfil del negocio
          </h1>
          <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
            Aquí se indica el nombre del local, la hora habitual de apertura y la hora máxima de cierre, con una observación si hace falta.
          </p>
        </section>
        <NegocioForm />
      </main>
    </>
  );
}
