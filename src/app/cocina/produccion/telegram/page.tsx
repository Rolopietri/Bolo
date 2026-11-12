import { Header } from "@/components/Header";
import Link from "next/link";
import { TelegramClient } from "./TelegramClient";

// Ajuste opcional de Producción: conectar el grupo de Telegram del equipo para
// que los registros que se escriben ahí lleguen solos a Bolo, por aprobar.
export default function TelegramPage() {
  return (
    <>
      <Header subtitle="Producción" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-10">
        <section className="mb-8 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="font-display text-[11px] tracking-[0.4em] text-cacao-soft">Cocina · Producción</p>
            <h1 className="mt-2 font-cinzel text-2xl sm:text-3xl tracking-[0.12em] uppercase text-cacao">
              Grupo de Telegram
            </h1>
            <p className="mt-3 font-serif italic text-cacao-soft">
              Lo que el equipo escribe en el grupo llega a Producción para que lo apruebes.
            </p>
          </div>
          <Link href="/cocina/produccion" className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao">
            ← Producción
          </Link>
        </section>
        <TelegramClient />
      </main>
    </>
  );
}
