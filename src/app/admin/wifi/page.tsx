import { headers } from "next/headers";
import { Header } from "@/components/Header";
import { WifiAdminClient } from "./WifiAdminClient";

export const metadata = { title: "WiFi de invitados · La Quinta Mamá" };

/** La dirección pública de la app, para armar el enlace del QR. */
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export default async function WifiAdminPage() {
  const base = await baseUrl();
  return (
    <>
      <Header subtitle="WiFi de invitados" />
      <main className="flex-1 mx-auto w-full max-w-5xl px-5 py-8">
        <WifiAdminClient baseUrl={base} />
      </main>
    </>
  );
}
