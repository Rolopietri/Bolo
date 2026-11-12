import { Header } from "@/components/Header";
import { HomeCocina } from "./_HomeCocina";

// El saludo y la fecha son de hoy (hora de Caracas). No se prerenderiza.
export const dynamic = "force-dynamic";

export default function CocinaHub() {
  return (
    <>
      <Header subtitle="Hoy" />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:py-10">
        <HomeCocina modulos={process.env.BOLO_MODULOS} />
      </main>
    </>
  );
}
