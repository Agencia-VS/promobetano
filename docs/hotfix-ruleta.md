# Hotfix de ruleta instantánea

## Alcance confirmado

- Una inscripción por jornada; se rechaza si coincide el RUT **o** el correo.
- Una persona puede ganar como máximo una vez durante todo el evento.
- Cada bloque congela su propio `N` y una posición ganadora aleatoria.
- Un cambio de `N` se aplica al siguiente bloque, nunca al que está en curso.
- Máximo 30 premios por jornada y 90 en total. El saldo diario no se arrastra.
- Folios globales correlativos `#001` a `#090`.
- La pantalla es la prueba principal. El correo se envía solo a ganadores.
- La entrega se marca en la hoja impresa; no existe canje digital ni QR.

## Ajuste automático

El valor inicial es `N=16`, aproximación de `500 / 30`. Después de al menos 10
participaciones y 15 minutos de observación, al abrir cada bloque se calcula:

```text
N = floor(participaciones proyectadas hasta el cierre / premios restantes)
```

El resultado se acota entre 1 y 10.000. Usar `floor` favorece agotar el stock y,
cerca del cierre, el automático puede llegar a `N=1`. La proyección de público
se topa además en `N inicial × 30` (480 con el valor inicial), evitando que una
ráfaga temprana cree un bloque desproporcionado que quede abierto si luego cae
el flujo.

El administrador puede pasar a modo manual en cualquier momento. El sistema no
vuelve a cambiar `N` hasta que el administrador seleccione otra vez
**Automático**. En ambos casos, el bloque abierto conserva el valor con el que
nació.

## Orden de despliegue

1. Crear un respaldo de la base de producción.
2. Aplicar `supabase/migrations/20260820230000_ruleta_instantanea.sql`.
3. Desplegar la aplicación de esta rama.
4. Entrar a `/admin/ruleta` y revisar para cada jornada:
   - apertura y cierre en hora de Chile;
   - modo automático;
   - `N inicial = 16`;
   - stock diario `0/30` y global `0/90`.
5. En **Resumen**, dejar el interruptor de inscripciones en **Calendario**. Un
   override manual abierto o cerrado sigue teniendo prioridad operativa.
6. Probar el flujo con el modo de pruebas y las identidades que muestra el
   panel. Los resultados de prueba dicen `PRUEBA`, no toman stock ni folio.
7. Imprimir desde `/admin/ruleta` la hoja de control 1–90.

La migración va antes que el código para que la nueva RPC exista cuando llegue
la primera petición. La firma anterior queda como compatibilidad temporal y ya
no encola confirmaciones.

## Smoke test previo a apertura

- Completar dos o más inscripciones con identidad de prueba.
- Confirmar que aparece primero la animación y después un resultado estable.
- Recargar la pantalla: debe conservar el mismo resultado de esa inscripción.
- En una prueba ganadora debe aparecer `PRUEBA`, nunca un número real.
- Confirmar que no llega correo de confirmación.
- Verificar que `/admin/ruleta` sigue mostrando `0/30` y `0/90` después de las
  pruebas.
- Cambiar a modo manual, guardar un `N`, comprobar que “N siguiente” cambió y
  reactivar explícitamente el modo automático.
- Volver a purgar los datos de prueba desde **Resumen**.

## Controles durante la activación

- Refrescar `/admin/ruleta` y vigilar ganadores diarios/globales y progreso del
  bloque actual.
- Si el ritmo real se aparta mucho de la proyección, fijar `N` manualmente. El
  cambio esperará al próximo bloque completo.
- Cerca del cierre, mantener automático permite que el sistema baje hasta
  `N=1`.
- Si hay una incidencia, cerrar inmediatamente desde el interruptor de
  **Resumen**; la RPC vuelve a comprobar la ventana al registrar.

## Rollback

Antes de recibir inscripciones reales, se puede restaurar el respaldo y volver
al despliegue anterior. Después de asignar un folio no se deben borrar ni
renumerar resultados: el rollback seguro es cerrar inscripciones, conservar la
base y desplegar una migración correctiva. Revertir solo el frontend no restaura
el sorteo diferido, porque la firma de compatibilidad conserva la asignación
instantánea para no perder ganadores durante un despliegue escalonado.

## Riesgo aceptado

La lista impresa y el folio entregan trazabilidad, pero no autentican a quien
muestra la pantalla: una captura reenviada puede intentarse reutilizar. El
control acordado es marcar el número en papel al entregar el premio; no se
incluye validación digital en este hotfix.
