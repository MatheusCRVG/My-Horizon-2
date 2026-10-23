-- One E2EE vault per Supabase identity. The cryptographic owner is an immutable
-- AAD value, possibly a legacy Google sub; it is NOT the authorization identity.
create schema if not exists horizon_private;
revoke all on schema horizon_private from public, anon, authenticated;

create function horizon_private.valid_base64(p_value text, p_bytes integer default null)
returns boolean
language plpgsql immutable parallel safe
set search_path = ''
as $$
declare v_decoded bytea;
begin
  if p_value is null or p_value = '' or
     p_value !~ '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$' then
    return false;
  end if;
  v_decoded := pg_catalog.decode(p_value, 'base64');
  return (p_bytes is null or pg_catalog.octet_length(v_decoded) = p_bytes)
    and pg_catalog.replace(pg_catalog.encode(v_decoded, 'base64'), E'\n', '') = p_value;
exception when invalid_parameter_value or data_exception then
  return false;
end;
$$;

create function horizon_private.valid_wrap(p_wrap jsonb)
returns boolean
language plpgsql immutable parallel safe
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_wrap) is distinct from 'object' then return false; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_wrap)) <> 4 then return false; end if;
  return p_wrap -> 'rounds' = '600000'::jsonb
    and pg_catalog.jsonb_typeof(p_wrap -> 'salt') = 'string'
    and pg_catalog.jsonb_typeof(p_wrap -> 'iv') = 'string'
    and pg_catalog.jsonb_typeof(p_wrap -> 'cipher') = 'string'
    and horizon_private.valid_base64(p_wrap ->> 'salt', 16)
    and horizon_private.valid_base64(p_wrap ->> 'iv', 12)
    and horizon_private.valid_base64(p_wrap ->> 'cipher', 48);
end;
$$;

create function horizon_private.valid_header(p_header jsonb, p_vault_id uuid)
returns boolean
language plpgsql immutable parallel safe
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_header) is distinct from 'object' or p_vault_id is null then return false; end if;
  if pg_catalog.octet_length(p_header::text) > 8192 or
     (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_header)) <> 6 then return false; end if;
  return coalesce(
    p_header ->> 'format' = 'financeiro5'
    and p_header -> 'version' = '1'::jsonb
    and pg_catalog.jsonb_typeof(p_header -> 'vaultId') = 'string'
    and p_header ->> 'vaultId' = p_vault_id::text
    and pg_catalog.jsonb_typeof(p_header -> 'owner') = 'string'
    and pg_catalog.char_length(p_header ->> 'owner') between 1 and 512
    and horizon_private.valid_wrap(p_header -> 'password')
    and horizon_private.valid_wrap(p_header -> 'recovery'), false);
end;
$$;

create function horizon_private.valid_payload(p_payload jsonb, p_header jsonb)
returns boolean
language plpgsql immutable parallel safe
set search_path = ''
as $$
begin
  if pg_catalog.jsonb_typeof(p_payload) is distinct from 'object' then return false; end if;
  if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(p_payload)) <> 8
     or pg_catalog.octet_length(p_payload::text) > 8400000 then return false; end if;
  return coalesce(
    (p_payload - 'iv' - 'cipher') = p_header
    and pg_catalog.jsonb_typeof(p_payload -> 'iv') = 'string'
    and horizon_private.valid_base64(p_payload ->> 'iv', 12)
    and pg_catalog.jsonb_typeof(p_payload -> 'cipher') = 'string'
    and pg_catalog.octet_length(p_payload ->> 'cipher') between 24 and 8388608
    and horizon_private.valid_base64(p_payload ->> 'cipher'),
    false);
end;
$$;

create table public.horizon_vaults (
  user_id uuid primary key references auth.users(id) on delete restrict,
  vault_id uuid not null unique,
  header jsonb not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint horizon_vaults_identity unique (user_id, vault_id),
  constraint horizon_vaults_header_valid check (horizon_private.valid_header(header, vault_id))
);

create table public.horizon_operations (
  user_id uuid not null,
  vault_id uuid not null,
  op_id uuid not null,
  seq bigint not null check (seq > 0 and seq <= 9007199254740991),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object' and pg_catalog.octet_length(payload::text) <= 8400000),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (user_id, op_id),
  constraint horizon_operations_sequence unique (user_id, seq),
  constraint horizon_operations_vault foreign key (user_id, vault_id)
    references public.horizon_vaults(user_id, vault_id) on delete restrict
);

alter table public.horizon_vaults enable row level security;
alter table public.horizon_vaults force row level security;
alter table public.horizon_operations enable row level security;
alter table public.horizon_operations force row level security;

create policy horizon_vaults_read_own on public.horizon_vaults
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);
create policy horizon_operations_read_own on public.horizon_operations
for select to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id);

-- Direct writes cannot bypass serial sequence allocation or collision checks.
revoke all on table public.horizon_vaults, public.horizon_operations from public, anon, authenticated, service_role;
grant select on table public.horizon_vaults, public.horizon_operations to authenticated;

create function horizon_private.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'HORIZON_IMMUTABLE_RECORD';
end;
$$;

create trigger horizon_vaults_immutable before update or delete on public.horizon_vaults
for each row execute function horizon_private.reject_mutation();
create trigger horizon_vaults_no_truncate before truncate on public.horizon_vaults
for each statement execute function horizon_private.reject_mutation();
create trigger horizon_operations_immutable before update or delete on public.horizon_operations
for each row execute function horizon_private.reject_mutation();
create trigger horizon_operations_no_truncate before truncate on public.horizon_operations
for each statement execute function horizon_private.reject_mutation();

-- This helper is private, and both public RPCs hold the SAME per-user lock
-- before reading a page. Limits apply to rows AND bytes, never skip a prefix.
create function horizon_private.page(p_user uuid, p_header jsonb, p_cursor bigint, p_limit integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row record;
  v_operations jsonb := '[]'::jsonb;
  v_cursor bigint := p_cursor;
  v_bytes bigint := 0;
  v_size bigint;
begin
  for v_row in
    select op_id, seq, payload from public.horizon_operations
    where user_id = p_user and seq > p_cursor order by seq limit p_limit
  loop
    v_size := pg_catalog.octet_length(v_row.payload::text);
    if v_bytes > 0 and v_bytes + v_size > 16777216 then exit; end if;
    v_operations := v_operations || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'op_id', v_row.op_id, 'seq', v_row.seq, 'payload', v_row.payload));
    v_bytes := v_bytes + v_size;
    v_cursor := v_row.seq;
  end loop;
  return pg_catalog.jsonb_build_object(
    'header', p_header, 'operations', v_operations, 'cursor', v_cursor,
    'has_more', exists (select 1 from public.horizon_operations where user_id = p_user and seq > v_cursor));
end;
$$;

create function public.horizon_exchange(
  p_vault_id uuid,
  p_header jsonb,
  p_operations jsonb,
  p_cursor bigint,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_vault public.horizon_vaults%rowtype;
  v_item jsonb;
  v_payload jsonb;
  v_op_id uuid;
  v_existing jsonb;
  v_seq bigint;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'HORIZON_AUTHENTICATION_REQUIRED';
  end if;
  if p_cursor is null or p_cursor < 0 or p_cursor > 9007199254740991
     or p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_CURSOR_OR_LIMIT';
  end if;
  if not horizon_private.valid_header(p_header, p_vault_id) then
    raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_HEADER';
  end if;
  if pg_catalog.jsonb_typeof(p_operations) is distinct from 'array' then
    raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_OPERATIONS';
  end if;
  if pg_catalog.jsonb_array_length(p_operations) > 20
     or pg_catalog.octet_length(p_operations::text) > 16777216 then
    raise exception using errcode = 'HV001', message = 'HORIZON_BATCH_TOO_LARGE';
  end if;

  -- A PostgreSQL SEQUENCE alone is unsafe here: N+1 could commit before N.
  -- The transaction-level lock is taken BEFORE setup and numbering, and is
  -- released only at commit/rollback. Hash collisions only serialize users.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('my-horizon:' || v_user::text, 0));
  select * into v_vault from public.horizon_vaults where user_id = v_user;
  if found then
    if v_vault.vault_id <> p_vault_id or v_vault.header <> p_header then
      raise exception using errcode = 'HV002', message = 'HORIZON_VAULT_HEADER_CONFLICT';
    end if;
  else
    begin
      insert into public.horizon_vaults(user_id, vault_id, header)
      values (v_user, p_vault_id, p_header);
    exception when unique_violation then
      raise exception using errcode = 'HV002', message = 'HORIZON_VAULT_ALREADY_REGISTERED';
    end;
  end if;

  select coalesce(pg_catalog.max(seq), 0) into v_seq
  from public.horizon_operations where user_id = v_user;
  -- Check against the prefix committed BEFORE this request, not its new writes.
  if p_cursor > v_seq then
    raise exception using errcode = 'HV004', message = 'HORIZON_CURSOR_AHEAD_OF_SERVER';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_operations)
  loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_OPERATION';
    end if;
    if (select pg_catalog.count(*) from pg_catalog.jsonb_object_keys(v_item)) <> 2
       or pg_catalog.jsonb_typeof(v_item -> 'op_id') is distinct from 'string' then
      raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_OPERATION';
    end if;
    begin v_op_id := (v_item ->> 'op_id')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_OPERATION_ID';
    end;
    v_payload := v_item -> 'payload';
    if not horizon_private.valid_payload(v_payload, p_header) then
      raise exception using errcode = 'HV001', message = 'HORIZON_INVALID_PAYLOAD';
    end if;
    select payload into v_existing from public.horizon_operations
    where user_id = v_user and op_id = v_op_id;
    if found then
      if v_existing <> v_payload then
        raise exception using errcode = 'HV003', message = 'HORIZON_OPERATION_ID_COLLISION';
      end if;
      continue;
    end if;
    if v_seq >= 9007199254740991 then
      raise exception using errcode = 'HV001', message = 'HORIZON_SEQUENCE_LIMIT_REACHED';
    end if;
    v_seq := v_seq + 1;
    insert into public.horizon_operations(user_id, vault_id, op_id, seq, payload)
    values (v_user, p_vault_id, v_op_id, v_seq, v_payload);
  end loop;
  return horizon_private.page(v_user, p_header, p_cursor, p_limit);
end;
$$;

create function public.horizon_bootstrap()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_vault public.horizon_vaults%rowtype;
begin
  if v_user is null or auth.role() is distinct from 'authenticated' then
    raise exception using errcode = '42501', message = 'HORIZON_AUTHENTICATION_REQUIRED';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('my-horizon:' || v_user::text, 0));
  select * into v_vault from public.horizon_vaults where user_id = v_user;
  if not found then return null; end if;
  return horizon_private.page(v_user, v_vault.header, 0, 100)
    || pg_catalog.jsonb_build_object('vault_id', v_vault.vault_id);
end;
$$;

-- SECURITY DEFINER is deliberately narrow: no client-provided user_id,
-- schema-qualified objects, fixed search_path, authenticated-only entry points.
revoke all on all functions in schema horizon_private from public, anon, authenticated, service_role;
revoke all on function public.horizon_exchange(uuid, jsonb, jsonb, bigint, integer) from public, anon, authenticated, service_role;
revoke all on function public.horizon_bootstrap() from public, anon, authenticated, service_role;
grant execute on function public.horizon_exchange(uuid, jsonb, jsonb, bigint, integer) to authenticated;
grant execute on function public.horizon_bootstrap() to authenticated;

comment on table public.horizon_vaults is 'Immutable encrypted vault header, isolated by Supabase auth.uid; owner inside header is cryptographic AAD only.';
comment on table public.horizon_operations is 'Append-only E2EE document envelopes; seq is a commit-ordered per-user prefix assigned under a transaction lock.';
comment on function public.horizon_exchange(uuid, jsonb, jsonb, bigint, integer) is 'Atomic upload/dedup plus paged own-user exchange. Maximum 20 uploads, 100 returned rows, 8 MiB cipher, 16 MiB batch/page payload.';
