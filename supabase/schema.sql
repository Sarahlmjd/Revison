-- À coller dans Supabase > SQL Editor > New query, puis « Run ».

create table if not exists public.plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  state      jsonb,
  -- jeton secret du lien calendrier (.ics)
  ics_token  text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

-- Chaque personne ne voit et ne modifie que sa propre ligne.
drop policy if exists "lire mon plan" on public.plans;
create policy "lire mon plan" on public.plans for select using (auth.uid() = user_id);

drop policy if exists "créer mon plan" on public.plans;
create policy "créer mon plan" on public.plans for insert with check (auth.uid() = user_id);

drop policy if exists "modifier mon plan" on public.plans;
create policy "modifier mon plan" on public.plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
