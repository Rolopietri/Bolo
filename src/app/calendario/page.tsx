import { Header } from "@/components/Header";
import { CalendarioClient } from "./CalendarioClient";

export default function CalendarioPage() {
  return (
    <>
      <Header subtitle="Calendario" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-5 py-8">
        <CalendarioClient />
      </main>
    </>
  );
}
