import { Header } from "@/components/Header";
import { EventoDetailClient } from "./EventoDetailClient";

export default async function EventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <Header subtitle="Evento" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-8">
        <EventoDetailClient id={id} />
      </main>
    </>
  );
}
