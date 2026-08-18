/**
 * Validación de RUT módulo 11 — misma regla que lib/rut.ts en el repo del
 * concurso anterior (brief §Se reusa tal cual). Puerta de entrada: los
 * dígitos y la K se limpian y se recalcula el dígito verificador.
 */
export function formateaRut(raw: string): string {
  const limpio = raw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 2) return raw.trim();
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + dv;
}

export function rutValido(raw: string): boolean {
  const limpio = raw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (limpio.length < 7) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;

  let suma = 0;
  let mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
  return dv === esperado;
}

/** Normaliza para deduplicar: 12.345.678-9 y 12345678-9 son la misma persona. */
export function normalizaRut(raw: string): string {
  return raw.replace(/[^0-9kK]/g, "").toUpperCase();
}
