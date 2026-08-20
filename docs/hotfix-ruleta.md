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
2. Aplicar, en orden, estas migraciones:
   - `supabase/migrations/20260820230000_ruleta_instantanea.sql`;
   - `supabase/migrations/20260820233000_ruleta_pruebas_reales.sql`;
   - `supabase/migrations/20260820234500_ruleta_configuracion_pruebas.sql`.
3. Desplegar la aplicación de esta rama.
4. Entrar a `/admin/ruleta` y revisar para cada jornada real:
   - apertura y cierre en hora de Chile;
   - modo automático;
   - `N inicial = 16`;
   - stock diario `0/30` y global `0/90`.
5. En **Resumen**, dejar el interruptor de inscripciones en **Calendario**. Un
   override manual abierto o cerrado sigue teniendo prioridad operativa.
6. En **Configuración de pruebas** de `/admin/ruleta`, definir su modo, N y
   ventana simulada. El ensayo calcula su tendencia solo con altas de prueba,
   numera a sus ganadores como `PRUEBA 1`, `PRUEBA 2`… y encola el correo sin
   tomar stock, bloques ni folios reales.
7. Imprimir desde `/admin/ruleta` la hoja de control 1–90.

La migración va antes que el código para que la nueva RPC exista cuando llegue
la primera petición. La firma anterior queda como compatibilidad temporal y ya
no encola confirmaciones.

## Smoke test previo a apertura

- Purgar cualquier ensayo anterior y, en **Configuración de pruebas** de
  `/admin/ruleta`, seleccionar modo manual con `N=1`. Así la primera
  inscripción de una prueba limpia debe ganar sin tocar la configuración real;
  un bloque de ensayo ya abierto conservaría su N anterior.
- Abrir **Pruebas en producción** y completar una inscripción con la identidad
  de prueba que muestra el panel.
- Confirmar que aparece primero la animación y después un resultado estable.
- Recargar la pantalla: debe conservar el mismo resultado de esa inscripción.
- Debe aparecer `PRUEBA 1`, nunca `#001` ni otro número real.
- Confirmar que llega el correo con asunto `[PRUEBA]` y el mismo `PRUEBA N`.
- Confirmar que no llega correo de confirmación.
- Verificar que `/admin/ruleta` sigue mostrando `0/30` y `0/90` después de las
  pruebas.
- Volver a purgar los datos de prueba desde **Resumen**.
- Dejar el simulador como se prefiera para futuras pruebas; su modo no cambia el
  automático de las jornadas reales. Verificar por separado que las jornadas
  reales sigan en Automático antes de abrir al público.

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
