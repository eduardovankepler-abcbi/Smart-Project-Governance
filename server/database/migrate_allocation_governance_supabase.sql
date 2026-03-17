alter table public.users
add column if not exists resource_id bigint;
