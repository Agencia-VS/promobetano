# promobetano — Eau de Confianza

Flujo de inscripción móvil para la activación "Eau de Confianza" (Betano ×
Cristián Riquelme): QR de panel → puerta 18+ → portada → formulario →
confirmación. Implementa las pantallas diseñadas en Claude Design a partir del
brief técnico del 18 de agosto de 2026.

## Estado

El **flujo público y el panel están completos**: portada, puerta 18+, formulario,
alta contra Supabase, encolado del correo y drenaje por cron; y en `/admin`, el
listado por cursor, el interruptor de inscripciones y los sorteos. El esquema de
base está escrito y verificado contra un PostgreSQL 16 real.

Lo que falta para producción es aplicar el esquema a un proyecto real, el webhook
de rebotes de Resend y las respuestas del cliente que siguen abiertas
(ver [Qué falta](#qué-falta-para-producción)).

**Son tres sorteos, uno por día, a las 21:00 de Santiago**, con 30 ganadores y 10
suplentes cada uno. Una inscripción entra solo al sorteo de su jornada y nunca a
los siguientes; una persona puede inscribirse una vez por jornada —hasta tres— y
gana como máximo una vez. El calendario vive en `CONCURSO_SORTEOS` y se lleva a la
base con «Sincronizar jornadas» en `/admin`. El detalle del modelo está en
[supabase/README.md](supabase/README.md).

La ventana de inscripción se configura por variable de entorno. Fuera de ella
`/inscripcion` no muestra el formulario, así que **para trabajar en el
formulario hay que abrir la ventana**:

```bash
CONCURSO_INICIO=2020-01-01T00:00:00-04:00 \
CONCURSO_CIERRE=2100-01-01T00:00:00-04:00 \
CONCURSO_SORTEOS=2026-08-21T21:00:00-04:00 npm run dev
```

Ojo: la base también exige una jornada que cubra el momento del alta, así que
mover solo estas variables abre el formulario pero no hace pasar la inscripción.
Para eso hay que sincronizar las jornadas desde `/admin` con la ventana ya
movida.

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `/` | Redirige a `/i` preservando el `?p=` del QR |
| `/edad` | Puerta 18+. Setea una cookie httpOnly vía server action |
| `/i` | Portada: halo CSS, lockup, CTA |
| `/inscripcion` | Formulario de inscripción |
| `/listo` | Confirmación |
| `/bases` | Bases y condiciones (borrador, requiere abogado) |
| `/admin` | Panel: estado del concurso, recuentos, jornadas y sorteos |
| `/admin/inscripciones` | Listado paginado por cursor con buscador |
| `/api/inscripcion` | Alta: revalida en servidor y llama a la RPC `crear_inscripcion` |
| `/api/cron/email` | Drenaje de `email_outbox` por lotes de 100 (Vercel Cron) |
| `/api/admin/jornadas` | Lleva el calendario de `CONCURSO_SORTEOS` a las filas de `sorteos` |
| `/api/admin/pruebas/modo` | Abre y cierra el ensayo en producción |
| `/api/admin/pruebas/datos` | Borra los datos que dejó el ensayo |
| `proxy.ts` | Exige la puerta 18+ y resuelve la atribución de panel |

## Decisiones que conviene conocer

**La puerta 18+ se verifica en el servidor.** `proxy.ts` exige una cookie
httpOnly en `/i`, `/inscripcion` y `/listo`. No es un overlay: un overlay se
saltaba con Tab+Enter, no cubría las otras rutas, y el servidor nunca sabía que
se había respondido.

**El RUT exige el guión.** Con 8 caracteres sin separador es imposible
distinguir "cuerpo de 7 + DV" de "cuerpo de 8 sin DV": ambas son formas legales.
Adivinar convertía el RUT de una persona en el de otra, y en ~9% de los casos el
resultado además validaba. Ver `lib/rut.ts`.

**El borrador nunca guarda el consentimiento** y expira en 20 minutos. Guardarlo
hacía que las casillas volvieran marcadas en el estado pero desmarcadas en
pantalla, y en un teléfono compartido el consentimiento de una persona
prellenaba el de la siguiente. Ver `lib/inscripcion.ts`.

**La atribución de panel la resuelve el proxy**, con el `?p=` de la petición
por sobre la cookie, y el nombre visible sale de una lista blanca en
`lib/origen.ts` (nunca del slug crudo, que viene de la URL). El valor por
defecto es `directo`, no un panel real.

**Se puede ensayar en producción sin ensuciar el sorteo.** «Pruebas en
producción», en `/admin`, abre una ventana de ensayo con su propia jornada
—encajada entre las reales y cerrada sola cuando la primera de verdad empieza—,
marca cada fila que entre por ella y avisa en el formulario que esas
inscripciones no participan. El RUT y el correo del equipo se inscriben sin
límite; el resto sigue con una por jornada. «Borrar datos de prueba» los elimina
enteros. Ninguna fila de ensayo entra al pool de un sorteo real ni cuenta en las
cifras del panel. Ver `supabase/migrations/20260820120000_pruebas.sql`.

**El halo de fondo es CSS**, reemplaza el `FONDO.png` de 2,1 MB, y no usa
`filter: blur()` (forzaba una superficie offscreen de ~21 MB antes del primer
paint). Las fuentes van subseteadas a latín: 215 KB → 76 KB.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # pruebas unitarias (RUT, validación, atribución)
npm run lint
npm run build
```

El e2e (`npm run test:e2e`) reproduce cada defecto corregido contra un servidor
levantado; necesita Playwright y un Chromium (`CHROMIUM_PATH` para apuntar a uno
ya instalado).

## Qué falta para producción

1. **Aplicar el esquema.** Las migraciones de `supabase/migrations/` están
   escritas y probadas, pero hay que correrlas contra el proyecto real y cargar
   las variables (ver `.env.example`).
2. **Dominio del remitente.** SPF, DKIM y DMARC verificados en Resend antes del
   primer envío; sin eso los correos entran a spam.
3. **Contacto de datos personales.** `NEXT_PUBLIC_CORREO_DATOS` sigue con el
   dominio reservado por la RFC 2606. Es un bloqueante legal.
4. **Datos pendientes de las bases.** `/bases` marca en pantalla cada dato sin
   definir: premio, canje, plazos y rol de Betano en el tratamiento. Las fechas
   de sorteo y las cantidades ya están puestas. Además hay **dos cláusulas
   marcadas «Redacción por revisar»** —la unicidad por jornada y los tres sorteos
   diarios— que describen lo que hace el código y necesitan visto bueno del
   abogado antes de publicar.
5. **Dominio.** `NEXT_PUBLIC_SITE_URL=https://promobetano.cl` en Vercel. Sin
   esa variable las plantillas omiten el lockup y los correos salen sin marca
   (ver `lib/sitio.ts`). El QR está impreso contra la raíz del dominio, que
   redirige a `/i` preservando el query string.

   La atribución por `?p=` no aplica a esta activación: se concentra en un solo
   punto, así que toda inscripción queda en `directo` y eso es correcto. La
   cañería sigue en pie para el día que haya más de un punto; la sede que muestra
   la portada es fija (`SEDE` en `lib/campana.ts`).
6. **Volumen del proveedor de correo.** Con 9.000 confirmaciones en un día, el
   límite que puede frenar la activación es el del plan de Resend, no Supabase.
   Confirmar el plan y crear el webhook en el panel de Resend apuntando a
   `/api/webhooks/resend` con los eventos `email.delivered`, `email.bounced` y
   `email.complained`, más `RESEND_WEBHOOK_SECRET` en Vercel: sin esa variable la
   ruta responde 503 y los rebotes no se registran.
7. **Usuario del panel.** Créalo en Supabase → Authentication → Users. No hay
   registro público: es la única forma de entrar a `/admin`.
8. **Prueba de carga** con 10.000 altas.

Opcional y no bloqueante: Cloudflare Turnstile. Los índices únicos sobre RUT y
correo normalizados ya impiden la inscripción duplicada, que es lo que protege
la integridad del sorteo.

Respuestas del cliente que siguen abiertas: **cuál es el premio** exactamente,
canje presencial, malls y paneles, y si los datos van a un CRM de Betano. El
formato del sorteo y las cantidades ya están respondidos.
