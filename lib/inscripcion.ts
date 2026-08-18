import { motivoRutInvalido } from "./rut.ts";
import { safeGetJSON, safeRemove, safeSetJSON } from "./storage.ts";

export type InscripcionValues = {
  nombre: string;
  email: string;
  tel: string;
  rut: string;
  edad: boolean;
  bases: boolean;
  mkt: boolean;
};

export type CampoTexto = "nombre" | "email" | "tel" | "rut";
export type ClaveError = CampoTexto | "legal";
export type InscripcionErrors = Partial<Record<ClaveError, string>>;

export const VALORES_INICIALES: InscripcionValues = {
  nombre: "",
  email: "",
  tel: "",
  rut: "",
  edad: false,
  bases: false,
  mkt: false,
};

/**
 * Normaliza un teléfono chileno a los 8 dígitos que van después del +56 9.
 * El campo declara autocomplete="tel", así que el autofill entrega el número
 * completo (+56 9 8765 4321) y mucha gente escribe el 9 inicial a mano: antes
 * ambos se rechazaban por "no tener 8 dígitos" pese a ser números correctos.
 */
export function normalizaTelefono(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("56")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) d = d.slice(1);
  return d;
}

/** Valida un campo de texto aislado, para poder revalidar al editar. */
export function validaCampo(k: CampoTexto, v: InscripcionValues): string | null {
  switch (k) {
    case "nombre":
      return v.nombre.trim().split(/\s+/).filter(Boolean).length < 2
        ? "Escribe tu nombre y tu apellido."
        : null;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.email.trim())
        ? null
        : "Revisa el correo: falta el dominio.";
    case "tel":
      return normalizaTelefono(v.tel).length !== 8
        ? "Ocho dígitos después del +56 9."
        : null;
    case "rut":
      return motivoRutInvalido(v.rut);
  }
}

export function valida(v: InscripcionValues): InscripcionErrors {
  const e: InscripcionErrors = {};
  for (const k of ["nombre", "email", "tel", "rut"] as CampoTexto[]) {
    const msg = validaCampo(k, v);
    if (msg) e[k] = msg;
  }
  if (!v.edad || !v.bases) {
    e.legal = "Necesitamos las dos casillas para inscribirte.";
  }
  return e;
}

/*
 * ── Borrador ────────────────────────────────────────────────────────────────
 *
 * Dos reglas que no son negociables:
 *
 * 1. El borrador NUNCA guarda el consentimiento (edad / bases / marketing).
 *    Guardarlo hacía que las casillas se restauraran marcadas en el state pero
 *    DESMARCADAS en el DOM (React 19 marca el flag de dirty checkedness al
 *    hidratar y defaultChecked deja de propagar), así que la persona quedaba
 *    inscrita con un consentimiento que la pantalla le mostró sin marcar.
 *    El consentimiento se declara siempre en la sesión actual, a mano.
 *
 * 2. El borrador expira. En el teléfono de demo de un panel, el borrador de
 *    quien se fue sin enviar reaparecía —con su RUT— para la siguiente
 *    persona. El propósito declarado es sobrevivir una caída de señal, y para
 *    eso alcanzan unos minutos.
 */

const DRAFT_KEY = "edc_draft";
const DRAFT_TTL_MS = 20 * 60 * 1000;

type DraftGuardado = {
  nombre: string;
  email: string;
  tel: string;
  rut: string;
  ts: number;
};

/** Type guard real: un draft con un campo de otro tipo se descarta, no se cree. */
function esDraft(x: unknown): x is DraftGuardado {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.nombre === "string" &&
    typeof d.email === "string" &&
    typeof d.tel === "string" &&
    typeof d.rut === "string" &&
    typeof d.ts === "number" &&
    Number.isFinite(d.ts)
  );
}

export function guardaDraft(v: InscripcionValues): void {
  const soloTexto: DraftGuardado = {
    nombre: v.nombre,
    email: v.email,
    tel: v.tel,
    rut: v.rut,
    ts: Date.now(),
  };
  safeSetJSON("local", DRAFT_KEY, soloTexto);
}

/**
 * Devuelve los campos de texto del borrador si existe y no expiró. El
 * consentimiento siempre vuelve en false: no se hereda de nadie.
 */
export function leeDraft(): InscripcionValues | null {
  const parsed = safeGetJSON("local", DRAFT_KEY);
  if (!esDraft(parsed)) {
    if (parsed !== null) borraDraft();
    return null;
  }
  if (Date.now() - parsed.ts > DRAFT_TTL_MS) {
    borraDraft();
    return null;
  }
  return {
    ...VALORES_INICIALES,
    nombre: parsed.nombre,
    email: parsed.email,
    tel: parsed.tel,
    rut: parsed.rut,
  };
}

export function borraDraft(): void {
  safeRemove("local", DRAFT_KEY);
}
