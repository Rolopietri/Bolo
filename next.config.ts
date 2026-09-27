import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx (SheetJS) hace require dinámicos de módulos de Node; se deja fuera del
  // bundle del servidor para que los routes que la usan (importar-facturas) no
  // fallen en runtime.
  serverExternalPackages: ["xlsx"],
};

export default nextConfig;
