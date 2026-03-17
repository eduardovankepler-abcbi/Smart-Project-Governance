# Smart Project Governance

Aplicação web para governança de portfólio, cadastro operacional, recursos, tarefas, alocações, comentários, auditoria e importação de cronogramas.

## Stack

- Frontend: React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- Backend: Node.js + Express + MySQL
- Sync opcional: Supabase
- Importação: Excel customizado e MS Project XML

## Estado atual do produto

O sistema já cobre:

- autenticação com perfis `admin`, `pmo`, `bi` e `viewer`
- governança de usuários e escopo por projeto
- cadastro de unidades de negócio, produtos, projetos, tarefas, subtarefas e recursos
- alocações de recursos em tarefas com bloqueio de duplicidade
- comentários por projeto e tarefa
- trilha básica de auditoria
- visão de capacidade e sobrealocação
- importação de cronograma por XML do MS Project
- sincronização automática opcional com Supabase

## Banco ativo recomendado

Se você seguiu a configuração mais recente deste projeto, o banco correto é:

```env
DB_NAME=abc_project_manager_v2
```

Esse banco substitui o schema legado `abc_project_manager`, que usava tabelas antigas como `usuarios`.

## Estrutura

- `src/`: frontend
- `server/`: API e scripts de banco
- `server/database/schema.sql`: schema completo para ambientes novos
- `server/database/supabase_schema.sql`: schema completo do Supabase
- `server/database/migrations/mysql`: migrações versionadas novas
- `server/scripts/runMigrations.js`: runner de migrações MySQL

## Subida local

### Frontend

```bash
npm install
npm run dev
```

URL padrão:

```text
http://localhost:8080
```

### Backend

```bash
cd server
npm install
npm run dev
```

URL padrão:

```text
http://localhost:3001
```

Health check:

```text
http://localhost:3001/api/health
```

## Variáveis de ambiente

### Raiz / frontend

- `VITE_API_URL=http://localhost:3001`
- `VITE_API_URL=auto` quando o frontend publicado usar o proxy `/api` do Nginx
- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

### Backend

- `PORT=3001`
- `DB_HOST=localhost`
- `DB_PORT=3306`
- `DB_USER=abc_app_user`
- `DB_PASSWORD=abc_secure_pass`
- `DB_NAME=abc_project_manager_v2`
- `API_KEY=...` apenas para integrações servidor-servidor
- `CORS_ORIGINS=http://localhost,http://localhost:80,http://localhost:8080,http://localhost:5173`
- `SESSION_DAYS=7`
- `IMPORT_MAX_FILE_SIZE_MB=25`
- `SUPABASE_SYNC_ENABLED=true|false`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

Regras de segurança:

- nunca exponha `API_KEY` no frontend
- nunca exponha `SUPABASE_SERVICE_ROLE_KEY` no navegador
- o frontend deve autenticar apenas com sessão de usuário

## Deploy para equipe com Docker

Para publicar em uma VM/servidor e deixar outras pessoas acessarem pelo navegador:

1. copie `.env.example` para `.env`
2. ajuste pelo menos:
   - `DB_ROOT_PASSWORD`
   - `DB_PASSWORD`
   - `API_KEY`
   - `CORS_ORIGINS=https://seu-dominio-ou-ip`
   - `VITE_API_URL=auto`
3. suba com:

```bash
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
```

Nesse modo:

- o frontend fica publicado na porta `80`
- a API não fica exposta diretamente no host
- o Nginx do frontend faz proxy para `/api`
- o health público pode ser validado em `http://seu-host/api/health`
- o banco interno do stack Docker continua sendo `abc_project_manager`, isolado do ambiente local que pode usar `abc_project_manager_v2`

## Frontend na Vercel + backend na VPS

Se o frontend ficar na Vercel e o backend em uma VPS, nao altere o `.env` local. Use arquivos dedicados:

- [`.env.vps.example`](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\.env.vps.example) para o backend na VPS
- [`.env.vercel.example`](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\.env.vercel.example) para as variaveis do frontend na Vercel

Na VPS:

```bash
cp .env.vps.example .env.vps
docker compose --env-file .env.vps up -d --build db api
```

Na Vercel:

- defina `VITE_API_URL=https://api.seudominio.com`
- nunca publique `API_KEY` nem `SUPABASE_SERVICE_ROLE_KEY`

## Teste temporario com backend na sua maquina

Se voce quiser usar sua maquina como backend temporario para a equipe, nao altere [server/.env](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\server\.env). Use um override separado:

1. copie [server/.env.teamtest.example](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\server\.env.teamtest.example) para `server/.env.teamtest`
2. ajuste `CORS_ORIGINS` para o dominio da Vercel
3. suba o backend com:

```powershell
cd server
$env:APP_ENV_FILE = ".env.teamtest"
npm run dev
```

Isso preserva o ambiente local padrao e aplica o arquivo de teste apenas nessa sessao do terminal.

## Ordem recomendada de criação de ambiente novo

### MySQL

Para ambiente novo, prefira o schema completo:

1. criar o banco `abc_project_manager_v2`
2. executar `server/database/schema.sql`
3. apontar `DB_NAME=abc_project_manager_v2`
4. iniciar o backend

### Supabase

1. criar o projeto no Supabase
2. executar `server/database/supabase_schema.sql`
3. preencher `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`
4. ativar `SUPABASE_SYNC_ENABLED=true`

## Migrações

O projeto ainda possui migrações manuais legadas em `server/database/*.sql`, mas as novas evoluções já podem usar o runner versionado.

Executar runner:

```bash
cd server
npm run migrate
```

Estado atual do runner:

- cria a tabela `schema_migrations`
- aplica arquivos em `server/database/migrations/mysql`
- registra cada arquivo aplicado

Migrações versionadas já incluídas:

- `20260313_001_comments_audit.sql`
- `20260313_002_project_product_link.sql`
- `20260313_003_typed_dates_integrity.sql`
- `20260316_004_secondary_typed_dates.sql`

## Credencial seed

Após carregar o schema atual, o usuário inicial é:

```text
admin@abc.local
Admin@123
```

Use esse acesso apenas para bootstrap e troque a senha imediatamente. Depois:

1. crie seu usuário real
2. promova seu usuário real para `admin`
3. altere a senha seed
4. rotacione os segredos expostos

## Segurança operacional já disponível

- política de senha forte
- troca de senha pelo usuário autenticado
- expiração de sessão por `SESSION_DAYS`
- encerramento das demais sessões ao trocar senha
- auditoria de login, logout e alterações de cadastro

## O que ainda segue pendente

Os itens abaixo continuam como próximos passos naturais:

- reset administrativo de senha
- datas totalmente tipadas como `DATE/DATETIME` em todos os campos restantes
- mais `foreign keys` em entidades secundárias e cenários de legado mais antigos
- testes mais amplos de governança e importação MS Project
- refinamento avançado de compatibilidade MS Project: calendários, baselines e time-phased

## Testes

Backend:

```bash
cd server
npm test
```

Hoje já existem testes para:

- autenticação e política de senha
- helpers de governança
- detecção de alocação duplicada

## Restore e recuperação

Fluxo recomendado:

1. exportar o schema ativo antes de migrações importantes
2. manter backup do MySQL `abc_project_manager_v2`
3. manter backup lógico do Supabase
4. em caso de rebuild completo, recriar o banco e reaplicar `schema.sql`
5. depois religar o sync com Supabase

## Observações operacionais

- o frontend continua funcionando com dados locais se `VITE_API_URL` não estiver definido
- o backend exige MySQL ativo e credenciais corretas
- o Supabase é opcional, mas útil para replicação e consulta externa
- o Docker do repositório não substitui automaticamente seu MySQL local já em uso
