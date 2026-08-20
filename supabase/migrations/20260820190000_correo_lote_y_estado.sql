-- ═══════════════════════════════════════════════════════════════════════════
-- Cola de correo por lotes, y el estado del correo de ganador a la vista
--
-- Dos problemas que el smoke test del 19 de agosto dejó abiertos con 9.000
-- inscripciones esperadas para el viernes.
--
-- 1. El cron cerraba el lote fila por fila: cien llamadas a PostgREST para cien
--    correos, más las cien llamadas a Resend. Con el envío pasando a la API de
--    lotes —cien correos en una sola petición, que es lo que saca al cron del
--    filo de su maxDuration de 60 s— el cierre de a una se convierte en el
--    cuello de botella que queda. Dos funciones que reciben arreglos lo bajan a
--    dos llamadas.
--
--    La fórmula del backoff NO se reescribe: es la misma expresión que
--    marcar_email_error, copiada al pie de la letra. Dos versiones que se
--    desincronizan darían reintentos distintos según por dónde entró la fila.
--
-- 2. El panel no podía ver si un ganador había recibido su correo. Al promover
--    un suplente hay que volver a apretar «Correos a ganadores» —el encolado es
--    manual y el `on conflict` deja entrar solo al nuevo—, y sin ninguna señal
--    de qué salió y qué no, el equipo lo hacía a ciegas. Es exactamente lo que
--    pasó en el ensayo: se reportó como «el suplente promovido no recibió
--    correo» sin forma de distinguir «nunca se encoló» de «salió y el cliente de
--    correo lo colapsó».
--
--    El `email_estado` que listar_resultados ya devolvía no sirve para esto:
--    vive en `inscripciones`, lo mueve el webhook del proveedor y es COMPARTIDO
--    entre la confirmación y el correo de ganador. Un 'entregado' ahí no dice
--    cuál de los dos llegó.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. Cierre del lote en una llamada
-- ───────────────────────────────────────────────────────────────────────────

/**
 * Cierre exitoso de varios envíos. Los dos arreglos van en paralelo: la
 * posición i de `p_ids` se cierra con la posición i de `p_proveedor_ids`.
 *
 * `unnest` con los dos arreglos a la vez y no dos `unnest` separados: en un
 * FROM con varias funciones de conjunto Postgres las alinea por fila, que es
 * justo lo que hace falta, mientras que dos subconsultas independientes darían
 * el producto cartesiano y le pondrían a cada fila el id de proveedor de otra.
 * Ese id es lo que después casa un rebote con su inscripción, así que
 * cruzarlos silenciaría los rebotes de todo el lote.
 */
create or replace function public.marcar_emails_enviados(
  p_ids bigint[],
  p_proveedor_ids text[]
)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas int;
begin
  -- Largos distintos serían un error de programación del cron, y aplicar el
  -- prefijo que coincide dejaría correos marcados con el id de otro. Se aborta.
  if coalesce(array_length(p_ids, 1), 0)
     <> coalesce(array_length(p_proveedor_ids, 1), 0) then
    raise exception
      'marcar_emails_enviados: % ids y % ids de proveedor. Tienen que ir en paralelo.',
      coalesce(array_length(p_ids, 1), 0),
      coalesce(array_length(p_proveedor_ids, 1), 0)
      using errcode = 'invalid_parameter_value';
  end if;

  update public.email_outbox o
  set estado = 'enviado',
      enviado_at = now(),
      proveedor_id = par.proveedor_id,
      ultimo_error = null
  from unnest(p_ids, p_proveedor_ids) as par(id, proveedor_id)
  where o.id = par.id;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

/**
 * Cierre fallido de varias filas con un mismo motivo: es el caso real, porque
 * cuando la llamada por lotes falla, falla entera.
 *
 * Misma fórmula que marcar_email_error, con `intentos` leído de cada fila: el
 * corte a las 6 tentativas y el backoff lineal de 5 minutos por intento.
 */
create or replace function public.marcar_emails_error(
  p_ids bigint[],
  p_error text
)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas int;
begin
  update public.email_outbox o
  set estado = case when o.intentos >= 6 then 'error' else 'pendiente' end,
      ultimo_error = left(p_error, 500),
      disponible_at = now() + (least(o.intentos, 6) * interval '5 minutes')
  where o.id = any(p_ids);

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. listar_resultados: el estado del correo DE GANADOR, por fila
--
-- DROP y no CREATE OR REPLACE: cambia el tipo de retorno, y Postgres no deja
-- reemplazar una función que devuelve TABLE con columnas distintas.
-- ───────────────────────────────────────────────────────────────────────────

drop function if exists public.listar_resultados(bigint);

create function public.listar_resultados(p_sorteo_id bigint)
returns table (
  id bigint,
  posicion int,
  rol text,
  nombre text,
  email text,
  telefono text,
  documento text,
  email_estado text,
  motivo text,
  promovido_desde bigint,
  cambiado_at timestamptz,
  -- null = nunca se encoló. Es el estado que más importa distinguir: es el de
  -- un suplente recién promovido, al que le falta un batch de correos.
  correo_estado text,
  correo_intentos int,
  correo_error text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id, r.posicion, r.rol, i.nombre, i.email, i.telefono, i.documento,
         i.email_estado, r.motivo, r.promovido_desde, r.cambiado_at,
         o.estado, o.intentos, left(o.ultimo_error, 200)
  from public.sorteo_resultados r
  join public.inscripciones i on i.id = r.inscripcion_id
  -- LEFT JOIN y por tipo = 'ganador': la fila de 'confirmacion' existe para
  -- todos y decir que "el correo salió" por ella sería mentir sobre el aviso
  -- del premio, que es el único que se está mirando en esta tabla.
  left join public.email_outbox o
    on o.inscripcion_id = r.inscripcion_id and o.tipo = 'ganador'
  where r.sorteo_id = p_sorteo_id
  order by r.posicion
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. Permisos
--
-- El `alter default privileges ... revoke execute from anon, authenticated` de
-- 20260819170000 ya evita que estas tres queden invocables con la clave
-- anónima, pero se revoca igual: es una línea y no depende de que la migración
-- anterior siga en su sitio.
--
-- Las dos de la cola NO se conceden a nadie: las llama el cron con la clave de
-- servicio, que tiene su propio grant por defecto de Supabase. Que sean
-- inalcanzables desde el navegador es parte del diseño —marcan como enviado un
-- correo que puede no haber salido—.
-- ───────────────────────────────────────────────────────────────────────────

revoke execute on function public.marcar_emails_enviados(bigint[], text[])
  from public, anon, authenticated;
revoke execute on function public.marcar_emails_error(bigint[], text)
  from public, anon, authenticated;
revoke execute on function public.listar_resultados(bigint)
  from public, anon;

grant execute on function public.listar_resultados(bigint) to authenticated;

-- PostgREST cachea la firma de las funciones, y acá una cambió de tipo de
-- retorno: sin recargar, el panel sigue recibiendo las once columnas viejas.
notify pgrst, 'reload schema';
