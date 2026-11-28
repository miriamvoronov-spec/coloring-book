-- Miriam's Coloring Books: e-mail notifications (Brevo, free plan: 300 e-mails a day).
-- Paste all of this into Supabase → SQL Editor → New query → Run. Safe to run again.
-- Then run, once, with your own Brevo key and e-mail (see supabase/EMAIL.md):
--   select public.set_mail_settings('xkeysib-...', 'you@gmail.com');
--
-- Who gets what:
--   * a friend request, and when a friend request is accepted
--   * being added to a group by someone else
--   * a book shared with you, or with a group you are in
--   * group chat messages: only if you turned it on, and at most one e-mail per group every 30 minutes
-- Each person turns these on or off in the app ("👭 חברות וקבוצות" → the account card).

create extension if not exists pg_net with schema extensions;

-- ───────── each person's choice ─────────
alter table public.profiles add column if not exists email_notify boolean not null default true;
alter table public.profiles add column if not exists email_chat boolean not null default false;
grant select (email_notify, email_chat) on public.profiles to authenticated;
grant update (email_notify, email_chat) on public.profiles to authenticated;

-- ───────── settings: Brevo key and sender, kept in the Vault ─────────
create or replace function public.set_mail_settings(p_key text, p_from text) returns text
language plpgsql security definer set search_path = public, vault as $$
declare k uuid;
begin
  select id into k from vault.secrets where name = 'brevo_key';
  if k is null then perform vault.create_secret(trim(p_key), 'brevo_key'); else perform vault.update_secret(k, trim(p_key)); end if;
  select id into k from vault.secrets where name = 'mail_from';
  if k is null then perform vault.create_secret(trim(p_from), 'mail_from'); else perform vault.update_secret(k, trim(p_from)); end if;
  return 'נשמר';
end $$;
revoke all on function public.set_mail_settings(text, text) from public, anon, authenticated;

-- a record of chat e-mails, so a busy group sends at most one e-mail per half hour
create table if not exists public.notify_log (
  user_id uuid not null references public.profiles on delete cascade,
  group_id uuid not null references public.groups on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, group_id)
);
alter table public.notify_log enable row level security;
revoke all on public.notify_log from anon, authenticated;

create or replace function public.html_esc(t text) returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

create or replace function public.person_name(u uuid) returns text
language sql security definer set search_path = public stable as $$
  select coalesce(nullif(display_name, ''), username, 'חברה') from profiles where id = u;
$$;

-- send one e-mail to one person, if they want it ('notify' or 'chat')
create or replace function public.mail_person(p_user uuid, p_kind text, p_subject text, p_line text, p_button text default 'לפתוח את האפליקציה')
returns void language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  addr text; want boolean; who text; k text; frm text;
  app constant text := 'https://miriamvoronov-spec.github.io/coloring-book/#friends';
  html text;
begin
  select u.email, case when p_kind = 'chat' then p.email_chat else p.email_notify end, coalesce(nullif(p.display_name, ''), p.username)
    into addr, want, who
    from auth.users u join profiles p on p.id = u.id where u.id = p_user;
  if addr is null or not coalesce(want, false) then return; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'brevo_key';
  select decrypted_secret into frm from vault.decrypted_secrets where name = 'mail_from';
  if k is null or frm is null then return; end if;   -- e-mail not set up yet: do nothing
  html := '<div dir="rtl" style="font-family:Arial,sans-serif;background:#2b1a10;padding:24px;color:#fbf4e4">'
       || '<div style="max-width:480px;margin:auto;background:#3a2416;border:1px solid #e7b850;border-radius:16px;padding:24px;text-align:right">'
       || '<div style="font-size:22px;color:#e7b850;margin-bottom:12px">Miriam''s Coloring Books ✨</div>'
       || '<p style="font-size:17px;line-height:1.6;margin:0 0 20px">שלום ' || html_esc(who) || ',<br>' || p_line || '</p>'
       || '<a href="' || app || '" style="display:inline-block;background:#e7b850;color:#2b1a10;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">' || html_esc(p_button) || '</a>'
       || '<p style="font-size:12px;color:#c9b48a;margin:22px 0 0">לא רוצה מיילים? באפליקציה: 👭 חברות וקבוצות ← כרטיס החשבון ← התראות במייל.</p>'
       || '</div></div>';
  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', k, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', 'Miriam''s Coloring Books', 'email', frm),
      'to', jsonb_build_array(jsonb_build_object('email', addr)),
      'subject', p_subject,
      'htmlContent', html));
exception when others then
  raise warning 'mail_person: %', sqlerrm;   -- an e-mail problem never blocks the app
end $$;
revoke all on function public.mail_person(uuid, text, text, text, text) from public, anon, authenticated;

-- ───────── friend requests ─────────
create or replace function public.notify_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform mail_person(new.addressee, 'notify', person_name(new.requester) || ' רוצה להיות חברה שלך',
      '<b>' || html_esc(person_name(new.requester)) || '</b> שלחה לך בקשת חברות. אפשר לאשר אותה באפליקציה, ב"👭 חברות וקבוצות".', 'לאשר את הבקשה');
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform mail_person(new.requester, 'notify', person_name(new.addressee) || ' אישרה את בקשת החברות',
      '<b>' || html_esc(person_name(new.addressee)) || '</b> אישרה את בקשת החברות שלך. עכשיו אפשר לשתף חוברות זו עם זו.');
  end if;
  return new;
end $$;
drop trigger if exists notify_friendship on public.friendships;
create trigger notify_friendship after insert or update on public.friendships for each row execute function public.notify_friendship();

-- ───────── added to a group ─────────
create or replace function public.notify_member() returns trigger
language plpgsql security definer set search_path = public as $$
declare g record; by_user uuid := auth.uid();
begin
  select name, icon, owner into g from groups where id = new.group_id;
  -- joining by yourself (invite link, or the owner creating the group) sends nothing
  if by_user is null or by_user = new.user_id then return new; end if;
  perform mail_person(new.user_id, 'notify', person_name(by_user) || ' הוסיפה אותך לקבוצה ' || g.name,
    '<b>' || html_esc(person_name(by_user)) || '</b> הוסיפה אותך לקבוצה <b>' || html_esc(g.icon || ' ' || g.name) || '</b>. אפשר לכתוב שם ולשתף חוברות.', 'לפתוח את הקבוצה');
  return new;
end $$;
drop trigger if exists notify_member on public.group_members;
create trigger notify_member after insert on public.group_members for each row execute function public.notify_member();

-- ───────── a book shared with you or your group ─────────
create or replace function public.notify_share() returns trigger
language plpgsql security definer set search_path = public as $$
declare b record; m record; gname text; line text;
begin
  select title, owner into b from shared_books where id = new.book_id;
  if new.to_user is not null then
    perform mail_person(new.to_user, 'notify', person_name(b.owner) || ' שיתפה איתך חוברת צביעה',
      '<b>' || html_esc(person_name(b.owner)) || '</b> שיתפה איתך את החוברת <b>' || html_esc(b.title) || '</b>. היא מחכה לך ב"שותפו איתי".', 'לפתוח את החוברת');
  else
    select icon || ' ' || name into gname from groups where id = new.to_group;
    line := '<b>' || html_esc(person_name(b.owner)) || '</b> שיתפה את החוברת <b>' || html_esc(b.title) || '</b> בקבוצה <b>' || html_esc(gname) || '</b>.';
    for m in select user_id from group_members where group_id = new.to_group and user_id <> b.owner loop
      perform mail_person(m.user_id, 'notify', person_name(b.owner) || ' שיתפה חוברת בקבוצה', line, 'לפתוח את החוברת');
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists notify_share on public.book_shares;
create trigger notify_share after insert on public.book_shares for each row execute function public.notify_share();

-- ───────── group chat (only for whoever turned it on, once per half hour per group) ─────────
create or replace function public.notify_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare m record; gname text; preview text;
begin
  select icon || ' ' || name into gname from groups where id = new.group_id;
  preview := left(coalesce(nullif(new.body, ''), '📚 חוברת'), 140);
  for m in select gm.user_id from group_members gm join profiles p on p.id = gm.user_id
           where gm.group_id = new.group_id and gm.user_id <> new.sender and p.email_chat loop
    if exists (select 1 from notify_log where user_id = m.user_id and group_id = new.group_id and sent_at > now() - interval '30 minutes') then continue; end if;
    insert into notify_log (user_id, group_id, sent_at) values (m.user_id, new.group_id, now())
      on conflict (user_id, group_id) do update set sent_at = excluded.sent_at;
    perform mail_person(m.user_id, 'chat', 'הודעה חדשה בקבוצה ' || gname,
      '<b>' || html_esc(person_name(new.sender)) || '</b> כתבה בקבוצה <b>' || html_esc(gname) || '</b>:<br><i>' || html_esc(preview) || '</i>', 'לקרוא בקבוצה');
  end loop;
  return new;
end $$;
drop trigger if exists notify_message on public.messages;
create trigger notify_message after insert on public.messages for each row execute function public.notify_message();
