alter table public.tarefas add column if not exists constraint_date_date date;

update public.tarefas
set constraint_date_date = case
  when constraint_date ~ '^\d{4}-\d{2}-\d{2}$' then to_date(constraint_date, 'YYYY-MM-DD')
  when constraint_date ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then to_date(constraint_date, 'MM/DD/YY')
  else null
end
where constraint_date_date is null
  and coalesce(constraint_date, '') <> '';

create index if not exists idx_tarefas_constraint_date_date on public.tarefas (constraint_date_date);
