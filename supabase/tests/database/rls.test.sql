-- Esquema, RLS, rol anónimo e inmutabilidad de user_id y de la clave.
--
-- Cada fichero corre en una transacción que se deshace al final: los usuarios y filas de prueba
-- nunca quedan en la base. Para actuar como un usuario se cambia al rol `authenticated` y se
-- fija el JWT con `request.jwt.claims`, que es de donde lee `auth.uid()`; es lo que hace
-- PostgREST con cada petición (guía de testing de Supabase).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Preparación como dueño de las tablas (postgres): se salta la RLS, así que puede sembrar las
-- filas de los dos usuarios.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'b@example.com');
insert into public.collection_entries (user_id, code, status, level, note, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'AK11179', 'owned', 1, null, '2026-01-02T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 'AK11180', 'owned', 1, null, '2026-01-02T00:00:00Z', null);
insert into public.recipes (user_id, id, data, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'receta-a', '{"name":"De A","zones":[]}', '2026-01-02T00:00:00Z', null),
  ('22222222-2222-2222-2222-222222222222', 'receta-b', '{"name":"De B","zones":[]}', '2026-01-02T00:00:00Z', null);

-- La RLS tiene que estar activa: sin ella, los GRANT darían acceso a las filas de todos.
select ok((select relrowsecurity from pg_class where oid = 'public.collection_entries'::regclass),
  'collection_entries tiene la RLS activa');
select ok((select relrowsecurity from pg_class where oid = 'public.recipes'::regclass),
  'recipes tiene la RLS activa');
select ok((select relrowsecurity from pg_class where oid = 'public.change_log'::regclass),
  'change_log tiene la RLS activa');
-- Sin USAGE sobre `private`, nadie desde la API puede invocar las funciones de los triggers.
select ok(not has_schema_privilege('authenticated', 'private', 'usage'),
  'authenticated no tiene USAGE sobre el esquema private');
-- Primera capa de la inmutabilidad de user_id: el GRANT de UPDATE por columna no lo incluye.
-- La guardia lanzaría el mismo 42501, así que esto se comprueba aparte para que no se pierda una capa.
select ok(not has_column_privilege('authenticated', 'public.collection_entries', 'user_id', 'UPDATE')
      and not has_column_privilege('authenticated', 'public.recipes', 'user_id', 'UPDATE'),
  'authenticated no tiene UPDATE sobre la columna user_id');

-- Como el usuario A.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select results_eq(
  $$select code from public.collection_entries$$,
  $$values ('AK11179'::text)$$,
  'A solo ve su propia fila de la colección, no la de B'
);
select results_eq(
  $$select id from public.recipes$$,
  $$values ('receta-a'::text)$$,
  'A solo ve su propia receta, no la de B'
);

-- Inserción sin user_id, como la hace el adaptador: el default auth.uid() pone el del JWT.
select lives_ok(
  $$insert into public.collection_entries (code, status, level, note, updated_at, deleted_at)
    values ('AK11200', 'wishlist', 0, null, '2026-01-01T00:00:00Z', null)$$,
  'A inserta una fila propia sin mandar user_id'
);
select is(
  (select user_id from public.collection_entries where code = 'AK11200'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'el default de user_id es el auth.uid() de la sesión'
);

select throws_ok(
  $$insert into public.collection_entries (user_id, code, status, level, updated_at)
    values ('22222222-2222-2222-2222-222222222222', 'AK11300', 'owned', 1, '2026-01-01T00:00:00Z')$$,
  '42501', null,
  'A no puede insertar en la colección una fila a nombre de B'
);
select throws_ok(
  $$insert into public.recipes (user_id, id, data, updated_at)
    values ('22222222-2222-2222-2222-222222222222', 'receta-x', '{"zones":[]}', '2026-01-01T00:00:00Z')$$,
  '42501', null,
  'A no puede insertar una receta a nombre de B'
);
-- La RLS filtra la fila de B: el UPDATE no falla, pero afecta a cero filas (se comprueba abajo).
select lives_ok(
  $$update public.collection_entries set level = 3, updated_at = '2027-01-01T00:00:00Z' where code = 'AK11180'$$,
  'un UPDATE de A sobre la fila de B no lanza error (la RLS la oculta)'
);

-- Restricciones de dominio (CHECK).
select throws_ok(
  $$insert into public.collection_entries (code, status, level, updated_at)
    values ('AK11400', 'owned', 4, '2026-01-01T00:00:00Z')$$,
  '23514', null,
  'un level fuera de 0..3 se rechaza'
);
select throws_ok(
  $$insert into public.collection_entries (code, status, level, updated_at)
    values ('AK11401', 'perdido', 1, '2026-01-01T00:00:00Z')$$,
  '23514', null,
  'un status no reconocido se rechaza'
);
select throws_ok(
  $$insert into public.recipes (id, data, updated_at) values ('receta-sin-zonas', '{"name":"x"}', '2026-01-01T00:00:00Z')$$,
  '23514', null,
  'una receta sin zones se rechaza (el coalesce del CHECK)'
);
select throws_ok(
  $$insert into public.recipes (id, data, updated_at) values ('receta-array', '[]', '2026-01-01T00:00:00Z')$$,
  '23514', null,
  'una receta cuyo data no es un objeto se rechaza'
);

-- user_id y la clave son inmutables, incluso para el dueño.
select throws_ok(
  $$update public.collection_entries set user_id = '22222222-2222-2222-2222-222222222222' where code = 'AK11179'$$,
  '42501', null,
  'el dueño no puede reasignar su fila a otro usuario (sin GRANT sobre user_id)'
);
select throws_ok(
  $$update public.collection_entries set code = 'AK99999' where code = 'AK11179'$$,
  '42501', 'No se puede cambiar el usuario ni la clave de una fila de collection_entries',
  'el dueño no puede cambiar la clave de su fila (guard_update)'
);

-- Como anónimo: sin ningún GRANT, cualquier acceso falla con 42501.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok($$select * from public.collection_entries$$, '42501', null,
  'anon no puede leer collection_entries');
select throws_ok($$select * from public.recipes$$, '42501', null,
  'anon no puede leer recipes');
select throws_ok($$select * from public.change_log$$, '42501', null,
  'anon no puede leer change_log');
select throws_ok(
  $$insert into public.collection_entries (user_id, code, status, level, updated_at)
    values ('11111111-1111-1111-1111-111111111111', 'AK11500', 'owned', 1, '2026-01-01T00:00:00Z')$$,
  '42501', null,
  'anon no puede escribir en collection_entries'
);

-- De vuelta al dueño de las tablas para comprobar el estado real, sin RLS de por medio.
reset role;

select is(
  (select level from public.collection_entries where code = 'AK11180'),
  1::smallint,
  'la fila de B sigue intacta tras el UPDATE de A'
);
select results_eq(
  $$select user_id from public.collection_entries where code = 'AK11179'$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'la fila de A conserva su user_id y su clave'
);

-- on delete restrict: borrar un usuario con datos falla; borrar una cuenta es un proceso manual.
-- RESTRICT da 23001 (restrict_violation), no el 23503 de NO ACTION.
select throws_ok(
  $$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  '23001', null,
  'borrar de auth.users a un usuario con filas propias falla'
);
select ok(
  exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111')
  and exists (select 1 from public.collection_entries where user_id = '11111111-1111-1111-1111-111111111111'),
  'el usuario y su fila siguen existiendo'
);

select * from finish();
rollback;
