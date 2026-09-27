import { Header } from "@/components/Header";
import { AdministracionClient } from "./AdministracionClient";

export default function AdministracionPage() {
  return (
    <>
      <Header subtitle="Administración" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-8">
        <AdministracionClient />
      </main>
    </>
  );
}
