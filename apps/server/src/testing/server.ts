import { BunHttpServer, BunRuntime } from '@effect/platform-bun';
import { Console, Context, Effect, Layer, Schema } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';

import { AllRoutesLayer } from '#src/index.ts';

const encodeReadyMessage = Schema.encodeEffect(
  Schema.fromJsonString(
    Schema.Struct({
      type: Schema.Literal('ready'),
      url: Schema.String,
    })
  )
);

const TestServerLayer = HttpRouter.serve(AllRoutesLayer).pipe(
  Layer.provideMerge(BunHttpServer.layer({ hostname: '127.0.0.1', port: 0 })),
  Layer.tap((context) =>
    encodeReadyMessage({
      type: 'ready',
      url: HttpServer.formatAddress(Context.get(context, HttpServer.HttpServer).address),
    }).pipe(Effect.flatMap(Console.log), Effect.orDie)
  )
);

BunRuntime.runMain(Layer.launch(TestServerLayer));
