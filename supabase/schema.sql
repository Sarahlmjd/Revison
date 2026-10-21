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

-- Flux calendrier : lecture d'un plan par son jeton secret, sans clé serveur.
-- La fonction ne renvoie que l'état du plan dont le jeton correspond exactement.
create or replace function public.plan_by_ics_token(t text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select state from public.plans where ics_token = t and length(t) >= 32 limit 1;
$$;
revoke all on function public.plan_by_ics_token(text) from public;
grant execute on function public.plan_by_ics_token(text) to anon, authenticated;
