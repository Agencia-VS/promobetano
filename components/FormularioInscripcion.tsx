"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Screen } from "./Screen";
import { BetanoLogo } from "./Lockup";
import { Footer18 } from "./Footer18";
import { Badge18 } from "./Badge18";
import { Campo, Casilla, bordeCampo, inputStyle } from "./Campo";
import { formateaRut } from "@/lib/rut";
import {
  VALORES_INICIALES,
  borraDraft,
  guardaDraft,
  leeDraft,
  valida,
  validaCampo,
  type CampoTexto,
  type InscripcionErrors,
  type InscripcionValues,
} from "@/lib/inscripcion";
import { guardaConfirmado } from "@/lib/confirmado";
import { CORREO_DATOS } from "@/lib/contacto";

const CAMPOS_TEXTO: CampoTexto[] = ["nombre", "email", "tel", "rut"];
const DEBOUNCE_MS = 400;

export function FormularioInscripcion({ origen }: { origen: string }) {
  const router = useRouter();
  // El borrador solo trae campos de texto; el consentimiento parte siempre en
  // false, así que las casillas coinciden entre servidor y cliente.
  const [v, setV] = useState<InscripcionValues>(
    () => leeDraft() ?? VALORES_INICIALES,
  );
  const [e, setE] = useState<InscripcionErrors>({});
  const [enviando, setEnviando] = useState(false);

  const pendiente = useRef<InscripcionValues | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const guardaYa = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (pendiente.current) {
      guardaDraft(pendiente.current);
      pendiente.current = null;
    }
  }, []);

  /*
   * El borrador se guardaba en cada tecla: 67 escrituras sincrónicas a
   * localStorage por llenado, serializando 11 KB para persistir 170 B, en plena
   * ruta de latencia de tecleo. Con debounce son ~6, y el flush en pagehide /
   * visibilitychange lo hace MÁS seguro que antes, porque la versión anterior
   * no guardaba nada al irse la app a segundo plano.
   */
  useEffect(() => {
    const alOcultar = () => {
      if (document.visibilityState === "hidden") guardaYa();
    };
    window.addEventListener("pagehide", guardaYa);
    document.addEventListener("visibilitychange", alOcultar);
    return () => {
      window.removeEventListener("pagehide", guardaYa);
      document.removeEventListener("visibilitychange", alOcultar);
      guardaYa();
    };
  }, [guardaYa]);

  // /listo no se alcanza con <Link>, así que sin prefetch su payload RSC se
  // descargaba recién al enviar, sobre la red del mall.
  useEffect(() => {
    router.prefetch("/listo");
  }, [router]);

  /** Limpia el error de un campo en cuanto el usuario lo corrige. */
  function revalida(
    previos: InscripcionErrors,
    k: keyof InscripcionValues,
    siguiente: InscripcionValues,
  ): InscripcionErrors {
    const next = { ...previos };
    if (CAMPOS_TEXTO.includes(k as CampoTexto) && previos[k as CampoTexto]) {
      const msg = validaCampo(k as CampoTexto, siguiente);
      if (msg) next[k as CampoTexto] = msg;
      else delete next[k as CampoTexto];
    }
    if ((k === "edad" || k === "bases") && previos.legal) {
      if (siguiente.edad && siguiente.bases) delete next.legal;
    }
    return next;
  }

  function set<K extends keyof InscripcionValues>(
    k: K,
    val: InscripcionValues[K],
  ) {
    const siguiente = { ...v, [k]: val };
    setV(siguiente);
    // El consentimiento nunca se persiste (ver lib/inscripcion.ts).
    pendiente.current = siguiente;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(guardaYa, DEBOUNCE_MS);
    setE((previos) => revalida(previos, k, siguiente));
  }

  function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    // Guard de reentrancia: antes `set()` reseteaba el estado a "idle" y los
    // campos no se deshabilitaban, así que una edición dentro de la ventana de
    // envío reactivaba el botón y aceptaba un segundo submit con datos rancios.
    if (enviando) return;

    const errores = valida(v);
    if (Object.keys(errores).length) {
      setE(errores);
      return;
    }
    setE({});
    setEnviando(true);

    // Sin backend todavía: se registra la confirmación para /listo y se navega.
    // Cuando exista el insert + outbox del brief, va acá dentro con su ruta de
    // error (el estado "error" y el reintento aún no existen porque nada puede
    // fallar; ver README).
    guardaConfirmado({ email: v.email.trim(), origen });
    pendiente.current = null;
    borraDraft();
    router.push("/listo");
  }

  return (
    <Screen variant="formulario" padTop={60} padX={24}>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <BetanoLogo width={124} />
          <Badge18 size={28} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-title)",
              fontSize: 10.5,
              letterSpacing: ".3em",
              textTransform: "uppercase",
              color: "#FFFFFF",
            }}
          >
            Inscripción
          </span>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-title)",
              fontWeight: 800,
              fontSize: 27,
              lineHeight: 1.04,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              color: "#FFFFFF",
            }}
          >
            Deja tus datos y entra al sorteo
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "#FFFFFF",
            }}
          >
            Un minuto y listo. La confirmación te llega al correo.
          </p>
        </div>

        <form onSubmit={enviar}>
          {/* El fieldset deshabilitado congela TODO el formulario durante el
              envío, no solo el botón. */}
          <fieldset
            disabled={enviando}
            style={{
              border: 0,
              margin: 0,
              padding: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            <Campo name="nombre" label="Nombre y apellido" error={e.nombre}>
              {(c) => (
                <input
                  {...c}
                  type="text"
                  autoComplete="name"
                  autoCapitalize="words"
                  value={v.nombre}
                  onChange={(ev) => set("nombre", ev.target.value)}
                  placeholder="Como aparece en tu carnet"
                  style={inputStyle(Boolean(e.nombre))}
                />
              )}
            </Campo>

            <Campo name="email" label="Correo" error={e.email}>
              {(c) => (
                <input
                  {...c}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="off"
                  spellCheck={false}
                  value={v.email}
                  onChange={(ev) => set("email", ev.target.value)}
                  placeholder="tu@correo.cl"
                  style={inputStyle(Boolean(e.email))}
                />
              )}
            </Campo>

            <Campo name="tel" label="Teléfono" error={e.tel}>
              {(c) => (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: "var(--color-bone)",
                    borderRadius: 4,
                    border: bordeCampo(Boolean(e.tel)),
                    overflow: "hidden",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      padding: "0 12px 0 14px",
                      fontSize: 16.5,
                      color: "rgba(10,6,5,.5)",
                      borderRight: "1px solid rgba(10,6,5,.18)",
                      lineHeight: "50px",
                    }}
                  >
                    +56 9
                  </span>
                  <input
                    {...c}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={v.tel}
                    onChange={(ev) => set("tel", ev.target.value)}
                    placeholder="1234 5678"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      height: 50,
                      padding: "0 14px",
                      fontSize: 16.5,
                      color: "var(--color-ink)",
                      background: "transparent",
                      border: "none",
                      outline: "none",
                    }}
                  />
                </div>
              )}
            </Campo>

            <Campo name="rut" label="RUT" error={e.rut}>
              {(c) => (
                <input
                  {...c}
                  type="text"
                  // inputMode="text" y no "numeric": con el teclado numérico no
                  // se puede escribir la K del dígito verificador.
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  value={v.rut}
                  onChange={(ev) => set("rut", ev.target.value)}
                  onBlur={(ev) => set("rut", formateaRut(ev.target.value))}
                  placeholder="12.345.678-5"
                  style={{
                    ...inputStyle(Boolean(e.rut)),
                    letterSpacing: ".02em",
                  }}
                />
              )}
            </Campo>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                paddingTop: 4,
                borderTop: "1px solid rgba(60,0,0,.3)",
              }}
            >
              <Casilla
                checked={v.edad}
                onChange={(x) => set("edad", x)}
                describedBy={e.legal ? "legal-error" : undefined}
              >
                Tengo 18 años o más.
              </Casilla>
              <div style={{ borderTop: "1px solid rgba(60,0,0,.18)" }}>
                <Casilla
                  checked={v.bases}
                  onChange={(x) => set("bases", x)}
                  describedBy={e.legal ? "legal-error" : undefined}
                >
                  Acepto las <a href="/bases">bases</a> y el tratamiento de mis
                  datos para este sorteo.
                </Casilla>
              </div>
              {e.legal && (
                <span
                  id="legal-error"
                  role="alert"
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: "var(--color-rust-deep)",
                    paddingBottom: 6,
                  }}
                >
                  {e.legal}
                </span>
              )}
              {/* La Ley 21.719 exige consentimiento específico por finalidad:
                  esta casilla va separada, opcional y nunca preseleccionada. */}
              <div style={{ borderTop: "1px solid rgba(60,0,0,.18)" }}>
                <Casilla checked={v.mkt} onChange={(x) => set("mkt", x)}>
                  Quiero recibir promociones de Betano.{" "}
                  <span style={{ color: "rgba(255,255,255,.72)" }}>
                    Opcional.
                  </span>
                </Casilla>
              </div>
            </div>

            <button
              type="submit"
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
                cursor: enviando ? "default" : "pointer",
                boxShadow: "0 12px 32px rgba(60,0,0,.35)",
                opacity: enviando ? 0.7 : 1,
              }}
            >
              {enviando ? "Inscribiendo…" : "Confía y dale"}
            </button>

            <p
              style={{
                margin: 0,
                fontSize: 12,
                lineHeight: 1.55,
                color: "#FFFFFF",
              }}
            >
              Guardamos lo que escribes en tu teléfono por 20 minutos. Si se cae
              la señal, no pierdes nada.
            </p>
          </fieldset>
        </form>
      </div>

      <Footer18 topGap={8}>
        Juega con responsabilidad. Consultas de datos personales:{" "}
        <a href={`mailto:${CORREO_DATOS}`}>{CORREO_DATOS}</a>
      </Footer18>
    </Screen>
  );
}
