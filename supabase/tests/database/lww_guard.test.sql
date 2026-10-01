-- Guardia de escritura más reciente (LWW): un UPDATE con updated_at más antiguo que el guardado
-- se descarta sin error, para que una sola fila antigua no tumbe el lote entero del upsert.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'a@example.com');
insert into public.collection_entries (user_id, code, status, level, note, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'AK-S', 'owned', 1, null, '2026-01-02T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 'AK-X', 'owned', 1, null, '2026-01-02T00:00:00Z', null),
  ('11111111-1111-1111-1111-111111111111', 'AK-Y', 'owned', 1, null, '2026-01-02T00:00:00Z', null);
insert into public.recipes (user_id, id, data, updated_at, deleted_at) values
  ('11111111-1111-1111-1111-111111111111', 'receta-1', '{"name":"Original","zones":[]}', '2026-01-02T00:00:00Z', null);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Un UPDATE suelto más antiguo.
select lives_ok(
  $$update public.collection_entries
    set level = 3, note = 'antigua', updated_at = '2026-01-01T00:00:00Z'
    where code = 'AK-S'$$,
  'una escritura más antigua no lanza error'
);
select results_eq(
  $$select level, note, updated_at from public.collection_entries where code = 'AK-S'$$,
  $$values (1::smallint, null::text, '2026-01-02T00:00:00Z'::timestamptz)$$,
  'la fila conserva sus valores y su updated_at originales'
);

-- Lote mixto con la forma exacta del upsert de PostgREST: todas las columnas del payload en el
-- SET, también la clave. X llega más antiguo, Y más nuevo y Z es nueva. El RETURNING solo
-- devuelve las filas escritas: si la guardia lanzara, el lote entero fallaría aquí.
with escritas as (
  insert into public.collection_entries (code, status, level, note, updated_at, deleted_at) values
    ('AK-X', 'wishlist', 3, 'antigua', '2026-01-01T00:00:00Z', null),
    ('AK-Y', 'owned',    2, 'nueva',   '2026-01-03T00:00:00Z', null),
    ('AK-Z', 'owned',    0, null,      '2026-01-03T00:00:00Z', null)
  on conflict (user_id, code) do update set
    code = excluded.code, status = excluded.status, level = excluded.level,
    note = excluded.note, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
  returning code
)
select is(
  (select array_agg(code order by code) from escritas),
  array['AK-Y', 'AK-Z']::text[],
  'el lote mixto no falla y solo escribe la fila más nueva y la nueva'
);
select results_eq(
  $$select status, level, note, updated_at from public.collection_entries where code = 'AK-X'$$,
  $$values ('owned'::text, 1::smallint, null::text, '2026-01-02T00:00:00Z'::timestamptz)$$,
  'en el lote, X (más antigua) conserva sus valores previos'
);
select results_eq(
  $$select status, level, note, updated_at from public.collection_entries where code = 'AK-Y'$$,
  $$values ('owned'::text, 2::smallint, 'nueva'::text, '2026-01-03T00:00:00Z'::timestamptz)$$,
  'en el lote, Y (más nueva) queda con los valores y el updated_at del lote'
);
select results_eq(
  $$select user_id, level from public.collection_entries where code = 'AK-Z'$$,
  $$values ('11111111-1111-1111-1111-111111111111'::uuid, 0::smallint)$$,
  'en el lote, Z se inserta a nombre del usuario de la sesión'
);

-- Las recetas tienen la misma guardia, con `id` como clave.
select lives_ok(
  $$insert into public.recipes (id, data, updated_at, deleted_at)
    values ('receta-1', '{"name":"Vieja","zones":[]}', '2026-01-01T00:00:00Z', null)
    on conflict (user_id, id) do update set
      id = excluded.id, data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at$$,
  'un upsert de receta más antiguo no lanza error'
);
select is(
  (select data ->> 'name' from public.recipes where id = 'receta-1'),
  'Original',
  'la receta conserva sus datos tras el upsert antiguo'
);
select lives_ok(
  $$insert into public.recipes (id, data, updated_at, deleted_at)
    values ('receta-1', '{"name":"Nueva","zones":[]}', '2026-01-03T00:00:00Z', null)
    on conflict (user_id, id) do update set
      id = excluded.id, data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at$$,
  'un upsert de receta más nuevo no lanza error'
);
select is(
  (select data ->> 'name' from public.recipes where id = 'receta-1'),
  'Nueva',
  'la receta se actualiza con el upsert más nuevo'
);

-- Empate: la guardia solo descarta lo estrictamente más antiguo (`<`); con el mismo updated_at
-- y otro contenido, gana la escritura que llega.
select lives_ok(
  $$update public.collection_entries set level = 2 where code = 'AK-X'$$,
  'un UPDATE con el mismo updated_at no lanza error'
);
select results_eq(
  $$select level, updated_at from public.collection_entries where code = 'AK-X'$$,
  $$values (2::smallint, '2026-01-02T00:00:00Z'::timestamptz)$$,
  'con el mismo updated_at, el UPDATE se aplica'
);

select * from finish();
rollback;
