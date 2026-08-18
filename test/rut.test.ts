import test from "node:test";
import assert from "node:assert/strict";
import {
  calculaDv,
  formateaRut,
  motivoRutInvalido,
  normalizaRut,
  rutValido,
  separaRut,
} from "../lib/rut.ts";

test("valida RUT correctos, con y sin puntos, y con K", () => {
  for (const r of ["12.345.678-5", "12345678-5", "15.000.005-K", "15000005-k"]) {
    assert.equal(rutValido(r), true, r);
  }
});

test("rechaza un dígito verificador equivocado", () => {
  assert.equal(rutValido("12.345.678-4"), false);
});

test("el módulo 11 es consistente para 200.000 cuerpos", () => {
  let malos = 0;
  for (let b = 1_000_000; b < 1_200_000; b++) {
    const c = String(b);
    if (!rutValido(`${c}-${calculaDv(c)}`)) malos++;
  }
  assert.equal(malos, 0);
});

test("NUNCA reinterpreta un cuerpo sin guión como cuerpo+DV", () => {
  // Regresión: formateaRut("12345674") devolvía "1.234.567-4", el RUT de otra
  // persona, y en ~9% de los casos además validaba.
  let reescritos = 0;
  for (let b = 12_345_600; b < 12_346_000; b++) {
    const s = String(b);
    if (formateaRut(s) !== s || rutValido(s)) reescritos++;
  }
  assert.equal(reescritos, 0);
});

test("pide el guión explícitamente en el mensaje de error", () => {
  assert.match(String(motivoRutInvalido("12345674")), /guión/);
  assert.match(String(motivoRutInvalido("12.345.678-4")), /dígito verificador/);
  assert.equal(motivoRutInvalido("12.345.678-5"), null);
});

test("los ceros a la izquierda colapsan a una sola clave canónica", () => {
  const claves = new Set(
    ["12.345.678-5", "012.345.678-5", "0012345678-5", "000000012345678-5"].map(
      normalizaRut,
    ),
  );
  assert.equal(claves.size, 1);
  assert.equal([...claves][0], "123456785");
});

test("rechaza el cuerpo todo-cero", () => {
  for (const r of ["0.000.000-0", "000000-0", "0-0"]) {
    assert.equal(rutValido(r), false, r);
  }
});

test("acota el largo del cuerpo a 7-8 dígitos", () => {
  assert.equal(separaRut("123456-7"), null, "6 dígitos");
  assert.equal(separaRut("123456789-1"), null, "9 dígitos");
  assert.notEqual(separaRut("1234567-4"), null, "7 dígitos");
  assert.notEqual(separaRut("12345678-5"), null, "8 dígitos");
});

test("formatea con puntos solo cuando hay guión", () => {
  assert.equal(formateaRut("12345678-5"), "12.345.678-5");
  assert.equal(formateaRut("12345678"), "12345678");
  assert.equal(formateaRut("1234"), "1234");
});
