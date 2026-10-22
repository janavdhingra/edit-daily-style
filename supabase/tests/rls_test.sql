-- Row-level security checks for profiles, items and closet photos.
--
-- Runs entirely inside one DO block that always ends by raising, so every
-- change (including the throwaway users) is rolled back. The raised message
-- carries the results:  supabase db query --linked -f supabase/tests/rls_test.sql
do $$
declare
  alice uuid := gen_random_uuid();
  bob   uuid := gen_random_uuid();
  out   text := '';
  failures int := 0;
  n int;
  ok boolean;

begin
  -- Two users. The signup trigger should create their profiles.
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
  values (alice, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', alice || '@rls.test', '{"display_name":"Alice"}'),
         (bob,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', bob || '@rls.test', '{}');

  select count(*) into n from public.profiles where id in (alice, bob);
  ok := n = 2; failures := failures + (not ok)::int;
  out := out || format(E'\n%s signup trigger creates both profiles', case when ok then 'PASS' else 'FAIL' end);

  select display_name = 'Alice' into ok from public.profiles where id = alice;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s display name copied from signup', case when ok then 'PASS' else 'FAIL' end);

  insert into public.items (user_id, name, role, color, photo_path) values
    (alice, 'Alice tee', 'top', 'white', alice || '/a.jpg'),
    (bob,   'Bob jeans', 'bottom', 'denim', bob || '/b.jpg');
  insert into storage.objects (bucket_id, name, owner) values
    ('closet', alice || '/a.jpg', alice),
    ('closet', bob || '/b.jpg', bob);

  -- ── As Alice ──────────────────────────────────────────────────────────
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', alice, 'role', 'authenticated')::text, true);

  select count(*) into n from public.items;
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice sees only her own item (saw %s)', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from public.profiles;
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice sees only her own profile (saw %s)', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from storage.objects where bucket_id = 'closet';
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice sees only her own photo (saw %s)', case when ok then 'PASS' else 'FAIL' end, n);

  update public.items set name = 'hacked' where user_id = bob;
  get diagnostics n = row_count;
  ok := n = 0; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice cannot edit Bob''s item', case when ok then 'PASS' else 'FAIL' end);

  delete from public.items where user_id = bob;
  get diagnostics n = row_count;
  ok := n = 0; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice cannot delete Bob''s item', case when ok then 'PASS' else 'FAIL' end);

  update public.profiles set display_name = 'hacked' where id = bob;
  get diagnostics n = row_count;
  ok := n = 0; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice cannot edit Bob''s profile', case when ok then 'PASS' else 'FAIL' end);

  begin
    insert into public.items (user_id, name, role, color, photo_path) values (bob, 'planted', 'top', 'black', bob || '/x.jpg');
    ok := false;
  exception when insufficient_privilege or check_violation then ok := true;
  end;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice cannot add items to Bob''s closet', case when ok then 'PASS' else 'FAIL' end);

  begin
    insert into storage.objects (bucket_id, name, owner) values ('closet', bob || '/planted.jpg', alice);
    ok := false;
  exception when insufficient_privilege or check_violation then ok := true;
  end;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice cannot upload into Bob''s photo folder', case when ok then 'PASS' else 'FAIL' end);

  insert into public.items (name, role, color, photo_path) values ('Alice coat', 'outer', 'tan', alice || '/c.jpg');
  select count(*) into n from public.items where user_id = alice;
  ok := n = 2; failures := failures + (not ok)::int;
  out := out || format(E'\n%s new items default to the signed-in user', case when ok then 'PASS' else 'FAIL' end);

  update public.items set state = 'washing' where user_id = alice and name = 'Alice tee';
  get diagnostics n = row_count;
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s Alice can edit her own item', case when ok then 'PASS' else 'FAIL' end);

  begin
    update public.profiles set is_public = true where id = alice;
    ok := false;
  exception when check_violation then ok := true;
  end;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s a public closet requires a handle', case when ok then 'PASS' else 'FAIL' end);

  -- ── Bob makes his closet public ───────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  update public.profiles set handle = 'bob_rls_test', is_public = true where id = bob;

  -- ── As an anonymous visitor ───────────────────────────────────────────
  perform set_config('role', 'anon', true);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select count(*) into n from public.items;
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s visitors see only the public closet (saw %s)', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from storage.objects where bucket_id = 'closet';
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s visitors see only public closet photos (saw %s)', case when ok then 'PASS' else 'FAIL' end, n);

  select count(*) into n from public.profiles where handle = 'bob_rls_test';
  ok := n = 1; failures := failures + (not ok)::int;
  out := out || format(E'\n%s visitors can look up a public profile by handle', case when ok then 'PASS' else 'FAIL' end);

  begin
    update public.items set name = 'vandalised';
    get diagnostics n = row_count;
    ok := n = 0;
  exception when insufficient_privilege then ok := true;
  end;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s visitors cannot edit a public closet', case when ok then 'PASS' else 'FAIL' end);

  begin
    insert into public.items (user_id, name, role, color, photo_path) values (bob, 'spam', 'top', 'black', bob || '/s.jpg');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  failures := failures + (not ok)::int;
  out := out || format(E'\n%s visitors cannot add to a public closet', case when ok then 'PASS' else 'FAIL' end);

  perform set_config('role', 'postgres', true);
  raise exception 'RLS TEST RESULTS (rolled back): % passed, % failed%',
    (length(out) - length(replace(out, 'PASS', ''))) / 4, failures, out;
end $$;
