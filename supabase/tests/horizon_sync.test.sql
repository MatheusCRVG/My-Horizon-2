-- Run against a disposable local Supabase database, never with real users.
-- Fixtures, helper functions and every write are rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

do $$ begin
  if exists (select 1 from auth.users where id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')) then
    raise exception 'Test-only identity already exists; use a fresh local database';
  end if;
end $$;
insert into auth.users(id, email) values
  ('11111111-1111-4111-8111-111111111111', 'horizon-fixture-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'horizon-fixture-b@example.invalid');

create schema horizon_test;
grant usage on schema horizon_test to authenticated, anon;
create function horizon_test.header(p_vault uuid default 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_owner text default 'legacy-google-sub-a')
returns jsonb language sql immutable as $$
  select jsonb_build_object('format','financeiro5','version',1,'vaultId',p_vault::text,'owner',p_owner,
    'password',jsonb_build_object('rounds',600000,'salt',encode(repeat('s',16)::bytea,'base64'),'iv',encode(repeat('v',12)::bytea,'base64'),'cipher',encode(repeat('k',48)::bytea,'base64')),
    'recovery',jsonb_build_object('rounds',600000,'salt',encode(repeat('r',16)::bytea,'base64'),'iv',encode(repeat('w',12)::bytea,'base64'),'cipher',encode(repeat('z',48)::bytea,'base64')));
$$;
create function horizon_test.payload(p_header jsonb, p_marker text default 'x')
returns jsonb language sql immutable as $$
  select p_header || jsonb_build_object('iv',encode(repeat('i',12)::bytea,'base64'),'cipher',replace(encode(repeat(p_marker,64)::bytea,'base64'),E'\n',''));
$$;
create function horizon_test.operations(p_ids integer[], p_header jsonb default horizon_test.header())
returns jsonb language sql immutable as $$
  select coalesce(jsonb_agg(jsonb_build_object('op_id','00000000-0000-4000-8000-'||lpad(i::text,12,'0'),'payload',horizon_test.payload(p_header)) order by i),'[]'::jsonb) from unnest(p_ids) i;
$$;
create function horizon_test.big_operations(p_ids integer[], p_chars integer)
returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_set(value,'{payload,cipher}',to_jsonb(repeat('A',p_chars))))
  from jsonb_array_elements(horizon_test.operations(p_ids));
$$;
grant execute on all functions in schema horizon_test to authenticated, anon;

select has_table('public','horizon_vaults','vault table exists');
select has_table('public','horizon_operations','immutable operation table exists');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.horizon_vaults'::regclass),'vault RLS is enabled and forced');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.horizon_operations'::regclass),'operation RLS is enabled and forced');
select ok(not has_table_privilege('authenticated','public.horizon_operations','INSERT'),'clients cannot insert operations directly');
select ok(not has_table_privilege('authenticated','public.horizon_operations','UPDATE'),'clients cannot rewrite operations');
select ok(not has_table_privilege('authenticated','public.horizon_operations','DELETE'),'clients cannot erase operations');
select ok(not has_table_privilege('authenticated','public.horizon_operations','TRUNCATE'),'clients cannot truncate operations');
select ok(not has_table_privilege('anon','public.horizon_vaults','SELECT'),'anonymous users cannot read headers');
select ok(not has_function_privilege('anon','public.horizon_bootstrap()','EXECUTE'),'anonymous bootstrap is not exposed');
select ok(not has_function_privilege('service_role','public.horizon_exchange(uuid,jsonb,jsonb,bigint,integer)','EXECUTE'),'service role is not an application RPC entry point');
select ok(not has_schema_privilege('authenticated','horizon_private','USAGE'),'private helpers are not client entry points');

set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.horizon_bootstrap(),null::jsonb,'new identity has no invented vault');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array[1]),0,100)->>'cursor')::bigint,1::bigint,'first upload creates sequence one');
select is((select header->>'owner' from public.horizon_vaults),'legacy-google-sub-a','cryptographic legacy owner is preserved separately from auth.uid');
select is((select user_id::text from public.horizon_vaults),'11111111-1111-4111-8111-111111111111','database owner comes from auth.uid');
select is((public.horizon_bootstrap()->>'vault_id'),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bootstrap returns the own vault identifier');
select is(jsonb_array_length(public.horizon_bootstrap()->'operations'),1,'a new device receives encrypted operations');
select ok(exists(select 1 from pg_locks where locktype='advisory' and pid=pg_backend_pid() and granted),'per-user lock remains held until the transaction ends');

select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array[1]),0,100)->>'cursor')::bigint,1::bigint,'exact replay does not allocate a new sequence');
select is((select count(*) from public.horizon_operations),1::bigint,'exact replay stores one operation');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000001','payload',horizon_test.payload(horizon_test.header(),'different'))),0,100)$sql$,'HV003',null,'same op_id with different ciphertext is rejected');
select is((select count(*) from public.horizon_operations),1::bigint,'collision does not change the history');

select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array[2,3,4]),0,2)->>'cursor')::bigint,2::bigint,'page cursor stops at last returned operation, not latest upload');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',0,2)->>'has_more')::boolean,true,'first prefix reports additional operations');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',2,2)->'operations'->0->>'seq')::bigint,3::bigint,'second page starts after the acknowledged prefix');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',2,2)->>'cursor')::bigint,4::bigint,'second page ends at four');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',4,2)->>'has_more')::boolean,false,'empty tail has no more data');
select is(jsonb_array_length(public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',4,2)->'operations'),0,'already consumed prefix is not returned again');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',5,100)$sql$,'HV004',null,'cursor cannot run ahead of committed server history');

select throws_ok($sql$select public.horizon_exchange('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',horizon_test.header('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),'[]',0,100)$sql$,'HV002',null,'setup cannot overwrite an existing vault with a different one');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','different-owner'),'[]',0,100)$sql$,'HV002',null,'owner AAD cannot be overwritten');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',jsonb_set(horizon_test.header(),'{password,salt}','"AAAAAAAAAAAAAAAAAAAAAA=="'),'[]',0,100)$sql$,'HV002',null,'key wraps cannot be overwritten');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header()||'{"iv":"extra"}'::jsonb,'[]',0,100)$sql$,'HV001',null,'header cannot contain document iv or extra keys');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header()||'{"format":"wrong"}'::jsonb,'[]',0,100)$sql$,'HV001',null,'unsupported encrypted format is rejected');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header()||'{"version":2}'::jsonb,'[]',0,100)$sql$,'HV001',null,'unsupported encrypted version is rejected');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header())||'{"owner":"different"}'::jsonb)),0,100)$sql$,'HV001',null,'payload owner must match the registered header');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header())||'{"vaultId":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}'::jsonb)),0,100)$sql$,'HV001',null,'payload vault must match the registered header');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','not-a-uuid','payload',horizon_test.payload(horizon_test.header()))),0,100)$sql$,'HV001',null,'operation identifier must be a UUID');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header())||'{"cipher":"not-base64"}'::jsonb)),0,100)$sql$,'HV001',null,'ciphertext must be canonical base64');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header())||jsonb_build_object('cipher',repeat('A',8388612)))),0,100)$sql$,'HV001',null,'ciphertext size is bounded');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'{}',0,100)$sql$,'HV001',null,'operation list must be an array');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array(select generate_series(5,25))),0,100)$sql$,'HV001',null,'upload count is bounded');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',0,0)$sql$,'HV001',null,'page size zero is invalid');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',0,101)$sql$,'HV001',null,'page size is bounded');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',-1,100)$sql$,'HV001',null,'negative cursors are invalid');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header()),'user_id','22222222-2222-4222-8222-222222222222')),0,100)$sql$,'HV001',null,'a client cannot submit an operation user_id');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),jsonb_build_array(jsonb_build_object('op_id','00000000-0000-4000-8000-000000000005','payload',horizon_test.payload(horizon_test.header())||'{"user_id":"22222222-2222-4222-8222-222222222222"}'::jsonb)),0,100)$sql$,'HV001',null,'unrecognized payload ownership fields are rejected');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array[5])||'[{"op_id":"bad","payload":{}}]'::jsonb,0,100)$sql$,'HV001',null,'a bad operation rolls back the whole submitted batch');
select is((select count(*) from public.horizon_operations),4::bigint,'failed batch leaves no partial operation');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.operations(array[5]),4,100)->'operations'->0->>'seq')::bigint,5::bigint,'next committed operation has no sequence gap after rollback');
select throws_ok($sql$insert into public.horizon_operations(user_id,vault_id,op_id,seq,payload) values(auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','00000000-0000-4000-8000-000000000099',99,horizon_test.payload(horizon_test.header()))$sql$,'42501',null,'direct insert cannot bypass exchange ordering');
select throws_ok($sql$update public.horizon_operations set payload='{}'$sql$,'42501',null,'direct update is prohibited');
select throws_ok($sql$delete from public.horizon_operations$sql$,'42501',null,'direct deletion is prohibited');

-- Three individually valid photo-sized envelopes exceed one response page.
-- The client must receive a complete prefix rather than the latest seq.
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.big_operations(array[6,7],5800000),5,1)->>'cursor')::bigint,6::bigint,'large envelopes can be uploaded while returning one prefix item');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.big_operations(array[8],5800000),6,1)->>'cursor')::bigint,7::bigint,'upload acknowledgement does not jump past a pending page');
select is(jsonb_array_length(public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',5,100)->'operations'),2,'page byte budget returns only the first two large payloads');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',5,100)->>'cursor')::bigint,7::bigint,'byte-limited page cursor is the actual returned prefix');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',5,100)->>'has_more')::boolean,true,'byte-limited page reports the remaining operation');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',7,100)->>'cursor')::bigint,8::bigint,'next page retrieves the remaining large envelope');
select is((public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',8,100)->>'has_more')::boolean,false,'large-envelope pagination finishes without omissions');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),horizon_test.big_operations(array[9,10],8388608),8,100)$sql$,'HV001',null,'aggregate batch bytes are bounded even when individual ciphers fit');
select is((select max(seq) from public.horizon_operations),8::bigint,'oversized batch cannot consume a sequence or leave rows');

set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*) from public.horizon_vaults),0::bigint,'second identity cannot read first identity header');
select is((select count(*) from public.horizon_operations),0::bigint,'second identity cannot read first identity history');
select is(public.horizon_bootstrap(),null::jsonb,'bootstrap does not discover another identity vault');
select throws_ok($sql$select public.horizon_exchange('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',horizon_test.header(),'[]',0,100)$sql$,'HV002',null,'another identity cannot register or attach the first vault');
select is((select count(*) from public.horizon_vaults),0::bigint,'failed attachment leaves no partial vault');
select is((public.horizon_exchange('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',horizon_test.header('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','legacy-google-sub-b'),horizon_test.operations(array[1],horizon_test.header('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','legacy-google-sub-b')),0,100)->>'cursor')::bigint,1::bigint,'second user has an independent sequence and op_id namespace');
select is(jsonb_array_length(public.horizon_bootstrap()->'operations'),1,'second user bootstrap contains only own operation');
select is((select count(*) from public.horizon_operations where user_id='11111111-1111-4111-8111-111111111111'),0::bigint,'RLS blocks an explicit predicate targeting another identity');

reset role;
select throws_ok($sql$update public.horizon_operations set payload=payload where user_id='11111111-1111-4111-8111-111111111111'$sql$,'55000',null,'immutability trigger also protects accidental privileged updates');
select throws_ok($sql$delete from public.horizon_operations where user_id='11111111-1111-4111-8111-111111111111'$sql$,'55000',null,'immutability trigger protects privileged deletes');
select throws_ok($sql$truncate public.horizon_operations$sql$,'55000',null,'immutability trigger protects truncation');
select throws_ok($sql$update public.horizon_vaults set header=header where user_id='11111111-1111-4111-8111-111111111111'$sql$,'55000',null,'vault header is immutable even to accidental privileged updates');

set local role authenticated;
set local request.jwt.claim.sub = '';
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($sql$select public.horizon_bootstrap()$sql$,'42501',null,'authenticated role without an identity is rejected');
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($sql$select public.horizon_bootstrap()$sql$,'42501',null,'anonymous bootstrap is denied by function privileges');
select throws_ok($sql$select * from public.horizon_vaults$sql$,'42501',null,'anonymous direct read is denied');
reset role;
select * from finish();
rollback;
