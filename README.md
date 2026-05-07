# Customer Support Agent — Learning Exercise

This project is a hands-on exercise for learning how to build AI agents using **Claude Code** and the **Strands Agents SDK**. Each git branch represents an incremental step in the build, so you can follow along stage by stage.

## What you'll learn

**Part 1 — Build an agent with Claude Code**
- Build a customer support agent using the Strands Agents SDK
- Learn how to use Claude Code Skills, Agents, and MCP servers

**Part 2 — Deploy to AWS AgentCore**
- Deploy the agent to AWS AgentCore Runtime
- Explore AgentCore features: Identity, Memory, and Observability

## How to follow along

Each branch adds one concept on top of the last. Check out branches in order to see how the agent evolves:

```bash
git branch -a   # list all branches
git checkout <branch-name>
```

## Prerequisites

- Node.js 18+
- AWS credentials configured (`~/.aws/credentials` or environment variables)
- Docker (for building the AgentCore container)
- AWS CLI v2 with `bedrock-agentcore-control` support

## Running the project

### Local development (no AWS required)

```bash
npm install

# CLI mode
npx tsx src/index.ts

# Server mode (UI + backend)
npx tsx src/server.ts        # port 3001
cd ui && npm install && npm run dev  # port 5173
```

### AgentCore runtime (local testing)

```bash
npx tsx src/runtime.ts  # port 8080

# Test endpoints
curl http://localhost:8080/ping
curl -X POST http://localhost:8080/invocations \
  -H 'Content-Type: application/json' \
  -d '{"prompt": "What is the status of ORD-123?"}'
```

### Deploy to AWS AgentCore

```bash
# Set required env vars
export AWS_ACCOUNT_ID=123456789012
export AWS_REGION=us-east-1  # optional, defaults to us-east-1

# Build, push to ECR, and create/update runtime
./deploy.sh
```

The deploy script will:
1. Build the Docker image (ARM64)
2. Create the ECR repository if needed
3. Push the image
4. Create the IAM execution role with required permissions
5. Create AgentCore Memory (session-scoped, for conversational context)
6. Create or update the AgentCore runtime (with `MEMORY_ID` env var)

### Connect the UI to a deployed runtime

```bash
# Set the ARN output from deploy.sh
export AGENT_RUNTIME_ARN=arn:aws:bedrock-agentcore:us-east-1:123456789012:runtime/customer_support_agent-xxxxx

export MEMORY_ID=arn:aws:bedrock-agentcore:us-east-1:12345678012:memory/customer_agent_memory-xxxxxx

# Start the proxy (bridges UI requests to AgentCore)
npx tsx src/proxy.ts  # port 3001

# Start the UI
cd ui && npm run dev  # port 5173
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `AWS_REGION` | No | `us-east-1` | AWS region |
| `AWS_ACCOUNT_ID` | Deploy only | — | AWS account for ECR and AgentCore |
| `AGENT_RUNTIME_ARN` | Proxy only | — | ARN of the deployed AgentCore runtime |
| `MEMORY_ID` | No | — | AgentCore Memory resource ID (memory disabled if unset) |
| `PORT` | No | `8080` (runtime) / `3001` (proxy/server) | Listen port |

## Project structure

```
src/
  index.ts          — CLI entry point
  server.ts         — Express SSE server (local dev)
  runtime.ts        — AgentCore runtime (/ping + /invocations)
  proxy.ts          — Proxy: UI → AgentCore SDK → runtime
  agent.ts          — Orchestrator agent
  memory.ts         — AgentCore Memory (retrieve/store per session)
  prompts/prompt.md — System prompt
  tools/
    getOrderStatus.ts   — Order lookup (mock)
    initiateRefund.ts   — Refund processor (mock)
  subagents/
    refundAgent.ts      — Refund specialist sub-agent
ui/                 — React + Vite + Tailwind frontend
Dockerfile          — ARM64 container for AgentCore
deploy.sh           — Build, push, deploy, and set up memory
```
