#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="${AWS_REGION:-us-east-1}"

ACTION="${1:-}"

usage() {
  echo "Usage:"
  echo "  ./create-credential.sh create <provider-name> <api-key>"
  echo "  ./create-credential.sh delete <provider-name>"
  exit 1
}

case "$ACTION" in
  create)
    PROVIDER_NAME="${2:-}"
    API_KEY="${3:-}"

    if [ -z "$PROVIDER_NAME" ]; then
      read -rp "Credential provider name (e.g. tavily-api): " PROVIDER_NAME
    fi

    if [ -z "$API_KEY" ]; then
      read -rsp "API key: " API_KEY
      echo
    fi

    if [ -z "$PROVIDER_NAME" ] || [ -z "$API_KEY" ]; then
      usage
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
    ;;

  delete)
    PROVIDER_NAME="${2:-}"

    if [ -z "$PROVIDER_NAME" ]; then
      read -rp "Credential provider name to delete: " PROVIDER_NAME
    fi

    if [ -z "$PROVIDER_NAME" ]; then
      usage
    fi

    echo "==> Deleting credential provider '${PROVIDER_NAME}' in ${AWS_REGION}..."

    if RESULT=$(aws bedrock-agentcore-control delete-api-key-credential-provider \
      --name "${PROVIDER_NAME}" \
      --region "${AWS_REGION}" 2>&1); then
      echo "    Credential provider '${PROVIDER_NAME}' deleted."
    else
      if echo "$RESULT" | grep -q -e "ResourceNotFoundException" -e "not found"; then
        echo "    Credential provider '${PROVIDER_NAME}' not found."
      else
        echo "==> Failed to delete credential provider:"
        echo "$RESULT"
        exit 1
      fi
    fi
    ;;

  *)
    usage
    ;;
esac
