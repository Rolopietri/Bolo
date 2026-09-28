import { Header } from "@/components/Header";
import Link from "next/link";
import { PlatoClient } from "./PlatoClient";

export default function PlatoPage() {
  return (
    <>
      <Header subtitle="Cocina" />
      <main className="flex-1 mx-auto w-full max-w-2xl px-5 py-8">
        <div className="mb-5">
          <Link
            href="/cocina"
            className="text-sm font-bold text-cacao-soft hover:text-cacao"
          >
            ← Cocina
          </Link>
        </div>
        <PlatoClient />
      </main>
    </>
  );
}
