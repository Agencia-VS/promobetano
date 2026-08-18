# promobetano — Eau de Confianza

Flujo de inscripción móvil para la activación "Eau de Confianza" (Betano ×
Cristián Riquelme): QR de panel → puerta 18+ → portada → formulario →
confirmación. Implementa las pantallas diseñadas en Claude Design a partir del
brief técnico del 18 de agosto de 2026.

## ⚠️ Estado: NO listo para producción

El frontend está completo y verificado, pero **no hay backend**: el formulario
no guarda nada en ninguna parte y no se envía ningún correo. Lo que falta no es
código de UI (ver [Qué falta](#qué-falta-para-producción)).

## Rutas

| Ruta | Qué hace |
| --- | --- |
| `/` | Redirige a `/i` preservando el `?p=` del QR |
| `/edad` | Puerta 18+. Setea una cookie httpOnly vía server action |
| `/i` | Portada: halo CSS, lockup, CTA |
| `/inscripcion` | Formulario de inscripción |
| `/listo` | Confirmación |
| `/bases` | Bases y condiciones (borrador, requiere abogado) |
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

Bloqueantes que **no son código de UI**:

1. **Backend.** Proyecto Supabase nuevo con el esquema del brief
   (`inscripciones`, `email_outbox`, `sorteos`), RLS, y la RPC de listado por
   cursor. Hoy el submit solo navega a `/listo`.
2. **Correo.** Plan de Resend dimensionado por duración de campaña, dominio con
   SPF/DKIM/DMARC, cola `email_outbox` con cron y webhooks de rebote.
3. **Antiabuso.** Cloudflare Turnstile verificado en el servidor, índices únicos
   sobre documento y correo normalizados, Vercel Firewall.
4. **Bases legales.** `/bases` es un andamio con la estructura de la Ley 21.719
   y cada dato pendiente marcado; necesita redacción y revisión de un abogado.
5. **Contacto de datos personales.** `lib/contacto.ts` usa un dominio reservado
   por la RFC 2606 a propósito. Reemplazar por la casilla real del responsable.
6. **Lista de paneles.** Completar `PANELES` en `lib/origen.ts` antes de generar
   e imprimir los QR.
7. **Panel de administración** y **prueba de carga** con 10.000 altas.

Respuestas pendientes del brief que bloquean lo anterior: duración de la
activación, sorteo único o diario, cantidad de ganadores y premio, malls y
paneles, dominio y control del DNS, responsable del tratamiento.
