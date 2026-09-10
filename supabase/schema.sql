create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  year integer,
  genre text,
  rating numeric(3,1) default 0,
  poster_url text,
  video_url text,
  published boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.movies enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

drop policy if exists "Public can read published movies" on public.movies;
create policy "Public can read published movies"
on public.movies for select
using (published = true or public.is_admin());

drop policy if exists "Admins insert movies" on public.movies;
create policy "Admins insert movies"
on public.movies for insert
with check (public.is_admin());

drop policy if exists "Admins update movies" on public.movies;
create policy "Admins update movies"
on public.movies for update
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins delete movies" on public.movies;
create policy "Admins delete movies"
on public.movies for delete
using (public.is_admin());

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile"
on public.profiles for select
using (id = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public)
values ('movies', 'movies', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('posters', 'posters', true)
on conflict (id) do update set public = true;

drop policy if exists "Admins upload movie files" on storage.objects;
create policy "Admins upload movie files"
on storage.objects for insert
to authenticated
with check (bucket_id = 'movies' and public.is_admin());

drop policy if exists "Admins update movie files" on storage.objects;
create policy "Admins update movie files"
on storage.objects for update
to authenticated
using (bucket_id = 'movies' and public.is_admin())
with check (bucket_id = 'movies' and public.is_admin());

drop policy if exists "Admins delete movie files" on storage.objects;
create policy "Admins delete movie files"
on storage.objects for delete
to authenticated
using (bucket_id in ('movies','posters') and public.is_admin());

drop policy if exists "Admins upload posters" on storage.objects;
create policy "Admins upload posters"
on storage.objects for insert
to authenticated
with check (bucket_id = 'posters' and public.is_admin());

drop policy if exists "Admins update posters" on storage.objects;
create policy "Admins update posters"
on storage.objects for update
to authenticated
using (bucket_id = 'posters' and public.is_admin())
with check (bucket_id = 'posters' and public.is_admin());

drop policy if exists "Public read movie files" on storage.objects;
create policy "Public read movie files"
on storage.objects for select
to public
using (bucket_id in ('movies','posters'));
