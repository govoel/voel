import { withRozenite } from '@rozenite/metro';
import { Effect } from 'effect';
// Learn more https://docs.expo.io/guides/customizing-metro
import { getDefaultConfig } from 'expo/metro-config.js';

import { Env } from './env.mts';

const env = Effect.runSync(Effect.service(Env).pipe(Effect.provide(Env.layer)));

// oxlint-disable-next-line typescript/no-unsafe-argument
const config = withRozenite(getDefaultConfig(import.meta.dirname), {
  enabled: env.rozeniteEnabled,
  include: ['@repo/effect-atom-devtools-rozenite'],
});

export default config;
