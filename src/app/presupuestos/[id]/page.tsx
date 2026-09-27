import { Header } from "@/components/Header";
import { PresupuestoDetail } from "./PresupuestoDetail";

export default async function PresupuestoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Header subtitle="Presupuesto" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <PresupuestoDetail id={id} />
      </main>
    </>
  );
}
