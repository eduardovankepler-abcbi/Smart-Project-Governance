#!/bin/bash
set -euo pipefail

# Script de deploy do backend no Railway
# Uso:
#   ./deploy.sh

FRONTEND_URL_DEFAULT="https://seu-projeto.vercel.app"
MYSQL_SERVICE_NAME_DEFAULT="MySQL"

check_requirements() {
  echo "Verificando pré-requisitos..."

  if ! command -v node >/dev/null 2>&1; then
    echo "Erro: Node.js não encontrado."
    exit 1
  fi

  if ! command -v railway >/dev/null 2>&1; then
    echo "Instalando Railway CLI..."
    npm install -g @railway/cli
  fi
}

configure_auth() {
  echo "Configurando autenticação no Railway..."

  if railway whoami >/dev/null 2>&1; then
    echo "CLI já autenticada."
    return
  fi

  read -r -p "Digite sua Railway API Key (ou deixe vazio para login browserless): " RAILWAY_TOKEN_INPUT

  if [[ -n "${RAILWAY_TOKEN_INPUT}" ]]; then
    export RAILWAY_TOKEN="${RAILWAY_TOKEN_INPUT}"
    export RAILWAY_API_TOKEN="${RAILWAY_TOKEN_INPUT}"
  else
    railway login --browserless
  fi

  if ! railway whoami >/dev/null 2>&1; then
    echo "Erro: autenticação no Railway falhou."
    exit 1
  fi
}

link_project() {
  echo "Entrando no diretório do backend..."
  cd server

  echo "Linkando projeto/serviço no Railway..."
  railway link || railway init
}

ensure_mysql_reference_vars() {
  local frontend_url mysql_service_name generated_api_key

  read -r -p "URL do frontend na Vercel [${FRONTEND_URL_DEFAULT}]: " frontend_url
  frontend_url="${frontend_url:-$FRONTEND_URL_DEFAULT}"

  read -r -p "Nome do serviço MySQL no Railway [${MYSQL_SERVICE_NAME_DEFAULT}]: " mysql_service_name
  mysql_service_name="${mysql_service_name:-$MYSQL_SERVICE_NAME_DEFAULT}"

  generated_api_key="$(openssl rand -hex 16)"

  echo "Configurando variáveis do backend..."
  railway variable set \
    "DB_HOST=\${{${mysql_service_name}.MYSQLHOST}}" \
    "DB_PORT=\${{${mysql_service_name}.MYSQLPORT}}" \
    "DB_USER=\${{${mysql_service_name}.MYSQLUSER}}" \
    "DB_PASSWORD=\${{${mysql_service_name}.MYSQLPASSWORD}}" \
    "DB_NAME=\${{${mysql_service_name}.MYSQLDATABASE}}" \
    "API_KEY=${generated_api_key}" \
    "CORS_ORIGINS=${frontend_url}" \
    "SUPABASE_SYNC_ENABLED=false" \
    "IMPORT_MAX_FILE_SIZE_MB=25" \
    --skip-deploys

  echo
  echo "Variáveis aplicadas."
  echo "API_KEY gerada: ${generated_api_key}"
  echo
  echo "Se o serviço MySQL ainda não existir no projeto, crie agora com:"
  echo "  railway add -d mysql"
  echo
}

deploy_backend() {
  echo "Fazendo deploy do backend..."
  railway up
}

final_notes() {
  echo
  echo "Próximo passo manual:"
  echo "1. No Railway, gere o domínio público do serviço backend em Networking."
  echo "2. Na Vercel, defina VITE_API_URL=https://SEU_BACKEND.up.railway.app"
  echo "3. Faça redeploy do frontend."
  echo
  echo "Observação:"
  echo "- Este script deploya apenas o backend."
  echo "- O frontend continua na Vercel."
}

main() {
  check_requirements
  configure_auth
  link_project
  ensure_mysql_reference_vars
  deploy_backend
  final_notes
}

main "$@"
