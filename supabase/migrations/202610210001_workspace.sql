begin;

create table public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tasks jsonb not null default '[]'::jsonb,
  revision bigint not null default 1 check (revision between 1 and 9007199254740991),
  updated_at timestamptz not null default now(),
  constraint bounded_tasks check (
    case when jsonb_typeof(tasks) = 'array' then
      jsonb_array_length(tasks) <= 30 and octet_length(tasks::text) <= 3600000
    else false end
  )
);
alter table public.workspaces enable row level security;
create policy own_workspace on public.workspaces for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.workspaces from public, anon, authenticated;
grant select on public.workspaces to authenticated;

-- All writes use this compare-and-swap. A stale tab cannot overwrite newer work.
-- No caller-provided owner ID is accepted. No metering or paid dispatch here.
create function public.save_workspace(expected_revision bigint, next_tasks jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  current_revision bigint;
begin
  if owner_id is null then raise insufficient_privilege; end if;
  if expected_revision is null or expected_revision < 0 or next_tasks is null then
    raise invalid_parameter_value;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select revision into current_revision from public.workspaces where user_id = owner_id;
  if coalesce(current_revision, 0) <> expected_revision then
    raise exception 'Workspace changed' using errcode = '40001';
  end if;
  insert into public.workspaces(user_id, tasks, revision) values (owner_id, next_tasks, 1)
    on conflict (user_id) do update set tasks = next_tasks,
      revision = public.workspaces.revision + 1, updated_at = now();
  return pg_catalog.jsonb_build_object('revision', expected_revision + 1);
end;
$$;
revoke all on function public.save_workspace(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_workspace(bigint, jsonb) to authenticated;

commit;
