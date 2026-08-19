import type { CSSProperties, ReactNode } from "react";
import { Badge18 } from "./Badge18";

/**
 * Banda negra de pie, a sangre. Los estilos viven en styles/pantalla.css y no
 * en un objeto inline porque en escritorio la banda pasa a ocupar las dos
 * columnas de la rejilla, y eso es una media query.
 */
export function Footer18({
  children,
  topGap = 0,
}: {
  children: ReactNode;
  topGap?: number;
}) {
  return (
    <div
      className="pantalla__pie"
      style={{ "--pie-gap": `${topGap}px` } as CSSProperties}
    >
      <Badge18 size={30} />
      <span>{children}</span>
    </div>
  );
}
