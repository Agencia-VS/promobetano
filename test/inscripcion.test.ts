import test from "node:test";
import assert from "node:assert/strict";
import {
  VALORES_INICIALES,
  normalizaTelefono,
  valida,
  validaCampo,
} from "../lib/inscripcion.ts";

const base = {
  ...VALORES_INICIALES,
  nombre: "Ana Pérez",
  email: "ana@correo.cl",
  tel: "87654321",
  rut: "12.345.678-5",
  edad: true,
  bases: true,
};

test("un formulario completo y correcto no tiene errores", () => {
  assert.deepEqual(valida(base), {});
});

test("acepta el teléfono como lo entrega el autofill y con 9 inicial", () => {
  // Regresión: la regla exigía exactamente 8 dígitos sin normalizar, así que
  // autocomplete="tel" y el hábito de escribir el 9 se rechazaban.
  for (const tel of [
    "87654321",
    "9 8765 4321",
    "+56 9 8765 4321",
    "56987654321",
    "(9) 8765-4321",
  ]) {
    assert.equal(normalizaTelefono(tel), "87654321", tel);
    assert.equal(validaCampo("tel", { ...base, tel }), null, tel);
  }
});

test("rechaza teléfonos que no completan 8 dígitos", () => {
  for (const tel of ["1234", "", "876543210000"]) {
    assert.notEqual(validaCampo("tel", { ...base, tel }), null, tel);
  }
});

test("exige nombre y apellido", () => {
  assert.notEqual(validaCampo("nombre", { ...base, nombre: "Ana" }), null);
  assert.equal(validaCampo("nombre", { ...base, nombre: "Ana Pérez" }), null);
});

test("las dos casillas legales son obligatorias y la de marketing no", () => {
  assert.ok(valida({ ...base, edad: false }).legal);
  assert.ok(valida({ ...base, bases: false }).legal);
  assert.deepEqual(valida({ ...base, mkt: false }), {});
  assert.deepEqual(valida({ ...base, mkt: true }), {});
});
