import type { ReactNode } from "react";
import { Halo } from "./Halo";

type HaloVariant = "portada" | "formulario" | "listo";

/**
 * Contenedor de pantalla mobile-first: superficie naranja de marca, halo en
 * CSS y `overflow: hidden` — sin esto el anillo de 700px produce scroll
 * horizontal (bug real encontrado y corregido durante el diseño).
 */
export function Screen({
  variant,
  children,
}: {
  variant: HaloVariant;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        boxSizing: "border-box",
        background: "var(--color-confianza)",
        overflow: "hidden",
      }}
    >
      <Halo variant={variant} />
      <div
        style={{
          position: "relative",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </div>
    </div>
  );
}
