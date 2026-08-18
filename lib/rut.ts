/**
 * RUT chileno: separación, validación módulo 11 y forma canónica.
 *
 * Regla de diseño: el guión es OBLIGATORIO para separar cuerpo y dígito
 * verificador. Con 8 caracteres sin separador es imposible distinguir un
 * cuerpo de 7 dígitos + DV de un cuerpo de 8 dígitos al que le falta el DV
 * — ambas son formas legales. Adivinar (tomar el último carácter como DV)
 * reescribe el RUT de una persona como el de OTRA, y en ~9% de los casos el
 * resultado además valida, así que el error pasa silencioso. Preferimos
 * pedir el guión antes que aceptar un RUT ajeno en un sorteo con efectos
 * legales.
 */

export type RutPartes = { cuerpo: string; dv: string };

/**
 * Separa un RUT en cuerpo canónico (sin puntos ni ceros a la izquierda) y
 * dígito verificador. Devuelve null si la forma no es interpretable.
 */
export function separaRut(raw: string): RutPartes | null {
  const limpio = raw.replace(/[^0-9kK-]/g, "").toUpperCase();
  const guion = limpio.lastIndexOf("-");
  if (guion < 1) return null;

  // Los ceros a la izquierda no cambian el módulo 11, así que 012.345.678-5 y
  // 12.345.678-5 son el MISMO RUT: se normalizan para que la clave de
  // deduplicación sea única (antes producían cuatro claves distintas y la
  // misma persona podía entrar cuatro veces al sorteo).
  const cuerpo = limpio.slice(0, guion).replace(/^0+/, "");
  const dv = limpio.slice(guion + 1);

  // 7–8 dígitos acota el cuerpo por arriba y por abajo, y de paso rechaza el
  // cuerpo todo-cero (0.000.000-0 validaba, dando un RUT "válido" desechable).
  if (!/^\d{7,8}$/.test(cuerpo)) return null;
  if (!/^[0-9K]$/.test(dv)) return null;
  return { cuerpo, dv };
}

/** Dígito verificador esperado para un cuerpo ya normalizado. */
export function calculaDv(cuerpo: string): string {
  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

export function rutValido(raw: string): boolean {
  const partes = separaRut(raw);
  return partes !== null && calculaDv(partes.cuerpo) === partes.dv;
}

/**
 * Formatea con puntos SOLO cuando el guión ya está presente, es decir cuando
 * el usuario indicó dónde termina el cuerpo. Sin guión devuelve lo escrito
 * tal cual: nunca reinterpreta los dígitos del usuario.
 */
export function formateaRut(raw: string): string {
  const partes = separaRut(raw);
  if (!partes) return raw.trim();
  const conPuntos = partes.cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${partes.dv}`;
}

/** Clave canónica de deduplicación: 12.345.678-5 y 012345678-5 → "123456785". */
export function normalizaRut(raw: string): string | null {
  const partes = separaRut(raw);
  return partes ? partes.cuerpo + partes.dv : null;
}

/** Mensaje de error para el usuario, o null si el RUT es válido. */
export function motivoRutInvalido(raw: string): string | null {
  const texto = raw.trim();
  if (!texto) return "Escribe tu RUT.";
  if (!separaRut(texto)) {
    return "Escribe el RUT con guión antes del último dígito, como 12.345.678-5.";
  }
  return rutValido(texto)
    ? null
    : "Ese RUT no valida. Revisa el dígito verificador.";
}
