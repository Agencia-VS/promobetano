<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — Eau de Confianza

Instrucciones permanentes del proyecto. Léelas completas antes de la primera tarea de cada sesión.

Este archivo manda sobre cualquier costumbre general. Si una instrucción de aquí choca con lo que harías por defecto, gana esta. Si choca con una petición explícita del usuario en el chat, dilo antes de ejecutar y deja que él decida.

---

## 1. Alcance

Activación de inscripción para el sorteo de **Eau de Confianza**, perfume de campaña de Betano con Cristián Riquelme. El usuario escanea un QR en un panel de mall, se inscribe desde el celular en menos de un minuto, recibe un correo de confirmación y queda en el sorteo.

**Dimensionado para 10.000 inscripciones diarias.** Esa cifra decide casi todas las discusiones técnicas: lo que funciona con 300 personas y se rompe con 200.000 no entra.

La app tiene exactamente cinco superficies:

| Superficie | Ruta | Quién la usa |
|---|---|---|
| Portada del QR | `/i?p=<slug-panel>` | Público, móvil |
| Formulario | `/inscripcion` — ruta propia; en escritorio se pinta como modal vía ruta interceptora | Público, móvil |
| Confirmación | `/listo` | Público, móvil |
| Bases legales | `/bases` | Público |
| Panel de administración | `/admin/**` | Equipo, escritorio |

**Fuera de alcance:** cuentas de usuario, pasarela de pago, CMS, blog, multi-idioma, y el módulo de juego en vivo (`/juego`) que existe en el repo de referencia y **no se porta a este proyecto**. Si una tarea parece requerir algo de esa lista, detente y pregunta.

---

## 2. Estado del proyecto

**El flujo público y el panel de administración están construidos, y el esquema de base escrito y verificado.** Igual vale la advertencia original: no asumas que un archivo está ahí, verifícalo. La columna de estado de la tabla dice qué está hecho de verdad y qué falta dentro de cada bloque.

El orden de los bloques importa. Los tres primeros tienen dependencias externas — contratación, DNS, imprenta — y si se dejan para el final bloquean el lanzamiento aunque el código esté listo.

| # | Bloque | Depende de | Estado |
|---|---|---|---|
| 1 | Contratación y DNS: plan de Resend, dominio con SPF/DKIM/DMARC, proyecto Supabase nuevo | Decisiones 01 y 06 | ☐ |
| 2 | Esquema y RPC: `inscripciones`, `email_outbox`, `sorteos`, `sorteo_resultados`, índices, `listar_inscripciones`, `ejecutar_sorteo`, RLS | Decisiones 02 y 03 | ☑ escrito y verificado en `supabase/migrations/` — **falta aplicarlo a un proyecto real** (bloqueado por el bloque 1). El sorteo quedó parametrizado (`ventana_desde/hasta`, `n_ganadores`, `n_suplentes`) para no inventar las decisiones 02 y 03: cuando se respondan se cargan filas, no se toca el esquema |
| 3 | QR y slugs: lista de paneles, generación de QR con `?p=`, entrega a imprenta | Decisión 05 | ☐ |
| 4 | Formulario móvil: portada, ruta propia, tokens, halo en CSS, validaciones, Turnstile, borrador local | Bloque 2 | ☑ salvo Turnstile. Incluye además el layout de escritorio a dos columnas (`styles/pantalla.css`) y la ventana de inscripción por variable de entorno (`lib/concurso.ts`). Turnstile quedó fuera a propósito: los índices únicos de la base ya cubren el duplicado, que es lo que protege la integridad del sorteo |
| 5 | Cola de correo: encolado en el alta, cron de lote, plantillas, webhooks de rebote | Bloques 1 y 2 | ☑ salvo el webhook de rebotes. El encolado lo hace la propia RPC del alta, `/api/cron/email` drena de a 100 con `for update skip locked` y `vercel.json` lo agenda. Las cuatro plantillas están escritas y con marca —isotipo en la cabecera oscura, lockup en la tarjeta, desde `public/email/`— y el correo de ganador tiene maqueta propia. La función `registrar_evento_email` ya existe en la base: falta la ruta que verifique la firma de Resend |
| 6 | Panel de administración: login, listado por cursor, buscador por RPC, export transmitido, sorteo, cascada persistida | Bloque 2 | ☑ salvo el export. Login con Supabase Auth, guardia en `proxy.ts` **y** en cada handler, listado por cursor con buscador de trigramas, interruptor manual de inscripciones, y sorteo completo: crear en borrador, ejecutar, ver resultados y promover suplentes con su motivo |
| 7 | Bases legales: redacción nueva y revisión por abogado | Decisiones 03 y 09 | ◐ adaptadas desde las del concurso anterior con los datos del responsable (AGENCIA VS SPA) y la finalidad de marketing separada, que aquel texto no contemplaba. Quedan 15 datos marcados `[PENDIENTE]` visibles en pantalla |
| 8 | Prueba de carga: 10.000 altas sintéticas — latencia, drenaje de la cola, tiempos del panel, peso real en red móvil | Bloques 4, 5 y 6 | ☐ |

El bloque 8 no es opcional. Los tres cuellos de botella del sistema solo se manifiestan con volumen.

Marca las casillas a medida que se completen y mantén esta tabla al día: es el mapa que lee la siguiente sesión.

---

## 3. El repo de referencia

Existe un repositorio anterior — `Agencia-VS/FinalExperinceBetano`, app `betano-final-experience` — que resolvió un concurso de escala chica. **Es referencia, no base.** Su capa de marca es sólida y se traslada casi tal cual; su capa de escala asume cientos de filas y no sobrevive a este proyecto.

> **Ubicación local del repo de referencia:** `⟨COMPLETAR RUTA⟩`
> Si no tienes acceso, dilo y pídelo. No reconstruyas de memoria código que existe: los detalles de la validación de RUT o del PRNG sembrado se pierden al reescribirlos de cabeza.

### Se porta

| Pieza | Adaptación al portarla |
|---|---|
| Tokens y puente `@theme inline` (`globals.css`, `layout.tsx`) | Con la paleta de campaña de la §6, no con la del concurso |
| Primitivas `.field-*` y el botón principal | Renombrar el token de acento; la estructura se mantiene |
| `lib/rut.ts` — validación módulo 11 | Tal cual |
| Guardia de `/admin` vía `proxy.ts` + Supabase Auth | Ampliando el matcher a `/api/admin/:path*` |
| Plantillas de correo tabuladas de `lib/email.ts` | Derivando los colores de los tokens, sin constante paralela |
| `createSeededRng` (xmur3 + mulberry32) | Tal cual, si hace falta azar en servidor |
| `device-token.ts` | Tal cual |
| `escapeHtml` + `firstName`, preheader oculto | Tal cual. Las imágenes NO van a Cloudinary: se sirven desde `public/email/` con la URL absoluta que resuelve `lib/sitio.ts`, y si no hay dominio la plantilla las omite. Un servicio menos que contratar y que mantener |
| `fetchAllRows()` | Solo para export y recuentos, nunca para el listado del admin |
| Máquina de estados del sorteo de trivia + auditoría append-only | **Este es el modelo a copiar** para el sorteo nuevo: estados explícitos, `UPDATE` condicional contra el doble clic, registro que nunca borra, pool congelado sin PII, el azar decidido en el servidor |
| Piso de accesibilidad: `:focus-visible`, `prefers-reduced-motion`, `aria-invalid`, `role="alert"` | Tal cual |

### No se porta

Copiar cualquiera de estas piezas reintroduce un fallo que ya está diagnosticado:

- El listado del admin — `select` completo y filtro en JavaScript con `String.includes`
- `lib/rate-limit.ts` — un `Map` en memoria de la instancia serverless
- El envío de correo dentro del request de inscripción
- `ejecutar_sorteo()` con `setseed()` + `random()`
- La promoción de suplentes calculada en el navegador del admin
- El formulario dentro de un modal **sin URL** (ver §1: el modal de escritorio sí se porta, pero como ruta interceptora, no como estado de la portada)
- `FONDO.png` (2,1 MB como `background-image`)
- La paleta paralela del correo (la constante `C` de `lib/email.ts`)
- El `@font-face` manual duplicado y los selectores que piden la fuente por nombre literal

---

## 4. Reglas duras

Cada una existe porque la auditoría del repo de referencia la encontró rota. No son preferencias de estilo.

**Seguridad y datos**

1. Ninguna ruta bajo `/api/admin/**` responde sin verificar `supabase.auth.getUser()` en el propio handler. El matcher del proxy la cubre, pero la guardia del handler no es opcional: la defensa no depende de recordar el matcher.
2. `createAdmin()` (service role, salta RLS) solo se usa después de una verificación de sesión exitosa en la misma función. Nunca en una ruta pública.
3. Toda validación del cliente se repite en el servidor. El cliente es evadible.
4. Nunca `delete` sobre `inscripciones`. Baja lógica con `elegible = false`.
5. Todo `security definer` lleva `set search_path = public, pg_temp`.

**Escala**

6. Ninguna lectura de `inscripciones` sin paginación. Se usa la RPC `listar_inscripciones` con cursor keyset. Prohibido `select()` sin `.range()`, prohibido `OFFSET`, prohibido filtrar en JavaScript lo que Postgres puede filtrar con un índice.
7. No subir `db-max-rows` de 1.000 en Supabase. Ese techo es la red de seguridad que impide que una consulta descuidada serialice la tabla entera. La respuesta correcta a "no me trae todas las filas" es paginar.
8. Ningún correo se envía dentro de un request. Todo se encola en `email_outbox` y lo drena el cron por lotes de 100 con `for update skip locked`.
9. Ningún rate limit en memoria de proceso. El control de abuso es Turnstile invisible + Vercel Firewall + cookie de dispositivo + índices únicos en base. En un mall la IP no identifica a nadie: cientos de teléfonos comparten el wifi o el CGNAT del operador.
10. El sorteo ordena por `md5(semilla || id)` con desempate por `id`. Prohibido `setseed()` + `random()`: deja de ser determinista cuando el planificador paraleliza, y un sorteo que se declara auditable pero no reproduce es peor que uno que no lo promete.

**Peso**

11. Presupuesto de primera carga: **350 KB**. Todo peso se multiplica por 10.000 al día. Si una tarea sube el bundle por encima, dilo antes de terminar.
12. Ninguna imagen como `background-image` en CSS. Todo por `next/image` con AVIF y WebP. El fondo del halo son tres `radial-gradient` apilados con blur, no un PNG.
13. Vídeo, si lo hay: `preload="none"`, póster estático, reproducción bajo demanda. Nunca autoplay.

**Marca**

14. Un solo naranja: `#FF3900`, definido una vez en `:root`. La paleta del correo deriva de los mismos tokens. El repo de referencia tenía tres naranjas distintos que el usuario veía en la misma sesión.
15. Las fuentes se piden siempre por variable (`var(--font-display)`, `var(--font-body)`), nunca por nombre literal de familia. Fallback `system-ui, sans-serif`, nunca `serif`.

**Legal**

16. La casilla de bases y la de comunicaciones comerciales son dos casillas separadas, ninguna preseleccionada. La Ley 21.719 exige consentimiento específico por finalidad; fusionarlas invalida las dos.
17. La casilla de mayoría de edad es obligatoria y el sello 18+ es visible. «Juega con responsabilidad» va en el pie de la landing y de los dos correos.
18. No redactes ni modifiques texto legal por tu cuenta. Las bases las revisa un abogado.

---

## 5. Cuándo detenerte y preguntar

Estas decisiones no están tomadas y **no se pueden inferir del código**. Si una tarea depende de alguna, detente, di cuál te bloquea, propón un valor por defecto razonable y espera confirmación. No implementes lógica de negocio sobre una respuesta inventada.

| # | Decisión abierta | Qué bloquea |
|---|---|---|
| 01 | ~~Duración de la activación en días~~ **RESPONDIDA:** del viernes 21 de agosto de 2026 a las 05:00 al domingo 23 de agosto a las 23:00, hora de Santiago. Cargada en `CONCURSO_INICIO` / `CONCURSO_CIERRE` | Plan de Resend, volumen total |
| 02 | ¿Un sorteo final o sorteos diarios? | Modelo completo del admin |
| 03 | Cuántos ganadores, cuántos suplentes, qué se gana | Parámetros del sorteo, copy del correo de ganador |
| 04 | ¿Hay canje presencial del perfume? | Módulo entero de código único + QR + validación |
| 05 | Cuántos paneles y en qué malls | Lista de slugs de `?p=`, reporte por ubicación |
| 06 | Dominio y control del DNS | SPF/DKIM/DMARC, todas las pruebas de correo |
| 07 | ¿Los datos van a un CRM de Betano? | Redacción del consentimiento de marketing |
| 08 | ¿Los paneles muestran algo en vivo? | Presupuesto de Realtime |
| 09 | ~~Quién es el responsable del tratamiento~~ **RESPONDIDA:** AGENCIA VS SPA, RUT 77.043.073-9, Diagonal Oriente 1850, Providencia; encargado del tratamiento Antonio Capra Barbera, RUT 18.467.272-3. Sigue faltando la casilla de contacto ARCO+ | Bases, acuerdo de tratamiento, contacto ARCO+ |
| 10 | Assets faltantes | Haffer Medium/Bold, logo SVG, lockup vectorial, spot web, licencia de las tipografías para el dominio nuevo |

Nunca inventes: fechas de sorteo, cifras de premio, nombres de mall, slugs de panel, texto de bases, ni copy que prometa algo verificable.

---

## 6. Stack y estructura

Línea base tomada del repo de referencia, reconciliada con lo que el scaffold de Next.js realmente instaló (16 ago 2026). No subas una versión mayor sin avisar.

| Pieza | Versión | Nota |
|---|---|---|
| Next.js (App Router, Turbopack) | 16.3.1 | El middleware se llama `proxy.ts` y exporta `proxy()`, runtime Node |
| React | 19.2.8 | Server Components por defecto, `"use client"` explícito |
| TypeScript | 5.9.3 | `strict: true`, alias `@/*`. El repo de referencia pedía 6.0.3 (major real, ya superada por 7.x); se decidió no migrar sin una razón concreta |
| Tailwind CSS | 4.3.3 | Vía `@tailwindcss/postcss`; `@theme inline` publica los tokens como utilidades |
| Supabase | ssr 0.12.4 · js 2.112.3 | Dos clientes: sesión por cookies y service role |
| Resend | 6.20.0 | Instalado. Cliente singleton perezoso en `lib/resend.ts` |

El proyecto se generó con `--src-dir`: el código de la app vive bajo `src/`, no en la raíz. `public/`, `supabase/` y los config files de la raíz (`vercel.json`, `next.config.ts`, etc.) quedan fuera de `src/` porque Next.js y Vercel los exigen ahí.

Al inicializar, deja el proyecto limpio: sin la página de bienvenida del template, sin los estilos por defecto, sin el SVG de ejemplo. (Pendiente: el scaffold inicial todavía trae el homepage por defecto de create-next-app.)

```
src/
  app/
    layout.tsx              next/font/local, metadata, themeColor
    globals.css             tokens en :root + @theme inline + primitivas
    i/page.tsx              portada del QR, lee ?p=
    inscripcion/page.tsx    formulario
    listo/page.tsx          confirmación
    bases/page.tsx
    admin/                  login + panel
    api/
      inscripcion/route.ts
      admin/**/route.ts
      cron/email/route.ts
      webhooks/resend/route.ts
  lib/
    supabase/               client.ts (browser), server.ts, proxy.ts — patrón oficial actual de @supabase/ssr
    rut.ts   email.ts   resend.ts   sitio.ts
    sorteo.ts     concurso.ts   turnstile.ts   device-token.ts
  styles/         una hoja por vista
  proxy.ts
supabase/migrations/
public/fonts/
public/email/   copias a tamaño fijo del isotipo y el lockup, solo para correo
vercel.json     cron del drenaje de la cola
```

Convenciones que se establecen desde el primer commit:

- **CSS por vista, tokens globales.** `globals.css` tiene tokens y primitivas; cada vista importa su hoja. Ni hoja monolítica ni CSS-in-JS.
- **Fuente única para reglas de negocio.** Cierre de inscripciones, cupos y fechas viven en `lib/concurso.ts` y se configuran por variable de entorno, sin recompilar.
- **Comentarios que explican el porqué, no la mecánica.** Si escribes una línea que parece rara y tiene motivo, el motivo va en el comentario. Este repo se lee seis meses después en una auditoría de concurso.

---

## 7. Tokens de campaña

Muestreados de las piezas entregadas — el panel del mall y la carta del perfume. Mandan sobre la paleta del repo de referencia.

```css
--confianza: #FF3900;  /* acento único y CTA */
--bone:      #F9F1E9;  /* titulares y logo; no es blanco puro */
--ink:       #0A0605;  /* fondo, negro cálido */
--rust:      #8A3C18;  /* anillo del halo: la firma de la campaña */
--rust-deep: #3C0000;  /* base del halo */
--white:     #FFFFFF;  /* solo texto sobre el naranja */
```

Tipografía: **MD Nichrome Dark** en display (caja alta, tracking 0.06–0.12em, interlínea 0.92–1.12), **MD Nichrome Regular** en etiquetas y antetítulos (tracking 0.18–0.42em), **Haffer Regular** en cuerpo e interfaz (15–16.5px, interlínea 1.6–1.7). Se sirven localmente desde `/public/fonts` con `next/font/local`.

**Registro de voz:** lujo publicitario jugando en serio. Es un anuncio de fragancia que resulta ser de una casa de apuestas. Las instrucciones de la carta — «Abre la botella · Susúrrate: "tú puedes" · Échate bastante y con confianza» — son la referencia para microcopy, estados vacíos y mensajes de error. El formulario no debe sonar a formulario.

---

## 8. Formulario móvil

Todo el tráfico llega de un QR, en un mall, con señal mala y una sola mano.

| Campo | Atributos obligatorios |
|---|---|
| Nombre y apellido (un solo campo) | `autocomplete="name"` `autocapitalize="words"` |
| Correo | `type="email"` `inputmode="email"` `autocomplete="email"` `autocapitalize="off"` `spellcheck="false"` |
| Teléfono | `inputmode="tel"` `autocomplete="tel"`, prefijo `+56 9` como adorno fijo |
| RUT | `inputmode="text"` `autocapitalize="characters"`, formateo en `blur` |

`inputmode="numeric"` en el RUT impide escribir la K del dígito verificador. `autocapitalize="off"` en el correo evita que iOS rompa la dirección con mayúscula inicial.

- Inputs a **16px mínimo**: por debajo, Safari iOS hace zoom al enfocar y descoloca el layout.
- Área táctil de **48px** en botones y casillas, con separación clara entre las dos casillas legales.
- `viewport-fit=cover` + `env(safe-area-inset-*)`.
- Borrador en `localStorage` en cada cambio. La señal se cae; nadie debería reescribir su RUT.
- Reintento explícito ante fallo de red, nunca un callejón sin salida.
- El parámetro `?p=` se persiste en cookie y se guarda en la fila.

---

## 9. Invariantes del modelo de datos

- La unicidad va sobre la forma **normalizada**, no sobre lo que escribió el usuario. `documento_norm` y `email_norm` son columnas generadas en la base, no cálculos de la aplicación: así la regla vale aunque alguien inserte desde el editor SQL.
- La búsqueda del admin usa `pg_trgm` + un envoltorio inmutable de `unaccent`, indexado con GIN. Nunca quitar tildes en JavaScript.
- El rol en `sorteo_resultados` es un estado persistido (`ganador` / `suplente` / `declinado` / `promovido`), no un cálculo derivado en el navegador. Promover a un suplente es una transacción que deja `promovido_desde` y `cambiado_at`, para poder responder «quién ganó y por qué» seis meses después.
- `email_outbox` tiene índice único `(inscripcion_id, tipo)`: encolar dos veces no duplica correo.
- Los rebotes y quejas que llegan por webhook de Resend marcan `email_estado`, y el sorteo excluye esas filas. Sin ese ciclo cerrado, la reputación del dominio se deteriora sola.
- Realtime solo en el panel del admin. En una vista pública jamás: son 500 conexiones concurrentes incluidas y se agotan en minutos.

---

## 10. Cómo trabajar una tarea

**Antes de escribir código:** identifica qué reglas duras de la §4 toca la tarea y si depende de alguna decisión abierta de la §5. Si depende, pregunta primero. Verifica qué existe realmente en el repo en vez de asumirlo.

**Durante:** cambios pequeños y revisables. Si necesitas desviarte de una regla dura, no lo hagas en silencio: explica el motivo y pide autorización.

**Antes de dar por terminada la tarea**, verifica:

- [ ] Toda ruta nueva bajo `/api/admin/**` verifica sesión en el handler
- [ ] Ninguna consulta nueva lee sin paginar
- [ ] Ningún correo se envía dentro de un request
- [ ] Ninguna imagen entró como `background-image`
- [ ] La primera carga sigue bajo 350 KB
- [ ] Se usaron los tokens de la §7, sin hex sueltos en los componentes
- [ ] Las fuentes se piden por variable, no por nombre literal
- [ ] Los inputs nuevos tienen `inputmode`, `autocomplete` y 16px
- [ ] Los estados de error tienen `aria-invalid` y `role="alert"`
- [ ] Nada de lo que escribiste inventa una respuesta de la §5
- [ ] Si completaste un bloque, la tabla de la §2 está actualizada

Al terminar, reporta qué reglas tocó la tarea y cualquier desviación.

---

## 11. Referencias

- `docs/brief-tecnico.md` — auditoría del repo de referencia y especificación completa del sistema. Es la fuente de la que sale este archivo; consúltalo cuando necesites el detalle de un esquema, una consulta o una cifra de escala.
- Repo de referencia: `Agencia-VS/FinalExperinceBetano`, rama `claude/betano-eau-confianza-brief-o6csno`.
