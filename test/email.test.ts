import { strict as assert } from "node:assert";
import { test } from "node:test";
import { escapaHtml, plantilla, primerNombre, type TipoCorreo } from "../lib/email.ts";
import { baseAbsoluta, urlAbsoluta } from "../lib/sitio.ts";

const TIPOS: TipoCorreo[] = [
  "confirmacion",
  "ganador",
  "suplente",
  "promovido",
];

/** Las plantillas leen el dominio de process.env al renderizar, así que se
    puede mover entre casos sin recargar el módulo. */
function conDominio<T>(valor: string | undefined, fn: () => T): T {
  const previoSitio = process.env.NEXT_PUBLIC_SITE_URL;
  const previoVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (valor === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = valor;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  try {
    return fn();
  } finally {
    if (previoSitio === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previoSitio;
    if (previoVercel === undefined)
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previoVercel;
  }
}

test("los cuatro tipos que encola la base renderizan", () => {
  // Si un tipo faltara, esa persona no recibiría nada: la cola inserta
  // 'ganador'/'suplente' desde ejecutar_sorteo y 'promovido' desde
  // promover_suplente, y el cron llama a plantilla() con lo que venga.
  for (const tipo of TIPOS) {
    const p = plantilla(tipo, "Ana María Pérez");
    assert.ok(p.asunto.length > 0, `${tipo}: sin asunto`);
    assert.ok(p.html.startsWith("<!doctype html>"), `${tipo}: html mal formado`);
    assert.ok(p.texto.length > 0, `${tipo}: sin versión de texto`);
    assert.ok(p.html.includes("Ana"), `${tipo}: no saluda`);
    assert.ok(p.texto.includes("Ana"), `${tipo}: el texto no saluda`);
  }
});

test("un nombre con HTML no se inyecta en el correo", () => {
  const malicioso = '<img src=x onerror="alert(1)">Ana';
  for (const tipo of TIPOS) {
    const { html, asunto } = plantilla(tipo, malicioso);
    assert.ok(
      !html.includes("onerror="),
      `${tipo}: el atributo llegó crudo al HTML`,
    );
    assert.ok(!asunto.includes("<img"), `${tipo}: el asunto lleva etiquetas`);
  }
  assert.equal(escapaHtml("<b>&'\""), "&lt;b&gt;&amp;&#39;&quot;");
});

test("sin dominio configurado no se emite ninguna imagen", () => {
  // Una ruta relativa en un correo no resuelve contra nada: se vería el icono
  // de imagen rota. Es preferible un correo sin logo.
  conDominio(undefined, () => {
    assert.equal(baseAbsoluta(), null);
    for (const tipo of TIPOS) {
      const { html } = plantilla(tipo, "Ana");
      assert.ok(!html.includes("<img"), `${tipo}: emitió una imagen sin base`);
      assert.ok(
        !html.includes('src="/'),
        `${tipo}: coló una ruta relativa`,
      );
    }
  });
});

test("con dominio, las imágenes son absolutas y llevan alt", () => {
  conDominio("https://eaudeconfianza.cl", () => {
    for (const tipo of TIPOS) {
      const { html } = plantilla(tipo, "Ana");
      assert.ok(
        html.includes("https://eaudeconfianza.cl/email/"),
        `${tipo}: la imagen no es absoluta`,
      );
      assert.ok(!html.includes('alt=""'), `${tipo}: una imagen sin alt`);
    }
    // El lockup es la cabecera de las cuatro piezas.
    for (const tipo of TIPOS) {
      const { html } = plantilla(tipo, "Ana");
      assert.ok(
        html.includes("/email/lockup-600.png"),
        `${tipo}: falta el lockup`,
      );
    }
  });
});

test("el isotipo ya no viaja: el lockup es el único logo", () => {
  // El lockup ya dice «RIQUELME + Betano», así que el isotipo era una segunda
  // firma de la misma marca ocupando una franja entera del correo.
  conDominio("https://eaudeconfianza.cl", () => {
    for (const tipo of TIPOS) {
      const { html } = plantilla(tipo, "Ana");
      assert.ok(!html.includes("iso-96"), `${tipo}: sigue trayendo el isotipo`);
      const imagenes = html.match(/<img/g) ?? [];
      assert.equal(imagenes.length, 1, `${tipo}: debería llevar una sola imagen`);
    }
  });
});

test("la barra final del dominio no duplica la de la ruta", () => {
  conDominio("https://eaudeconfianza.cl/", () => {
    assert.equal(baseAbsoluta(), "https://eaudeconfianza.cl");
    assert.equal(
      urlAbsoluta("/email/lockup-600.png"),
      "https://eaudeconfianza.cl/email/lockup-600.png",
    );
  });
});

test("VERCEL_PROJECT_PRODUCTION_URL sirve de respaldo", () => {
  const previo = process.env.NEXT_PUBLIC_SITE_URL;
  const previoV = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "promobetano.vercel.app";
  try {
    assert.equal(baseAbsoluta(), "https://promobetano.vercel.app");
  } finally {
    if (previo === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = previo;
    if (previoV === undefined) delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    else process.env.VERCEL_PROJECT_PRODUCTION_URL = previoV;
  }
});

test("el correo de ganador dice lo que el equipo prometió y nada más", () => {
  const { asunto, html, texto } = plantilla("ganador", "Ana Pérez");
  // «Confiaste y ganaste», no «felicidades»: amarra con el nombre de la
  // fragancia y con el CTA del sitio. «Felicidades» lo firma cualquier marca.
  assert.match(asunto, /confiaste y ganaste/i);
  assert.match(html, /¡Confiaste/);
  assert.ok(!/felicidades/i.test(html), "volvió el «felicidades» genérico");
  assert.match(html, /el equipo se contactará contigo/i);
  assert.match(texto, /gestionar la entrega de los premios/i);

  // Decisiones 03 y 04 abiertas: no se puede nombrar premio, plazo ni forma de
  // entrega en una pieza con efectos legales.
  for (const inventado of [/\d+\s*(días|horas)/i, /plazo de/i, /retira/i, /canje/i]) {
    assert.ok(!inventado.test(texto), `promete algo no decidido: ${inventado}`);
  }
});

test("suplente no felicita a nadie", () => {
  // Un suplente que reciba "¡Felicidades, ganaste!" es un problema real, no un
  // detalle de copy: los cuatro tipos salen de la misma función.
  const { asunto, html, texto } = plantilla("suplente", "Ana");
  assert.ok(!/ganaste/i.test(asunto), "el asunto felicita");
  assert.ok(!/ganaste/i.test(html), "el cuerpo felicita");
  assert.match(texto, /suplente/i);
});

test("promovido celebra, porque el cupo ya es suyo", () => {
  const { html, texto } = plantilla("promovido", "Ana");
  assert.match(html, /¡Confiaste/);
  assert.match(texto, /se liberó un cupo/i);
});

test("la confirmación dice solo que nos comunicaremos", () => {
  const { html, texto } = plantilla("confirmacion", "Ana");
  assert.match(html, /Nos comunicaremos contigo/);
  assert.match(texto, /Nos comunicaremos contigo/);

  // La frase larga que la reemplazó no debe volver por un merge distraído.
  assert.ok(
    !/Si sales sorteado, te escribimos/i.test(html),
    "volvió la frase que se pidió eliminar",
  );

  // Pero los pasos del perfume se quedan: son «algo de la campaña».
  assert.match(html, /Abre la botella/);
});

test("todo correo lleva el aviso 18+ y el contacto de datos", () => {
  // Obligatorio en toda pieza de una marca de apuestas (reglas 17 y legal).
  for (const tipo of TIPOS) {
    const { html, texto } = plantilla(tipo, "Ana");
    assert.match(html, /mayores de 18 años/i, `${tipo}: falta el 18+ en html`);
    assert.match(html, /Juega con responsabilidad/i, `${tipo}: falta el aviso`);
    assert.match(texto, /mayores de 18 años/i, `${tipo}: falta el 18+ en texto`);
  }
});

test("primerNombre no deja el saludo vacío", () => {
  assert.equal(primerNombre("Ana María Pérez"), "Ana");
  assert.equal(primerNombre("  Ana  "), "Ana");
  assert.equal(primerNombre(""), "hola");
  assert.equal(primerNombre("   "), "hola");
});
