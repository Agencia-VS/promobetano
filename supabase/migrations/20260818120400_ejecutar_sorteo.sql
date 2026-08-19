-- ============================================================================
-- Ejecución del sorteo.
--
-- Regla dura 10: el orden lo decide `md5(semilla || id)` con desempate por id.
-- Prohibido `setseed()` + `random()`, que es lo que hacía el repo anterior:
-- deja de ser determinista en cuanto el planificador paraleliza el scan, y un
-- sorteo que se declara auditable pero no reproduce es peor que uno que no lo
-- promete.
-- ============================================================================

/**
 * Ejecuta un sorteo en borrador. Idempotente por construcción: el paso a
 * 'ejecutando' es un UPDATE condicional, así que el segundo clic del admin
 * —o dos pestañas abiertas— no encuentra fila que actualizar y aborta sin
 * tocar nada.
 *
 * `p_actor` es el uuid del usuario de Supabase Auth; lo pasa la ruta de
 * /api/admin tras verificar la sesión. No se toma de auth.uid() por defecto
 * para que la función sea ejecutable y comprobable fuera de una sesión.
 */
create or replace function public.ejecutar_sorteo(
  p_sorteo_id bigint,
  p_actor uuid default null
)
returns table (
  sorteo_id  bigint,
  en_pool    int,
  ganadores  int,
  suplentes  int
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  s public.sorteos%rowtype;
  v_pool int;
  v_gan  int;
  v_sup  int;
begin
  -- Reclamo atómico. Si otra transacción ya lo tomó, o el sorteo no está en
  -- borrador, acá se termina.
  update public.sorteos
  set estado = 'ejecutando'
  where id = p_sorteo_id and estado = 'borrador'
  returning * into s;

  if not found then
    raise exception 'El sorteo % no está en borrador (ya se ejecutó, se está ejecutando o no existe).', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- ── Pool congelado ────────────────────────────────────────────────────────
  -- Se excluyen las bajas lógicas y los correos rotos. Un ganador cuyo correo
  -- rebota nunca se entera de que ganó y el premio queda sin entregar con el
  -- sorteo ya hecho.
  insert into public.sorteo_pool (sorteo_id, inscripcion_id, orden)
  select s.id,
         i.id,
         row_number() over (order by md5(s.semilla || i.id::text), i.id)
  from public.inscripciones i
  where i.elegible
    and i.email_estado not in ('rebote','queja')
    and (s.ventana_desde is null or i.creado_at >= s.ventana_desde)
    and (s.ventana_hasta is null or i.creado_at <  s.ventana_hasta);

  get diagnostics v_pool = row_count;

  if v_pool = 0 then
    raise exception 'El sorteo % no tiene participantes elegibles en su ventana.', p_sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  -- ── Resultados ────────────────────────────────────────────────────────────
  -- Si el pool es más chico que ganadores + suplentes, se reparte lo que hay;
  -- no se inventan filas ni se falla, porque un pool corto es un dato del
  -- negocio, no un error del programa.
  insert into public.sorteo_resultados (sorteo_id, inscripcion_id, posicion, rol)
  select p.sorteo_id,
         p.inscripcion_id,
         p.orden,
         case when p.orden <= s.n_ganadores then 'ganador' else 'suplente' end
  from public.sorteo_pool p
  where p.sorteo_id = s.id
    and p.orden <= s.n_ganadores + s.n_suplentes;

  select count(*) filter (where rol = 'ganador'),
         count(*) filter (where rol = 'suplente')
  into v_gan, v_sup
  from public.sorteo_resultados
  where sorteo_resultados.sorteo_id = s.id;

  -- ── Correo ────────────────────────────────────────────────────────────────
  -- Se encola, no se envía (regla dura 8). El índice único de la cola hace que
  -- un reintento no duplique nada.
  insert into public.email_outbox (inscripcion_id, tipo)
  select r.inscripcion_id, r.rol
  from public.sorteo_resultados r
  where r.sorteo_id = s.id and r.rol in ('ganador','suplente')
  on conflict on constraint email_outbox_unico do nothing;

  update public.sorteos
  set estado = 'ejecutado', ejecutado_at = now(), ejecutado_por = p_actor
  where id = s.id;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (s.id, 'ejecutado',
          jsonb_build_object(
            'en_pool', v_pool,
            'ganadores', v_gan,
            'suplentes', v_sup,
            'ventana_desde', s.ventana_desde,
            'ventana_hasta', s.ventana_hasta
          ),
          p_actor);

  return query select s.id, v_pool, v_gan::int, v_sup::int;
end;
$$;

/**
 * Reproduce el orden del pool desde la semilla y lo compara con lo que quedó
 * guardado. Es la contraparte de "auditable": si esto devuelve false, el
 * resultado publicado no se puede sostener.
 */
create or replace function public.verificar_sorteo(p_sorteo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select not exists (
    select 1
    from (
      select p.inscripcion_id,
             p.orden as orden_guardado,
             row_number() over (
               order by md5(s.semilla || p.inscripcion_id::text), p.inscripcion_id
             ) as orden_recalculado
      from public.sorteo_pool p
      join public.sorteos s on s.id = p.sorteo_id
      where p.sorteo_id = p_sorteo_id
    ) c
    where c.orden_guardado <> c.orden_recalculado
  )
  and exists (select 1 from public.sorteo_pool where sorteo_id = p_sorteo_id)
$$;

/**
 * Un ganador declina o no responde: pasa a 'declinado' y el suplente de menor
 * posición pasa a 'promovido', dejando de dónde vino y cuándo.
 *
 * Va entero en una transacción y con la fila bloqueada: sin el `for update`,
 * dos promociones simultáneas podían ascender al MISMO suplente y dejar un
 * premio sin dueño. Los cálculos de cascada en el navegador del admin —que es
 * como lo hacía el repo anterior— no pueden dar esta garantía.
 */
create or replace function public.promover_suplente(
  p_resultado_id bigint,
  p_motivo text default null,
  p_actor uuid default null
)
returns table (
  declinado_id bigint,
  promovido_id bigint
)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  g public.sorteo_resultados%rowtype;
  su public.sorteo_resultados%rowtype;
begin
  select * into g
  from public.sorteo_resultados
  where id = p_resultado_id
  for update;

  if not found then
    raise exception 'No existe el resultado %.', p_resultado_id
      using errcode = 'invalid_parameter_value';
  end if;

  if g.rol <> 'ganador' then
    raise exception 'El resultado % no es un ganador vigente (rol actual: %).', p_resultado_id, g.rol
      using errcode = 'invalid_parameter_value';
  end if;

  select * into su
  from public.sorteo_resultados
  where sorteo_id = g.sorteo_id and rol = 'suplente'
  order by posicion
  limit 1
  for update skip locked;

  if not found then
    raise exception 'El sorteo % no tiene suplentes disponibles.', g.sorteo_id
      using errcode = 'invalid_parameter_value';
  end if;

  update public.sorteo_resultados
  set rol = 'declinado', motivo = p_motivo, cambiado_at = now()
  where id = g.id;

  update public.sorteo_resultados
  set rol = 'promovido', promovido_desde = g.id, cambiado_at = now()
  where id = su.id;

  insert into public.email_outbox (inscripcion_id, tipo)
  values (su.inscripcion_id, 'promovido')
  on conflict on constraint email_outbox_unico do nothing;

  insert into public.sorteo_auditoria (sorteo_id, evento, detalle, actor)
  values (g.sorteo_id, 'promocion',
          jsonb_build_object(
            'declinado_resultado', g.id,
            'declinado_posicion', g.posicion,
            'promovido_resultado', su.id,
            'promovido_posicion', su.posicion,
            'motivo', p_motivo
          ),
          p_actor);

  return query select g.id, su.id;
end;
$$;
