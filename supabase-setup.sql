create extension if not exists pgcrypto;

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  template text not null default 'simple'
    check (template in ('simple', 'modern', 'creative')),
  profile jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portfolios_user_id_updated_at_idx
  on public.portfolios (user_id, updated_at desc);

alter table public.portfolios enable row level security;

drop policy if exists "Public portfolios are viewable and owners can view theirs"
  on public.portfolios;
create policy "Public portfolios are viewable and owners can view theirs"
  on public.portfolios for select
  to anon, authenticated
  using (is_public or (select auth.uid()) = user_id);

drop policy if exists "Owners can create portfolios"
  on public.portfolios;
create policy "Owners can create portfolios"
  on public.portfolios for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can update portfolios"
  on public.portfolios;
create policy "Owners can update portfolios"
  on public.portfolios for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owners can delete portfolios"
  on public.portfolios;
create policy "Owners can delete portfolios"
  on public.portfolios for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.portfolios to anon, authenticated;
grant insert, update, delete on public.portfolios to authenticated;

create or replace function public.set_portfolio_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_portfolio_updated_at on public.portfolios;
create trigger set_portfolio_updated_at
  before update on public.portfolios
  for each row execute function public.set_portfolio_updated_at();
