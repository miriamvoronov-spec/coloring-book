-- Miriam's Coloring Books: a gallery of finished pages, shared with friends or with one group.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.
-- Only pictures someone chose to share go here (her own coloured result, at most 1600 px).

create table if not exists public.gallery (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null default '' check (length(title) <= 120),
  to_group uuid references public.groups on delete cascade,   -- empty = all my friends
  path text not null,
  width int not null default 0,
  height int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.gallery enable row level security;
create index if not exists gallery_time on public.gallery (created_at desc);

create or replace function public.can_see_art(p_owner uuid, p_group uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select p_owner = auth.uid()
      or (p_group is null and public.are_friends(auth.uid(), p_owner))
      or (p_group is not null and public.is_member(p_group));
$$;

drop policy if exists "see art" on public.gallery;
create policy "see art" on public.gallery for select using (public.can_see_art(owner, to_group));
drop policy if exists "post art" on public.gallery;
create policy "post art" on public.gallery for insert with check (
  owner = auth.uid() and (to_group is null or public.is_member(to_group)) and path like auth.uid()::text || '/%');
drop policy if exists "remove art" on public.gallery;
create policy "remove art" on public.gallery for delete using (owner = auth.uid());
grant select, insert, delete on public.gallery to authenticated;

-- pictures live at gallery/<owner id>/<picture id>.jpg
insert into storage.buckets (id, name, public) values ('gallery', 'gallery', false) on conflict (id) do nothing;
drop policy if exists "gallery read" on storage.objects;
create policy "gallery read" on storage.objects for select to authenticated using (
  bucket_id = 'gallery' and exists (select 1 from public.gallery g where g.path = name and public.can_see_art(g.owner, g.to_group)));
drop policy if exists "gallery upload" on storage.objects;
create policy "gallery upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "gallery delete" on storage.objects;
create policy "gallery delete" on storage.objects for delete to authenticated using (
  bucket_id = 'gallery' and (storage.foldername(name))[1] = auth.uid()::text);
