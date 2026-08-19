import Link from "next/link";
import { Halo } from "@/components/Halo";
import { Badge18 } from "@/components/Badge18";
import { destinoSeguro } from "@/lib/edad";
import { confirmarEdad } from "./actions";

const botonBase: React.CSSProperties = {
  height: 52,
  width: "100%",
  borderRadius: 3,
  fontFamily: "var(--font-title)",
  fontSize: 14.5,
  letterSpacing: ".16em",
  textTransform: "uppercase",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
};

/**
 * Puerta 18+ como página propia, no como overlay. Al ser una página normal el
 * contenido de la promo no existe todavía en el DOM, así que no hay nada que
 * saltarse con Tab, no hace falta focus trap ni `inert`, y el centrado es el
 * del viewport y no el de una caja que crece con el contenido.
 */
export default async function EdadPage({ searchParams }: PageProps<"/edad">) {
  const params = await searchParams;
  const destino = destinoSeguro(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );
  const salio = params.salir === "1";

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        background: "var(--color-ink)",
        overflow: "hidden",
      }}
    >
      <div
        className="halo--centrado"
        style={{ position: "absolute", inset: 0, opacity: 0.35 }}
      >
        <Halo variant="portada" />
      </div>

      <main
        style={{
          position: "relative",
          minHeight: "100dvh",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 22,
          padding:
            "40px max(30px, env(safe-area-inset-left)) calc(40px + env(safe-area-inset-bottom)) max(30px, env(safe-area-inset-right))",
          textAlign: "center",
        }}
      >
        {salio ? (
          <>
            <Badge18 size={54} tone="confianza" />
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-title)",
                fontWeight: 800,
                fontSize: 24,
                lineHeight: 1.1,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--color-bone)",
              }}
            >
              Esta promoción es solo para mayores de 18 años
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: "rgba(249,241,233,.62)",
                maxWidth: "28ch",
              }}
            >
              Puedes cerrar esta pestaña. Juega con responsabilidad.
            </p>
          </>
        ) : (
          <>
            <Badge18 size={54} tone="confianza" />
            <h1
              style={{
                margin: 0,
                fontFamily: "var(--font-title)",
                fontWeight: 800,
                fontSize: 24,
                lineHeight: 1.1,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--color-bone)",
              }}
            >
              ¿Tienes 18 años o más?
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                lineHeight: 1.6,
                color: "rgba(249,241,233,.62)",
                maxWidth: "28ch",
              }}
            >
              Esta promoción es solo para mayores de edad. Al continuar lo
              confirmas.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                width: "100%",
                maxWidth: 340,
              }}
            >
              <form action={confirmarEdad} style={{ display: "contents" }}>
                <input type="hidden" name="next" value={destino} />
                <button
                  type="submit"
                  style={{
                    ...botonBase,
                    background: "var(--color-confianza)",
                    color: "#FFFFFF",
                    border: "none",
                    fontWeight: 800,
                  }}
                >
                  Sí, tengo 18 o más
                </button>
              </form>
              <Link
                href="/edad?salir=1"
                style={{
                  ...botonBase,
                  background: "transparent",
                  color: "rgba(249,241,233,.72)",
                  border: "1px solid rgba(138,60,24,.6)",
                }}
              >
                Salir
              </Link>
            </div>
          </>
        )}

        <p
          style={{
            margin: "8px 0 0",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "rgba(249,241,233,.55)",
          }}
        >
          Juega con responsabilidad.{" "}
          <Link
            href="/bases"
            style={{
              color: "var(--color-bone)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
            }}
          >
            Bases y condiciones
          </Link>
        </p>
      </main>
    </div>
  );
}
