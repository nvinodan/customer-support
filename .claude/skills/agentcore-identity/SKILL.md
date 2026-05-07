---
name: agentcore-identity
description: Add outbound authentication to an AWS Bedrock AgentCore runtime agent using AgentCore Identity — the managed credential service for calling external APIs on behalf of workloads or users.
---

# Skill: agentcore-identity

Add outbound authentication to an AWS Bedrock AgentCore runtime agent using AgentCore Identity — the managed credential service for calling external APIs on behalf of workloads or users.

## When to use this skill

Invoke `/agentcore-identity` when the user asks to:
- Have the agent call an external API (GitHub, Salesforce, Tavily, custom provider)
- Retrieve API keys stored in AgentCore Identity
- Implement OAuth2 flows (machine-to-machine or user-delegated)
- Fetch access tokens or API keys without storing credentials in the agent container
- Set up workload identity for the agent runtime

---

## Concepts

| Term | Meaning |
|---|---|
| **Workload Identity** | A named identity registered in AgentCore that represents your agent. Created via CLI before the runtime can retrieve credentials. |
| **Workload Access Token** | Proof of the agent's own identity — obtained by calling `GetWorkloadAccessTokenCommand` with the workload name |
| **Resource OAuth2 Token** | Access token for a specific external API, exchanged using the workload token |
| **Resource API Key** | API key stored in AgentCore Identity, retrieved using the workload token |
| **Credential Provider** | Named registration in AgentCore for an external service (e.g., `tavily-api`, `github-oauth`). Stores the actual secret (API key or OAuth2 config). |
| **OAuth2 Flow** | `USER_FEDERATION` (3-legged, user consent), `M2M` (machine-to-machine), `ON_BEHALF_OF_TOKEN_EXCHANGE` |

---

## Setup: Creating Workload Identity and Credential Provider

Before the runtime can retrieve credentials, you must create the workload identity and credential provider via CLI.

### 1. Create a workload identity

```bash
aws bedrock-agentcore-control create-workload-identity \
  --name "<workload-name>" \
  --region us-east-1
```

The `--name` is a string you choose (e.g., `customer_support_agent`). Pass this same name to the runtime as the `WORKLOAD_NAME` environment variable.

### 2. Create a credential provider (API key)

```bash
aws bedrock-agentcore-control create-api-key-credential-provider \
  --name "<provider-name>" \
  --api-key "<your-api-key>" \
  --region us-east-1
```

The `--name` (e.g., `tavily-api`) is what you pass as `CREDENTIAL_PROVIDER_NAME` to the runtime.

### 3. How the runtime retrieves credentials

The runtime calls `GetWorkloadAccessTokenCommand` with the workload name → receives a workload token → uses that token to call `GetResourceApiKeyCommand` with the credential provider name → receives the API key.

```
Runtime                        AgentCore Identity
  |                                   |
  |-- GetWorkloadAccessToken -------->|
  |   (workloadName)                  |
  |<-- workloadAccessToken -----------|
  |                                   |
  |-- GetResourceApiKey ------------->|
  |   (workloadIdentityToken,         |
  |    resourceCredentialProviderName) |
  |<-- apiKey ------------------------|
```

### Deploy script pattern (create-or-ignore)

```bash
WORKLOAD_NAME="${WORKLOAD_NAME:-${RUNTIME_NAME}}"

# Create workload identity (ignore if exists)
if aws bedrock-agentcore-control create-workload-identity \
  --name "${WORKLOAD_NAME}" \
  --region "${AWS_REGION}" 2>&1 | grep -q -e "ConflictException" -e "already exists"; then
  echo "Workload identity already exists."
else
  echo "Workload identity created."
fi

# Pass to runtime as env var
--environment-variables WORKLOAD_NAME=${WORKLOAD_NAME},CREDENTIAL_PROVIDER_NAME=${CREDENTIAL_PROVIDER_NAME}
```

---

## SDK Package

```bash
npm install bedrock-agentcore
```

The `bedrock-agentcore` package provides higher-level wrappers (`withApiKey`, `withAccessToken`) that handle workload token extraction and credential fetching automatically.

---

## Option A: High-Level SDK (`bedrock-agentcore`)

### Import

```typescript
import { withApiKey, withAccessToken } from 'bedrock-agentcore/identity'
```

### `withApiKey` — retrieve an API key

Wraps a function and injects the API key as the last parameter. The workload access token is automatically extracted from the AgentCore request context.

```typescript
interface ApiKeyWrapperConfig {
  workloadIdentityToken?: string  // optional — auto-extracted from context if omitted
  providerName: string            // credential provider name in AgentCore
}
```

```typescript
const searchWithKey = withApiKey({
  providerName: 'tavily-api',
})(async (query: string, apiKey: string): Promise<string> => {
  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query }),
  })
  const data = await resp.json() as { results: Array<{ title: string; content: string }> }
  return data.results.map(r => `${r.title}: ${r.content}`).join('\n\n')
})

// Call without the apiKey arg — it's injected automatically:
const result = await searchWithKey('latest shipping delays')
```

### `withAccessToken` — retrieve an OAuth2 token

```typescript
interface OAuth2WrapperConfig {
  workloadIdentityToken?: string
  providerName: string
  scopes: string[]
  resources?: string[]
  audiences?: string[]
  authFlow: 'M2M' | 'USER_FEDERATION' | 'ON_BEHALF_OF_TOKEN_EXCHANGE'
  onAuthUrl?: (url: string) => void | Promise<void>
  forceAuthentication?: boolean
  callbackUrl?: string
  customState?: string
  customParameters?: Record<string, string>
}
```

```typescript
const callGitHub = withAccessToken({
  providerName: 'github-oauth',
  scopes: ['repo'],
  authFlow: 'M2M',
})(async (org: string, token: string): Promise<string> => {
  const resp = await fetch(`https://api.github.com/orgs/${org}/repos`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const repos = await resp.json() as Array<{ full_name: string }>
  return repos.map(r => r.full_name).join('\n')
})
```

### How context works

When running inside an AgentCore runtime, the `x-amzn-bedrock-agentcore-workload-access-token` request header contains the workload token. The SDK's runtime (`BedrockAgentCoreApp`) extracts it and makes it available via context — so `withApiKey`/`withAccessToken` can auto-resolve it without you passing it explicitly.

If you are **not** using `BedrockAgentCoreApp` (e.g., custom Express), pass the token manually:

```typescript
const workloadToken = req.headers['x-amzn-bedrock-agentcore-workload-access-token'] as string

const searchWithKey = withApiKey({
  providerName: 'tavily-api',
  workloadIdentityToken: workloadToken,
})(async (query: string, apiKey: string) => { /* ... */ })
```

---

## Option B: Low-Level AWS SDK (`@aws-sdk/client-bedrock-agentcore`)

### Import

```typescript
import {
  BedrockAgentCoreClient,
  GetWorkloadAccessTokenCommand,
  GetResourceOauth2TokenCommand,
  GetResourceApiKeyCommand,
} from '@aws-sdk/client-bedrock-agentcore'
```

### Get workload token (machine-to-machine)

```typescript
const client = new BedrockAgentCoreClient({ region: process.env.AWS_REGION ?? 'us-east-1' })

async function getWorkloadToken(): Promise<string> {
  const response = await client.send(
    new GetWorkloadAccessTokenCommand({
      workloadName: process.env.WORKLOAD_NAME!,
    })
  )
  return response.workloadAccessToken!
}
```

### Retrieve an API key

```typescript
async function getApiKey(providerName: string): Promise<string> {
  const workloadToken = await getWorkloadToken()
  const response = await client.send(
    new GetResourceApiKeyCommand({
      workloadIdentityToken: workloadToken,
      resourceCredentialProviderName: providerName,
    })
  )
  return response.apiKey!
}
```

### Retrieve an OAuth2 token

```typescript
async function getOAuth2Token(providerName: string, scopes: string[]): Promise<string> {
  const workloadToken = await getWorkloadToken()
  const response = await client.send(
    new GetResourceOauth2TokenCommand({
      workloadIdentityToken: workloadToken,
      resourceCredentialProviderName: providerName,
      scopes,
      oauth2Flow: 'M2M',
    })
  )
  return response.accessToken!
}
```

---

## Required IAM permissions

Add to the runtime execution role:

```json
{
  "Effect": "Allow",
  "Action": [
    "bedrock-agentcore:GetWorkloadAccessToken",
    "bedrock-agentcore:GetResourceOauth2Token",
    "bedrock-agentcore:GetResourceApiKey",
    "bedrock-agentcore:CompleteResourceTokenAuth"
  ],
  "Resource": "*"
},
{
  "Effect": "Allow",
  "Action": "secretsmanager:GetSecretValue",
  "Resource": "*"
}
```

---

## Required environment variables

| Variable | Purpose |
|---|---|
| `WORKLOAD_NAME` | Registered workload name in AgentCore Identity (only needed for low-level SDK) |
| `CREDENTIAL_PROVIDER_NAME` | Named credential provider in AgentCore (e.g., `tavily-api`) |
| `AWS_REGION` | AWS region, fallback `us-east-1` |

---

## Checklist

- [ ] Workload identity created via `aws bedrock-agentcore-control create-workload-identity --name <name>`
- [ ] Credential provider created (`create-api-key-credential-provider` for API keys, or via console)
- [ ] IAM role has identity permissions (`GetWorkloadAccessToken`, `GetResourceApiKey`, `GetResourceOauth2Token`)
- [ ] IAM role has `secretsmanager:GetSecretValue` permission (required by AgentCore to read stored credentials)
- [ ] `WORKLOAD_NAME` env var passed to runtime (same name used in `create-workload-identity`)
- [ ] `CREDENTIAL_PROVIDER_NAME` env var passed to runtime
- [ ] For API keys: use `withApiKey` (high-level) or `GetWorkloadAccessTokenCommand` + `GetResourceApiKeyCommand` (low-level)
- [ ] For OAuth2 M2M: use `withAccessToken` with `authFlow: 'M2M'`
- [ ] For user-delegated OAuth2: handle `authorizationUrl` response, call `CompleteResourceTokenAuthCommand` after consent
