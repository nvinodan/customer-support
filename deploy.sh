#!/usr/bin/env bash
set -euo pipefail

# Configuration (override via environment variables)
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?AWS_ACCOUNT_ID is required}"
RUNTIME_NAME="${RUNTIME_NAME:-customer_support_agent}"
ECR_REPO_NAME="${ECR_REPO_NAME:-$RUNTIME_NAME}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ROLE_NAME="${ROLE_NAME:-${RUNTIME_NAME}-execution-role}"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"

echo "==> Building Docker image (ARM64)..."
docker build --platform linux/arm64 -t "${ECR_REPO_NAME}:${IMAGE_TAG}" .

echo "==> Ensuring ECR repository exists..."
aws ecr describe-repositories --repository-names "${ECR_REPO_NAME}" --region "${AWS_REGION}" 2>/dev/null || \
  aws ecr create-repository --repository-name "${ECR_REPO_NAME}" --region "${AWS_REGION}"

echo "==> Authenticating with ECR..."
aws ecr get-login-password --region "${AWS_REGION}" | \
  docker login --username AWS --password-stdin "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

echo "==> Tagging and pushing image..."
docker tag "${ECR_REPO_NAME}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:${IMAGE_TAG}"

echo "==> Ensuring IAM execution role exists..."
ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}"
POLICY_NAME="${RUNTIME_NAME}-policy"

TRUST_POLICY=$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "bedrock-agentcore.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
POLICY
)

INLINE_POLICY=$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRImageAccess",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchGetImage",
        "ecr:GetDownloadUrlForLayer"
      ],
      "Resource": "arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/*"
    },
    {
      "Sid": "ECRTokenAccess",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:DescribeLogStreams",
        "logs:CreateLogGroup"
      ],
      "Resource": "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*"
    },
    {
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:${AWS_REGION}:${AWS_ACCOUNT_ID}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "xray:PutTraceSegments",
        "xray:PutTelemetryRecords",
        "xray:GetSamplingRules",
        "xray:GetSamplingTargets"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": "cloudwatch:PutMetricData",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "bedrock-agentcore"
        }
      }
    },
    {
      "Sid": "BedrockModelAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:*::foundation-model/*",
        "arn:aws:bedrock:${AWS_REGION}:${AWS_ACCOUNT_ID}:*"
      ]
    }
  ]
}
POLICY
)

if ! aws iam get-role --role-name "${ROLE_NAME}" 2>/dev/null; then
  echo "    Creating role ${ROLE_NAME}..."
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --assume-role-policy-document "${TRUST_POLICY}"

  aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document "${INLINE_POLICY}"

  echo "    Waiting for role to propagate..."
  sleep 10
else
  echo "    Role ${ROLE_NAME} already exists, updating inline policy..."
  aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${POLICY_NAME}" \
    --policy-document "${INLINE_POLICY}"
fi

echo "    Verifying policy is attached..."
aws iam get-role-policy --role-name "${ROLE_NAME}" --policy-name "${POLICY_NAME}" > /dev/null
echo "    Policy verified."

# --- AgentCore Memory ---

MEMORY_NAME="${MEMORY_NAME:-${RUNTIME_NAME}_memory}"
MEMORY_ID=""

echo "==> Creating or reusing AgentCore Memory: ${MEMORY_NAME}..."

if MEMORY_RESULT=$(aws bedrock-agentcore-control create-memory \
  --name "${MEMORY_NAME}" \
  --description "Session memory for ${RUNTIME_NAME}" \
  --region "${AWS_REGION}" \
  --event-expiry-duration 30 \
  --memory-strategies '[{"semanticMemoryStrategy":{"name":"session_context","description":"Stores conversation turns for session continuity","namespaces":["session"]}}]' \
  2>&1); then
  echo "    Memory created."
else
  if echo "$MEMORY_RESULT" | grep -q -e "ConflictException" -e "already exists"; then
    echo "    Memory already exists, fetching ID..."
    MEMORY_ID=$(aws bedrock-agentcore-control list-memories \
      --region "${AWS_REGION}" \
      --output json | python3 -c "
import sys, json
data = json.load(sys.stdin)
for m in data.get('memories', []):
    if '${MEMORY_NAME}' in m.get('arn', '') or '${MEMORY_NAME}' in m.get('id', ''):
        print(m['id'])
        break
" 2>/dev/null || true)
    if [ -z "$MEMORY_ID" ] || [ "$MEMORY_ID" = "None" ]; then
      echo "==> WARNING: Could not resolve memory ID. Skipping memory setup."
      MEMORY_ID=""
    else
      MEMORY_RESULT="{\"id\": \"${MEMORY_ID}\"}"
    fi
  else
    echo "==> WARNING: Failed to create memory (non-fatal):"
    echo "    $MEMORY_RESULT"
    MEMORY_RESULT=""
  fi
fi

if [ -n "${MEMORY_RESULT:-}" ] && [ -z "$MEMORY_ID" ]; then
  MEMORY_ID=$(echo "$MEMORY_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('memory',d).get('id',''))" 2>/dev/null || true)
fi

if [ -n "$MEMORY_ID" ]; then
  echo "    Memory ID: ${MEMORY_ID}"

  echo "==> Attaching memory IAM permissions..."
  MEMORY_POLICY_NAME="${RUNTIME_NAME}-memory-policy"
  MEMORY_POLICY=$(cat <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AgentCoreMemoryAccess",
      "Effect": "Allow",
      "Action": [
        "bedrock-agentcore:RetrieveMemoryRecords",
        "bedrock-agentcore:BatchCreateMemoryRecords",
        "bedrock-agentcore:GetMemoryRecord",
        "bedrock-agentcore:StartMemoryExtractionJob"
      ],
      "Resource": "arn:aws:bedrock-agentcore:${AWS_REGION}:${AWS_ACCOUNT_ID}:memory/*"
    }
  ]
}
POLICY
)

  aws iam put-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-name "${MEMORY_POLICY_NAME}" \
    --policy-document "${MEMORY_POLICY}"
  echo "    Memory policy attached."
fi

echo "    Waiting for IAM propagation..."
sleep 15

# --- Create or update AgentCore runtime ---

ENV_VARS_FLAG=""
if [ -n "$MEMORY_ID" ]; then
  ENV_VARS_FLAG="--environment-variables MEMORY_ID=${MEMORY_ID}"
fi

echo "==> Creating or updating AgentCore runtime..."

if RESULT=$(aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name "${RUNTIME_NAME}" \
  --agent-runtime-artifact "containerConfiguration={containerUri=${ECR_URI}:${IMAGE_TAG}}" \
  --role-arn "${ROLE_ARN}" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  ${ENV_VARS_FLAG} \
  --region "${AWS_REGION}" 2>&1); then
  echo "==> Runtime created."
else
  if echo "$RESULT" | grep -q "ConflictException"; then
    echo "    Runtime already exists, fetching runtime ID..."
    RUNTIME_ID=$(aws bedrock-agentcore-control list-agent-runtimes \
      --region "${AWS_REGION}" \
      --query "agentRuntimes[?agentRuntimeName=='${RUNTIME_NAME}'].agentRuntimeId | [0]" --output text)
    if [ -z "$RUNTIME_ID" ] || [ "$RUNTIME_ID" = "None" ]; then
      echo "==> ERROR: Runtime exists but could not resolve its ID. List output:"
      aws bedrock-agentcore-control list-agent-runtimes --region "${AWS_REGION}"
      exit 1
    fi
    echo "    Found runtime ID: ${RUNTIME_ID}"
    RESULT=$(aws bedrock-agentcore-control update-agent-runtime \
      --agent-runtime-id "${RUNTIME_ID}" \
      --agent-runtime-artifact "containerConfiguration={containerUri=${ECR_URI}:${IMAGE_TAG}}" \
      --role-arn "${ROLE_ARN}" \
      --network-configuration networkMode=PUBLIC \
      ${ENV_VARS_FLAG} \
      --region "${AWS_REGION}")
    echo "==> Runtime updated."
  else
    echo "==> Failed to create runtime:"
    echo "$RESULT"
    exit 1
  fi
fi

RUNTIME_ARN=$(echo "$RESULT" | grep -o '"agentRuntimeArn": *"[^"]*"' | head -1 | sed 's/.*"agentRuntimeArn": *"//;s/"//' || true)

# --- Summary ---

echo ""
echo "==> Done!"
if [ -n "$RUNTIME_ARN" ]; then
  echo "    Runtime ARN: ${RUNTIME_ARN}"
  echo ""
  echo "    Set this in your proxy server:"
  echo "    export AGENT_RUNTIME_ARN=${RUNTIME_ARN}"
else
  echo "    Runtime created/updated. Full response:"
  echo "    $RESULT"
fi
if [ -n "$MEMORY_ID" ]; then
  echo ""
  echo "    For local development, set:"
  echo "    export MEMORY_ID=${MEMORY_ID}"
fi
