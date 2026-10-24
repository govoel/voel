---
name: file-pr
description: File a concise pull request. Use when the user asks to file, oper, or create a PR.
disable-model-invocation: true
---

# File PR

- PR titles become the commit message on `main`, so they should use scoped commits (not conventional commits) style. Prefer a concise, human-readable title that explains why the change matters.
- PR descriptions should aim for simplicity. Open with a minimal, clear description of the problem. Follow up with how you solved it. Do not lead with an implementation inventory.
- If a PR for this branch already exists, ensure the PR title and description are up to date with the changes in the branch.

## Scoped Commits Style

`<scope>: <message>`, where scope identifies the affected area of the project.

Examples:
- auth: add password reset flow
- api: handle missing user IDs
- editor: simplify command parsing
- docs: clarify setup instructions
