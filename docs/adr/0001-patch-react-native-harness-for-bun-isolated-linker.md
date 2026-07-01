# Patch React Native Harness for Bun Isolated Linker

React Native Harness 1.3.0 assumes hoisted package resolution in a few Metro and Babel paths, but this repo is moving toward Bun's isolated linker to make dependency boundaries explicit. We patch the published Harness packages instead of keeping `node-linker=hoisted`, forking Harness, or waiting on upstream fixes, because the needed changes are small and local: resolve Harness Babel plugins from the preset package, make the Metro entry-point resolver tolerate Bun's symlinked `.bun` paths, and load Expo's winter runtime before the Harness entry point so native `TextDecoder` is present without running Metro polyfills in a scope where `require` is unavailable.

## Considered Options

- Keep `node-linker=hoisted`: easiest short term, but preserves hidden dependency leaks and makes isolated-install regressions invisible.
- Fork React Native Harness: gives full control, but creates more maintenance than the current patch size justifies.
- Patch only `react-native-harness`: insufficient because the failures live in separately published packages, especially `@react-native-harness/babel-preset`, `@react-native-harness/bundler-metro`, and `@react-native-harness/jest`.

## Consequences

The patches are tied to Harness 1.3.0 and should be rechecked when upgrading Harness. The client also declares `@babel/runtime` directly because isolated linking exposes that the app bundle depends on it instead of receiving it through a hoisted transitive dependency.
