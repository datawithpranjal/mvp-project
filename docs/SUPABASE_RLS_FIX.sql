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
alter table if exists public.premium_purchase_records enable row level security;
alter table if exists public.user_usage_events enable row level security;

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
    'premium_payment_requests',
    'premium_purchase_records',
    'user_usage_events'
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

-- 4. Keep verified payment history append-only.
-- The current access entitlement can update in premium_access_grants, but payment
-- records should never be edited or deleted after successful verification.
create or replace function public.prevent_premium_purchase_record_mutation()
returns trigger as $$
begin
  raise exception 'premium_purchase_records is append-only. Insert a new payment record instead of updating or deleting payment history.';
end;
$$ language plpgsql;

do $$
begin
  if to_regclass('public.premium_purchase_records') is not null then
    drop trigger if exists premium_purchase_records_no_update_delete
    on public.premium_purchase_records;

    create trigger premium_purchase_records_no_update_delete
    before update or delete on public.premium_purchase_records
    for each row
    execute function public.prevent_premium_purchase_record_mutation();
  end if;
end $$;

-- 5. Confirm there are no backend-owned tables left with RLS disabled.
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
    'premium_payment_requests',
    'premium_purchase_records',
    'user_usage_events'
  )
order by tablename;
