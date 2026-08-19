/**
 * Piezas de la confirmación, compartidas por /listo y por el modal.
 *
 * Se extrajeron cuando el modal de escritorio pasó a mostrar el éxito en su
 * sitio en vez de navegar: son un texto que afirma algo sobre el trato de datos
 * de una persona («te mandamos la confirmación a…») y las instrucciones de uso
 * del producto. Mantener dos copias garantiza que dentro de un mes una diga una
 * cosa y la otra otra, según por dónde haya entrado quien se inscribió.
 *
 * `compacto` es la única diferencia entre ambos contextos: dentro del panel del
 * modal el titular no puede escalar con el viewport como en la pantalla
 * completa, porque el panel mide 460px fijos.
 */

export function SelloConfirmado({
  email,
  compacto = false,
}: {
  email?: string | null;
  compacto?: boolean;
}) {
  return (
    <div
      className={compacto ? undefined : "bloque-centrado-movil"}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: compacto ? 14 : 20,
        padding: compacto ? 0 : "24px 0 8px",
      }}
    >
      <span
        aria-hidden
        style={{
          width: compacto ? 46 : 60,
          height: compacto ? 46 : 60,
          border: "1px solid rgba(255,255,255,.7)",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: compacto ? 20 : 24,
          color: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        ✓
      </span>
      <h1
        style={{
          margin: 0,
          fontFamily: "var(--font-title)",
          fontWeight: 800,
          fontSize: compacto ? 27 : "clamp(30px, 3.4vw, 46px)",
          lineHeight: 1.04,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "#FFFFFF",
        }}
      >
        Quedaste dentro
      </h1>
      <p
        style={{
          margin: 0,
          fontSize: compacto ? 13.5 : "clamp(15px, 1.1vw, 17.5px)",
          lineHeight: 1.6,
          color: "#FFFFFF",
          maxWidth: compacto ? undefined : "34ch",
        }}
      >
        {email ? (
          <>
            Te mandamos la confirmación a{" "}
            <strong style={{ fontWeight: 500 }}>{email}</strong>. Llega en menos
            de un minuto.
          </>
        ) : (
          "Te mandamos la confirmación a tu correo. Llega en menos de un minuto."
        )}
      </p>
    </div>
  );
}

/** Las instrucciones de la carta del perfume. Es el registro de voz de la
    campaña, no un relleno: «Abre la botella · Susúrrate: tú puedes». */
export function PasosPerfume({ compacto = false }: { compacto?: boolean }) {
  return (
    <div
      style={{
        background: "var(--color-ink)",
        padding: compacto ? "16px 16px" : "22px 20px",
        display: "flex",
        flexDirection: "column",
        gap: compacto ? 12 : 18,
        boxShadow: "0 14px 36px rgba(60,0,0,.4)",
        borderRadius: compacto ? 6 : 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontSize: 10.5,
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: "var(--color-confianza)",
        }}
      >
        Si te lo ganas, así se usa
      </span>
      <ol
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: compacto ? 10 : 14,
        }}
      >
        <Paso n="01" compacto={compacto}>
          Abre la botella.
        </Paso>
        <Paso n="02" compacto={compacto}>
          Susúrrate: «tú puedes».
        </Paso>
        <Paso n="03" compacto={compacto}>
          Échate bastante y con confianza.
        </Paso>
      </ol>
    </div>
  );
}

function Paso({
  n,
  compacto,
  children,
}: {
  n: string;
  compacto: boolean;
  children: React.ReactNode;
}) {
  return (
    <li style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
      <span
        style={{
          fontFamily: "var(--font-title)",
          fontSize: compacto ? 11 : 12,
          letterSpacing: ".1em",
          color: "var(--color-confianza)",
          minWidth: 18,
        }}
      >
        {n}
      </span>
      <span
        style={{
          fontSize: compacto ? 13 : 14.5,
          lineHeight: 1.5,
          color: "var(--color-bone)",
        }}
      >
        {children}
      </span>
    </li>
  );
}
