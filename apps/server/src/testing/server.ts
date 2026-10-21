import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Console, Context, Layer } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';

import { AllRoutesLayer } from '#src/index.ts';

// Report the child's own address only after the application handler and dependencies are ready.
const TestServerLayer = HttpRouter.serve(AllRoutesLayer).pipe(
  Layer.provideMerge(BunHttpServer.layer({ hostname: '127.0.0.1', port: 0 })),
  Layer.tap((context) =>
    Console.log(
      JSON.stringify({
        type: 'ready',
        url: HttpServer.formatAddress(Context.get(context, HttpServer.HttpServer).address),
      })
    )
  )
);

BunRuntime.runMain(Layer.launch(TestServerLayer));
