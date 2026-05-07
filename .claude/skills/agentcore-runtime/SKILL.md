---
name: agentcore-runtime
description: Scaffold or extend an AWS Bedrock AgentCore runtime agent using the Strands TypeScript SDK.
---

# Skill: agentcore-runtime

Scaffold or extend an AWS Bedrock AgentCore runtime agent using the Strands TypeScript SDK.

## When to use this skill

Invoke `/agentcore-runtime` when the user asks to:
- Create a new AgentCore runtime agent
- Add a new tool to the existing agent
- Fix or update the `/invocations` or `/ping` endpoint
- Update the Dockerfile or deployment configuration

---

## Core Contract (memorize this)

| Concern | Value |
|---|---|
| Port | `8080` (env `PORT` overrides) |
| Bind address | `0.0.0.0` |
| Health endpoint | `GET /ping` |
| Invocation endpoint | `POST /invocations` |
| Body parser | `express.raw({ type: '*/*' })` |
| Platform | `linux/arm64` |

---

## Input Format (`POST /invocations`)

AgentCore sends raw bytes. The body is either:

```
{ "prompt": "user message" }          ← JSON
```
or plain UTF-8 text. Always parse with:

```typescript
function parseInvocationPayload(body: Buffer): string {
  if (!body?.length) return ''
  const text = new TextDecoder().decode(body).trim()
  if (!text) return ''
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const prompt = parsed.prompt
      if (typeof prompt === 'string') return prompt
      if (prompt != null) return String(prompt)
    } catch { /* treat as plain text */ }
  }
  return text
}
```

---

## Output Format (`POST /invocations`)

**Success (HTTP 200):**
```json
{ "response": "<string>", "status": "success" }
```

**Error (HTTP 500):**
```json
{ "response": "<error message>", "status": "error" }
```

`response` must always be a string. Serialize non-strings with:

```typescript
function agentOutputToString(output: unknown): string {
  if (typeof output === 'string') return output
  try { return JSON.stringify(output) } catch { return String(output) }
}
```

---

## Health Check (`GET /ping`)

```typescript
app.get('/ping', (_, res) =>
  res.json({
    status: 'Healthy',
    time_of_last_update: Math.floor(Date.now() / 1000),
  })
)
```

---

## Minimal Complete Runtime Template

```typescript
import { z } from 'zod'
import * as strands from '@strands-agents/sdk'
import express from 'express'

const PORT = process.env.PORT || 8080

function parseInvocationPayload(body: Buffer): string {
  if (!body?.length) return ''
  const text = new TextDecoder().decode(body).trim()
  if (!text) return ''
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>
      const prompt = parsed.prompt
      if (typeof prompt === 'string') return prompt
      if (prompt != null) return String(prompt)
    } catch {}
  }
  return text
}

function agentOutputToString(output: unknown): string {
  if (typeof output === 'string') return output
  try { return JSON.stringify(output) } catch { return String(output) }
}

// --- Define tools here ---
const exampleTool = strands.tool({
  name: 'example',
  description: 'Example tool — replace with real implementation',
  inputSchema: z.object({
    query: z.string(),
  }),
  callback: (input): string => {
    return `Processed: ${input.query}`
  },
})

// --- Configure agent ---
const agent = new strands.Agent({
  model: new strands.BedrockModel({ region: process.env.AWS_REGION || 'us-east-1' }),
  tools: [exampleTool],
})

const app = express()

app.get('/ping', (_, res) =>
  res.json({ status: 'Healthy', time_of_last_update: Math.floor(Date.now() / 1000) })
)

app.post('/invocations', express.raw({ type: '*/*' }), async (req, res) => {
  try {
    const prompt = parseInvocationPayload(req.body as Buffer)
    const agentResult = await agent.invoke(prompt)
    return res.status(200).json({ response: agentOutputToString(agentResult), status: 'success' })
  } catch (err) {
    console.error('Invocation error:', err)
    return res.status(500).json({
      status: 'error',
      response: err instanceof Error ? err.message : 'Internal server error',
    })
  }
})

app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`AgentCore runtime listening on port ${PORT}`)
})
```

---

## Tool Definition Pattern

```typescript
const myTool = strands.tool({
  name: 'tool_name',           // snake_case, unique
  description: 'Verb phrase describing what it does for the LLM',
  inputSchema: z.object({
    field1: z.string().describe('what this field is'),
    field2: z.number(),
    field3: z.enum(['a', 'b', 'c']),
  }),
  callback: (input): ReturnType => {
    // synchronous or async
    return result
  },
})
```

Add to agent: `tools: [myTool, anotherTool]`

---

## package.json

```json
{
  "name": "agentcore-runtime",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc && node dist/index.js"
  },
  "dependencies": {
    "@strands-agents/sdk": "latest",
    "@aws-sdk/client-bedrock-agentcore": "latest",
    "express": "^5.1.0",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "typescript": "^5.3.3"
  }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Dockerfile

```dockerfile
FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:latest

WORKDIR /app

COPY . ./

RUN npm install

RUN npm run build

EXPOSE 8080

CMD ["npm", "start"]
```

**Rules:**
- `--platform=linux/arm64` is mandatory (AgentCore runs ARM64 containers)
- Use `public.ecr.aws` base image (not DockerHub)
- `EXPOSE` port must match what the app binds to
- `CMD` runs the compiled JS, not `ts-node`

---

## AWS CLI Commands (bedrock-agentcore-control)

The AWS CLI subcommand is `bedrock-agentcore-control` (not `bedrock-agentcore`).

### Create a runtime

```bash
aws bedrock-agentcore-control create-agent-runtime \
  --agent-runtime-name my_agent \
  --agent-runtime-artifact "containerConfiguration={containerUri=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest}" \
  --role-arn ${ROLE_ARN} \
  --network-configuration networkMode=PUBLIC \
  --protocol-configuration serverProtocol=HTTP \
  --region ${AWS_REGION}
```

### Update a runtime (requires runtime ID, not name)

```bash
aws bedrock-agentcore-control update-agent-runtime \
  --agent-runtime-id "${RUNTIME_ID}" \
  --agent-runtime-artifact "containerConfiguration={containerUri=${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}:latest}" \
  --role-arn ${ROLE_ARN} \
  --network-configuration networkMode=PUBLIC \
  --region ${AWS_REGION}
```

### List runtimes (to find runtime ID by name)

```bash
aws bedrock-agentcore-control list-agent-runtimes --region ${AWS_REGION}
```

Response shape:
```json
{
  "agentRuntimes": [
    {
      "agentRuntimeArn": "arn:aws:bedrock-agentcore:us-east-1:ACCOUNT_ID:runtime/my_agent-ABC123",
      "agentRuntimeId": "my_agent-ABC123",
      "agentRuntimeVersion": "1",
      "agentRuntimeName": "my_agent",
      "status": "READY"
    }
  ]
}
```

JMESPath to get ID by name:
```bash
--query "agentRuntimes[?agentRuntimeName=='my_agent'].agentRuntimeId | [0]" --output text
```

### Delete a runtime

```bash
aws bedrock-agentcore-control delete-agent-runtime \
  --agent-runtime-id "${RUNTIME_ID}" \
  --region ${AWS_REGION}
```

---

## IAM Execution Role

The runtime requires an execution role with:
- **Trust policy**: allows `bedrock-agentcore.amazonaws.com` to assume it
- **Permissions**: ECR image pull, CloudWatch Logs, X-Ray, CloudWatch Metrics, Bedrock model invocation

### Trust policy

```json
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
```

### Required inline policy

```json
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
      "Resource": "arn:aws:ecr:REGION:ACCOUNT_ID:repository/*"
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
      "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/bedrock-agentcore/runtimes/*"
    },
    {
      "Effect": "Allow",
      "Action": "logs:DescribeLogGroups",
      "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:REGION:ACCOUNT_ID:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*"
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
        "arn:aws:bedrock:REGION:ACCOUNT_ID:*"
      ]
    }
  ]
}
```

Replace `REGION` and `ACCOUNT_ID` with actual values.

---

## Caller permissions (your IAM user/role)

To deploy and manage runtimes, the calling principal needs:

- `bedrock-agentcore:CreateAgentRuntime`
- `bedrock-agentcore:UpdateAgentRuntime`
- `bedrock-agentcore:DeleteAgentRuntime`
- `bedrock-agentcore:GetAgentRuntime`
- `bedrock-agentcore:ListAgentRuntimes`
- `bedrock-agentcore:InvokeAgentRuntime`
- `iam:PassRole` (for the execution role ARN)
- ECR push permissions (`ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, etc.)

---

## AWS SDK Invocation (TypeScript)

```typescript
import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from '@aws-sdk/client-bedrock-agentcore'

const client = new BedrockAgentCoreClient({ region: 'us-east-1' })

const command = new InvokeAgentRuntimeCommand({
  agentRuntimeArn: 'arn:aws:bedrock-agentcore:<region>:<account_id>:runtime/<runtime_id>',
  runtimeSessionId: 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2),
  qualifier: 'DEFAULT',
  payload: new TextEncoder().encode(JSON.stringify({ prompt: 'your prompt here' })),
})

const response = await client.send(command)
const raw = await response?.response?.transformToString()
const parsed = JSON.parse(raw ?? '{}')
console.log(parsed.response)
```

---

## Checklist when building a new agent

- [ ] `GET /ping` returns `{ status: 'Healthy', time_of_last_update: <unix> }`
- [ ] `POST /invocations` uses `express.raw({ type: '*/*' })` (not json/urlencoded)
- [ ] Body parsed via `parseInvocationPayload` (handles JSON and plain text)
- [ ] Response is always `{ response: string, status: 'success' | 'error' }`
- [ ] Server binds to `0.0.0.0`, port 8080
- [ ] Dockerfile uses `--platform=linux/arm64` and `public.ecr.aws` base image
- [ ] `package.json` has `"type": "module"` and all four runtime deps
- [ ] `tsconfig.json` uses `"module": "ESNext"`, `"moduleResolution": "bundler"`
- [ ] Execution role has trust policy for `bedrock-agentcore.amazonaws.com`
- [ ] Execution role has ECR pull, CloudWatch Logs, X-Ray, and Bedrock invoke permissions
- [ ] Caller has `bedrock-agentcore:*` and `iam:PassRole` permissions
