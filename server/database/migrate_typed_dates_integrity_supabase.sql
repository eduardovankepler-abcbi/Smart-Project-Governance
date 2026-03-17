alter table public.projetos add column if not exists data_inicio_planej_date date;
alter table public.projetos add column if not exists data_fim_planej_date date;
alter table public.projetos add column if not exists data_inicio_real_date date;
alter table public.projetos add column if not exists data_fim_real_date date;

alter table public.tarefas add column if not exists data_inicio_planej_date date;
alter table public.tarefas add column if not exists data_fim_planej_date date;
alter table public.tarefas add column if not exists data_inicio_real_date date;
alter table public.tarefas add column if not exists data_fim_real_date date;

update public.projetos
set
  data_inicio_planej_date = case
    when data_inicio_planej ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_inicio_planej, 'YYYY-MM-DD')
    when data_inicio_planej ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_inicio_planej, 'MM/DD/YY')
    else null
  end,
  data_fim_planej_date = case
    when data_fim_planej ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_fim_planej, 'YYYY-MM-DD')
    when data_fim_planej ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_fim_planej, 'MM/DD/YY')
    else null
  end,
  data_inicio_real_date = case
    when data_inicio ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_inicio, 'YYYY-MM-DD')
    when data_inicio ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_inicio, 'MM/DD/YY')
    else null
  end,
  data_fim_real_date = case
    when data_fim_real ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_fim_real, 'YYYY-MM-DD')
    when data_fim_real ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_fim_real, 'MM/DD/YY')
    else null
  end;

update public.tarefas
set
  data_inicio_planej_date = case
    when data_inicio_planej ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_inicio_planej, 'YYYY-MM-DD')
    when data_inicio_planej ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_inicio_planej, 'MM/DD/YY')
    else null
  end,
  data_fim_planej_date = case
    when data_fim_planej ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_fim_planej, 'YYYY-MM-DD')
    when data_fim_planej ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_fim_planej, 'MM/DD/YY')
    else null
  end,
  data_inicio_real_date = case
    when data_inicio_real ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_inicio_real, 'YYYY-MM-DD')
    when data_inicio_real ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_inicio_real, 'MM/DD/YY')
    else null
  end,
  data_fim_real_date = case
    when data_fim_real ~ '^\d{4}-\d{2}-\d{2}$' then to_date(data_fim_real, 'YYYY-MM-DD')
    when data_fim_real ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(data_fim_real, 'MM/DD/YY')
    else null
  end;

update public.produtos
set business_unit_id = 1, business_unit_nome = 'Corporativo'
where business_unit_id not in (select id from public.business_units);

update public.projetos
set business_unit_id = 1, business_unit_nome = 'Corporativo'
where business_unit_id not in (select id from public.business_units);

update public.projetos
set produto_id = null, produto_nome = ''
where produto_id is not null
  and produto_id not in (select id from public.produtos);

update public.users
set resource_id = null
where resource_id is not null
  and resource_id not in (select id from public.recursos);

delete from public.user_project_access
where project_id not in (select id from public.projetos);

create index if not exists idx_projetos_data_inicio_planej_date on public.projetos (data_inicio_planej_date);
create index if not exists idx_projetos_data_fim_planej_date on public.projetos (data_fim_planej_date);
create index if not exists idx_tarefas_data_inicio_planej_date on public.tarefas (data_inicio_planej_date);
create index if not exists idx_tarefas_data_fim_planej_date on public.tarefas (data_fim_planej_date);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_produtos_business_unit') then
    alter table public.produtos add constraint fk_produtos_business_unit foreign key (business_unit_id) references public.business_units(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_projetos_business_unit') then
    alter table public.projetos add constraint fk_projetos_business_unit foreign key (business_unit_id) references public.business_units(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_projetos_produto') then
    alter table public.projetos add constraint fk_projetos_produto foreign key (produto_id) references public.produtos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_users_resource') then
    alter table public.users add constraint fk_users_resource foreign key (resource_id) references public.recursos(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_user_project_access_project') then
    alter table public.user_project_access add constraint fk_user_project_access_project foreign key (project_id) references public.projetos(id) on delete cascade;
  end if;
end $$;

insert into public.schema_migrations (filename)
values ('migrate_typed_dates_integrity_supabase.sql')
on conflict (filename) do nothing;
