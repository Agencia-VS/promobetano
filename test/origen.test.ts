import test from "node:test";
import assert from "node:assert/strict";
import { ORIGEN_DIRECTO, normalizaOrigen, slugValido } from "../lib/origen.ts";

test("el default no es un panel real", () => {
  // Regresión: ORIGEN_DEFAULT era "parque-arauco-01", así que todo el tráfico
  // orgánico se acreditaba a ese panel.
  assert.equal(normalizaOrigen(undefined), ORIGEN_DIRECTO);
  assert.equal(normalizaOrigen(""), ORIGEN_DIRECTO);
  assert.ok(!/arauco/.test(ORIGEN_DIRECTO));
});

test("toma el primer valor no vacío cuando ?p= viene repetido", () => {
  assert.equal(normalizaOrigen(["", "costanera-center-04"]), "costanera-center-04");
});

test("no refleja slugs con forma inválida", () => {
  for (const s of ["<script>", "MAYUS-01", "a".repeat(80), "doble--guion", "-x"]) {
    assert.equal(slugValido(s), false, s);
  }
  assert.equal(normalizaOrigen("<script>-01"), ORIGEN_DIRECTO);
});

test("un slug con forma válida se registra tal cual, sin lista blanca", () => {
  // Los QR se imprimen con un ?p= por panel y no hay que tocar el código para
  // agregar uno: la forma es lo único que se exige, y el slug entero llega a
  // `inscripciones.origen` para que el reporte por panel lo agrupe.
  assert.equal(normalizaOrigen("costanera-center-04"), "costanera-center-04");
  assert.equal(normalizaOrigen("COSTANERA-CENTER-04"), "costanera-center-04");
});
