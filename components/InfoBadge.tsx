/**
 * Placa de dato de campaña. Estaba duplicada en /i y /listo, y la copia de
 * /listo había perdido la prop `pending`, así que no podía dejar de marcar el
 * subrayado de "dato pendiente" cuando el dato se confirmara.
 */
export function InfoBadge({
  label,
  value,
  pending = false,
}: {
  label: string;
  value: string;
  /** Subrayado punteado = dato aún no definido en el brief. */
  pending?: boolean;
}) {
  return (
    <div
      style={{
        border: "1px solid rgba(60,0,0,.4)",
        background: "rgba(60,0,0,.3)",
        padding: "11px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontSize: 10,
          letterSpacing: ".26em",
          textTransform: "uppercase",
          color: "#FFFFFF",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 13.5,
          color: "#FFFFFF",
          borderBottom: pending ? "1px dashed rgba(255,255,255,.5)" : undefined,
          alignSelf: "flex-start",
        }}
      >
        {value}
      </span>
    </div>
  );
}
