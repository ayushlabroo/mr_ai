-- Run AFTER the migration in the empty MrAI project. All fixture data rolls back.
begin;
insert into auth.users(id, email) values
 ('11111111-1111-4111-8111-111111111111', 'mrai-isolation-a@example.invalid'),
 ('22222222-2222-4222-8222-222222222222', 'mrai-isolation-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select public.save_workspace(0, '[]'::jsonb);
do $$ begin
  if (select count(*) from public.workspaces) <> 1 then raise exception 'Owner cannot read workspace'; end if;
  begin
    perform public.save_workspace(0, '[]'::jsonb);
    raise exception 'Stale write was accepted';
  exception when serialization_failure then null;
  end;
  begin
    update public.workspaces set tasks = '[]'::jsonb;
    raise exception 'Direct write was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
do $$ begin
  if exists(select 1 from public.workspaces) then raise exception 'Cross-user data leaked'; end if;
end $$;
select public.save_workspace(0, '[]'::jsonb);
do $$ begin
  if (select count(*) from public.workspaces) <> 1 then raise exception 'User B isolation failed'; end if;
  begin
    perform public.save_workspace(1, '{}'::jsonb);
    raise exception 'Invalid payload was accepted';
  exception when check_violation then null;
  end;
end $$;
set local role anon;
do $$ begin
  begin
    perform public.save_workspace(0, '[]'::jsonb);
    raise exception 'Anonymous write was accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.workspaces;
    raise exception 'Anonymous read was accepted';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
select 'PASS: owner access, cross-user isolation, stale writes, direct writes, payload bounds, anonymous access; fixtures rolled back' as verification;
