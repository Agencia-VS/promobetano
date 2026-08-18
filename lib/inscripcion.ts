import { rutValido } from "./rut";

export type InscripcionValues = {
  nombre: string;
  email: string;
  tel: string;
  rut: string;
  edad: boolean;
  bases: boolean;
  mkt: boolean;
};

export type InscripcionErrors = Partial<
  Record<"nombre" | "email" | "tel" | "rut" | "legal", string>
>;

export const VALORES_INICIALES: InscripcionValues = {
  nombre: "",
  email: "",
  tel: "",
  rut: "",
  edad: false,
  bases: false,
  mkt: false,
};

/** Misma máquina de validación que el Component del prototipo (dc.html). */
export function valida(v: InscripcionValues): InscripcionErrors {
  const e: InscripcionErrors = {};
  if (v.nombre.trim().split(/\s+/).filter(Boolean).length < 2) {
    e.nombre = "Escribe tu nombre y tu apellido.";
  }
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.email.trim())) {
    e.email = "Revisa el correo: falta el dominio.";
  }
  if (v.tel.replace(/\D/g, "").length !== 8) {
    e.tel = "Ocho dígitos después del +56 9.";
  }
  if (!rutValido(v.rut)) {
    e.rut = "Ese RUT no valida. Revisa el dígito verificador.";
  }
  if (!v.edad || !v.bases) {
    e.legal = "Necesitamos las dos casillas para inscribirte.";
  }
  return e;
}

const DRAFT_KEY = "edc_draft";

/**
 * Borrador en localStorage — brief §Reglas del formulario móvil: "la señal
 * en un mall se cae; el usuario no debería reescribir su RUT."
 */
export function guardaDraft(v: InscripcionValues) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(v));
  } catch {
    // Almacenamiento no disponible (modo privado, cuota llena): el borrador
    // es una comodidad, no un requisito — se sigue sin él.
  }
}

export function leeDraft(): InscripcionValues | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...VALORES_INICIALES, ...parsed };
  } catch {
    return null;
  }
}

export function borraDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ver guardaDraft
  }
}
