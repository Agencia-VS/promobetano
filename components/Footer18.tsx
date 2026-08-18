import type { ReactNode } from "react";
import { Badge18 } from "./Badge18";

/**
 * Banda negra de pie, a sangre. Cancela el padding de Screen leyendo sus
 * custom properties, sin que ninguna página tenga que repetir el número.
 *
 * El padding inferior suma env(safe-area-inset-bottom): con viewport-fit=cover
 * el link legal obligatorio caía dentro de la franja del gesto del home
 * indicator en iPhone, donde iOS intercepta los toques.
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
      style={{
        marginTop: "auto",
        marginInline: "calc(var(--screen-pad-x) * -1)",
        marginBottom: "calc(var(--screen-pad-b) * -1)",
        paddingTop: 20 + topGap,
        paddingInline: "var(--screen-pad-x)",
        paddingBottom: "calc(32px + env(safe-area-inset-bottom))",
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "var(--color-ink)",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: "rgba(249,241,233,.75)",
      }}
    >
      <Badge18 size={30} />
      <span>{children}</span>
    </div>
  );
}
