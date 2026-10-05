/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Deferred, Effect, Fiber, Layer, Option, Schema } from 'effect';
import { FetchHttpClient, Headers, HttpEffect, HttpRouter } from 'effect/http';
import { HttpApiClient, HttpApiMiddleware } from 'effect/http-api';
import { TestClock } from 'effect/testing';

import { Api } from '@repo/spec-api';
import { Library } from '@repo/spec-api/database/schema.ts';
import { AuthMiddleware } from '@repo/spec-api/middlewares/auth.ts';

import { ApiRoutesLayerNoDeps } from '#src/groups/index.ts';
import { makeAuthedClient, makeRawRequest } from '#src/groups/utils.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/services/auth.ts';
import { AuthDatabase } from '#src/services/database/auth/index.ts';
import { LibraryRepository } from '#src/services/libraries/repository.ts';
import {
  PluginFixture,
  createInput,
  librariesTestLayer,
} from '#src/services/libraries/test-fixture.ts';

const wireTestLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provideMerge(
    Layer.mergeAll(AuthMiddlewareLayerNoDeps, AdminMiddlewareLayerNoDeps).pipe(
      Layer.provideMerge(AuthLayerNoDeps),
      Layer.provideMerge(AuthDatabase.layerNoDeps)
    )
  ),
  Layer.provideMerge(librariesTestLayer),
  Layer.provideMerge(BunHttpServer.layerHttpServices),
  Layer.provideMerge(HttpRouter.layer)
);

// The Fetch override is local to this client; plugin HTTP traffic keeps its real transport.
const makeWireTransport = Effect.fnUntraced(function* (
  user: Option.Option<Parameters<typeof makeAuthedClient>[0]>
) {
  const auth = Option.isSome(user)
    ? yield* makeAuthedClient(user.value)
    : {
        headers: Headers.empty,
        layer: HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request)),
      };
  const handler = HttpEffect.toWebHandler(yield* HttpRouter.toHttpEffect(Layer.empty));
  const localFetch: typeof fetch = Object.assign(
    async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      handler(
        input instanceof Request ? new Request(input, init) : new Request(input.toString(), init)
      ),
    {
      preconnect() {
        // In-memory requests do not open connections.
      },
    }
  );
  const client = yield* HttpApiClient.make(Api, { baseUrl: 'http://localhost' }).pipe(
    Effect.provide([
      auth.layer,
      Layer.fresh(FetchHttpClient.layer).pipe(
        Layer.provide(Layer.succeed(FetchHttpClient.Fetch, localFetch))
      ),
    ])
  );
  return { client, send: makeRawRequest({ handler, headers: auth.headers }) };
});

it.layer(wireTestLayer)('library HTTP transport', (iit) => {
  iit.effect(
    'rejects unauthenticated requests',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(Option.none());
      expect(
        yield* client.library.create({ payload: createInput('Unauthorized') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
      expect(
        yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'UnauthorizedError' });
    })
  );
  iit.effect.each(['user', 'under18'] as const)(
    'rejects non-admin %s requests',
    Effect.fnUntraced(function* (role) {
      const { client } = yield* makeWireTransport(Option.some({ username: role, role }));
      expect(
        yield* client.library.create({ payload: createInput('Forbidden') }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
      expect(
        yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } }).pipe(Effect.flip)
      ).toMatchObject({ _tag: 'ForbiddenError' });
    })
  );

  iit.effect.each(['typed interruption', 'raw interruption', 'raw explicit abort'] as const)(
    'interrupts and finalizes blocked settings decoding on %s',
    Effect.fnUntraced(
      function* (scenario) {
        const { client, send } = yield* makeWireTransport(
          Option.some({ username: 'wire_cancellation', role: 'admin' })
        );
        const fixture = yield* PluginFixture;
        const library = yield* Effect.acquireRelease(
          client.library.create({
            payload: createInput(`HTTP ${scenario}`, 'npm:test'),
          }),
          (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
        );
        const started = yield* Deferred.make<boolean>();
        const interrupted = yield* Deferred.make<boolean>();
        const finalized = yield* Deferred.make<boolean>();
        const release = yield* Deferred.make<boolean>();
        const { beforeDecode } = fixture.controls;
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(release, true).pipe(
            Effect.andThen(
              Effect.sync(() => {
                fixture.controls.beforeDecode = beforeDecode;
              })
            )
          )
        );
        fixture.controls.beforeDecode = (request) =>
          request.library.id === library.id
            ? Effect.acquireUseRelease(
                Effect.void,
                () =>
                  Deferred.succeed(started, true).pipe(
                    Effect.andThen(Deferred.await(release)),
                    Effect.onInterrupt(() =>
                      Deferred.succeed(interrupted, true).pipe(Effect.asVoid)
                    )
                  ),
                () => Deferred.succeed(finalized, true).pipe(Effect.asVoid)
              )
            : Effect.void;
        const payload = { input: StoragePluginSettingsInput.make({ root: '/cancelled' }) };
        // oxlint-disable-next-line effecttsgo/abort-controller-in-effect -- model a caller-owned signal independent of Effect interruption
        const controller = new AbortController();
        const request = yield* (
          scenario === 'typed interruption'
            ? client.library.setStoragePluginSettings({ params: library, payload })
            : send({
                path: `/api/libraries/${library.id}/plugins/storage/settings`,
                method: 'PUT',
                body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
                // Raw interruption must still work when the caller also supplies a signal.
                signal: controller.signal,
              })
        ).pipe(Effect.forkChild);
        yield* Deferred.await(started);
        expect(yield* Deferred.isDone(interrupted)).toBe(false);
        expect(yield* Deferred.isDone(finalized)).toBe(false);
        if (scenario === 'raw explicit abort') {
          controller.abort();
        } else {
          yield* Fiber.interrupt(request);
          expect(controller.signal.aborted).toBe(false);
        }
        yield* Deferred.await(interrupted);
        yield* Deferred.await(finalized);
        expect(yield* Deferred.isDone(release)).toBe(false);
        expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
          Option.none()
        );
      },
      // A live deadline makes a missing abort fail instead of waiting on the test clock.
      (effect) => TestClock.withLive(effect.pipe(Effect.timeout('3 seconds')))
    )
  );

  iit.effect.each([
    [
      'invalid submission',
      'PUT',
      422,
      'LibraryInvalidStoragePluginSettingsError',
      'Submitted storage plugin settings failed validation',
    ],
    ['operational GET', 'GET', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    ['operational PUT', 'PUT', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
    [
      'malformed form',
      'GET',
      500,
      'StoragePluginSettingsError',
      'Storage plugin returned an invalid settings form',
    ],
    [
      'malformed persisted output',
      'PUT',
      500,
      'StoragePluginSettingsError',
      'Storage plugin returned invalid persisted settings',
    ],
    [
      'invalid current settings',
      'GET',
      500,
      'StoragePluginSettingsError',
      'Storage plugin could not build the settings form from the current settings',
    ],
  ] as const)(
    'distinguishes submitted settings validation from operational failures: %s',
    Effect.fnUntraced(function* ([scenario, method, status, tag, message]) {
      const { client, send } = yield* makeWireTransport(
        Option.some({ username: 'wire_settings', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const repository = yield* LibraryRepository;
      const library = yield* Effect.acquireRelease(
        client.library.create({
          payload: createInput(`HTTP settings ${scenario}`, 'npm:test'),
        }),
        (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const original = StoragePluginSettingsPersisted.make(
        scenario === 'invalid current settings' ? {} : { prefix: '/original' }
      );
      yield* repository.setSettings({ ...library, settings: original });
      const { invalidForm, invalidPersisted, settingsError } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Object.assign(fixture.controls, { invalidForm, invalidPersisted, settingsError });
        })
      );
      fixture.controls.invalidForm = scenario === 'malformed form';
      fixture.controls.invalidPersisted = scenario === 'malformed persisted output';
      fixture.controls.settingsError =
        scenario === 'operational GET' || scenario === 'operational PUT';
      const input = StoragePluginSettingsInput.make({
        root:
          scenario === 'invalid submission' ? { secret: 'submitted-settings-secret' } : '/updated',
      });
      const path = `/api/libraries/${library.id}/plugins/storage`;
      const response = yield* send(
        method === 'GET'
          ? { path: `${path}/settings-form`, method }
          : {
              path: `${path}/settings`,
              method,
              body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ input }),
            }
      );
      expect(response.status).toBe(status);
      const body = yield* Effect.promise(async () => response.text());
      expect(yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(body)).toEqual({
        _tag: tag,
        message,
      });
      expect(body).not.toContain('submitted-settings-secret');
      // Also prove the API schema decodes the wire error into the declared client error.
      const error = yield* method === 'GET'
        ? client.library.getStoragePluginSettingsForm({ params: library }).pipe(Effect.flip)
        : client.library
            .setStoragePluginSettings({ params: library, payload: { input } })
            .pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: tag, message });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual(
        Option.some(original)
      );
    })
  );

  iit.effect(
    'serves resource methods, tagged errors, Option JSON, and bodyless deletion',
    Effect.fnUntraced(function* () {
      const { client, send } = yield* makeWireTransport(
        Option.some({ username: 'wire_admin', role: 'admin' })
      );
      const payload = createInput('HTTP library');
      const created = yield* send({
        path: '/api/libraries',
        method: 'POST',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
      });
      expect(created.status).toBe(200);
      const library = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ id: Library.json.fields.id })
      )(yield* Effect.promise(async () => created.json()));
      const path = `/api/libraries/${library.id}`;
      const get = yield* send({ path, method: 'GET' });
      expect(get.status).toBe(200);
      expect(get.headers.get('content-type')).toContain('application/json');
      expect(yield* Effect.promise(async () => get.json())).toMatchObject({
        ...library,
        storagePluginSettings: { _tag: 'None' },
        storagePluginHealth: { status: 'unknown' },
      });
      const conflict = yield* send({
        path: '/api/libraries',
        method: 'POST',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(payload),
      });
      expect(conflict.status).toBe(409);
      expect(yield* Effect.promise(async () => conflict.json())).toMatchObject({
        _tag: 'LibraryNameConflictError',
      });
      expect(
        (yield* send({
          path,
          method: 'PATCH',
          body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
            name: 'HTTP renamed',
          }),
        })).status
      ).toBe(200);
      const form = yield* send({ path: `${path}/plugins/storage/settings-form`, method: 'GET' });
      expect(form.status).toBe(200);
      expect(yield* Effect.promise(async () => form.json())).toEqual([]);
      const unconfigured = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ roots: [] }),
      });
      expect(unconfigured.status).toBe(409);
      expect(yield* Effect.promise(async () => unconfigured.json())).toMatchObject({
        _tag: 'LibraryUnconfiguredError',
      });
      expect(
        (yield* send({
          path: `${path}/plugins/storage/settings`,
          method: 'PUT',
          body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({ input: {} }),
        })).status
      ).toBe(200);
      const invalidRoot = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          roots: [{ root: 'relative' }],
        }),
      });
      expect(invalidRoot.status).toBe(422);
      expect(yield* Effect.promise(async () => invalidRoot.json())).toMatchObject({
        _tag: 'LibraryInvalidRootError',
      });
      const roots = yield* send({
        path: `${path}/roots`,
        method: 'PUT',
        body: yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          roots: [{ root: '/wire' }],
        }),
      });
      expect(roots.status).toBe(200);
      expect(yield* Effect.promise(async () => roots.json())).toEqual({
        ...library,
        roots: [{ root: '/wire' }],
      });
      const trailing = yield* client.library.create({ payload: createInput('HTTP trailing') });
      const list = yield* send({ path: '/api/libraries?limit=1', method: 'GET' });
      expect(list.status).toBe(200);
      expect(yield* Effect.promise(async () => list.json())).toMatchObject({
        items: [
          { ...library, name: 'HTTP renamed', storagePluginSettings: { _tag: 'Some', value: {} } },
        ],
        nextCursor: { _tag: 'Some', value: library.id },
      });
      const decoded = yield* client.library.list({ query: { cursor: Option.none(), limit: 1 } });
      expect(decoded.items[0]?.storagePluginSettings).toEqual(Option.some({}));
      expect(decoded.nextCursor).toEqual(Option.some(library.id));
      const next = yield* send({
        path: `/api/libraries?limit=1&cursor=${library.id}`,
        method: 'GET',
      });
      expect(next.status).toBe(200);
      expect(yield* Effect.promise(async () => next.json())).toMatchObject({
        items: [{ ...trailing, name: 'HTTP trailing', storagePluginSettings: { _tag: 'None' } }],
        nextCursor: { _tag: 'None' },
      });
      const deleted = yield* send({ path, method: 'DELETE' });
      expect(deleted.status).toBe(204);
      expect(yield* Effect.promise(async () => deleted.text())).toBe('');
      expect(
        (yield* client.library.delete({ params: library, responseMode: 'response-only' })).status
      ).toBe(204);
      const missing = yield* send({ path, method: 'GET' });
      expect(missing.status).toBe(404);
      expect(yield* Effect.promise(async () => missing.json())).toEqual({
        _tag: 'LibraryNotFoundError',
        ...library,
      });
    })
  );

  iit.effect(
    'validates path and query values before handlers run',
    Effect.fnUntraced(function* () {
      const { send } = yield* makeWireTransport(
        Option.some({ username: 'wire_validation', role: 'admin' })
      );
      for (const path of [
        '/api/libraries/not-an-id',
        '/api/libraries/-1',
        '/api/libraries',
        '/api/libraries?limit=0',
        '/api/libraries?limit=101',
        '/api/libraries?limit=1.5',
        '/api/libraries?limit=1&cursor=invalid',
      ]) {
        const response = yield* send({ path, method: 'GET' });
        expect(response.status, path).toBe(400);
      }
    })
  );

  iit.effect.each([
    [Option.none(), 401, 'UnauthorizedError'],
    [Option.some({ username: 'wire_user', role: 'user' } as const), 403, 'ForbiddenError'],
  ] as const)(
    'enforces HTTP authentication and admin access (%s)',
    Effect.fnUntraced(function* ([user, status, tag]) {
      const { send } = yield* makeWireTransport(user);
      const response = yield* send({ path: '/api/libraries?limit=1', method: 'GET' });
      expect(response.status).toBe(status);
      expect(yield* Effect.promise(async () => response.json())).toEqual({ _tag: tag });
    })
  );
});
