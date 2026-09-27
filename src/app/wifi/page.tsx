/**
 * WiFi de invitados · página pública (la que abre el QR de las mesas).
 *
 * No pide sesión: está en PUBLIC_PATHS de src/lib/supabase/middleware.ts.
 * El invitado llena el formulario y recién entonces ve la clave.
 * Si ya se registró antes (cookie), le mostramos la clave directo.
 */
import Image from "next/image";
import { cookies } from "next/headers";
import { COOKIE_WIFI, credencialesWifi } from "@/lib/wifi-server";
import { WifiForm } from "./WifiForm";
import { ClaveWifi } from "./ClaveWifi";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "WiFi · La Quinta Mamá",
  description: "Conéctate al WiFi de La Quinta Mamá.",
};

export default async function WifiPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; nuevo?: string }>;
}) {
  const { p, nuevo } = await searchParams;
  const galletas = await cookies();
  const yaRegistrado = !nuevo && !!galletas.get(COOKIE_WIFI)?.value;
  const credenciales = yaRegistrado ? await credencialesWifi() : null;

  return (
    <main className="flex-1 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo-black.svg"
            alt="La Quinta Mamá"
            width={72}
            height={72}
            className="mx-auto size-16 opacity-90"
            priority
          />
          <h1 className="mt-5 font-cinzel text-xl tracking-[0.2em] uppercase text-cacao">
            La Quinta Mamá
          </h1>
          <p className="mt-2 font-serif italic text-cacao-soft">
            Bienvenido. Te damos el WiFi de la casa.
          </p>
        </div>

        {credenciales ? (
          <ClaveWifi credenciales={credenciales} conocido />
        ) : (
          <WifiForm origen={p ?? null} />
        )}

        <p className="mt-10 text-center font-display text-[10px] tracking-[0.35em] text-cacao-mute">
          LA QUINTA MAMÁ · CARACAS
        </p>
      </div>
    </main>
  );
}
