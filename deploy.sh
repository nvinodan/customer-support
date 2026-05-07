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
echo "    Policy verified. Waiting for IAM propagation..."
sleep 15

echo "==> Creating or updating AgentCore runtime..."

# Try to create first; if it already exists, update instead
if RESULT=$(aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name "${RUNTIME_NAME}" \
  --agent-runtime-artifact "containerConfiguration={containerUri=${ECR_URI}:${IMAGE_TAG}}" \
  --role-arn "${ROLE_ARN}" \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
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
      --region "${AWS_REGION}")
    echo "==> Runtime updated."
  else
    echo "==> Failed to create runtime:"
    echo "$RESULT"
    exit 1
  fi
fi

RUNTIME_ARN=$(echo "$RESULT" | grep -o '"agentRuntimeArn": *"[^"]*"' | head -1 | sed 's/.*"agentRuntimeArn": *"//;s/"//' || true)

if [ -z "$RUNTIME_ARN" ]; then
  echo ""
  echo "==> Done! Runtime created/updated. Full response:"
  echo "$RESULT"
else
  echo ""
  echo "==> Done! Runtime ARN:"
  echo "    ${RUNTIME_ARN}"
  echo ""
  echo "    Set this in your proxy server:"
  echo "    export AGENT_RUNTIME_ARN=${RUNTIME_ARN}"
fi
