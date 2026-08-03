---
name: agent-device
description: Automates Apple-platform apps (iOS, tvOS, macOS) and Android devices. Use when navigating apps, taking snapshots/screenshots, tapping, typing, scrolling, extracting UI info, collecting logs/network/perf evidence, or planning agent-device CLI commands.
disable-model-invocation: true
---

# agent-device

Before your first agent-device command or plan, read the smallest version-matched CLI guide that fits the task:

```bash
bun agent-device help manual-qa   # scripted/manual QA, acceptance checks, checklist execution
bun agent-device help validate    # code/runtime validation, stale build or daemon risk
bun agent-device help dogfood     # exploratory app dogfooding and evidence collection
bun agent-device help workflow    # fallback reference for general app driving or mixed tasks
```

Read additional topics only when relevant:

```bash
bun agent-device help debugging
bun agent-device help react-native
bun agent-device help react-devtools
bun agent-device help cdp
bun agent-device help remote
bun agent-device help macos
bun agent-device help dogfood
```

Default loop: `open -> snapshot/-i -> get/is/find or press/fill/scroll/wait -> verify -> close`.

Use this skill only to route into version-matched CLI help. Let the selected help topic provide exact command shapes, platform limits, and current workflow guidance; use `help workflow` as the full reference when a task-specific topic is too narrow.

For precise location workflows, read the installed `settings` help before planning so coordinate support and platform limits come from the active CLI version.
