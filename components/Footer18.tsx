import type { ReactNode } from "react";

/**
 * Banda negra de pie, a sangre en los bordes de la pantalla: márgenes
 * negativos que cancelan exactamente el padding lateral/inferior del
 * contenedor que la envuelve (mismo valor, signo opuesto) — no un div de
 * relleno, que fue el bug real que partía la franja naranja a la mitad.
 * `sidePad`/`bottomPad` deben calzar con el padding del contenedor padre.
 */
export function Footer18({
  children,
  topGap,
  sidePad,
  bottomPad = 46,
}: {
  children: ReactNode;
  topGap: number;
  sidePad: number;
  bottomPad?: number;
}) {
  return (
    <div
      style={{
        margin: `${topGap}px -${sidePad}px -${bottomPad}px`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: `20px ${sidePad}px 32px`,
        background: "var(--color-ink)",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: "rgba(249,241,233,.75)",
      }}
    >
      <span
        style={{
          flexShrink: 0,
          width: 30,
          height: 30,
          border: "1px solid rgba(255,255,255,.6)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: 11,
          color: "#FFFFFF",
        }}
      >
        18+
      </span>
      <span>{children}</span>
    </div>
  );
}
