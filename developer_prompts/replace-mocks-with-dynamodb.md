# Replace Mock Data with DynamoDB

## Goal

Replace all hardcoded mock data in the agent's tools with a real DynamoDB table, and provide a setup script to create the table and seed it with sample data.

---

## Context

The agent's tools currently use inline hardcoded data. This works for demos but needs to be backed by a real data store for the deployed AgentCore runtime.

---

## What Needs to Happen

### 1. Create a DynamoDB Setup Script

Write a script that:
- Creates a DynamoDB table suitable for storing the data currently mocked in the tools
- Seeds it with sample records matching the shapes already in the mock data
- Is idempotent — safe to run repeatedly without errors or duplicates

### 2. Update Tools to Use DynamoDB

Replace all hardcoded mock data in the agent's tools with DynamoDB queries. The tools should:
- Read from the table instead of in-memory maps
- Write back when the tool performs a mutation (e.g. processing a refund)
- Return the same response shapes as before — the agent's interface doesn't change

### 3. Update `deploy.sh`

- Add DynamoDB read/write permissions to the runtime's IAM execution role
- Pass the table name to the runtime as an environment variable

---

## What NOT to Change

- Tool names, descriptions, or input schemas
- The agent orchestrator or sub-agent structure
- The system prompt
- Memory or observability integration

---

## Definition of Done

- A setup script creates and seeds the DynamoDB table
- All tools read/write from DynamoDB instead of hardcoded data
- The deploy script grants the runtime DynamoDB access
- The agent behaves identically from the user's perspective
- The setup script is idempotent
