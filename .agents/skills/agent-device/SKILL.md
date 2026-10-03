---
name: agent-device
description: Automates Apple-platform apps (iOS, tvOS, macOS) and Android devices. Use when navigating apps, taking snapshots/screenshots, tapping, typing, scrolling, extracting UI info, collecting logs/network/perf evidence, or planning agent-device CLI commands.
disable-model-invocation: true
---

# agent-device

For a normal app-driving task, start immediately. Do not probe first with `--help`, `--version`, `devices`, `appstate`, `snapshot`, or `screenshot`:

```bash
bun agent-device open <app> --foreground
```

That starts the session and returns the initial interactive snapshot with `@refs`.

Loop: act with `press|click|fill|longpress <target> ... --settle`, `scroll <direction> --settle`, or `back --settle`; continue from the printed diff, verify the named expectation (`wait text "..."`, `is`, `get`, or `find`), then run `bun agent-device close`.

Reaching an off-screen target is one command, not a scroll-and-check loop: `scroll down --until <selector>` scrolls until that element is on screen, and `scroll bottom` runs to the end of the content. Repeated bare `scroll down` calls are the slow way to find something.

Copy refs byte-for-byte: `@e12`, `@e12~s4` — keep the `@` and any `~sN`. Prefer current refs, then `id`/`label`/`role` selectors; coordinates are a last resort. If snapshot reports sparse/AX-unavailable, its refs and selectors are invalid: run `bun agent-device screenshot`, inspect the image, use coordinates, then retry `snapshot -i` after navigating. Otherwise run `snapshot -i` only when the diff lacks the next target.

Error output includes corrective hints; follow them instead of re-planning. Only when the task is specialized (for example gestures, scripting, TV, macOS, remote, or debugging) or a command shape is unclear, run `bun agent-device help <topic>`. `bun agent-device --help` lists topics, but is not a startup step.

## Specialized workflows

For specialized tasks, read the smallest version-matched CLI guide that fits:

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
```

Let the selected help topic provide exact command shapes, platform limits, and current workflow guidance; use `help workflow` as the full reference when a task-specific topic is too narrow.

For precise location workflows, read the installed `settings` help before planning so coordinate support and platform limits come from the active CLI version.
