"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { guardaConfirmado, type Confirmado } from "@/lib/confirmado";
import { CORREO_DATOS } from "@/lib/contacto";

const CAMPOS_TEXTO: CampoTexto[] = ["nombre", "email", "tel", "rut"];
const DEBOUNCE_MS = 400;

/**
 * Mensajes de los fallos que devuelve /api/inscripcion. Cada uno tiene que
 * decir qué pasó y qué hacer: un "error inesperado" en un mall, con la persona
 * de pie y con una mano, es un callejón sin salida.
 */
function mensajeDeFalla(codigo: unknown): string {
  switch (codigo) {
    /*
     * El duplicado ya no es un callejón sin salida: hay un sorteo por día y la
     * inscripción es una por día, así que quien ya participó hoy puede volver
     * mañana. Decir solo "ya está inscrito" haría que se fuera creyendo que su
     * participación vale para los tres sorteos, que es justo lo que no pasa.
     *
     * La frase "ya está inscrito" se conserva a propósito: es la que comprueba
     * el e2e del alta rechazada.
     */
    case "duplicado_rut":
      return "Ese RUT ya está inscrito en el sorteo de hoy. Cada día se puede participar una vez: vuelve mañana para entrar al siguiente.";
    case "duplicado_email":
      return "Ese correo ya está inscrito en el sorteo de hoy. Cada día se puede participar una vez: vuelve mañana para entrar al siguiente.";
    case "cerrado":
      return "Las inscripciones ya cerraron.";
    case "sin_jornada":
      // No hay jornada cargada que cubra este instante. Es un problema nuestro,
      // no de la persona, y el reintento más tarde puede funcionar.
      return "Las inscripciones están en pausa. Vuelve a escanear el código en un rato.";
    case "vetado":
      // Baja por incumplimiento de las bases. El motivo no se explica acá, pero
      // se deja una vía para reclamar en vez de un muro.
      return `No pudimos registrar esta inscripción. Si crees que es un error, escríbenos a ${CORREO_DATOS}.`;
    default:
      return "No pudimos inscribirte. Toca de nuevo para reintentar.";
  }
}

/**
 * Solo el formulario: campos, validación, envío y reintento. NO monta la
 * pantalla ni el encabezado.
 *
 * Se separó del marco para poder usarlo en dos sitios sin duplicarlo: la ruta
 * /inscripcion a pantalla completa y el modal de escritorio que la intercepta.
 * Duplicar un formulario con nueve campos, tres consentimientos y una máquina
 * de errores es la forma más segura de que dentro de un mes uno de los dos
 * valide distinto que el otro.
 */
export function FormularioInscripcion({
  origen,
  alExito,
}: {
  origen: string;
  /**
   * Si viene, se llama en vez de navegar a /listo. Es lo que permite que el
   * modal de escritorio cambie a la ruleta en su sitio: navegar cerraba
   * el modal y mandaba a la pantalla completa, que es exactamente lo que un
   * modal existe para evitar.
   */
  /** Lleva al modal la misma decisión persistida que recibe /listo. */
  alExito?: (resultado: Confirmado) => void;
}) {
  const router = useRouter();
  // El borrador solo trae campos de texto; el consentimiento parte siempre en
  // false, así que las casillas coinciden entre servidor y cliente.
  const [v, setV] = useState<InscripcionValues>(
    () => leeDraft() ?? VALORES_INICIALES,
  );
  const [e, setE] = useState<InscripcionErrors>({});
  const [enviando, setEnviando] = useState(false);
  // Fallo del envío, distinto de los errores por campo: no lo produce un dato
  // malo sino la red o el servidor, y se resuelve reintentando.
  const [falla, setFalla] = useState<string | null>(null);

  const pendiente = useRef<InscripcionValues | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Se conserva entre reintentos de red: si la base alcanzó a resolver antes
  // de que se cortara la respuesta, el segundo POST recupera la misma ruleta.
  const requestId = useRef<string | null>(null);

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
  //
  // Pero desde el modal /listo ya no se visita: el resultado se muestra en su
  // sitio. Ahí el prefetch era una descarga a fondo perdido compitiendo por el
  // ancho de banda justo mientras el modal intentaba cargar.
  useEffect(() => {
    if (alExito) return;
    router.prefetch("/listo");
  }, [router, alExito]);

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
    // Una edición después de un fallo ya es un intento distinto. Durante el
    // POST el fieldset está deshabilitado, por lo que no se pierde idempotencia.
    requestId.current = null;
    // El consentimiento nunca se persiste (ver lib/inscripcion.ts).
    pendiente.current = siguiente;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(guardaYa, DEBOUNCE_MS);
    setE((previos) => revalida(previos, k, siguiente));
  }

  async function enviar(ev: React.FormEvent) {
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
    setFalla(null);
    setEnviando(true);
    requestId.current ??= crypto.randomUUID();

    try {
      const r = await fetch("/api/inscripcion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // El origen NO se manda: lo resuelve proxy.ts y llega por cabecera. Si
        // viniera de acá, cualquiera podría acreditar sus inscripciones al
        // panel que quisiera.
        body: JSON.stringify({
          nombre: v.nombre,
          email: v.email,
          tel: v.tel,
          rut: v.rut,
          edad: v.edad,
          bases: v.bases,
          mkt: v.mkt,
          request_id: requestId.current,
        }),
      });

      if (r.ok) {
        const correo = v.email.trim();
        /*
         * A qué sorteo entró, tal como lo devolvió el servidor. Se guarda en vez
         * de recalcularlo en /listo porque el instante que importa es el del
         * envío: quien manda el formulario a las 20:59:59 entra al sorteo de
         * esta noche, y recalcularlo dos segundos después diría el de mañana.
         */
        const cuerpo = (await r.json().catch(() => ({}))) as {
          sorteo?: unknown;
          pruebas?: unknown;
          ganador?: unknown;
          numero_ganador?: unknown;
        };
        const sorteo = typeof cuerpo.sorteo === "string" ? cuerpo.sorteo : undefined;
        const pruebas = cuerpo.pruebas === true;
        const ganador = cuerpo.ganador === true;
        const numeroGanador =
          typeof cuerpo.numero_ganador === "number" &&
          Number.isInteger(cuerpo.numero_ganador)
            ? cuerpo.numero_ganador
            : undefined;
        const confirmado: Confirmado = {
          email: correo,
          origen,
          sorteo,
          pruebas,
          ganador,
          numeroGanador,
        };
        guardaConfirmado(confirmado);
        pendiente.current = null;
        borraDraft();
        // Sin apagar `enviando`: tanto la navegación como el cambio de
        // contenido del modal desmontan este componente, y reactivar el botón
        // acá solo abre una ventana para un segundo submit.
        if (alExito) {
          alExito(confirmado);
          return;
        }
        router.push("/listo");
        return;
      }

      const cuerpo = await r.json().catch(() => ({}));
      // El servidor revalida todo (el cliente es evadible): si rechaza campos,
      // se pintan sobre los mismos inputs.
      if (cuerpo?.campos) setE(cuerpo.campos as InscripcionErrors);
      setFalla(mensajeDeFalla(cuerpo?.error));
    } catch {
      // Falla de red: en un mall es el caso frecuente, no el excepcional.
      setFalla("No pudimos conectar. Revisa tu señal y toca de nuevo.");
    }
    setEnviando(false);
  }

  return (
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

        {falla && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "12px 14px",
              background: "var(--color-rust-deep)",
              color: "var(--color-bone)",
              fontSize: 13.5,
              lineHeight: 1.5,
              borderRadius: 3,
            }}
          >
            {falla}
          </p>
        )}

        <button
          type="submit"
          style={{
            height: 56,
            // El fondo sale de una custom property para que el modal, que es
            // casi negro en escritorio, pueda cambiarlo a naranja sin pelear
            // con este estilo inline: un botón negro sobre el panel oscuro
            // desaparecía. Sobre el naranja de la pantalla el negro es lo
            // correcto, y ese es el valor por defecto.
            background: "var(--cta-fondo, var(--color-ink))",
            color: "var(--cta-texto, var(--color-bone))",
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
          {enviando
            ? "Preparando ruleta…"
            : falla
              ? "Reintentar"
              : "Inscribirme y girar"}
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
  );
}
