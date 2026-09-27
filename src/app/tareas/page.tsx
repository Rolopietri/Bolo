import { Header } from "@/components/Header";
import { SistemaOperativoClient } from "./SistemaOperativoClient";

export default function TareasPage() {
  return (
    <>
      <Header subtitle="Tareas" />
      <main className="flex-1 mx-auto w-full max-w-6xl px-5 py-8">
        <SistemaOperativoClient />
      </main>
    </>
  );
}
