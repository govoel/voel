---
name: agent-browser
description: Browser automation CLI for AI agents. Use when the user needs to interact with websites, including navigating pages, filling forms, clicking buttons, taking screenshots, extracting data, testing web apps, or automating any browser task.
disable-model-invocation: true
---

# agent-browser

Fast browser automation CLI for AI agents. Chrome/Chromium via CDP with accessibility-tree snapshots and compact `@eN` element refs.

## Start here

This file is a discovery stub, not the usage guide. Before running any `bun agent-browser` command, load the actual workflow content from the CLI:

```bash
bun agent-browser skills get core             # start here — workflows, common patterns, troubleshooting
bun agent-browser skills get core --full      # include full command reference and templates
```

The CLI serves skill content that always matches the installed version, so instructions never go stale. The content in this stub cannot change between releases, which is why it just points at `skills get core`.

## Specialized skills

Load a specialized skill when the task falls outside browser web pages:

```bash
bun agent-browser skills get dogfood           # Exploratory testing / QA / bug hunts
bun agent-browser skills get derive-client     # Record a HAR, derive a standalone API client for a site
```

Run `bun agent-browser skills list` to see everything available on the installed version.
