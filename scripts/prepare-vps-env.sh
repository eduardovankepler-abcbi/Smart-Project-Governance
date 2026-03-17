#!/usr/bin/env sh
set -eu

TARGET_FILE="${1:-.env.vps}"
TEMPLATE_FILE="${2:-.env.vps.example}"

if [ ! -f "$TEMPLATE_FILE" ]; then
  echo "Template nao encontrado: $TEMPLATE_FILE" >&2
  exit 1
fi

if [ -f "$TARGET_FILE" ]; then
  echo "Arquivo ja existe: $TARGET_FILE"
  echo "Nenhuma alteracao foi feita."
  exit 0
fi

cp "$TEMPLATE_FILE" "$TARGET_FILE"
echo "Arquivo criado: $TARGET_FILE"
echo "Edite apenas os valores CHANGE_ME_* e os dominios antes de subir a stack."
