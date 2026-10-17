---
name: agent-browser
description: Browser automation CLI for AI agents. Use when navigating websites, filling forms, taking screenshots, extracting data, testing or dogfooding web apps, automating Electron apps or Slack, or using cloud browsers.
disable-model-invocation: true
---

# agent-browser

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.

## Start here

This file is a discovery stub, not the usage guide. Before running any `agent-browser` command, load the actual workflow content from the CLI:

```bash
bun agent-browser skills get core             # start here — workflows, common patterns, troubleshooting
bun agent-browser skills get core --full      # include full command reference and templates
```

The CLI serves skill content that always matches the installed version, so instructions never go stale. The content in this stub cannot change between releases, which is why it just points at `skills get core`.

## Specialized skills

Load a specialized skill when the task falls outside browser web pages:

```bash
bun agent-browser skills get electron          # Electron desktop apps (VS Code, Slack, Discord, Figma, ...)
bun agent-browser skills get slack             # Slack workspace automation
bun agent-browser skills get dogfood           # Exploratory testing / QA / bug hunts
bun agent-browser skills get derive-client     # Record a HAR, derive a standalone API client for a site
bun agent-browser skills get vercel-sandbox    # agent-browser inside Vercel Sandbox microVMs
bun agent-browser skills get protected-vercel-deployments  # Access protected Vercel deployments
bun agent-browser skills get agentcore         # AWS Bedrock AgentCore cloud browsers
```

Run `bun agent-browser skills list` to see everything available on the installed version.

## Observability Dashboard

The dashboard runs independently of browser sessions on port 4848 and can also be opened through a proxied or forwarded URL such as `https://dashboard.agent-browser.localhost`. Agents should stay on the dashboard origin: session tabs, status, and stream traffic are proxied internally, so session ports do not need to be exposed.

Ensure you manage sessions properly, especially closing sessions after use.
