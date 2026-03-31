# Deploy do Backend na Render

Este projeto ja esta preparado para subir o backend na Render como `Web Service` com o arquivo [render.yaml](C:/Users/Eduardo%20Cassiano/Downloads/appprojectmanengerv2-main(1)/appprojectmanengerv2-main/render.yaml).

## Estrategia recomendada

1. manter o frontend na Vercel
2. subir apenas o backend na Render
3. usar um MySQL externo ou rodar uma instancia propria de MySQL/MariaDB na Render

## O que ja esta configurado

O `render.yaml` usa:

- `rootDir: server`
- `buildCommand: npm install --omit=dev`
- `startCommand: npm run start:prod`
- `healthCheckPath: /api/health`
- `PORT=10000`

O comando `npm run start:prod`:

- aplica `schema.sql` se o banco estiver vazio
- executa as migracoes versionadas
- sobe a API

## Opcao A: subir so o backend agora

Use esta opcao se o MySQL atual ainda continuar disponivel por mais algum tempo.

### Variaveis obrigatorias

Preencha na Render:

```env
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
API_KEY=...
ENABLE_GLOBAL_API_KEY=false
CORS_ORIGINS=https://SEU_FRONTEND.vercel.app
IMPORT_MAX_FILE_SIZE_MB=25
SUPABASE_SYNC_ENABLED=false
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

### Passo a passo

1. No dashboard da Render, clique em `New +`
2. Escolha `Blueprint`
3. Conecte o repositorio `eduardovankepler-abcbi/Smart-Project-Governance`
4. Confirme que o arquivo `render.yaml` da raiz foi detectado
5. Preencha as variaveis marcadas com `sync: false`
6. Finalize o deploy

Quando o deploy concluir, valide:

```text
https://SEU_BACKEND.onrender.com/api/health
```

## Opcao B: migrar backend e banco para a Render

Se o MySQL da Railway tambem vai expirar, o caminho mais limpo e migrar o banco tambem.

### Observacao importante

A documentacao oficial da Render confirma suporte a bancos proprios com disco persistente. Para MySQL/MariaDB, o caminho seguro e tratar isso como uma instancia propria e manter `mysqldump` como estrategia principal de backup e restauracao. Isso importa bastante para este projeto.

### Fluxo recomendado

1. criar uma instancia propria de MySQL/MariaDB na Render
2. restaurar os dados com `mysqldump`
3. apontar o backend Render para o host interno do MySQL
4. fazer o health check
5. atualizar a Vercel com a nova URL da API

## Atualizacao da Vercel

Depois que a API da Render estiver respondendo:

```env
VITE_API_URL=https://SEU_BACKEND.onrender.com
```

Depois faca `Redeploy` do frontend na Vercel.

## Checklist final

- backend Render responde `/api/health`
- login funciona pelo frontend
- CORS_ORIGINS contem o dominio atual da Vercel
- importacoes funcionam
- Railway pode ser desligada so depois do teste final
