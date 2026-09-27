import { Header } from "@/components/Header";
import { RecetaDetail } from "./RecetaDetail";

export default async function RecetaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Header subtitle="Receta" />
      <main className="flex-1 mx-auto w-full max-w-4xl px-5 py-10">
        <RecetaDetail id={id} />
      </main>
    </>
  );
}
