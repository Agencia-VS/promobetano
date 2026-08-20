import type { ReactNode } from "react";

export const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-title)",
  fontSize: 10.5,
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "#FFFFFF",
};

export const errorStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 9,
  padding: "10px 12px",
  background: "var(--color-bone)",
  border: "2px solid var(--color-rust-deep)",
  borderRadius: 4,
  boxShadow: "0 4px 0 rgba(60,0,0,.2)",
  fontSize: 14,
  lineHeight: 1.35,
  fontWeight: 800,
  color: "var(--color-rust-deep)",
};

export function bordeCampo(invalido: boolean): string {
  return `${invalido ? 2 : 1}px solid ${invalido ? "var(--color-rust-deep)" : "rgba(10,6,5,.22)"}`;
}

export function sombraCampo(invalido: boolean): string {
  return invalido ? "0 0 0 3px rgba(249,241,233,.85)" : "none";
}

export const inputStyle = (invalido: boolean): React.CSSProperties => ({
  height: 52,
  width: "100%",
  padding: "0 14px",
  // 16px es el mínimo: por debajo, Safari iOS hace zoom al enfocar y descoloca
  // el layout (brief §Reglas del formulario móvil).
  fontSize: 16.5,
  color: "var(--color-ink)",
  background: "var(--color-bone)",
  borderRadius: 4,
  border: bordeCampo(invalido),
  boxShadow: sombraCampo(invalido),
  outline: "none",
});

/**
 * El error necesita una superficie propia: sobre el naranja de la campaña el
 * texto burdeos suelto tenía contraste insuficiente, sobre todo bajo el sol y
 * en pantallas móviles. El icono no reemplaza el texto y queda oculto para
 * lectores de pantalla, que reciben el mensaje mediante role="alert".
 */
export function MensajeError({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <span id={id} role="alert" style={errorStyle}>
      <span
        aria-hidden="true"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          flex: "0 0 20px",
          borderRadius: "50%",
          background: "var(--color-rust-deep)",
          color: "var(--color-bone)",
          fontSize: 13,
          lineHeight: 1,
        }}
      >
        !
      </span>
      <span>{children}</span>
    </span>
  );
}

/** Props que Campo inyecta en el control: el llamador no puede omitirlas. */
export type ControlProps = {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
};

/**
 * Campo es dueño del control (lo recibe como función, no como children), así
 * que deriva `id`, `aria-invalid` y `aria-describedby` de un solo `name`.
 *
 * En la versión anterior el input entraba como children y Campo, por
 * estructura, no podía anotarlo: ningún campo tenía aria-invalid ni
 * aria-describedby, y el estado de error se comunicaba solo por el color del
 * borde — invisible para lectores de pantalla y para daltonismo. Los pares
 * id/htmlFor también se escribían a mano a quince líneas de distancia.
 */
export function Campo({
  name,
  label,
  error,
  children,
}: {
  name: string;
  label: string;
  error?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const id = `f-${name}`;
  const errorId = `${id}-error`;
  const control: ControlProps = error
    ? { id, "aria-invalid": true, "aria-describedby": errorId }
    : { id };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      {children(control)}
      {error && <MensajeError id={errorId}>{error}</MensajeError>}
    </div>
  );
}

/** Casilla legal. Estaba triplicada verbatim, con nueve objetos de estilo repetidos. */
export function Casilla({
  checked,
  onChange,
  children,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  describedBy?: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        // Área táctil de 48px (brief §Reglas del formulario móvil).
        minHeight: 48,
        padding: "12px 0",
        cursor: "pointer",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(ev) => onChange(ev.target.checked)}
        aria-describedby={describedBy}
        aria-invalid={describedBy ? true : undefined}
        style={{
          width: 22,
          height: 22,
          margin: 0,
          flexShrink: 0,
          accentColor: "var(--color-ink)",
        }}
      />
      <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#FFFFFF" }}>
        {children}
      </span>
    </label>
  );
}
