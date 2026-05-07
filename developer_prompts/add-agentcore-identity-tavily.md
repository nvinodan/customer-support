# Add News Search via AgentCore Identity + Tavily

## Goal

Give the agent a tool that searches current news for shipping-related events (weather, port closures, carrier delays) that could affect a customer's order. Retrieve the Tavily API key from AgentCore Identity — no hardcoded secrets.

---

## Context

The agent handles customer support for orders. Customers ask "where is my package?" or "why is my order delayed?" — the agent currently has no way to check real-world events that might explain delays.

Tavily is a search API optimized for AI agents. The API key is stored as a credential provider in AgentCore Identity. The agent retrieves it at runtime using the workload access token.

Use the `/agentcore-identity` skill for the SDK patterns and credential retrieval.

---

## What Needs to Happen

### 1. Create the Tavily Search Tool

Create `src/tools/searchNews.ts` — a Zod tool that:
- Takes a search query (e.g., "shipping delays US east coast May 2026")
- Retrieves the Tavily API key from AgentCore Identity using `withApiKey` or `GetResourceApiKeyCommand`
- Calls the Tavily search API (`POST https://api.tavily.com/search`)
- Returns a summarized list of relevant results
- Falls back gracefully if identity service is unavailable (return "unable to search news")

### 2. Register the Tool with the Agent

Add the new tool to the agent's tool list in `src/agent.ts`.

### 3. Update `deploy.sh` with Identity Permissions

Add IAM permissions for identity to the runtime execution role:
- `bedrock-agentcore:GetWorkloadAccessToken`
- `bedrock-agentcore:GetResourceApiKey`

### 4. Update `deploy.sh` to Pass Credential Provider Name

Pass `CREDENTIAL_PROVIDER_NAME` as an environment variable to the runtime (alongside `MEMORY_ID`).

---

## What NOT to Change

- The agent's system prompt (the agent will use the tool when relevant based on its existing instructions)
- The AgentCore contract (`/ping`, `/invocations` format)
- Existing tools or sub-agents
- Streaming behavior

---

## Tavily API Reference

```
POST https://api.tavily.com/search
Content-Type: application/json

{
  "api_key": "<key>",
  "query": "shipping delays weather disruptions",
  "search_depth": "basic",
  "max_results": 5,
  "include_answer": true
}

Response:
{
  "answer": "...",
  "results": [
    { "title": "...", "url": "...", "content": "..." }
  ]
}
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `CREDENTIAL_PROVIDER_NAME` | Name of the credential provider in AgentCore Identity (e.g., `tavily-api`) |
| `WORKLOAD_NAME` | Registered workload name (only if using low-level SDK) |

---

## Definition of Done

- Agent can search current news when a customer asks about potential shipping issues
- Tavily API key is retrieved from AgentCore Identity at runtime — not hardcoded or in env vars
- If identity service is unavailable, the tool returns a graceful fallback (does not break the agent)
- IAM permissions for identity are included in `deploy.sh`
- `CREDENTIAL_PROVIDER_NAME` is passed to the runtime as an env var
