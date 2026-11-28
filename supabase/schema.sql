-- Miriam's Coloring Books: accounts, friends, groups, chat and shared books.
-- Paste all of this into Supabase → SQL Editor → New query → Run. Safe to run again.

create extension if not exists pgcrypto with schema extensions;

-- ───────── profiles ─────────
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_.\-]{3,30}$'),
  display_name text not null default '',
  security_question text not null default '',
  security_answer_hash text not null default '',
  recover_fails int not null default 0,
  recover_locked_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

revoke all on public.profiles from anon, authenticated;
grant select (id, username, display_name, security_question, created_at) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (id = auth.uid());
drop policy if exists "edit own profile" on public.profiles;
create policy "edit own profile" on public.profiles for update using (id = auth.uid());

-- a new account gets its profile from the sign-up form
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare base text; uname text;
begin
  -- Google sign-ins bring no username: make one from the e-mail, kept unique
  base := coalesce(nullif(new.raw_user_meta_data->>'username', ''),
                   left(regexp_replace(split_part(coalesce(new.email, 'friend'), '@', 1), '[^A-Za-z0-9_.-]', '', 'g'), 24));
  if length(base) < 3 then base := base || 'friend'; end if;
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    uname := left(base, 24) || floor(random() * 9000 + 1000)::int;
  end loop;
  insert into public.profiles (id, username, display_name, security_question, security_answer_hash)
  values (new.id,
          uname,
          coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', uname),
          coalesce(new.raw_user_meta_data->>'question', ''),
          case when coalesce(new.raw_user_meta_data->>'answer', '') = '' then ''
               else crypt(lower(trim(new.raw_user_meta_data->>'answer')), gen_salt('bf')) end);
  -- the plain answer must not stay in the user record
  update auth.users set raw_user_meta_data = raw_user_meta_data - 'answer' where id = new.id;
  return new;
end $$;
drop trigger if exists on_new_user on auth.users;
create trigger on_new_user after insert on auth.users for each row execute function public.on_new_user();

-- is this username free? (sign-up form)
create or replace function public.username_free(p_username text) returns boolean
language sql security definer set search_path = public stable as $$
  select not exists (select 1 from profiles where lower(username) = lower(p_username));
$$;
grant execute on function public.username_free(text) to anon, authenticated;

-- forgotten password: show the question
create or replace function public.recovery_question(p_login text) returns text
language sql security definer set search_path = public, auth stable as $$
  select p.security_question from profiles p join auth.users u on u.id = p.id
  where lower(p.username) = lower(p_login) or lower(u.email) = lower(p_login) limit 1;
$$;
grant execute on function public.recovery_question(text) to anon, authenticated;

-- forgotten password: right answer → new password. 5 wrong answers lock it for an hour.
create or replace function public.recover_password(p_login text, p_answer text, p_new_password text) returns text
language plpgsql security definer set search_path = public, auth, extensions as $$
declare r record;
begin
  if length(coalesce(p_new_password, '')) < 6 then return 'short'; end if;
  select p.* into r from profiles p join auth.users u on u.id = p.id
    where lower(p.username) = lower(p_login) or lower(u.email) = lower(p_login) limit 1;
  if not found or r.security_answer_hash = '' then return 'wrong'; end if;
  if r.recover_locked_until is not null and r.recover_locked_until > now() then return 'locked'; end if;
  if crypt(lower(trim(p_answer)), r.security_answer_hash) <> r.security_answer_hash then
    update profiles set
      recover_locked_until = case when recover_fails + 1 >= 5 then now() + interval '1 hour' else null end,
      recover_fails = case when recover_fails + 1 >= 5 then 0 else recover_fails + 1 end
      where id = r.id;
    return 'wrong';
  end if;
  update auth.users set encrypted_password = crypt(p_new_password, gen_salt('bf')), updated_at = now() where id = r.id;
  update profiles set recover_fails = 0, recover_locked_until = null where id = r.id;
  return 'ok';
end $$;
grant execute on function public.recover_password(text, text, text) to anon, authenticated;

-- change the security question while signed in
create or replace function public.set_security(p_question text, p_answer text) returns void
language sql security definer set search_path = public, extensions as $$
  update profiles set security_question = p_question,
    security_answer_hash = crypt(lower(trim(p_answer)), gen_salt('bf')) where id = auth.uid();
$$;
grant execute on function public.set_security(text, text) to authenticated;

-- ───────── friends (contacts) ─────────
create table if not exists public.friendships (
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
drop policy if exists "see own" on public.friendships;
create policy "see own" on public.friendships for select using (auth.uid() in (requester, addressee));
drop policy if exists "ask" on public.friendships;
create policy "ask" on public.friendships for insert with check (requester = auth.uid() and status = 'pending');
drop policy if exists "accept" on public.friendships;
create policy "accept" on public.friendships for update using (addressee = auth.uid()) with check (status = 'accepted');
drop policy if exists "remove" on public.friendships;
create policy "remove" on public.friendships for delete using (auth.uid() in (requester, addressee));

create or replace function public.are_friends(a uuid, b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from friendships where status = 'accepted'
    and ((requester = a and addressee = b) or (requester = b and addressee = a)));
$$;

-- ───────── groups ─────────
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  icon text not null default '💬',
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create or replace function public.is_member(g uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;
create or replace function public.is_group_owner(g uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from groups where id = g and owner = auth.uid());
$$;

drop policy if exists "members see group" on public.groups;
create policy "members see group" on public.groups for select using (public.is_member(id) or owner = auth.uid());
drop policy if exists "create group" on public.groups;
create policy "create group" on public.groups for insert with check (owner = auth.uid());
drop policy if exists "owner edits group" on public.groups;
create policy "owner edits group" on public.groups for update using (owner = auth.uid());
drop policy if exists "owner deletes group" on public.groups;
create policy "owner deletes group" on public.groups for delete using (owner = auth.uid());

drop policy if exists "members see members" on public.group_members;
create policy "members see members" on public.group_members for select using (public.is_member(group_id));
-- the owner adds herself, or adds friends; anyone may leave; the owner may remove
drop policy if exists "add member" on public.group_members;
create policy "add member" on public.group_members for insert with check (
  public.is_group_owner(group_id) and (user_id = auth.uid() or public.are_friends(auth.uid(), user_id)));
drop policy if exists "leave or remove" on public.group_members;
create policy "leave or remove" on public.group_members for delete using (user_id = auth.uid() or public.is_group_owner(group_id));

-- a new group: the creator becomes its owner member
create or replace function public.on_new_group() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into group_members (group_id, user_id, role) values (new.id, new.owner, 'owner');
  return new;
end $$;
drop trigger if exists on_new_group on public.groups;
create trigger on_new_group after insert on public.groups for each row execute function public.on_new_group();

-- names of the people one knows: herself, friends, friend requests and group members
-- (never e-mails or the answer hash)
create or replace view public.people with (security_invoker = false) as
  select p.id, p.username, p.display_name from public.profiles p
  where p.id = auth.uid()
     or exists (select 1 from public.friendships f where (f.requester = auth.uid() and f.addressee = p.id) or (f.addressee = auth.uid() and f.requester = p.id))
     or exists (select 1 from public.group_members a join public.group_members b on a.group_id = b.group_id where a.user_id = auth.uid() and b.user_id = p.id);
revoke all on public.people from anon;
grant select on public.people to authenticated;

-- adding a friend by exact username
create or replace function public.find_person(p_username text) returns table (id uuid, username text, display_name text)
language sql security definer set search_path = public stable as $$
  select id, username, display_name from profiles where lower(username) = lower(trim(p_username)) and auth.uid() is not null;
$$;
grant execute on function public.find_person(text) to authenticated;

-- ───────── invite links ─────────
create table if not exists public.invites (
  code text primary key default encode(extensions.gen_random_bytes(9), 'hex'),
  group_id uuid not null references public.groups on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);
alter table public.invites enable row level security;
drop policy if exists "members make invites" on public.invites;
create policy "members make invites" on public.invites for insert with check (created_by = auth.uid() and public.is_member(group_id));
drop policy if exists "members see invites" on public.invites;
create policy "members see invites" on public.invites for select using (public.is_member(group_id));

create or replace function public.invite_info(p_code text) returns table (group_id uuid, name text, icon text)
language sql security definer set search_path = public stable as $$
  select g.id, g.name, g.icon from invites i join groups g on g.id = i.group_id
  where i.code = p_code and i.expires_at > now();
$$;
grant execute on function public.invite_info(text) to anon, authenticated;

create or replace function public.join_group(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select group_id into g from invites where code = p_code and expires_at > now();
  if g is null then raise exception 'invite expired'; end if;
  insert into group_members (group_id, user_id) values (g, auth.uid()) on conflict do nothing;
  return g;
end $$;
grant execute on function public.join_group(text) to authenticated;

-- ───────── shared books ─────────
create table if not exists public.shared_books (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null,
  cover_color text not null default '#6b3a1f',
  pages int not null default 0,
  parts int not null default 1,
  bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.book_shares (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.shared_books on delete cascade,
  to_user uuid references public.profiles on delete cascade,
  to_group uuid references public.groups on delete cascade,
  created_at timestamptz not null default now(),
  check ((to_user is null) <> (to_group is null))
);
alter table public.shared_books enable row level security;
alter table public.book_shares enable row level security;

create or replace function public.can_read_book(b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from shared_books where id = b and owner = auth.uid())
      or exists (select 1 from book_shares s where s.book_id = b
                 and (s.to_user = auth.uid() or (s.to_group is not null and public.is_member(s.to_group))));
$$;
create or replace function public.owns_book(b uuid) returns boolean
language sql security definer set search_path = public stable as $$
  select exists (select 1 from shared_books where id = b and owner = auth.uid());
$$;

drop policy if exists "read shared" on public.shared_books;
create policy "read shared" on public.shared_books for select using (public.can_read_book(id));
drop policy if exists "upload own" on public.shared_books;
create policy "upload own" on public.shared_books for insert with check (owner = auth.uid());
drop policy if exists "delete own" on public.shared_books;
create policy "delete own" on public.shared_books for delete using (owner = auth.uid());

drop policy if exists "see shares" on public.book_shares;
create policy "see shares" on public.book_shares for select using (public.can_read_book(book_id));
drop policy if exists "share own" on public.book_shares;
create policy "share own" on public.book_shares for insert with check (
  public.owns_book(book_id) and (
    (to_user is not null and public.are_friends(auth.uid(), to_user)) or
    (to_group is not null and public.is_member(to_group))));
drop policy if exists "unshare own" on public.book_shares;
create policy "unshare own" on public.book_shares for delete using (public.owns_book(book_id));

-- ───────── group chat ─────────
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  group_id uuid not null references public.groups on delete cascade,
  sender uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null default '' check (length(body) <= 4000),
  book_id uuid references public.shared_books on delete set null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
drop policy if exists "members read chat" on public.messages;
create policy "members read chat" on public.messages for select using (public.is_member(group_id));
drop policy if exists "members write chat" on public.messages;
create policy "members write chat" on public.messages for insert with check (sender = auth.uid() and public.is_member(group_id));
drop policy if exists "delete own message" on public.messages;
create policy "delete own message" on public.messages for delete using (sender = auth.uid());
create index if not exists messages_group_time on public.messages (group_id, created_at);

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- ───────── book files (Storage) ─────────
-- files live at books/<book id>/part-<n>; each part stays under the free plan's 50 MB limit
insert into storage.buckets (id, name, public) values ('books', 'books', false) on conflict (id) do nothing;

drop policy if exists "books read" on storage.objects;
create policy "books read" on storage.objects for select to authenticated using (
  bucket_id = 'books' and public.can_read_book(((storage.foldername(name))[1])::uuid));
drop policy if exists "books upload" on storage.objects;
create policy "books upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'books' and public.owns_book(((storage.foldername(name))[1])::uuid));
drop policy if exists "books delete" on storage.objects;
create policy "books delete" on storage.objects for delete to authenticated using (
  bucket_id = 'books' and public.owns_book(((storage.foldername(name))[1])::uuid));

-- ───────── table permissions (same as grants.sql) ─────────
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

