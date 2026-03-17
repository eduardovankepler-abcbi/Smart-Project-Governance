# ============================================
# ABC Project Manager - Deploy Guide
# ============================================

## Estrutura do Projeto

```
├── server/                  # Backend Node.js + Express
│   ├── database/
│   │   └── schema.sql       # Schema MySQL + dados iniciais
│   ├── index.js             # API Express
│   ├── package.json         # Dependências do backend
│   ├── Dockerfile           # Container do backend
│   ├── .env.example         # Template de configuração
│   └── README.md            # Documentação da API
│
├── src/                     # Frontend React + Vite
│   ├── config/api.ts        # Config da URL da API
│   ├── services/api.ts      # Camada de serviço (API ou local)
│   ├── contexts/DataContext.tsx  # Estado reativo dos dados
│   ├── utils/importUtils.ts # Parser de Excel (client-side)
│   └── ...                  # Componentes e páginas
│
├── docker-compose.yml       # Deploy com Docker (recomendado)
├── Dockerfile               # Build do frontend
├── nginx.conf               # Config Nginx para SPA + proxy
├── .env.example             # Template de variáveis de ambiente
└── DEPLOY_GUIDE.md          # Este arquivo
```

## Opção 1: Docker Compose para equipe (Recomendado)

### 1. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env com senhas seguras, domínio/IP público e API key
```

Ajustes mínimos recomendados:

```env
DB_ROOT_PASSWORD=troque_essa_senha
DB_PASSWORD=troque_essa_senha
API_KEY=gere_um_valor_forte
CORS_ORIGINS=https://seu-dominio-ou-ip
VITE_API_URL=auto
FRONTEND_PORT=80
IMPORT_MAX_FILE_SIZE_MB=25
```

### 2. Subir os serviços

```bash
docker compose -f docker-compose.yml -f docker-compose.deploy.yml up -d --build
```

Isso inicia automaticamente:
- **MySQL 8.0** em rede interna do Docker
- **API Express** em rede interna do Docker
- **Frontend Nginx** (porta 80) com proxy reverso para a API

### 3. Verificar

```bash
# Health check da API pelo frontend publicado
curl http://localhost/api/health

# Acessar o frontend
open http://localhost
```

### 4. Credencial inicial

Após a primeira subida, entre com:

```text
admin@abc.local
Admin@123
```

Troque essa senha assim que criar os usuários reais da equipe.

## Opção 2: Deploy Manual (Frontend + Backend + MySQL)

### 1. Configurar MySQL

```bash
mysql -u root -p < server/database/schema.sql
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
# Edite .env com credenciais MySQL e API_KEY de backend

# Desenvolvimento
npm run dev

# Produção com PM2
npm install -g pm2
pm2 start index.js --name abc-api
```

### 3. Frontend

```bash
# Na raiz do projeto
# Configure as variáveis de build:
export VITE_API_URL=http://seu-dominio.com:3001

# Build
npm run build

# Sirva dist/ com Nginx usando o nginx.conf fornecido
```

## Opção 2B: Frontend na Vercel + backend na VPS

Esse é o cenário correto quando o frontend já está publicado na Vercel.

### Backend na VPS

1. copie [`.env.vps.example`](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\.env.vps.example) para `.env.vps`
2. ajuste apenas os valores de senha, `API_KEY`, `CORS_ORIGINS` e Supabase
3. suba somente banco e API:

```bash
docker compose --env-file .env.vps up -d --build db api
```

### Frontend na Vercel

No painel da Vercel, configure as variaveis de [`.env.vercel.example`](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\.env.vercel.example):

```env
VITE_API_URL=https://api.seudominio.com
```

Observacoes:

- o backend precisa estar em `https`
- `CORS_ORIGINS` no backend precisa conter o dominio da Vercel
- nao use `VITE_API_URL=auto` nesse modo

## Opção 3: Somente Frontend (dados estáticos)

Se não quiser usar MySQL, a aplicação funciona com dados embarcados no código.
Você pode atualizar os dados via o botão **"Importar Excel"** no header.

```bash
npm run build
# Sirva dist/ com qualquer servidor web
```

A planilha Excel deve conter abas: **Projeto**, **Tarefa**, **Recurso**

Nunca use `API_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` em variáveis `VITE_*` ou em código de navegador.

## Importação de Dados via Excel

### Via Interface (client-side)
Use o botão **"Importar"** no header da aplicação.
Aceita `.xml`, `.xlsx` e `.xlsm`. O limite padrão atual é **25 MB** e pode ser alterado por `IMPORT_MAX_FILE_SIZE_MB`.

### Via API (server-side)
Quando o backend está ativo:

```bash
curl -X POST http://localhost:3001/api/import-excel \
  -H "Authorization: Bearer SUA_API_KEY" \
  -F "file=@sua_planilha.xlsx"
```

## Segurança em Produção

- [ ] Gere senhas fortes para MySQL e API Key
- [ ] Configure CORS_ORIGINS apenas para domínios autorizados
- [ ] Use HTTPS com certificado SSL (Let's Encrypt)
- [ ] Configure firewall para expor apenas a porta pública do frontend
- [ ] Faça backup regular do volume `mysql_data`
