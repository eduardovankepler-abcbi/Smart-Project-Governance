alter table public.projetos
add column if not exists produto_id bigint;

alter table public.projetos
add column if not exists produto_nome text default '';

update public.projetos
set produto_nome = ''
where produto_nome is null;
