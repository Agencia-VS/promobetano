import test from "node:test";
import assert from "node:assert/strict";
import {
  ORIGEN_DIRECTO,
  etiquetaPanel,
  normalizaOrigen,
  slugValido,
} from "../lib/origen.ts";

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

test("la etiqueta sale de la lista blanca, nunca del slug crudo", () => {
  // Regresión: derivarla del slug truncaba malls ("parque-arauco" → "Parque") y
  // permitía reflejar texto elegido por un tercero.
  assert.equal(etiquetaPanel("parque-arauco-01"), "Parque Arauco");
  assert.equal(etiquetaPanel("retira-tu-premio-ahora-01"), "Panel por definir");
  assert.equal(etiquetaPanel("costanera"), "Panel por definir");
});
