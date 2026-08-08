-- Padhai Yatra / Mero Basket Supabase schema
-- Run this in Supabase SQL Editor after creating a project.
-- Tables are protected with RLS and scoped to the signed-in user.

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
  room_id uuid references public.study_rooms(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  status text not null default 'invited',
  created_at timestamptz not null default now()
);

create table if not exists public.study_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.study_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.study_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  score int not null default 0,
  total int not null default 5,
  difficulty text not null default 'Normal',
  created_at timestamptz not null default now()
);

alter table public.study_rooms enable row level security;
alter table public.study_invites enable row level security;
alter table public.study_messages enable row level security;
alter table public.group_quiz_attempts enable row level security;

create policy "room owners can manage rooms"
on public.study_rooms
for all
to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

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
using (
  exists (
    select 1 from public.study_rooms
    where study_rooms.id = study_messages.room_id
      and (
        study_rooms.owner_id = (select auth.uid())
        or exists (
          select 1 from public.study_invites
          where study_invites.room_id = study_rooms.id
            and lower(study_invites.invitee_email) = lower((select auth.jwt() ->> 'email'))
        )
      )
  )
);

create policy "users can send their own room messages"
on public.study_messages
for insert
to authenticated
with check ((select auth.uid()) = sender_id);

create policy "users can manage own quiz attempts"
on public.group_quiz_attempts
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

