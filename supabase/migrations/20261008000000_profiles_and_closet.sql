-- Profiles, closet items and closet photos.
--
-- Access model: everyone reads and writes only their own rows. A user can opt
-- in to a public, read-only closet (profiles.is_public) — that is what powers
-- the demo link — and then anyone can read that profile, its items and photos.

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text check (char_length(display_name) <= 60),
  handle        text unique check (handle ~ '^[a-z0-9_]{3,30}$'),
  avatar_path   text,
  prefs         jsonb not null default '{}'::jsonb,
  is_public     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- A public closet needs a handle so it has a link.
  constraint public_needs_handle check (not is_public or handle is not null)
);

create table public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  role        text not null check (role in ('top', 'bottom', 'outer', 'shoes', 'dress', 'accessory')),
  color       text not null check (char_length(color) <= 30),
  formality   smallint not null default 2 check (formality between 1 and 5),
  warmth      smallint not null default 3 check (warmth between 1 and 5),
  fabric      text check (char_length(fabric) <= 30),
  fit         text check (char_length(fit) <= 30),
  styles      text[] not null default '{}',
  occasions   text[] not null default '{}',
  tags        text[] not null default '{}',
  photo_path  text not null,
  state       text not null default 'clean' check (state in ('clean', 'recent', 'washing', 'cleaners')),
  last_worn   timestamptz,
  created_at  timestamptz not null default now()
);
create index items_user_id_idx on public.items (user_id);

-- Keep updated_at honest.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Every new account gets an empty profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row-level security ---------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.items enable row level security;

create policy "read own or public profiles" on public.profiles
  for select using (id = (select auth.uid()) or is_public);
create policy "update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read own or public closets" on public.items
  for select using (
    user_id = (select auth.uid())
    or exists (select 1 from public.profiles p where p.id = items.user_id and p.is_public)
  );
create policy "add to own closet" on public.items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "edit own closet" on public.items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "remove from own closet" on public.items
  for delete to authenticated using (user_id = (select auth.uid()));

-- Photo storage: private bucket, one folder per user ("<user id>/<file>") ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('closet', 'closet', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "read own or public closet photos" on storage.objects
  for select using (
    bucket_id = 'closet' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.profiles p
        where p.id::text = (storage.foldername(name))[1] and p.is_public
      )
    )
  );
create policy "upload own closet photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "replace own closet photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own closet photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
