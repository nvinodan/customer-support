#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

# Prompt for inputs if not provided as arguments
PROVIDER_NAME="${1:-}"
API_KEY="${2:-}"

if [ -z "$PROVIDER_NAME" ]; then
  read -rp "Credential provider name (e.g. tavily-api): " PROVIDER_NAME
fi

if [ -z "$API_KEY" ]; then
  read -rsp "API key: " API_KEY
  echo
fi

if [ -z "$PROVIDER_NAME" ] || [ -z "$API_KEY" ]; then
  echo "Usage: ./create-credential.sh <provider-name> <api-key>"
  exit 1
fi

echo "==> Creating credential provider '${PROVIDER_NAME}' in ${AWS_REGION}..."

if RESULT=$(aws bedrock-agentcore-control create-api-key-credential-provider \
  --name "${PROVIDER_NAME}" \
  --api-key "${API_KEY}" \
  --region "${AWS_REGION}" 2>&1); then
  echo "    Credential provider '${PROVIDER_NAME}' created."
  echo "$RESULT"
else
  if echo "$RESULT" | grep -q -e "ConflictException" -e "already exists"; then
    echo "    Credential provider '${PROVIDER_NAME}' already exists."
  else
    echo "==> Failed to create credential provider:"
    echo "$RESULT"
    exit 1
  fi
fi
