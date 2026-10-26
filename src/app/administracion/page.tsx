import Link from "next/link";
import { Header } from "@/components/Header";
import { AdministracionClient } from "./AdministracionClient";

export default function AdministracionPage() {
  return (
    <>
      <Header subtitle="Administración" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-8">
        <div className="mb-4 flex justify-end">
          <Link
            href="/administracion/monitoreo"
            className="text-xs uppercase tracking-widest text-cacao-soft hover:text-cacao"
          >
            Monitoreo de tareas →
          </Link>
        </div>
        <AdministracionClient />
      </main>
    </>
  );
}
