# promobetano — Eau de Confianza

Flujo de inscripción móvil para la activación "Eau de Confianza" (Betano x
Cristián Riquelme): QR de panel → portada → formulario → confirmación.
Implementa las tres pantallas diseñadas en Claude Design a partir del brief
técnico del 18 de agosto de 2026 (auditoría de `FinalExperinceBetano` +
especificación del sistema nuevo).

## Estado de este código

Este es el frontend del flujo, sin backend: no hay Supabase, Resend ni
Turnstile conectados todavía. El envío del formulario se simula
client-side y pasa a `/listo` guardando el correo en `sessionStorage` — es
un placeholder hasta que exista el proyecto Supabase nuevo y la cola de
correo descritos en el brief (§Datos, §Cuello 1 · Correo).

Sí está implementado de verdad:

- Validación de RUT módulo 11 y formateo (`lib/rut.ts`).
- Validación de los cinco campos con errores por campo (`lib/inscripcion.ts`).
- Borrador del formulario en `localStorage`, para que una caída de señal en
  el mall no borre lo escrito.
- Persistencia del slug `?p=` del panel en cookie, para que sobreviva la
  navegación entre pantallas.
- Puerta 18+ con persistencia en `sessionStorage` dentro de la sesión.
- Paleta y tipografías de campaña (`app/globals.css`, `app/fonts.ts`) —
  MD Nichrome y Haffer servidas localmente, sin Google Fonts.
- El halo de fondo es CSS puro (`components/Halo.tsx`), no una imagen.

## Rutas

| Ruta | Pantalla |
| --- | --- |
| `/i?p={slug}` | Portada — halo, lockup, CTA, puerta 18+ |
| `/inscripcion?p={slug}` | Formulario de inscripción |
| `/listo` | Confirmación |

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) — redirige a `/i`.

## Pendiente (fuera de alcance de esta implementación)

Ver el brief completo para el detalle, en particular: esquema Supabase
(`inscripciones`, `email_outbox`, `sorteos`), Cloudflare Turnstile, rate
limiting en el borde, panel de administración, plantillas de correo, y las
bases legales (redacción nueva, responsable del tratamiento).
