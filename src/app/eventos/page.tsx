import { Header } from "@/components/Header";
import { EventosClient } from "./EventosClient";

export default function EventosPage() {
  return (
    <>
      <Header subtitle="Eventos" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">
        <EventosClient />
      </main>
    </>
  );
}
