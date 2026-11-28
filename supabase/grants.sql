-- Miriam's Coloring Books: table permissions.
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

select 'מוכן ✨' as result;
