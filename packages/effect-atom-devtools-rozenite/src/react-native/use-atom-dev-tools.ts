import { useRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Fiber, Layer, ManagedRuntime } from 'effect';
import { AtomRegistry } from 'effect/unstable/reactivity';
import { useEffect, useMemo } from 'react';

import { AtomDevTools } from '@repo/effect-atom-devtools-core/atom-dev-tools';
import { AtomDevToolsRpcServerFromService } from '@repo/effect-atom-devtools-core/rpc-server';

import { useAtomDevToolsAgentTools } from '#src/react-native/agent/use-agent-tools.ts';
import { layerRozeniteRpcServerProtocol } from '#src/react-native/rpc-server-protocol.ts';
import { EFFECT_ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/plugin-id.ts';
import type { EffectRpcEventMap } from '#src/shared/rpc-messages.ts';

export interface UseAtomDevToolsOptions {
  readonly registry: AtomRegistry.AtomRegistry;
}

export const useAtomDevTools = ({ registry }: UseAtomDevToolsOptions): void => {
  const runtime = useMemo(
    () =>
      ManagedRuntime.make(
        AtomDevTools.layer.pipe(Layer.provide(Layer.succeed(AtomRegistry.AtomRegistry, registry)))
      ),
    [registry]
  );

  useAtomDevToolsAgentTools(runtime);

  const client = useRozeniteDevToolsClient<EffectRpcEventMap>({
    pluginId: EFFECT_ATOM_DEVTOOLS_PLUGIN_ID,
  });

  useEffect(() => {
    if (client === null) {
      return (): void => {
        // No server was acquired while the Rozenite client was unavailable.
      };
    }

    const serverLayer = AtomDevToolsRpcServerFromService.pipe(
      Layer.provide(layerRozeniteRpcServerProtocol(client))
    );
    const serverFiber = runtime.runFork(Layer.launch(serverLayer));

    return () => {
      Effect.runFork(Fiber.interrupt(serverFiber));
    };
  }, [client, runtime]);

  useEffect(
    () => () => {
      Effect.runFork(runtime.disposeEffect);
    },
    [runtime]
  );
};
