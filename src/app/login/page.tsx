import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="flex-1 flex items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image
            src="/logo-black.svg"
            alt="La Quinta Mamá"
            width={80}
            height={80}
            className="mx-auto h-20 w-20 opacity-90"
            priority
          />
          <h1 className="mt-5 font-display text-xl tracking-[0.25em] uppercase text-cacao">
            La Quinta Mamá
          </h1>
          <p className="mt-2 text-cacao-soft text-sm italic">
            Donde la cultura y el bienestar florecen.
          </p>
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
