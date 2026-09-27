import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
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
          <p className="mt-4 text-cacao-soft">Entra a tu panel de trabajo.</p>
        </div>

        <Suspense
          fallback={
            <div className="text-center text-cacao-soft">Cargando...</div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
