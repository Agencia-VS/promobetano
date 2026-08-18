/**
 * Sello 18+. Marca regulatoria, así que vive en un solo lugar: antes estaba
 * inlineado tres veces con dos opacidades de borde y dos colores distintos, y
 * un cambio de cumplimiento obligaba a buscarlas una por una.
 */
export function Badge18({
  size = 30,
  tone = "bone",
}: {
  size?: number;
  tone?: "bone" | "confianza";
}) {
  const color = tone === "confianza" ? "var(--color-confianza)" : "#FFFFFF";
  return (
    <span
      aria-label="Solo mayores de 18 años"
      role="img"
      style={{
        flexShrink: 0,
        width: size,
        height: size,
        border: `1px solid ${tone === "confianza" ? "rgba(255,57,0,.7)" : "rgba(255,255,255,.6)"}`,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "var(--font-title)",
        fontWeight: 800,
        fontSize: Math.round(size * 0.36),
        color,
      }}
    >
      18+
    </span>
  );
}
