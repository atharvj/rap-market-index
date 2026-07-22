begin;

create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  category text not null,
  message text not null,
  contact_email text,
  status text not null default 'new',
  created_at timestamptz not null default clock_timestamp(),
  constraint user_feedback_category_check
    check (category in ('bug', 'data', 'account', 'idea', 'other')),
  constraint user_feedback_message_length_check
    check (char_length(message) between 15 and 4000),
  constraint user_feedback_contact_email_length_check
    check (contact_email is null or char_length(contact_email) between 3 and 254),
  constraint user_feedback_status_check
    check (status in ('new', 'reviewed', 'resolved'))
);

create index if not exists user_feedback_created_at_idx
  on public.user_feedback (created_at desc);

create index if not exists user_feedback_user_created_at_idx
  on public.user_feedback (user_id, created_at desc)
  where user_id is not null;

alter table public.user_feedback enable row level security;

-- Feedback is written and reviewed only through server-side service-role code.
-- Deliberately create no anon or authenticated RLS policies.
revoke all on table public.user_feedback from public, anon, authenticated;
grant all on table public.user_feedback to service_role;

notify pgrst, 'reload schema';

commit;
