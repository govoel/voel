import { getRozeniteDevToolsClient } from '@rozenite/plugin-bridge';
import { Effect, Layer, Schema } from 'effect';

import { AtomDevTools, serveAtomDevToolsRpc } from '@repo/atom-devtools-core';
import type { AtomDevToolsRpcEventMap } from '@repo/atom-devtools-core';

import { makeRozeniteRpcServerTransport } from '#src/react-native/rpc-server.ts';
import { ATOM_DEVTOOLS_PLUGIN_ID } from '#src/shared/constants.ts';

class RozeniteConnectionError extends Schema.TaggedErrorClass<RozeniteConnectionError>(
  '@repo/atom-devtools-plugin/RozeniteConnectionError'
)('RozeniteConnectionError', {
  cause: Schema.Defect(),
}) {}

const runServer = Effect.acquireRelease(
  Effect.tryPromise({
    try: async () => getRozeniteDevToolsClient<AtomDevToolsRpcEventMap>(ATOM_DEVTOOLS_PLUGIN_ID),
    catch: (cause) => new RozeniteConnectionError({ cause }),
  }),
  (client) =>
    Effect.sync(() => {
      client.close();
    })
).pipe(
  Effect.tap((client) =>
    Effect.sleep(0).pipe(
      Effect.andThen(
        Effect.sync(() => {
          client.send('plugin-mounted', { pluginId: ATOM_DEVTOOLS_PLUGIN_ID });
        })
      )
    )
  ),
  Effect.flatMap((client) => serveAtomDevToolsRpc(makeRozeniteRpcServerTransport(client))),
  Effect.catchTag('RozeniteConnectionError', (error) =>
    Effect.logWarning('Atom DevTools could not connect to Rozenite.').pipe(
      Effect.annotateLogs({ cause: error.cause })
    )
  )
);

const RpcServerLayer = Layer.effectDiscard(Effect.forkScoped(runServer));

export const AtomDevToolsPluginLayer = RpcServerLayer.pipe(Layer.provideMerge(AtomDevTools.layer));
