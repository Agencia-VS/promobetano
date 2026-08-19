import type { CSSProperties, ReactNode } from "react";
import { Halo, type HaloVariant } from "./Halo";
import { FondoPC } from "./FondoPC";
import "@/styles/pantalla.css";

/**
 * Contenedor de pantalla. Es dueño del padding y lo publica como custom
 * properties, así que el pie a sangre puede cancelarlo sin que nadie copie un
 * número a mano: antes cada página repetía su padding lateral como prop de
 * Footer18 y un desajuste rompía la composición en silencio.
 *
 * El contenido entra por dos ranuras en vez de como children sueltos. En móvil
 * se apilan igual que antes —`poster` arriba, `accion` abajo— y a partir de
 * 1024px se convierten en las dos columnas del escritorio sin que las páginas
 * dupliquen su árbol. La alternativa era un children plano, y entonces la
 * rejilla de dos columnas no tendría a qué agarrarse.
 *
 * `--screen-pad-x` incorpora env(safe-area-inset-*) para que en horizontal, con
 * viewport-fit=cover, el contenido no quede bajo el notch.
 */
export function Screen({
  variant,
  padTop,
  padX,
  padBottom = 46,
  poster,
  accion,
  pie,
}: {
  variant: HaloVariant;
  padTop: number;
  padX: number;
  padBottom?: number;
  /** Columna de marca en escritorio; bloque superior en móvil. */
  poster: ReactNode;
  /** Columna de acción en escritorio; bloque inferior en móvil. */
  accion: ReactNode;
  pie?: ReactNode;
}) {
  const vars = {
    "--screen-pad-x": `max(${padX}px, env(safe-area-inset-left), env(safe-area-inset-right))`,
    "--screen-pad-b": `${padBottom}px`,
    "--screen-pad-t": `${padTop}px`,
  } as CSSProperties;

  return (
    <div className={`pantalla pantalla--${variant}`}>
      {/* Orden de capas: foto, halo, contenido. El velo del halo cubre inset:0
          y unifica la foto con el naranja de campaña. */}
      <FondoPC />
      <Halo variant={variant} />
      <div className={`pantalla__grid pantalla__grid--${variant}`} style={vars}>
        <div className="pantalla__poster">{poster}</div>
        <div className="pantalla__accion">{accion}</div>
        {pie}
      </div>
    </div>
  );
}
