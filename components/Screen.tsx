import type { CSSProperties, ReactNode } from "react";
import { Halo, type HaloVariant } from "./Halo";

/**
 * Contenedor de pantalla mobile-first. Es dueño del padding y lo publica como
 * custom properties, así que el pie a sangre puede cancelarlo sin que nadie
 * copie un número a mano: antes cada página repetía su padding lateral como
 * prop de Footer18 y un desajuste rompía la composición en silencio.
 *
 * `--screen-pad-x` incorpora env(safe-area-inset-*) para que en horizontal, con
 * viewport-fit=cover, el contenido no quede bajo el notch.
 */
export function Screen({
  variant,
  padTop,
  padX,
  padBottom = 46,
  children,
}: {
  variant: HaloVariant;
  padTop: number;
  padX: number;
  padBottom?: number;
  children: ReactNode;
}) {
  const vars = {
    "--screen-pad-x": `max(${padX}px, env(safe-area-inset-left), env(safe-area-inset-right))`,
    "--screen-pad-b": `${padBottom}px`,
  } as CSSProperties;

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
          ...vars,
          position: "relative",
          minHeight: "100dvh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          padding: `${padTop}px var(--screen-pad-x) var(--screen-pad-b)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
