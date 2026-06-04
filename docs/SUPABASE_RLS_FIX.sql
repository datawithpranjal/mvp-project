-- The Data Foundry Supabase RLS hardening script.
--
-- Run this once in Supabase Dashboard -> SQL Editor for the production project.
-- It enables Row-Level Security on backend-owned public tables that should never
-- be accessed directly from the browser.

-- 1. Check which public tables still have RLS disabled.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and rowsecurity = false
order by tablename;

-- 2. Enable RLS on existing backend-owned tables.
alter table if exists public.email_captures enable row level security;
alter table if exists public.playground_users enable row level security;
alter table if exists public.auth_otps enable row level security;
alter table if exists public.auth_sessions enable row level security;
alter table if exists public.auth_otp_attempts enable row level security;
alter table if exists public.premium_access_grants enable row level security;
alter table if exists public.premium_payment_requests enable row level security;

-- 3. Defense-in-depth: remove direct table privileges from Supabase browser roles.
-- The FastAPI backend uses the server-side Postgres connection string and should
-- remain able to read/write these tables. Do not create anon/authenticated
-- policies for these private backend tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'email_captures',
    'playground_users',
    'auth_otps',
    'auth_sessions',
    'auth_otp_attempts',
    'premium_access_grants',
    'premium_payment_requests'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is not null then
      if to_regrole('anon') is not null then
        execute format('revoke all on table public.%I from anon', table_name);
      end if;

      if to_regrole('authenticated') is not null then
        execute format('revoke all on table public.%I from authenticated', table_name);
      end if;
    end if;
  end loop;
end $$;

-- 4. Confirm there are no backend-owned tables left with RLS disabled.
select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in (
    'email_captures',
    'playground_users',
    'auth_otps',
    'auth_sessions',
    'auth_otp_attempts',
    'premium_access_grants',
    'premium_payment_requests'
  )
order by tablename;
