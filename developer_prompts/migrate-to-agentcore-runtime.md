# Migrate Customer Support Agent to AgentCore Runtime

## Goal

Convert the existing customer support agent from a local Express SSE server into a deployable AWS Bedrock AgentCore runtime container, and update the UI application to invoke it through the AgentCore SDK.

---

## What Exists Today

- A Strands Agents SDK agent 
- A system prompt loaded from a markdown file
- An Express server that streams responses to the UI via SSE
- A React frontend that consumes the SSE stream

---

## What Needs to Happen

### 1. Create the AgentCore Runtime

Replace the Express SSE server with an AgentCore-compatible runtime. The runtime must implement the AgentCore contract (`/invocations` + `/ping`). Keep the same agent logic, tools, and sub-agent — only the HTTP layer changes.

The `/invocations` endpoint should stream the agent's response (use the SDK's streaming capability) so that tokens are sent to the caller as they are generated, not buffered into a single response.

Use the `/agentcore-runtime` skill for the exact contract, template, and Dockerfile requirements.

### 2. Update the UI Integration

The UI currently calls `POST /api/chat` and reads an SSE stream. After migration, the agent lives in AgentCore and no longer serves HTTP directly to the browser.

Connect this to a :
- **Proxy server**: A lightweight backend that receives the UI's requests and calls `InvokeAgentRuntimeCommand` from the AWS SDK, then streams the response back to the frontend.

The runtime should stream its response (SSE or chunked) so the UI can display tokens as they arrive — preserve the existing streaming UX.

### 3. Containerize for Deployment

Create a Dockerfile that meets AgentCore's requirements (ARM64, public ECR base image, compiled JS at runtime). Add a `.dockerignore` to exclude the UI and dev artifacts.

### 4. Create a Deployment Script

Write a shell script (e.g. `deploy.sh`) that automates the full deployment pipeline:
- Build the Docker image (ARM64)
- Create the ECR repository if it doesn't exist
- Authenticate with ECR, tag, and push the image
- Create or update the AgentCore runtime pointing to the pushed image
- Output the runtime ARN on success

The script should accept configuration (region, account ID, runtime name) via environment variables or arguments. It should be idempotent — safe to run repeatedly.

### 5. Configure IAM and Environment

The runtime container needs an execution role with Bedrock model invocation permissions. No hardcoded AWS credentials — the role is assumed automatically. Document the required environment variables.

---

## What NOT to Change

- Tools and sub-agent logic (they work as-is)
- System prompt content
- The CLI entry point (keep it for local testing)

---

## Definition of Done

- `GET /ping` returns a healthy status
- `POST /invocations` accepts a prompt and returns the agent's response in the AgentCore format
- The container builds and runs on ARM64
- The UI can send a message and display the agent's response
- Existing tools and sub-agent behavior is preserved
