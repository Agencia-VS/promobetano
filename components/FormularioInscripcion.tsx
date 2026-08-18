"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "./Screen";
import { BetanoLogo } from "./Lockup";
import { Footer18 } from "./Footer18";
import { formateaRut } from "@/lib/rut";
import {
  VALORES_INICIALES,
  borraDraft,
  guardaDraft,
  leeDraft,
  valida,
  type InscripcionErrors,
  type InscripcionValues,
} from "@/lib/inscripcion";
import { leeOrigenCookie } from "@/lib/origen";

type Estado = "idle" | "sending" | "ok";

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-title)",
  fontSize: 10.5,
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "#FFFFFF",
};

const inputStyle = (invalid: boolean): React.CSSProperties => ({
  height: 52,
  boxSizing: "border-box",
  padding: "0 14px",
  fontSize: 16.5,
  color: "var(--color-ink)",
  background: "var(--color-bone)",
  borderRadius: 4,
  border: `1px solid ${invalid ? "var(--color-rust-deep)" : "rgba(10,6,5,.22)"}`,
  outline: "none",
  width: "100%",
});

const errorStyle: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 500,
  color: "var(--color-rust-deep)",
};

export function FormularioInscripcion({ origenInicial }: { origenInicial: string }) {
  const router = useRouter();
  // Lazy initializer, no efecto: en SSR `leeDraft()` no encuentra
  // localStorage y cae a los valores vacíos; el cliente lo corrige al
  // hidratar. React no avisa por un mismatch de `value` en inputs
  // controlados, así que no hay parpadeo que resolver aquí.
  const [v, setV] = useState<InscripcionValues>(() => leeDraft() ?? VALORES_INICIALES);
  const [e, setE] = useState<InscripcionErrors>({});
  const [tocado, setTocado] = useState(false);
  const [estado, setEstado] = useState<Estado>("idle");

  useEffect(() => {
    if (tocado) guardaDraft(v);
  }, [v, tocado]);

  function set<K extends keyof InscripcionValues>(k: K, val: InscripcionValues[K]) {
    setV((s) => ({ ...s, [k]: val }));
    setTocado(true);
    setEstado("idle");
  }

  function borde(k: keyof InscripcionErrors) {
    return Boolean(e[k]);
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    const errores = valida(v);
    if (Object.keys(errores).length) {
      setE(errores);
      setTocado(true);
      return;
    }
    setE({});
    setTocado(true);
    setEstado("sending");

    // Sin backend en este entorno: se simula el encolado (brief §Cuello 1 ·
    // Correo — el alta responde sin esperar al envío del correo) y se pasa
    // a /listo. En el sistema real esto es un insert + outbox.
    const origen = leeOrigenCookie() || origenInicial;
    await new Promise((r) => setTimeout(r, 700));
    try {
      sessionStorage.setItem(
        "edc_confirmado",
        JSON.stringify({ email: v.email.trim(), origen })
      );
    } catch {
      // sessionStorage no disponible: /listo cae a su copy genérico.
    }
    borraDraft();
    setEstado("ok");
    router.push("/listo");
  }

  return (
    <Screen variant="formulario">
      <div
        style={{
          position: "relative",
          flex: 1,
          boxSizing: "border-box",
          padding: "60px 24px 46px",
          display: "flex",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <BetanoLogo width={124} height={30} />
          <span
            style={{
              flexShrink: 0,
              width: 28,
              height: 28,
              border: "1px solid rgba(255,255,255,.6)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 10.5,
              color: "#FFFFFF",
            }}
          >
            18+
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-title)", fontSize: 10.5, letterSpacing: ".3em", textTransform: "uppercase", color: "#FFFFFF" }}>
            Inscripción
          </span>
          <h1 style={{ margin: 0, fontFamily: "var(--font-title)", fontWeight: 800, fontSize: 27, lineHeight: 1.04, letterSpacing: ".05em", textTransform: "uppercase", color: "#FFFFFF" }}>
            Deja tus datos y entra al sorteo
          </h1>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "#FFFFFF" }}>
            Un minuto y listo. La confirmación te llega al correo.
          </p>
        </div>

        <form onSubmit={enviar} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Campo label="Nombre y apellido" htmlFor="f-nombre" error={e.nombre}>
            <input
              id="f-nombre"
              type="text"
              autoComplete="name"
              autoCapitalize="words"
              value={v.nombre}
              onChange={(ev) => set("nombre", ev.target.value)}
              placeholder="Como aparece en tu carnet"
              style={inputStyle(borde("nombre"))}
            />
          </Campo>

          <Campo label="Correo" htmlFor="f-email" error={e.email}>
            <input
              id="f-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              value={v.email}
              onChange={(ev) => set("email", ev.target.value)}
              placeholder="tu@correo.cl"
              style={inputStyle(borde("email"))}
            />
          </Campo>

          <Campo label="Teléfono" htmlFor="f-tel" error={e.tel}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--color-bone)",
                borderRadius: 4,
                border: `1px solid ${borde("tel") ? "var(--color-rust-deep)" : "rgba(10,6,5,.22)"}`,
                overflow: "hidden",
              }}
            >
              <span style={{ padding: "0 12px 0 14px", fontSize: 16.5, color: "rgba(10,6,5,.5)", borderRight: "1px solid rgba(10,6,5,.18)", lineHeight: "50px" }}>
                +56 9
              </span>
              <input
                id="f-tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={v.tel}
                onChange={(ev) => set("tel", ev.target.value)}
                placeholder="1234 5678"
                style={{ flex: 1, minWidth: 0, height: 50, padding: "0 14px", fontSize: 16.5, color: "var(--color-ink)", background: "transparent", border: "none", outline: "none" }}
              />
            </div>
          </Campo>

          <Campo label="RUT" htmlFor="f-rut" error={e.rut}>
            <input
              id="f-rut"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={v.rut}
              onChange={(ev) => set("rut", ev.target.value)}
              onBlur={(ev) => set("rut", formateaRut(ev.target.value))}
              placeholder="12.345.678-5"
              style={{ ...inputStyle(borde("rut")), letterSpacing: ".02em" }}
            />
          </Campo>

          <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4, borderTop: "1px solid rgba(60,0,0,.3)" }}>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 48, padding: "12px 0", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={v.edad}
                onChange={(ev) => set("edad", ev.target.checked)}
                style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--color-ink)" }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#FFFFFF" }}>Tengo 18 años o más.</span>
            </label>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 48, padding: "12px 0", cursor: "pointer", borderTop: "1px solid rgba(60,0,0,.18)" }}>
              <input
                type="checkbox"
                checked={v.bases}
                onChange={(ev) => set("bases", ev.target.checked)}
                style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--color-ink)" }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#FFFFFF" }}>
                Acepto las{" "}
                <a href="/bases" style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 2 }}>
                  bases
                </a>{" "}
                y el tratamiento de mis datos para este sorteo.
              </span>
            </label>
            {e.legal && <span role="alert" style={{ ...errorStyle, paddingBottom: 6 }}>{e.legal}</span>}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 12, minHeight: 48, padding: "12px 0", cursor: "pointer", borderTop: "1px solid rgba(60,0,0,.18)" }}>
              <input
                type="checkbox"
                checked={v.mkt}
                onChange={(ev) => set("mkt", ev.target.checked)}
                style={{ width: 22, height: 22, margin: 0, flexShrink: 0, accentColor: "var(--color-ink)" }}
              />
              <span style={{ fontSize: 13.5, lineHeight: 1.45, color: "#FFFFFF" }}>
                Quiero recibir promociones de Betano.{" "}
                <span style={{ color: "rgba(255,255,255,.72)" }}>Opcional.</span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={estado === "sending"}
            style={{
              height: 56,
              background: "var(--color-ink)",
              color: "var(--color-bone)",
              border: "none",
              borderRadius: 3,
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 15.5,
              letterSpacing: ".16em",
              textTransform: "uppercase",
              cursor: estado === "sending" ? "default" : "pointer",
              boxShadow: "0 12px 32px rgba(60,0,0,.35)",
              opacity: estado === "sending" ? 0.7 : 1,
            }}
          >
            {estado === "sending" ? "Inscribiendo…" : estado === "ok" ? "Listo, quedaste dentro" : "Confía y dale"}
          </button>

          <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: "#FFFFFF" }}>
            Guardamos lo que escribes en tu teléfono. Si se cae la señal, no pierdes nada.
          </p>
        </form>

        <Footer18 topGap={8} sidePad={24}>
          Juega con responsabilidad. Consultas de datos personales:{" "}
          <a href="mailto:datos@dominio.cl" style={{ color: "#FFFFFF", textDecoration: "underline", textUnderlineOffset: 2 }}>
            datos@dominio.cl
          </a>
        </Footer18>
      </div>
    </Screen>
  );
}

function Campo({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {error && <span role="alert" style={errorStyle}>{error}</span>}
    </div>
  );
}
