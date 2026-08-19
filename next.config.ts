import type { NextConfig } from "next";

/**
 * La protección CSRF de Server Actions compara el header `Origin` contra
 * `X-Forwarded-Host` (o `Host`) y aborta con "Invalid Server Actions request."
 * si no coinciden.
 *
 * En GitHub Codespaces nunca coinciden: la infraestructura inyecta
 * `X-Forwarded-Host: <codespace>-<puerto>.app.github.dev` en toda petición,
 * pero el navegador manda el origen real desde el que se abrió la app, que
 * suele ser `localhost:<puerto>` (puerto reenviado de VS Code) y a veces el
 * dominio público. Se declaran ambos.
 *
 * Solo en desarrollo: en producción la lista queda vacía y el check vuelve a
 * exigir mismo origen. No se usa un comodín tipo `*.app.github.dev` porque
 * habilitaría a cualquier codespace ajeno a invocar las acciones.
 */
function origenesDeDesarrollo(): string[] {
  if (process.env.NODE_ENV === "production") return [];

  const puerto = process.env.PORT ?? "3000";
  const origenes = [`localhost:${puerto}`, `127.0.0.1:${puerto}`];

  const codespace = process.env.CODESPACE_NAME;
  const dominio = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
  if (codespace && dominio) origenes.push(`${codespace}-${puerto}.${dominio}`);

  return origenes;
}

const nextConfig: NextConfig = {
  images: {
    // AVIF primero: los dos logos de marca son planos y comprimen muy bien,
    // y esta landing se sirve sobre la red de un mall.
    formats: ["image/avif", "image/webp"],
    // Desde Next 16 `qualities` es una lista blanca —por defecto solo [75]— y
    // un valor fuera de ella se ignora en silencio. El 40 es para el key
    // visual de escritorio, que se ve al 14% de opacidad detrás del halo.
    qualities: [40, 75],
  },
  experimental: {
    serverActions: {
      allowedOrigins: origenesDeDesarrollo(),
    },
  },
};

export default nextConfig;
