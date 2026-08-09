import { Layer } from 'effect';

import { AtomDevTools } from '@repo/effect-atom-devtools-core/atom-dev-tools';

import { AgentToolsLayer } from '#src/react-native/agent/layer.ts';
import { RpcServerLayer } from '#src/react-native/rpc/layer.ts';

export const AtomDevToolsLayer = Layer.mergeAll(RpcServerLayer, AgentToolsLayer).pipe(
  Layer.provideMerge(AtomDevTools.layer)
);
