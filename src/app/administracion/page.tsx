import { Header } from "@/components/Header";
import { AdministracionClient } from "./AdministracionClient";

export default async function AdministracionPage({
  searchParams,
}: {
  searchParams: Promise<{ seccion?: string | string[] }>;
}) {
  const { seccion } = await searchParams;
  const inicial = typeof seccion === "string" ? seccion : null;
  return (
    <>
      <Header subtitle="Administración" />
      <main className="flex-1 mx-auto w-full max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        <AdministracionClient seccionInicial={inicial} />
      </main>
    </>
  );
}
