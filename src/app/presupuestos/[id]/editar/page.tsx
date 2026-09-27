import { Header } from "@/components/Header";
import Link from "next/link";
import { EditarPresupuestoForm } from "./EditarPresupuestoForm";

export default async function EditarPresupuestoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Header subtitle="Editar presupuesto" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">
              Presupuestos · Edición
            </p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Editar
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft max-w-2xl">
              Cambiá cualquier dato del presupuesto. Antes de guardar, el
              estado actual se archiva como una versión anterior visible en el
              historial.
            </p>
          </div>
          <Link
            href={`/presupuestos/${id}`}
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            ← Volver al presupuesto
          </Link>
        </section>
        <EditarPresupuestoForm id={id} />
      </main>
    </>
  );
}
