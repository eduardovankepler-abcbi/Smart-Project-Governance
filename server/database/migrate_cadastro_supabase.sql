ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS project_code text DEFAULT 'PRJ-MIGRATE';
ALTER TABLE public.recursos ADD COLUMN IF NOT EXISTS seniority text DEFAULT '';
ALTER TABLE public.recursos ADD COLUMN IF NOT EXISTS specialties_json text DEFAULT '[]';

UPDATE public.projetos
SET project_code = CONCAT('PRJ-', REGEXP_REPLACE(UPPER(projeto), '[^A-Z0-9]+', '-', 'g'))
WHERE project_code IS NULL OR project_code = '' OR project_code = 'PRJ-MIGRATE';

CREATE UNIQUE INDEX IF NOT EXISTS ux_projetos_project_code ON public.projetos (project_code);
