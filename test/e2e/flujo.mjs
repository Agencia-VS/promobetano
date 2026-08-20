/*
 * Verificación end-to-end del flujo de inscripción. Cada bloque reproduce un
 * defecto concreto encontrado en la revisión de código, para que no vuelva.
 *
 *   1. Levanta el servidor CON LA VENTANA ABIERTA. Con las fechas reales el
 *      formulario no existe fuera del 21 al 23 de agosto, así que para probar:
 *
 *        CONCURSO_INICIO=2020-01-01T00:00:00-04:00 \
 *        CONCURSO_CIERRE=2100-01-01T00:00:00-04:00 npm run dev
 *
 *   2. node test/e2e/flujo.mjs
 *
 * El alta contra Supabase se simula con page.route: esta suite verifica el
 * flujo de la interfaz —validaciones, borrador, estados, reintento— y no la
 * base, que se prueba aparte contra un PostgreSQL real.
 *
 * Requiere Playwright y un Chromium. Con CHROMIUM_PATH se puede apuntar a uno
 * ya instalado en el sistema.
 */
import { chromium } from "playwright";
// E2E_BASE permite apuntar a un build de produccion (next start) en vez del
// servidor de desarrollo. Importa: en `next dev` el prefetch esta desactivado
// por diseño, asi que la apertura instantanea del modal SOLO se puede
// comprobar de verdad contra produccion.
const B = process.env.E2E_BASE ?? "http://localhost:3000";
const ok = (c, m) => console.log(`${c ? "PASS" : "FALLA"}  ${m}`);
let fallas = 0;
const check = (c, m) => { if (!c) fallas++; ok(c, m); };

// CHROMIUM_PATH permite apuntar a un binario ya instalado; si no está, se usa
// el que Playwright resuelva por su cuenta.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
/**
 * `respuesta` fuerza lo que devuelve /api/inscripcion. Por defecto un alta
 * exitosa, para que los bloques que prueban la interfaz no dependan de tener
 * un Supabase levantado.
 */
const nueva = async (
  respuesta = { status: 201, body: { ok: true, ganador: false } },
) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/api/inscripcion", (route) =>
    route.fulfill({
      status: respuesta.status,
      contentType: "application/json",
      body: JSON.stringify(respuesta.body),
    }),
  );
  const p = await ctx.newPage();
  const errores = [];
  p.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  p.on("pageerror", (e) => errores.push(String(e)));
  return { ctx, p, errores };
};

console.log("=== 1. Puerta 18+ verificada en el servidor ===");
{
  const { ctx, p } = await nueva();
  for (const ruta of ["/i", "/inscripcion", "/listo"]) {
    await p.goto(B + ruta, { waitUntil: "domcontentloaded" });
    check(new URL(p.url()).pathname === "/edad", `${ruta} sin cookie -> /edad (quedo en ${new URL(p.url()).pathname})`);
  }
  // El bypass de Tab+Enter: el CTA de la promo no existe en el DOM de /edad
  await p.goto(B + "/i", { waitUntil: "domcontentloaded" });
  const cta = await p.locator('a[href^="/inscripcion"]').count();
  check(cta === 0, `el CTA "Confia y dale" no esta en el DOM de la puerta (encontrados: ${cta})`);
  // Tab x5 + Enter no debe llevar al formulario
  for (let i = 0; i < 5; i++) await p.keyboard.press("Tab");
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  check(new URL(p.url()).pathname !== "/inscripcion", `Tab+Enter no llega al formulario (quedo en ${new URL(p.url()).pathname})`);
  await ctx.close();
}

console.log("\n=== 2. Puerta se cierra y persiste server-side ===");
{
  const { ctx, p } = await nueva();
  await p.goto(B + "/i?p=parque-arauco-01", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  check(new URL(p.url()).pathname === "/i", `tras confirmar vuelve a /i (${new URL(p.url()).pathname})`);
  const cookies = await ctx.cookies();
  const edad = cookies.find((c) => c.name === "edc_18_ok");
  check(!!edad && edad.httpOnly === true, `cookie edc_18_ok es httpOnly (${edad ? "httpOnly=" + edad.httpOnly : "ausente"})`);
  const org = cookies.find((c) => c.name === "edc_origen");
  check(org?.value === "parque-arauco-01", `origen registrado desde ?p= (${org?.value})`);
  // El ?p= se guarda para MEDIR, no para mostrarse: la placa nombra la sede de
  // la activacion, que es la misma con o sin QR. Antes salia de una lista blanca
  // y el trafico sin ?p= —la mayoria— leia "Panel por definir".
  check((await p.locator("text=Costanera Center").count()) > 0, "la placa nombra la sede, no el slug del panel");
  check((await p.locator("text=Parque Arauco").count()) === 0, "el ?p= no elige el texto de la portada");
  await ctx.close();
}

console.log("\n=== 3. El draft NO arrastra consentimiento ni datos de otra persona ===");
{
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  // Persona A llena y marca las casillas, sin enviar
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  check((await p.locator('input[type=checkbox]').count()) === 2, "el formulario solo muestra edad y bases, sin casilla promocional");
  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-rut", "12.345.678-5");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.waitForTimeout(700); // debounce
  // Persona B recarga
  await p.reload({ waitUntil: "networkidle" });
  const c0 = p.locator('input[type=checkbox]').nth(0);
  const c1 = p.locator('input[type=checkbox]').nth(1);
  check((await c0.isChecked()) === false, "casilla 18+ vuelve DESMARCADA");
  check((await c1.isChecked()) === false, "casilla bases vuelve DESMARCADA");
  // y el state coincide: enviar debe fallar por falta de consentimiento
  await p.click('button[type=submit]');
  await p.waitForTimeout(400);
  check(new URL(p.url()).pathname === "/inscripcion", "no deja enviar sin marcar consentimiento");
  check((await p.locator("text=Necesitamos las dos casillas").count()) > 0, "muestra el error legal");
  const draft = await p.evaluate(() => localStorage.getItem("edc_draft"));
  check(draft !== null && !/edad|bases/.test(draft), `el draft no contiene consentimiento (${draft?.slice(0,60)}...)`);
  await ctx.close();
}

console.log("\n=== 4. RUT: exige guion, no reescribe el RUT de otro ===");
{
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.fill("#f-rut", "12345674");     // cuerpo sin DV
  await p.locator("#f-rut").blur();
  await p.waitForTimeout(200);
  const val = await p.inputValue("#f-rut");
  check(val === "12345674", `no reescribe cuerpo sin guion (quedo "${val}", antes "1.234.567-4")`);
  await p.click('button[type=submit]');
  await p.waitForTimeout(300);
  check((await p.locator("text=con guión").count()) > 0, "explica que falta el guion");
  // aria wiring
  check((await p.getAttribute("#f-rut", "aria-invalid")) === "true", "aria-invalid en el campo RUT");
  const desc = await p.getAttribute("#f-rut", "aria-describedby");
  check(desc === "f-rut-error", `aria-describedby apunta al error (${desc})`);
  // el error se limpia al corregir
  await p.fill("#f-rut", "12.345.678-5");
  await p.waitForTimeout(250);
  check((await p.locator("text=con guión").count()) === 0, "el error se limpia al corregir el dato");
  await ctx.close();
}

console.log("\n=== 5. Telefono: acepta autofill y 9 inicial ===");
{
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  for (const tel of ["+56 9 8765 4321", "9 8765 4321", "87654321"]) {
    await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
    await p.evaluate(() => localStorage.clear());
    await p.fill("#f-nombre", "Ana Perez");
    await p.fill("#f-email", "ana@correo.cl");
    await p.fill("#f-rut", "12.345.678-5");
    await p.fill("#f-tel", tel);
    await p.locator('input[type=checkbox]').nth(0).check();
    await p.locator('input[type=checkbox]').nth(1).check();
    await p.click('button[type=submit]');
    await p.waitForTimeout(500);
    check(new URL(p.url()).pathname === "/listo", `acepta "${tel}" (quedo en ${new URL(p.url()).pathname})`);
  }
  await ctx.close();
}

console.log("\n=== 6. /listo: guard + sin hydration mismatch ===");
{
  const { ctx, p, errores } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  // visita directa sin inscribirse -> debe expulsar
  await p.goto(B + "/listo", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  // Expulsa a la portada, no al formulario: una navegacion de cliente a
  // /inscripcion abriria el modal sobre una pantalla que se desmonta.
  check(new URL(p.url()).pathname === "/i", `visita directa a /listo redirige (${new URL(p.url()).pathname})`);
  // ahora inscribiendose de verdad, por navegacion dura (sin modal)
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-tel", "87654321");
  await p.fill("#f-rut", "12.345.678-5");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  errores.length = 0;
  await p.click('button[type=submit]');
  await p.waitForURL("**/listo", { timeout: 5000 });
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(3100);
  check((await p.locator("text=Esta vez no ganaste").count()) > 0, "revela el resultado perdedor");
  check((await p.locator("text=ana@correo.cl").count()) === 0, "no promete correo a quien no gana");
  // recarga dura: es donde antes explotaba la hidratacion
  errores.length = 0;
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(3100);
  const hidra = errores.filter((e) => /hydrat|418|423|Minified React error/i.test(e));
  check(hidra.length === 0, `recarga de /listo sin error de hidratacion (${hidra.length ? hidra[0].slice(0,120) : "limpio"})`);
  check((await p.locator("text=Esta vez no ganaste").count()) > 0, "tras recargar conserva el mismo resultado");
  await ctx.close();
}

console.log("\n=== 7. Datos corruptos no rompen nada ===");
{
  const { ctx, p, errores } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.evaluate(() => localStorage.setItem("edc_draft", '{"nombre":123,"email":"a@b.cl","tel":"1","rut":"x","ts":1}'));
  errores.length = 0;
  await p.reload({ waitUntil: "networkidle" });
  await p.click('button[type=submit]');
  await p.waitForTimeout(400);
  const crash = errores.filter((e) => /trim is not a function|is not a function/i.test(e));
  check(crash.length === 0, `draft mal tipado no lanza (${crash.length ? crash[0].slice(0,90) : "limpio"})`);
  check((await p.locator('[role=alert]').count()) > 0, "muestra errores de validacion normalmente");
  // cookie de origen malformada
  await p.context().addCookies([{ name: "edc_origen", value: "100%", url: B }]);
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  errores.length = 0;
  await p.fill("#f-nombre", "Ana Perez"); await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-tel", "87654321"); await p.fill("#f-rut", "12.345.678-5");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.click('button[type=submit]');
  await p.waitForTimeout(900);
  check(new URL(p.url()).pathname === "/listo", `cookie de origen malformada no bloquea el envio (${new URL(p.url()).pathname})`);
  // confirmado corrupto no crashea /listo
  await p.evaluate(() => sessionStorage.setItem("edc_confirmado", '{"email":{"a":1}}'));
  errores.length = 0;
  await p.goto(B + "/listo", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  const c31 = errores.filter((e) => /error #31|Objects are not valid/i.test(e));
  check(c31.length === 0, `confirmado corrupto no crashea /listo (${c31.length ? c31[0].slice(0,90) : "limpio"})`);
  await ctx.close();
}

console.log("\n=== 8. Atribucion de panel ===");
{
  // la URL manda sobre la cookie
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/i?p=parque-arauco-01", { waitUntil: "networkidle" });
  await p.goto(B + "/inscripcion?p=costanera-center-04", { waitUntil: "networkidle" });
  let cs = await ctx.cookies();
  check(cs.find((c) => c.name === "edc_origen")?.value === "costanera-center-04",
    `?p= vigente le gana a la cookie de 30 dias (${cs.find((c) => c.name === "edc_origen")?.value})`);
  // una visita sin ?p= no borra la atribucion buena
  await p.goto(B + "/i", { waitUntil: "networkidle" });
  cs = await ctx.cookies();
  check(cs.find((c) => c.name === "edc_origen")?.value === "costanera-center-04",
    `visita sin ?p= no sobreescribe con el default (${cs.find((c) => c.name === "edc_origen")?.value})`);
  // la raiz preserva el query string
  await p.goto(B + "/?p=mall-plaza-01", { waitUntil: "networkidle" });
  cs = await ctx.cookies();
  check(cs.find((c) => c.name === "edc_origen")?.value === "mall-plaza-01",
    `la raiz preserva el ?p= al redirigir (${cs.find((c) => c.name === "edc_origen")?.value})`);
  // slug arbitrario no se refleja en la pagina
  await p.goto(B + "/i?p=retira-tu-premio-ahora-01", { waitUntil: "networkidle" });
  check((await p.locator("text=Retira Tu Premio").count()) === 0, "un slug arbitrario no se refleja como texto en la pagina");
  await ctx.close();
}

{
  // Regresion del smoke test del 19 ago: TODA inscripcion quedaba con origen
  // "directo". El POST del formulario no pasaba por proxy.ts, asi que el header
  // con el origen no existia y el handler caia al default. Lo que se comprueba
  // es que la peticion de alta LLEVA la atribucion: la cookie es lo que el
  // servidor puede leer con o sin matcher, y es el respaldo del arreglo.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let cookieDelAlta = null;
  let cuerpoDelAlta = null;
  await ctx.route("**/api/inscripcion", (route) => {
    cookieDelAlta = route.request().headers()["cookie"] ?? "";
    cuerpoDelAlta = JSON.parse(route.request().postData() ?? "{}");
    return route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, ganador: false }),
    });
  });
  const p = await ctx.newPage();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/i?p=costanera-center-04", { waitUntil: "networkidle" });
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-rut", "12.345.678-5");
  await p.fill("#f-tel", "87654321");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.click('button[type=submit]');
  await p.waitForTimeout(600);
  check(/edc_origen=costanera-center-04/.test(cookieDelAlta ?? ""),
    `el POST de alta lleva la atribucion de panel (${cookieDelAlta ?? "sin peticion"})`);
  check(
    /^[0-9a-f-]{36}$/i.test(cuerpoDelAlta?.request_id ?? ""),
    "el POST lleva request_id para recuperar el mismo resultado al reintentar",
  );
  await ctx.close();
}

console.log("\n=== 8b. Portada y ruleta: ganador con folio ===");
{
  const { ctx, p } = await nueva({
    status: 201,
    body: { ok: true, ganador: true, numero_ganador: 7 },
  });
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/i", { waitUntil: "networkidle" });
  // La sede es fija: aparece tambien sin ?p=, que antes decia "Panel por definir".
  check((await p.locator("text=Costanera Center").count()) > 0, "la portada nombra la sede sin depender del ?p=");
  check((await p.locator("text=Panel por definir").count()) === 0, "ya no queda el placeholder de panel");
  check((await p.getByRole("heading", { name: /confía y participa por 1 de los 90 eau de confianza/i }).count()) === 1,
    "la portada muestra el nuevo titulo principal");
  check((await p.locator("h1 + p", { hasText: "Hay un aroma para el momento en que decides confiar en ti" }).count()) === 1,
    "la frase de aroma aparece como bajada inmediata del titulo");
  check((await p.locator("text=Un perfume único en su tipo").count()) === 0,
    "la portada ya no muestra el texto descriptivo eliminado");

  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-rut", "12.345.678-5");
  await p.fill("#f-tel", "87654321");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.click('button[type=submit]');
  await p.waitForURL("**/listo", { timeout: 5000 });
  check((await p.locator("text=Girando la ruleta").count()) > 0, "muestra la animacion antes del resultado");
  check((await p.locator(".ruleta__segmento").count()) === 6, "la ruleta tiene seis segmentos con perfume");
  await p.waitForTimeout(3100);
  check((await p.locator("text=¡Ganaste!").count()) > 0, "revela la pantalla de ganador");
  check((await p.locator("text=#007").count()) > 0, "muestra el folio correlativo");
  check((await p.locator("text=ana@correo.cl").count()) > 0, "dice a que correo fue el respaldo");
  await ctx.close();
}

console.log("\n=== 8c. Modo pruebas: correlativo aislado ===");
{
  const { ctx, p } = await nueva({
    status: 201,
    body: { ok: true, ganador: true, numero_ganador: 2, pruebas: true },
  });
  await p.goto(B + "/edad?next=%2Finscripcion", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/inscripcion", { timeout: 5000 });
  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-tel", "87654321");
  await p.fill("#f-rut", "12.345.678-5");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.click('button[type=submit]');
  await p.waitForURL("**/listo", { timeout: 5000 });
  await p.waitForTimeout(3100);
  check((await p.locator("text=PRUEBA 2").count()) > 0, "el ensayo muestra PRUEBA 2 y no un folio real");
  check((await p.locator("text=#002").count()) === 0, "el ensayo nunca presenta #002");
  check((await p.locator("text=Enviaremos el respaldo de prueba").count()) > 0, "el ganador de ensayo anuncia su correo de respaldo");
  await ctx.close();
}

console.log("\n=== 9. /bases existe y es alcanzable sin puerta ===");
{
  const { ctx, p } = await nueva();
  const r = await p.goto(B + "/bases", { waitUntil: "domcontentloaded" });
  check(r.status() === 200 && new URL(p.url()).pathname === "/bases", `/bases responde 200 sin puerta (${r.status()} ${new URL(p.url()).pathname})`);
  check((await p.locator("text=Responsable del tratamiento").count()) > 0, "/bases contiene la información del tratamiento de datos");
  await ctx.close();
}

console.log("\n=== 10. Fallo del alta y reintento ===");
{
  // Duplicado: el servidor responde 409 y la persona tiene que entender por
  // que y poder corregir, no quedarse mirando un spinner.
  const { ctx, p } = await nueva({ status: 409, body: { error: "duplicado_rut" } });
  await p.goto(B + "/edad?next=%2Finscripcion", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/inscripcion", { timeout: 5000 });
  await p.locator("#f-nombre").fill("Ana Perez");
  await p.locator("#f-email").fill("ana@correo.cl");
  await p.locator("#f-tel").fill("87654321");
  await p.locator("#f-rut").fill("9568547-1");
  await p.locator("input[type=checkbox]").nth(0).check();
  await p.locator("input[type=checkbox]").nth(1).check();
  await p.getByRole("button", { name: /girar/i }).click();
  await p.waitForTimeout(600);

  check(new URL(p.url()).pathname === "/inscripcion", `un alta rechazada NO navega a /listo (${new URL(p.url()).pathname})`);
  check((await p.locator("text=ya esta inscrito").count()) + (await p.locator("text=ya está inscrito").count()) > 0, "explica que ese RUT ya esta inscrito");
  check((await p.getByRole("button", { name: /reintentar/i }).count()) > 0, "ofrece reintentar en vez de dejar un callejon sin salida");
  const habilitado = await p.getByRole("button", { name: /reintentar/i }).isEnabled();
  check(habilitado, "el boton de reintento queda habilitado");
  await ctx.close();
}

{
  // Caida de red: el fetch lanza y la interfaz tiene que decirlo.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route("**/api/inscripcion", (route) => route.abort("failed"));
  const p = await ctx.newPage();
  await p.goto(B + "/edad?next=%2Finscripcion", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/inscripcion", { timeout: 5000 });
  await p.locator("#f-nombre").fill("Ana Perez");
  await p.locator("#f-email").fill("ana@correo.cl");
  await p.locator("#f-tel").fill("87654321");
  await p.locator("#f-rut").fill("9568547-1");
  await p.locator("input[type=checkbox]").nth(0).check();
  await p.locator("input[type=checkbox]").nth(1).check();
  await p.getByRole("button", { name: /girar/i }).click();
  await p.waitForTimeout(600);
  check((await p.locator("[role=alert]").count()) > 0, "una caida de red muestra alerta");
  check((await p.getByRole("button", { name: /reintentar/i }).count()) > 0, "y deja reintentar");
  await ctx.close();
}

console.log("\n=== 11. Modal desde la portada ===");
{
  // El CTA de la portada abre el formulario como modal SIN salir de la pagina,
  // pero cambiando la URL: es lo que permite cerrar con el boton atras.
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad?next=%2Fi", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/i", { timeout: 5000 });
  await p.getByRole("link", { name: /dale/i }).click();
  await p.waitForSelector("#f-nombre", { timeout: 8000 });

  check(new URL(p.url()).pathname === "/inscripcion", `abrir el modal cambia la URL (${new URL(p.url()).pathname})`);
  check((await p.locator(".modal-panel").count()) > 0, "se pinta como modal, no como pagina");

  await p.fill("#f-nombre", "Ana Perez");
  await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-tel", "87654321");
  await p.fill("#f-rut", "12.345.678-5");
  await p.locator("input[type=checkbox]").nth(0).check();
  await p.locator("input[type=checkbox]").nth(1).check();
  await p.click("button[type=submit]");
  await p.waitForTimeout(3100);

  // La ruleta y su resultado permanecen dentro del modal interceptado.
  check(new URL(p.url()).pathname === "/inscripcion", `el exito NO navega a otra pantalla (${new URL(p.url()).pathname})`);
  check((await p.locator("text=Esta vez no ganaste").count()) > 0, "el modal revela el resultado");
  check((await p.locator("text=ana@correo.cl").count()) === 0, "el perdedor no recibe correo");
  check((await p.locator(".modal-panel").count()) > 0, "sigue siendo el modal, no la pantalla completa");

  await p.getByRole("button", { name: /^cerrar$/i }).click();
  await p.waitForTimeout(700);
  check(new URL(p.url()).pathname === "/i", `cerrar devuelve a la portada (${new URL(p.url()).pathname})`);
  check((await p.locator(".modal-panel").count()) === 0, "el modal queda cerrado");
  await ctx.close();
}

{
  // El boton atras del navegador cierra el modal en vez de salir del sitio:
  // eso es lo que el modal sin URL del repo anterior no podia dar.
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad?next=%2Fi", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/i", { timeout: 5000 });
  await p.getByRole("link", { name: /dale/i }).click();
  await p.waitForSelector("#f-nombre", { timeout: 8000 });
  await p.goBack();
  await p.waitForTimeout(700);
  check(new URL(p.url()).pathname === "/i", `el boton atras cierra el modal (${new URL(p.url()).pathname})`);
  await ctx.close();
}

{
  // Visita directa: la MISMA URL tiene que dar el formulario completo, sin
  // modal. Es la razon de usar rutas interceptoras y no un estado local.
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad?next=%2Finscripcion", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/inscripcion", { timeout: 5000 });
  check((await p.locator(".modal-panel").count()) === 0, "una visita directa da la pantalla completa, no el modal");
  check((await p.locator("#f-nombre").count()) > 0, "y el formulario esta ahi igual");
  await ctx.close();
}

console.log("\n=== 12. Doble submit ===");
{
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForLoadState("networkidle");
  await p.goto(B + "/inscripcion", { waitUntil: "networkidle" });
  await p.fill("#f-nombre", "Ana Perez"); await p.fill("#f-email", "ana@correo.cl");
  await p.fill("#f-tel", "87654321"); await p.fill("#f-rut", "12.345.678-5");
  await p.locator('input[type=checkbox]').nth(0).check();
  await p.locator('input[type=checkbox]').nth(1).check();
  await p.click('button[type=submit]');
  // .isDisabled() de Playwright no refleja el estado de <fieldset>; se lee la
  // propiedad del DOM, que es la que realmente congela los controles hijos.
  const disabled = await p.locator("fieldset").evaluate((el) => el.disabled).catch(() => false);
  check(disabled === true, "el fieldset completo queda deshabilitado durante el envio");
  await ctx.close();
}

console.log("\n=== 13. El modal se comporta igual en celular que en PC ===");
{
  // El viewport de nueva() es 390x844: celular. Antes el panel ocupaba la
  // pantalla entera y no habia ninguna animacion —las dos vivian dentro de
  // @media (min-width:1024px)— asi que abrirlo era indistinguible de navegar.
  const { ctx, p } = await nueva();
  await p.goto(B + "/edad?next=%2Fi", { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /tengo 18/i }).click();
  await p.waitForURL("**/i", { timeout: 5000 });

  // Cuenta montajes del marco: el esqueleto y la pagina son hermanos de un
  // Suspense, asi que si los dos trajeran <ModalInscripcion> el marco se
  // desmontaria y volveria a montar, repitiendo la animacion a media apertura.
  await p.evaluate(() => {
    window.__montajes = 0;
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n.nodeType === 1 && n.classList?.contains("modal-fondo"))
            window.__montajes++;
    }).observe(document.body, { childList: true, subtree: true });
  });

  await p.getByRole("link", { name: /dale/i }).click();
  await p.waitForSelector(".modal-panel", { state: "visible", timeout: 8000 });

  const anim = await p.evaluate(() => {
    const nombres = (sel) => {
      const el = document.querySelector(sel);
      return el ? el.getAnimations().map((a) => a.animationName ?? "?") : [];
    };
    return { fondo: nombres(".modal-fondo"), panel: nombres(".modal-panel") };
  });

  check(anim.fondo.includes("modal-entra"), `el fondo entra con fundido (${anim.fondo.join(",") || "ninguna"})`);
  check(anim.panel.includes("modal-aparece"), `el panel entra igual que en PC (${anim.panel.join(",") || "ninguna"})`);

  // Tarjeta flotante, no pantalla completa: el panel tiene que ser mas angosto
  // que el viewport y dejar fondo visible a los lados para poder cerrarlo
  // tocando fuera, igual que en escritorio.
  const caja = await p.locator(".modal-panel").boundingBox();
  check(caja !== null && caja.width < 390 - 8, `el panel flota, no ocupa la pantalla (${caja ? Math.round(caja.width) : "?"}px de 390)`);
  check(caja !== null && caja.y > 4, `queda fondo visible arriba (${caja ? Math.round(caja.y) : "?"}px)`);

  const radio = await p.locator(".modal-panel").evaluate((el) => getComputedStyle(el).borderRadius);
  check(parseFloat(radio) > 0, `la tarjeta tiene esquinas redondeadas (${radio})`);

  await p.waitForSelector("#f-nombre", { timeout: 8000 });

  // El logo de Betano acompana al formulario: el modal tapa la portada, asi que
  // sin el la persona llena sus datos sin ninguna marca a la vista. Se comprueba
  // DESPUES de esperar al formulario: hasta entonces el panel muestra el
  // esqueleto, que no lo lleva.
  const logo = await p.locator('.modal-panel img[alt="Betano"]').count();
  check(logo === 1, `el logo de Betano esta en el formulario (${logo})`);
  const montajes = await p.evaluate(() => window.__montajes);
  check(montajes === 1, `el marco se monta una sola vez, sin repetir la animacion (${montajes})`);

  // El dialogo se anuncia por aria-labelledby="modal-titulo". Si el esqueleto
  // no aportara ese id, durante la carga seria un dialogo sin nombre.
  const titulado = await p.locator("#modal-titulo").count();
  check(titulado === 1, `el dialogo siempre tiene titulo accesible (${titulado})`);

  await ctx.close();
}

await browser.close();
console.log(`\n${fallas === 0 ? "TODO OK" : fallas + " FALLA(S)"}`);
process.exit(fallas === 0 ? 0 : 1);
