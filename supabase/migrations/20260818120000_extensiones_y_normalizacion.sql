-- ============================================================================
-- Extensiones y funciones de normalización.
--
-- Todo lo que decide identidad —qué RUT es "el mismo" RUT, qué texto encuentra
-- el buscador— vive acá y en la base, no en la aplicación. La razón es el
-- invariante del brief (§9): la regla tiene que valer aunque alguien inserte
-- una fila desde el editor SQL de Supabase, no solo cuando pasa por el
-- formulario.
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- ----------------------------------------------------------------------------
-- unaccent inmutable
--
-- `unaccent(text)` es STABLE, no IMMUTABLE: resuelve el diccionario por el
-- search_path en tiempo de ejecución. Así no se puede indexar ni usar en una
-- columna generada. La forma de dos argumentos recibe el diccionario explícito
-- y sí es determinista, así que este envoltorio es seguro marcarlo IMMUTABLE.
--
-- Nunca quitar tildes en JavaScript: si el índice se construye con una regla y
-- la consulta con otra, el índice deja de servir y la búsqueda se cae a un
-- seq scan sobre la tabla entera.
-- ----------------------------------------------------------------------------
create or replace function public.inmutable_unaccent(texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select public.unaccent('public.unaccent', texto)
$$;

-- ----------------------------------------------------------------------------
-- RUT: forma canónica y dígito verificador
--
-- Espeja exactamente lib/rut.ts. Dos reglas que no son cosméticas:
--
-- 1. El guión es OBLIGATORIO. Con ocho caracteres sin separador es imposible
--    distinguir un cuerpo de 7 dígitos + DV de un cuerpo de 8 al que le falta
--    el DV: adivinar reescribe el RUT de una persona como el de OTRA y en ~9%
--    de los casos el resultado además valida, así que el error pasa silencioso.
--
-- 2. Los ceros a la izquierda se colapsan. 012.345.678-5 y 12.345.678-5 son el
--    mismo RUT; sin normalizar producían cuatro claves distintas y la misma
--    persona entraba cuatro veces al sorteo.
-- ----------------------------------------------------------------------------
create or replace function public.rut_norm(crudo text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  with limpio as (
    select upper(regexp_replace(crudo, '[^0-9kK-]', '', 'g')) as t
  ),
  corte as (
    -- Índice del ÚLTIMO guión, 1-based. position() sobre el reverso porque
    -- Postgres no trae un lastIndexOf.
    select t, length(t) - position('-' in reverse(t)) + 1 as guion
    from limpio
    where position('-' in t) > 0
  ),
  partes as (
    select ltrim(substr(t, 1, guion - 1), '0') as cuerpo,
           substr(t, guion + 1)                as dv
    from corte
    -- guion > 1: un guión en la primera posición deja el cuerpo vacío.
    where guion > 1
  )
  select cuerpo || dv
  from partes
  -- 7–8 dígitos acota el cuerpo por arriba y por abajo, y de paso rechaza el
  -- cuerpo todo-cero: 0.000.000-0 validaba y daba un RUT "válido" desechable.
  where cuerpo ~ '^[0-9]{7,8}$' and dv ~ '^[0-9K]$'
$$;

/** Dígito verificador esperado para un cuerpo ya normalizado (módulo 11). */
create or replace function public.rut_dv(cuerpo text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
declare
  suma  int := 0;
  mult  int := 2;
  i     int;
  resto int;
begin
  for i in reverse length(cuerpo)..1 loop
    suma := suma + substr(cuerpo, i, 1)::int * mult;
    mult := case when mult = 7 then 2 else mult + 1 end;
  end loop;

  resto := 11 - (suma % 11);
  return case resto when 11 then '0' when 10 then 'K' else resto::text end;
end;
$$;

/** true solo si el RUT es interpretable Y su dígito verificador cuadra. */
create or replace function public.rut_valido(crudo text)
returns boolean
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when public.rut_norm(crudo) is null then false
    else public.rut_dv(left(public.rut_norm(crudo), -1))
         = right(public.rut_norm(crudo), 1)
  end
$$;

/**
 * Normalización de correo: minúsculas y sin espacios al borde, nada más.
 *
 * A propósito NO se quitan los puntos ni el sufijo +etiqueta de Gmail. Tratar
 * a.b@gmail.com y ab@gmail.com como la misma persona es una decisión de
 * negocio con consecuencias legales en un sorteo (rechaza inscripciones que el
 * proveedor considera cuentas distintas) y no está tomada. Si se toma, se
 * cambia acá y se reconstruye el índice único.
 */
create or replace function public.email_norm(crudo text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$
  select lower(btrim(crudo))
$$;
