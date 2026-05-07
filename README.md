# Customer Support Agent — Learning Exercise

This project is a hands-on exercise for learning how to build AI agents using **Claude Code** and the **Strands AgentCore SDK**. Each git branch represents an incremental step in the build, so you can follow along stage by stage.

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
- `AWS_REGION` set (defaults to `us-west-2`)

## Running the project

```bash
npm install
npx tsx src/index.ts
```
