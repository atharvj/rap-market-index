-- Block common disposable-email providers before Supabase creates an auth user.
-- After running this migration, enable public.hook_reject_disposable_email as
-- the Authentication > Hooks > Before User Created hook in the dashboard.

create table if not exists public.blocked_signup_email_domains (
  domain text primary key,
  reason text not null default 'Disposable email provider',
  created_at timestamptz not null default now(),
  constraint blocked_signup_email_domains_normalized_check
    check (domain = lower(trim(domain)) and domain !~ '[@[:space:]]')
);

alter table public.blocked_signup_email_domains enable row level security;

revoke all on table public.blocked_signup_email_domains from public, anon, authenticated;
grant select on table public.blocked_signup_email_domains to service_role;

insert into public.blocked_signup_email_domains (domain) values
  ('10minutemail.com'),
  ('discard.email'),
  ('dispostable.com'),
  ('emailondeck.com'),
  ('fakeinbox.com'),
  ('getnada.com'),
  ('grr.la'),
  ('guerrillamail.com'),
  ('guerrillamailblock.com'),
  ('mail.tm'),
  ('maildrop.cc'),
  ('mailinator.com'),
  ('minuteinbox.com'),
  ('mohmal.com'),
  ('sharklasers.com'),
  ('spamgourmet.com'),
  ('temp-mail.org'),
  ('tempail.com'),
  ('tempmail.com'),
  ('throwawaymail.com'),
  ('trashmail.com'),
  ('yopmail.com')
on conflict (domain) do nothing;

create or replace function public.hook_reject_disposable_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_domain text;
begin
  email_domain := lower(trim(split_part(coalesce(event->'user'->>'email', ''), '@', 2)));

  if email_domain <> '' and exists (
    select 1
    from public.blocked_signup_email_domains blocked
    where email_domain = blocked.domain
       or email_domain like '%.' || blocked.domain
  ) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Use a permanent email address. Temporary email services are not allowed.',
        'http_code', 403
      )
    );
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_reject_disposable_email(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_reject_disposable_email(jsonb) from authenticated, anon, public;
