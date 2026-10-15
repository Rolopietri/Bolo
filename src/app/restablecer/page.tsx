import Image from "next/image";
import { RestablecerClient } from "./RestablecerClient";

export const metadata = {
  title: "Nueva contraseña · bolo",
};

export default function RestablecerPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-5 py-12 bg-marfil-soft">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/bolo-logo.png"
            alt="bolo"
            width={360}
            height={144}
            className="mx-auto h-16 w-auto"
            priority
          />
          <p className="mt-4 text-cacao-soft">Crea tu nueva contraseña.</p>
        </div>

        <RestablecerClient />
      </div>
    </div>
  );
}
