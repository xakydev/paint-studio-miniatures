-- Nada se borra físicamente: ni el dueño de la fila, ni service_role (BYPASSRLS), ni el dueño de
-- las tablas (postgres, el editor SQL del dashboard) pueden hacer DELETE ni TRUNCATE.
-- El borrado es lógico: un UPDATE de deleted_at.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com');
insert into public.collection_entries (user_id, code, status, level, note, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'AK11179', 'owned', 1, null, '2026-01-02T00:00:00Z', null);
insert into public.recipes (user_id, id, data, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'receta-a', '{"name":"De A","zones":[]}', '2026-01-02T00:00:00Z', null);
-- Una fila de auditoría real, generada por el trigger, para comprobar que tampoco se borra.
update public.collection_entries set level = 2, updated_at = '2026-01-03T00:00:00Z' where code = 'AK11179';

-- Segunda capa: ningún rol de la API tiene el privilegio. El trigger lanzaría el mismo 42501,
-- así que esto se comprueba aparte para que no se pierda una capa sin que nadie lo note.
select is_empty(
  $$select rol, tabla, privilegio
    from unnest(array['anon', 'authenticated', 'service_role']) as rol,
         unnest(array['public.collection_entries', 'public.recipes', 'public.change_log']) as tabla,
         unnest(array['DELETE', 'TRUNCATE']) as privilegio
    where has_table_privilege(rol, tabla, privilegio)$$,
  'ningún rol de la API tiene DELETE ni TRUNCATE sobre las tablas protegidas'
);

-- El dueño de las filas: sin GRANT de DELETE ni TRUNCATE, el error es explícito (42501), no un
-- "cero filas" silencioso.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok($$delete from public.collection_entries where code = 'AK11179'$$, '42501', null,
  'el usuario no puede borrar su propia fila de la colección');
select throws_ok($$delete from public.recipes where id = 'receta-a'$$, '42501', null,
  'el usuario no puede borrar su propia receta');
select throws_ok($$delete from public.change_log$$, '42501', null,
  'el usuario no puede borrar su historial de auditoría');
select throws_ok($$truncate public.collection_entries$$, '42501', null,
  'el usuario no puede vaciar la colección');

-- service_role se salta la RLS, pero no tiene GRANT de DELETE ni TRUNCATE.
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

select throws_ok($$delete from public.collection_entries$$, '42501', null,
  'service_role no puede borrar filas de la colección');
select throws_ok($$delete from public.recipes$$, '42501', null,
  'service_role no puede borrar recetas');
select throws_ok($$delete from public.change_log$$, '42501', null,
  'service_role no puede borrar la auditoría');
select throws_ok($$truncate public.collection_entries$$, '42501', null,
  'service_role no puede vaciar la colección');
select throws_ok($$truncate public.recipes$$, '42501', null,
  'service_role no puede vaciar las recetas');
select throws_ok($$truncate public.change_log$$, '42501', null,
  'service_role no puede vaciar la auditoría');

-- El dueño de las tablas tiene todos los privilegios: solo lo para el trigger. Se comprueba el
-- mensaje para distinguir el trigger de un simple "permission denied".
reset role;

select throws_ok($$delete from public.collection_entries$$, '42501',
  'Borrado físico prohibido en collection_entries: usa deleted_at',
  'el dueño de las tablas no puede borrar filas de la colección');
select throws_ok($$delete from public.recipes$$, '42501',
  'Borrado físico prohibido en recipes: usa deleted_at',
  'el dueño de las tablas no puede borrar recetas');
select throws_ok($$delete from public.change_log$$, '42501',
  'Borrado físico prohibido en change_log: usa deleted_at',
  'el dueño de las tablas no puede borrar la auditoría');
select throws_ok($$truncate public.collection_entries$$, '42501',
  'Borrado físico prohibido en collection_entries: usa deleted_at',
  'el dueño de las tablas no puede vaciar la colección');
select throws_ok($$truncate public.recipes$$, '42501',
  'Borrado físico prohibido en recipes: usa deleted_at',
  'el dueño de las tablas no puede vaciar las recetas');
select throws_ok($$truncate public.change_log$$, '42501',
  'Borrado físico prohibido en change_log: usa deleted_at',
  'el dueño de las tablas no puede vaciar la auditoría');

select is((select count(*) from public.collection_entries), 1::bigint,
  'la fila de la colección sigue presente');
select is((select count(*) from public.recipes), 1::bigint,
  'la receta sigue presente');
select is((select count(*) from public.change_log), 1::bigint,
  'la fila de auditoría sigue presente');

-- El camino legítimo: el borrado lógico es un UPDATE más nuevo que pone deleted_at.
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$update public.collection_entries
    set deleted_at = '2026-01-04T00:00:00Z', updated_at = '2026-01-04T00:00:00Z'
    where code = 'AK11179'$$,
  'el usuario puede marcar su fila como borrada (borrado lógico)'
);
select is(
  (select deleted_at from public.collection_entries where code = 'AK11179'),
  '2026-01-04T00:00:00Z'::timestamptz,
  'la fila queda con su tombstone y sigue existiendo'
);

select * from finish();
rollback;
