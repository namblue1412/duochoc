-- Run once in the SQL Editor of your Supabase project.
-- Only these two functions are public; the table cannot be listed or modified.
begin;
create table if not exists public.quiz_shares (
  id text primary key default translate(rtrim(encode(uuid_send(gen_random_uuid()), 'base64'), '='), '+/', '-_'),
  quiz jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  constraint quiz_share_size check (octet_length(quiz::text) <= 5242880)
);
alter table public.quiz_shares enable row level security;
revoke all on public.quiz_shares from public, anon, authenticated;

create or replace function public.create_quiz_share(p_quiz jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare share_id text;
begin
  if p_quiz is null or jsonb_typeof(p_quiz) <> 'object'
     or jsonb_typeof(p_quiz->'meta') is distinct from 'object'
     or jsonb_typeof(p_quiz->'questions') is distinct from 'array' then
    raise exception 'Invalid quiz structure';
  end if;
  if jsonb_array_length(p_quiz->'questions') not between 1 and 1000
     or octet_length(p_quiz::text) > 5242880 then
    raise exception 'Quiz exceeds limits';
  end if;
  -- Only the quiz is persisted, never answers or scores from the browser.
  insert into public.quiz_shares(quiz) values (p_quiz) returning id into share_id;
  return share_id;
end;
$$;

create or replace function public.read_quiz_share(p_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select quiz from public.quiz_shares
  where id = p_id and expires_at > now() and p_id ~ '^[A-Za-z0-9_-]{22}$';
$$;

revoke all on function public.create_quiz_share(jsonb) from public;
revoke all on function public.read_quiz_share(text) from public;
grant execute on function public.create_quiz_share(jsonb) to anon, authenticated;
grant execute on function public.read_quiz_share(text) to anon, authenticated;
commit;
