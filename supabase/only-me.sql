-- Réserve l'appli aux adresses autorisées : toute autre inscription est refusée par la base.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ».
create or replace function public.only_owner_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) not in ('lamjadabsarah@gmail.com', 'wiame.lamjadab.pro@gmail.com') then
    raise exception 'Inscriptions fermées';
  end if;
  return new;
end;
$$;

drop trigger if exists only_owner_signup on auth.users;
create trigger only_owner_signup
  before insert on auth.users
  for each row execute function public.only_owner_signup();
