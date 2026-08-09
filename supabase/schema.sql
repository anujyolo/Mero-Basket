-- Padhai Yatra / Mero Basket Supabase schema
-- Run this in Supabase SQL Editor after creating a project.
-- Tables are protected with RLS and scoped to the signed-in user.
-- Safe to re-run: every statement is idempotent.

create table if not exists public.study_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  room_code text not null unique,
  topic text not null,
  mode text not null default 'Competition',
  created_at timestamptz not null default now()
);

create table if not exists public.study_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  status text not null default 'invited',
  created_at timestamptz not null default now()
);

create table if not exists public.study_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  score int not null default 0,
  total int not null default 5,
  difficulty text not null default 'Normal',
  created_at timestamptz not null default now()
);

-- The same student can only hold one invite per room, so re-inviting a friend
-- updates the existing row instead of stacking duplicates in the participant list.
create unique index if not exists study_invites_room_email_key
  on public.study_invites (room_id, lower(invitee_email));

-- Every index below backs a lookup that RLS itself performs on each row check.
-- Without them the policies fall back to sequential scans on all four tables.
create index if not exists study_rooms_owner_id_idx on public.study_rooms (owner_id);
create index if not exists study_invites_room_id_idx on public.study_invites (room_id);
create index if not exists study_invites_email_idx on public.study_invites (lower(invitee_email));
create index if not exists study_messages_room_created_idx on public.study_messages (room_id, created_at desc);
create index if not exists group_quiz_attempts_room_idx on public.group_quiz_attempts (room_id);

alter table public.study_rooms enable row level security;
alter table public.study_invites enable row level security;
alter table public.study_messages enable row level security;
alter table public.group_quiz_attempts enable row level security;

-- Membership test shared by the message and quiz-attempt policies.
--
-- It has to be security definer: a policy on study_messages that inlined this
-- lookup would re-enter the study_rooms policies for every row, and those in
-- turn read study_invites, so each message check would cost two more policy
-- evaluations. Running the lookup as the definer settles membership once.
-- search_path is pinned to empty so the fully qualified names below cannot be
-- shadowed by a caller-controlled schema.
create or replace function public.is_room_participant(target_room uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.study_rooms r
    where r.id = target_room
      and (
        r.owner_id = auth.uid()
        or exists (
          select 1
          from public.study_invites i
          where i.room_id = r.id
            and lower(i.invitee_email) = lower(auth.jwt() ->> 'email')
        )
      )
  );
$$;

revoke execute on function public.is_room_participant(uuid) from public, anon;
grant execute on function public.is_room_participant(uuid) to authenticated;

drop policy if exists "room owners can manage rooms" on public.study_rooms;
drop policy if exists "invited users can read rooms" on public.study_rooms;
drop policy if exists "users can manage invites they send" on public.study_invites;
drop policy if exists "invited users can read their invites" on public.study_invites;
drop policy if exists "room participants can read messages" on public.study_messages;
drop policy if exists "users can send their own room messages" on public.study_messages;
drop policy if exists "room participants send messages" on public.study_messages;
drop policy if exists "users can manage own quiz attempts" on public.group_quiz_attempts;
drop policy if exists "participants read room quiz attempts" on public.group_quiz_attempts;
drop policy if exists "users record their own quiz attempts" on public.group_quiz_attempts;

create policy "room owners can manage rooms"
on public.study_rooms
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- Kept inline rather than routed through is_room_participant: this policy is on
-- study_rooms itself, so calling a helper that reads study_rooms would recurse.
create policy "invited users can read rooms"
on public.study_rooms
for select
to authenticated
using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.study_invites
    where study_invites.room_id = study_rooms.id
      and lower(study_invites.invitee_email) = lower((select auth.jwt() ->> 'email'))
  )
);

create policy "users can manage invites they send"
on public.study_invites
for all
to authenticated
using ((select auth.uid()) = inviter_id)
with check ((select auth.uid()) = inviter_id);

create policy "invited users can read their invites"
on public.study_invites
for select
to authenticated
using (
  lower(invitee_email) = lower((select auth.jwt() ->> 'email'))
  or (select auth.uid()) = inviter_id
);

create policy "room participants can read messages"
on public.study_messages
for select
to authenticated
using (public.is_room_participant(room_id));

-- Sender identity alone is not enough. Checking only auth.uid() = sender_id lets
-- any signed-in student post into a room they were never invited to, as long as
-- they know the room id.
create policy "room participants send messages"
on public.study_messages
for insert
to authenticated
with check (
  (select auth.uid()) = sender_id
  and public.is_room_participant(room_id)
);

-- A group quiz needs a shared leaderboard, so participants read every attempt in
-- their room. Scoping reads to auth.uid() = user_id would show each student only
-- their own score and the leaderboard could never populate.
create policy "participants read room quiz attempts"
on public.group_quiz_attempts
for select
to authenticated
using (public.is_room_participant(room_id));

-- Writes stay first-person: you can only record a score under your own id, and
-- only in a room you belong to.
create policy "users record their own quiz attempts"
on public.group_quiz_attempts
for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and public.is_room_participant(room_id)
);
