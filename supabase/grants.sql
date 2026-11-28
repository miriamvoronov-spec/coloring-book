-- Miriam's Coloring Books: table permissions and personal friend links.
-- New Supabase projects no longer let the app's signed-in users touch new tables by default
-- ("permission denied for table friendships"). This gives them access; the row-level
-- security rules in schema.sql still decide which rows each person may see or change.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.friendships, public.groups, public.group_members, public.invites,
  public.shared_books, public.book_shares, public.messages
to authenticated;

grant select on public.people to authenticated;
grant select (id, username, display_name, security_question, created_at) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- helpers that the row rules call
grant execute on function public.are_friends(uuid, uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.can_read_book(uuid) to authenticated;
grant execute on function public.owns_book(uuid) to authenticated;

-- the shared gallery, only if gallery.sql was already run
do $$ begin
  if to_regclass('public.gallery') is not null then
    execute 'grant select, insert, delete on public.gallery to authenticated';
  end if;
  if to_regprocedure('public.can_see_art(uuid, uuid)') is not null then
    execute 'grant execute on function public.can_see_art(uuid, uuid) to authenticated';
  end if;
end $$;

-- ───────── personal friend links ─────────
-- A link she sends to anyone: whoever opens it (new or existing account) becomes her friend right away.
create table if not exists public.friend_links (
  code text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  expires_at timestamptz not null default now() + interval '30 days',
  created_at timestamptz not null default now()
);
alter table public.friend_links enable row level security;
drop policy if exists "make own links" on public.friend_links;
create policy "make own links" on public.friend_links for insert with check (created_by = auth.uid());
drop policy if exists "see own links" on public.friend_links;
create policy "see own links" on public.friend_links for select using (created_by = auth.uid());
grant select, insert on public.friend_links to authenticated;

create or replace function public.friend_link_info(p_code text) returns table (username text, display_name text)
language sql security definer set search_path = public stable as $$
  select p.username, p.display_name from friend_links l join profiles p on p.id = l.created_by
  where l.code = p_code and l.expires_at > now();
$$;
grant execute on function public.friend_link_info(text) to anon, authenticated;

create or replace function public.accept_friend_link(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select created_by into who from friend_links where code = p_code and expires_at > now();
  if who is null then raise exception 'invite expired'; end if;
  if who = auth.uid() then raise exception 'own friend link'; end if;
  update friendships set status = 'accepted'
    where (requester = who and addressee = auth.uid()) or (requester = auth.uid() and addressee = who);
  if not found then
    insert into friendships (requester, addressee, status) values (who, auth.uid(), 'accepted');
  end if;
  return who;
end $$;
grant execute on function public.accept_friend_link(text) to authenticated;

select 'מוכן ✨' as result;
