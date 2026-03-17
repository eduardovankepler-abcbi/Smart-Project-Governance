# Backend 100% em nuvem

O frontend pode continuar na Vercel. Para remover a dependencia da maquina local, o proximo passo recomendado e:

- backend Node/Express em um host permanente
- banco MySQL em um host permanente
- `VITE_API_URL` da Vercel apontando para a URL publica da API

## Caminho recomendado

Para este projeto, o caminho mais simples e coerente com a arquitetura atual e:

1. frontend na Vercel
2. backend no Render como Web Service Node
3. MySQL gerenciado em provedor compativel

Se depois voce optar por VPS, o mesmo backend continua valido.

## Backend em nuvem

O backend ja esta preparado para subir com:

```bash
cd server
npm install
npm run start:prod
```

Esse comando:

- aplica as migracoes versionadas
- sobe a API

Health check:

```text
/api/health
```

## Variaveis de ambiente

Use [server/.env.cloud.example](c:\Users\Eduardo Cassiano\Downloads\appprojectmanengerv2-main(1)\appprojectmanengerv2-main\server\.env.cloud.example) como referencia.

Valores minimos:

```env
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
API_KEY=...
CORS_ORIGINS=https://SEU_FRONTEND.vercel.app
IMPORT_MAX_FILE_SIZE_MB=25
SUPABASE_SYNC_ENABLED=false
```

## Banco

O app usa MySQL. Para um ambiente estavel em nuvem:

1. crie um banco MySQL permanente
2. importe a estrutura inicial
3. aponte as variaveis `DB_*` do backend para esse banco

### Opcao mais segura para carga inicial

Se o banco em nuvem estiver vazio, leve os dados do seu MySQL atual via dump/import:

```bash
mysqldump -h localhost -P 3306 -u abc_app_user -p abc_project_manager_v2 > backup.sql
```

Depois importe no banco em nuvem com as credenciais do novo host.

## Vercel

Depois que a API em nuvem estiver publicada e o health responder, ajuste na Vercel:

```env
VITE_API_URL=https://SUA_API_PUBLICA
```

Depois faca redeploy do frontend.

## Validacao final

1. `https://SUA_API_PUBLICA/api/health`
2. frontend da Vercel carregando
3. login funcionando
4. cadastro e leitura funcionando sem sua maquina ligada
