# ABC Project Manager - Backend API

## Pré-requisitos
- Node.js 18+
- MySQL 8.0+

## Instalação

```bash
# 1. Instale as dependências
cd server
npm install

# 2. Crie o banco de dados MySQL
mysql -u root -p < database/schema.sql

# 3. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais MySQL
# Se quiser sincronizar com Supabase, preencha também:
# SUPABASE_SYNC_ENABLED=true
# SUPABASE_URL=...
# SUPABASE_SERVICE_ROLE_KEY=...

# 4. Inicie o servidor
npm run dev   # desenvolvimento (com hot-reload)
npm start     # produção
```

## Endpoints da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/projetos` | Lista todos os projetos |
| GET | `/api/tarefas` | Lista todas as tarefas |
| GET | `/api/recursos` | Lista todos os recursos |
| POST | `/api/import-excel` | Importa dados de planilha Excel |
| GET | `/api/health` | Verifica status da API e banco |

## Importação de Excel

Envie um `POST` para `/api/import-excel` com `multipart/form-data` contendo o campo `file` com a planilha `.xlsx`.

A planilha deve ter abas chamadas:
- **Projeto** ou **Projetos** - dados dos projetos
- **Tarefa** ou **Tarefas** - dados das tarefas
- **Recurso** ou **Recursos** - dados dos recursos

## Deploy em Produção

```bash
# Com PM2
npm install -g pm2
pm2 start index.js --name abc-api

# Com Docker (exemplo)
docker build -t abc-api .
docker run -p 3001:3001 --env-file .env abc-api
```

## Supabase

Para espelhar automaticamente os dados do MySQL no Supabase:

1. Execute `database/supabase_schema.sql` no SQL Editor do projeto Supabase.
2. Defina `SUPABASE_SYNC_ENABLED=true`.
3. Defina `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

Com isso, as rotas de CRUD e a importacao Excel sincronizam automaticamente os dados.
