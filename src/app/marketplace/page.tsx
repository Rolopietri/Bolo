import { Header } from "@/components/Header";
import Link from "next/link";
import { MarketplaceClient } from "./MarketplaceClient";

export default function MarketplacePage() {
  return (
    <>
      <Header subtitle="Mercado" />
      <main className="flex-1 mx-auto w-full max-w-3xl px-5 py-8">
        <div className="mb-5">
          <Link
            href="/"
            className="text-sm font-bold text-cacao-soft hover:text-cacao"
          >
            ← Inicio
          </Link>
        </div>
        <MarketplaceClient />
      </main>
    </>
  );
}
