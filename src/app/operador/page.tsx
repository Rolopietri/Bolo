import { Header } from "@/components/Header";
import Link from "next/link";
import { OperadorClient } from "./OperadorClient";

export default function OperadorPage() {
  return (
    <>
      <Header subtitle="Operador" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">
        <div className="mb-5">
          <Link href="/" className="text-sm font-bold text-cacao-soft hover:text-cacao">
            ← Inicio
          </Link>
        </div>
        <OperadorClient />
      </main>
    </>
  );
}
