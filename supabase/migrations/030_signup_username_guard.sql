begin;

-- Keep the already-configured Before User Created hook name, but also reject a
-- selected username before Supabase creates the auth user or sends confirmation.
create or replace function public.hook_reject_disposable_email(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  email_domain text;
  requested_username text;
  username_was_selected boolean;
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

  username_was_selected := coalesce(
    event->'user'->'user_metadata'->>'username_is_user_selected',
    'false'
  ) = 'true';
  requested_username := regexp_replace(
    trim(coalesce(event->'user'->'user_metadata'->>'username', '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if username_was_selected then
    if char_length(requested_username) not between 2 and 32
       or requested_username !~ '^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$' then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'Use 2-32 characters: letters, numbers, spaces, periods, hyphens, or underscores.',
          'http_code', 422
        )
      );
    end if;

    if exists (
      select 1
      from public.profiles profile
      where lower(profile.username) = lower(requested_username)
    ) then
      return jsonb_build_object(
        'error', jsonb_build_object(
          'message', 'That username is already taken.',
          'http_code', 409
        )
      );
    end if;
  end if;

  return '{}'::jsonb;
end;
$$;

grant execute on function public.hook_reject_disposable_email(jsonb)
  to supabase_auth_admin;
revoke execute on function public.hook_reject_disposable_email(jsonb)
  from authenticated, anon, public;

commit;
