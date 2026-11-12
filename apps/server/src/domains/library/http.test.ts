import { BunHttpServer } from '@effect/platform-bun';
import { expect, it } from '@effect/vitest';
import {
  StoragePluginSettingsInput,
  StoragePluginSettingsPersisted,
} from '@govoel/plugins/storage';
import { Array, Effect, Fiber, Latch, Layer, Option } from 'effect';
import {
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpEffect,
  HttpRouter,
} from 'effect/http';
import { HttpApiClient, HttpApiMiddleware, HttpApiTest } from 'effect/http-api';
import { Reactivity } from 'effect/reactivity';
import { TestClock } from 'effect/testing';

import { TursoClient } from '@repo/effect-turso';
import { Api } from '@repo/spec-api';
import { AuthMiddleware } from '@repo/spec-api/domains/auth/http.ts';
import { Library } from '@repo/spec-api/domains/library/schema.ts';

import { ApiConfig } from '#src/config.ts';
import { AuthDatabase } from '#src/domains/auth/database/index.ts';
import {
  AdminMiddlewareLayerNoDeps,
  AuthLayerNoDeps,
  AuthMiddlewareLayerNoDeps,
} from '#src/domains/auth/http.ts';
import { LibraryDatabase } from '#src/domains/library/database/index.ts';
import { LibraryHandlersLayerNoDeps } from '#src/domains/library/http.ts';
import { LibraryRepository } from '#src/domains/library/repository.ts';
import { LibraryService } from '#src/domains/library/service.ts';
import { PluginFixture, TestScheduler, pluginLayer } from '#src/domains/library/testing.ts';
import { StoragePluginMap, StoragePluginSettingsMap } from '#src/domains/plugins/storage/index.ts';
import { ApiRoutesLayerNoDeps } from '#src/http.ts';
import { makeAuthedClient } from '#src/testing/http.ts';

const testDependenciesLayer = Layer.mergeAll(
  AuthMiddlewareLayerNoDeps,
  AdminMiddlewareLayerNoDeps,
  LibraryRepository.layerNoDeps,
  pluginLayer
).pipe(
  Layer.provideMerge(AuthLayerNoDeps),
  Layer.provideMerge(Layer.mergeAll(AuthDatabase.layerNoDeps, LibraryDatabase.layerNoDeps)),
  Layer.provideMerge([ApiConfig.layerTest(), Reactivity.layer]),
  Layer.provideMerge(BunHttpServer.layerHttpServices)
);

const testLayer = LibraryHandlersLayerNoDeps.pipe(
  Layer.provideMerge(LibraryService.layerNoDeps.pipe(Layer.provideMerge(testDependenciesLayer))),
  Layer.provideMerge(TestScheduler.layer)
);

const wireTestLayer = ApiRoutesLayerNoDeps.pipe(
  Layer.provideMerge(LibraryService.layerNoDeps.pipe(Layer.provideMerge(testDependenciesLayer))),
  Layer.provideMerge(HttpRouter.layer)
);

const createInput = (
  name: string,
  pluginId: 'builtin:local' | `npm:${string}` = 'builtin:local'
) => ({
  name: Library.fields.name.make(name),
  type: Library.fields.type.make('movie'),
  storagePluginId: Library.fields.storagePluginId.make(pluginId),
  storagePluginSettings: StoragePluginSettingsInput.make(
    pluginId === 'builtin:local' ? { roots: [] } : { root: '/initial' }
  ),
});
const createRecord = (...args: Parameters<typeof createInput>) => {
  const request = createInput(...args);
  return {
    ...request,
    storagePluginSettings: StoragePluginSettingsPersisted.make(
      request.storagePluginId === 'builtin:local' ? { roots: [] } : { prefix: '/initial' }
    ),
  };
};
const makeClient = Effect.gen(function* () {
  const auth = yield* makeAuthedClient({ username: 'libraryadmin', role: 'admin' });
  return yield* HttpApiTest.groups(Api, ['library']).pipe(Effect.provide(auth.layer));
});

it.layer(testLayer)('library lifecycle', (iit) => {
  iit.effect(
    'round-trips local directory lists through the settings editor and persisted settings',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const input = {
        ...createInput('Local directories'),
        storagePluginSettings: StoragePluginSettingsInput.make({
          roots: ['/books/../audio', '/audio/./', '/movies'],
        }),
      };
      const draft = yield* client.library.getDraftStoragePluginSettingsForm({
        payload: { ...input, id: Option.none() },
      });
      expect(draft).toMatchObject([{ kind: 'TextListField', name: 'roots', initialValue: [] }]);
      const library = yield* client.library.create({ payload: input });
      const created = yield* client.library.get({ params: library });
      expect(created.storagePluginSettings).toEqual({ roots: ['/audio', '/movies'] });
      const form = yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(form).toMatchObject([
        { kind: 'TextListField', name: 'roots', initialValue: ['/audio', '/movies'] },
      ]);
      yield* client.library.update({
        params: library,
        payload: {
          ...input,
          storagePluginSettings: StoragePluginSettingsInput.make({ roots: [] }),
        },
      });
      expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
        roots: [],
      });
      const clearedForm = yield* client.library.getStoragePluginSettingsForm({ params: library });
      expect(clearedForm).toEqual(draft);
    })
  );

  iit.effect(
    'reports cached plugin health without carrying failed proposed configurations into persisted health',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository;
      const editors = yield* StoragePluginSettingsMap;
      yield* editors.invalidate(Library.fields.storagePluginId.make('npm:missing'));
      const record = yield* repository.create(createRecord('Missing plugin', 'npm:missing'));
      const library = { id: record.id };
      const initial = yield* client.library.get({ params: library });
      expect(initial.storagePluginHealth).toEqual({ status: 'unknown' });
      const formError = yield* client.library
        .getStoragePluginSettingsForm({ params: library })
        .pipe(Effect.flip);
      expect(formError).toMatchObject({ _tag: 'PluginLoadError' });
      const failed = yield* client.library.get({ params: library });
      expect(failed.storagePluginHealth).toMatchObject({
        status: 'unhealthy',
        errors: [{ _tag: 'PluginLoadError' }],
      });
      const payload = createInput('Healthy plugin', 'npm:test');
      yield* client.library.update({ params: library, payload });
      const healthy = yield* client.library.get({ params: library });
      expect(healthy.storagePluginHealth).toEqual({ status: 'healthy' });
      const rejected = yield* client.library
        .update({
          params: library,
          payload: {
            ...payload,
            storagePluginSettings: StoragePluginSettingsInput.make({ root: 123 }),
          },
        })
        .pipe(Effect.flip);
      expect(rejected).toMatchObject({ _tag: 'StoragePluginInvalidSettingsError' });
      const after = yield* client.library.get({ params: library });
      expect(after).toEqual(healthy);
    })
  );

  iit.effect(
    'holds the write lock through settings validation and publishes only the complete replacement',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const fixture = yield* PluginFixture;
      const config = yield* ApiConfig;
      const contender = yield* TursoClient.make({
        filename: config.db.libraryFilename,
        busyTimeout: 0,
      });
      const input = createInput('Locked aggregate', 'npm:test');
      const library = yield* client.library.create({ payload: input });
      const before = yield* client.library.get({ params: library });
      const settingsStarted = yield* Latch.make();
      const settingsRelease = yield* Latch.make();
      const { beforeDecode } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        settingsRelease.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.beforeDecode = beforeDecode;
            })
          )
        )
      );
      fixture.controls.beforeDecode = ({ library: metadata }) =>
        metadata.name === 'Replacement aggregate'
          ? settingsStarted.open.pipe(Effect.andThen(settingsRelease.await))
          : Effect.void;
      const payload = {
        ...input,
        name: Library.fields.name.make('Replacement aggregate'),
        type: Library.fields.type.make('show'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/replacement' }),
      };
      const pending = yield* client.library
        .update({ params: library, payload })
        .pipe(Effect.forkChild);
      yield* settingsStarted.await;
      const error = yield* contender`
         update library
         set
           name = 'Contender'
         where
           id = ${library.id}
       `.pipe(Effect.flip);
      expect(error).toMatchObject({ _tag: 'SqlError', reason: { _tag: 'LockTimeoutError' } });
      const current = yield* client.library.get({ params: library });
      expect(current).toEqual(before);
      yield* settingsRelease.open;
      const updated = yield* Fiber.join(pending);
      expect(updated).toEqual(library);
      const after = yield* client.library.get({ params: library });
      expect(after).toMatchObject({
        name: payload.name,
        type: payload.type,
        storagePluginSettings: { prefix: '/replacement' },
      });
    })
  );

  iit.effect(
    'returns before idle plugin cleanup finishes and retires beyond the request scope',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const { drainScheduler } = yield* TestScheduler;
      const fixture = yield* PluginFixture;
      const payload = {
        ...createInput('Background retirement', 'npm:test'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: '/background' }),
      };
      const library = yield* client.library.create({ payload });
      const repository = yield* LibraryRepository;
      const stores = yield* StoragePluginMap;
      const row = yield* repository.getById(library);
      yield* stores.acquire(row.storageKey).pipe(Effect.scoped);

      const started = yield* Latch.make();
      const release = yield* Latch.make();
      const finished = yield* Latch.make();
      fixture.controls.onFinalize = (request) =>
        request.library.id === library.id
          ? started.open.pipe(
              Effect.andThen(release.await),
              Effect.andThen(finished.open),
              Effect.asVoid
            )
          : Effect.void;
      yield* Effect.addFinalizer(() =>
        release.open.pipe(
          Effect.andThen(
            Effect.sync(() => {
              fixture.controls.onFinalize = () => Effect.void;
            })
          )
        )
      );

      const response = yield* Effect.scoped(
        client.library.update({
          params: library,
          payload: { ...payload, name: Library.fields.name.make('Background renamed') },
        })
      );
      expect(response).toEqual(library);
      yield* drainScheduler;
      expect(started.isOpen()).toBe(true);
      expect(finished.isOpen()).toBe(false);
      expect((yield* client.library.get({ params: library })).name).toBe('Background renamed');
      const getStoragePluginSettingsFormResult = yield* client.library.getStoragePluginSettingsForm(
        { params: library }
      );
      expect(getStoragePluginSettingsFormResult).toMatchObject([
        { label: 'Background renamed', initialValue: '/background' },
      ]);
      yield* release.open;
      yield* finished.await;
    })
  );

  iit.effect(
    'rejects invalid local directories without persisting any proposed field',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const input = {
        ...createInput('Directory validation'),
        storagePluginSettings: StoragePluginSettingsInput.make({ roots: ['/original'] }),
      };
      const library = yield* client.library.create({ payload: input });
      const before = yield* client.library.get({ params: library });
      const error = yield* client.library
        .update({
          params: library,
          payload: {
            ...input,
            name: Library.fields.name.make('Invalid root update'),
            type: Library.fields.type.make('show'),
            storagePluginSettings: StoragePluginSettingsInput.make({
              roots: ['relative', '/valid', '/nul\0'],
            }),
          },
        })
        .pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: 'StoragePluginInvalidSettingsError',
      });
      const after = yield* client.library.get({ params: library });
      expect(after).toEqual(before);
    })
  );

  iit.effect(
    'hard deletion cascades mappings but preserves shared media',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const sql = yield* LibraryDatabase;
      const library = yield* client.library.create({
        payload: { ...createInput('Delete cascade') },
      });
      yield* sql`
        insert into
          "mediaFile" (location, "durationMs")
        values
          ('/shared', 100)
      `;
      yield* sql`
        insert into
          "libraryFileMap" (
            "libraryId",
            "mediaFileId",
            "matchFailureReason",
            "customOrder"
          )
        select
          ${library.id},
          id,
          'unmatched',
          0
        from
          "mediaFile"
        where
          location = '/shared'
      `;

      const rows2 = yield* sql`
          select
            "matchFailureReason",
            "customOrder"
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows2).toEqual([{ matchFailureReason: 'unmatched', customOrder: 0 }]);
      yield* client.library.delete({ params: library });

      const rows4 = yield* sql`
          select
            id
          from
            "libraryFileMap"
          where
            "libraryId" = ${library.id}
        `;
      expect(rows4).toEqual([]);
      const rows5 = yield* sql`
          select
            location
          from
            "mediaFile"
          where
            location = '/shared'
        `;
      expect(rows5).toEqual([{ location: '/shared' }]);
      const resultValueError = yield* client.library.get({ params: library }).pipe(Effect.flip);
      expect(resultValueError).toMatchObject({
        _tag: 'LibraryNotFoundError',
      });
    })
  );

  iit.effect(
    'paginates admin listings of configured libraries',
    Effect.fnUntraced(function* () {
      const client = yield* makeClient;
      const repository = yield* LibraryRepository;
      const marker = yield* client.library.create({ payload: createInput('Page marker') });
      const firstRecord = yield* repository.create(createRecord('Page first'));
      const first = { id: firstRecord.id };
      yield* repository.create(createRecord('Page second'));
      const page = yield* client.library.list({
        query: { cursor: Option.some(marker.id), limit: 1 },
      });
      expect(
        Array.map(page.items, ({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page first', storagePluginStatus: 'healthy' }]);
      expect(page.nextCursor).toEqual(Option.some(first.id));
      const last = yield* client.library.list({ query: { cursor: page.nextCursor, limit: 10 } });
      expect(
        Array.map(last.items, ({ name, storagePluginStatus }) => ({ name, storagePluginStatus }))
      ).toEqual([{ name: 'Page second', storagePluginStatus: 'healthy' }]);
      expect(last.nextCursor).toEqual(Option.none());
    })
  );
});

const makeWireTransport = Effect.fnUntraced(function* (
  user: Option.Option<Parameters<typeof makeAuthedClient>[0]>
) {
  const headers = Option.isSome(user)
    ? (yield* makeAuthedClient(user.value)).headers
    : Headers.empty;
  const toHttpEffectResult = yield* HttpRouter.toHttpEffect(Layer.empty);
  const handler = HttpEffect.toWebHandler(toHttpEffectResult);
  const http = HttpClient.make((request, _url, signal) =>
    HttpClientRequest.toWeb(request, { signal }).pipe(
      Effect.flatMap((webRequest) => Effect.promise(async () => handler(webRequest))),
      Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      Effect.orDie
    )
  ).pipe(HttpClient.mapRequest(HttpClientRequest.setHeaders(headers)));
  const client = yield* HttpApiClient.makeWith(Api, {
    httpClient: http,
    baseUrl: 'http://localhost',
  }).pipe(
    Effect.provide(
      HttpApiMiddleware.layerClient(AuthMiddleware, ({ next, request }) => next(request))
    )
  );
  return { client, http, handler, headers };
});

it.layer(wireTestLayer)('library HTTP transport', (iit) => {
  iit.effect(
    'previews persisted settings with draft metadata across plugin versions without saving',
    Effect.fnUntraced(function* () {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_version_draft', role: 'admin' })
      );
      const input = createInput('Plugin version draft', 'npm:test@1');
      const library = yield* client.library.create({ payload: input });
      const before = yield* client.library.get({ params: library });
      const draft = {
        ...input,
        id: Option.some(library.id),
        name: Library.fields.name.make('Renamed plugin version draft'),
        type: Library.fields.type.make('audiobook'),
      };
      for (const pluginId of ['npm:test@1', 'npm:test@2'] as const) {
        const form = yield* client.library.getDraftStoragePluginSettingsForm({
          payload: { ...draft, storagePluginId: Library.fields.storagePluginId.make(pluginId) },
        });
        expect(form).toMatchObject([{ label: draft.name, initialValue: '/initial' }]);
      }
      const afterPreview = yield* client.library.get({ params: library });
      expect(afterPreview).toEqual(before);
      yield* client.library.update({
        params: library,
        payload: {
          ...input,
          storagePluginId: Library.fields.storagePluginId.make('npm:test@2'),
          storagePluginSettings: StoragePluginSettingsInput.make({ root: '/updated' }),
        },
      });
      const updatedForm = yield* client.library.getDraftStoragePluginSettingsForm({
        payload: { ...draft, storagePluginId: Library.fields.storagePluginId.make('npm:test@2') },
      });
      expect(updatedForm).toMatchObject([{ label: draft.name, initialValue: '/updated' }]);
      yield* client.library.delete({ params: library });
      const missing = yield* http.execute(
        HttpClientRequest.post('http://localhost/api/libraries/plugins/storage/settings-form').pipe(
          HttpClientRequest.bodyJsonUnsafe({ ...input, id: library.id })
        )
      );
      expect(missing.status).toBe(404);
      const missingBody = yield* missing.json;
      expect(missingBody).toMatchObject({ _tag: 'LibraryNotFoundError', id: library.id });
    })
  );

  iit.effect(
    'serves draft forms and validates settings before creation over HTTP',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_draft', role: 'admin' })
      );
      const input = createInput('Draft HTTP', 'npm:test');
      const draftForm = yield* client.library.getDraftStoragePluginSettingsForm({
        payload: { ...input, id: Option.none() },
      });
      expect(draftForm).toMatchObject([{ label: 'Draft HTTP', initialValue: '' }]);
      for (const payload of [
        { ...input, storagePluginSettings: StoragePluginSettingsInput.make({ root: 123 }) },
        { ...input, storagePluginSettings: StoragePluginSettingsInput.make({}) },
      ]) {
        const createError = yield* client.library.create({ payload }).pipe(Effect.flip);
        expect(createError).toMatchObject({
          _tag: 'StoragePluginInvalidSettingsError',
        });
        expect(
          Array.some(
            (yield* client.library.list({ query: { cursor: Option.none(), limit: 100 } })).items,
            (row) => row.name === input.name
          )
        ).toBe(false);
      }
      const created = yield* client.library.create({
        payload: { ...input },
      });
      const library = yield* client.library.get({ params: created });
      expect(library).toMatchObject({
        storagePluginSettings: { prefix: '/initial' },
      });
      yield* client.library.delete({ params: created });
    })
  );

  iit.effect(
    'replaces all editable fields with PUT, rejects partial payloads, conflicts, and missing libraries',
    Effect.fnUntraced(function* () {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_replace', role: 'admin' })
      );
      const initial = { ...createInput('Original HTTP aggregate') };
      const library = yield* client.library.create({ payload: initial });
      const before = yield* client.library.get({ params: library });
      const partial = yield* http.execute(
        HttpClientRequest.put(`http://localhost/api/libraries/${library.id}`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ name: 'Partial' })
        )
      );
      expect(partial.status).toBe(400);
      const unchanged = yield* client.library.get({ params: library });
      expect(unchanged).toEqual(before);
      const payload = {
        ...createInput('Replaced HTTP aggregate', 'npm:test'),
        type: Library.fields.type.make('audiobook'),
        storagePluginSettings: StoragePluginSettingsInput.make({ root: ' /settings ' }),
      };
      const response = yield* http.execute(
        HttpClientRequest.put(`http://localhost/api/libraries/${library.id}`).pipe(
          HttpClientRequest.bodyJsonUnsafe(payload)
        )
      );
      expect(response.status).toBe(200);
      const result = yield* response.json;
      expect(result).toEqual(library);
      const replaced = yield* client.library.get({ params: library });
      expect(replaced).toMatchObject({
        ...library,
        name: payload.name,
        type: payload.type,
        storagePluginId: payload.storagePluginId,
        storagePluginSettings: { prefix: '/settings' },
      });
      yield* client.library.update({ params: library, payload });
      const repeated = yield* client.library.get({ params: library });
      expect(repeated).toEqual(replaced);
      yield* Effect.acquireRelease(
        client.library.create({ payload: createInput('Reserved HTTP name') }),
        (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const conflict = yield* http.execute(
        HttpClientRequest.put(`http://localhost/api/libraries/${library.id}`).pipe(
          HttpClientRequest.bodyJsonUnsafe({ ...payload, name: 'Reserved HTTP name' })
        )
      );
      expect(conflict.status).toBe(409);
      const afterConflict = yield* client.library.get({ params: library });
      expect(afterConflict).toEqual(repeated);
      yield* client.library.delete({ params: library });
      const missing = yield* http.execute(
        HttpClientRequest.put(`http://localhost/api/libraries/${library.id}`).pipe(
          HttpClientRequest.bodyJsonUnsafe(payload)
        )
      );
      expect(missing.status).toBe(404);
    })
  );

  iit.effect.each(['client interruption', 'request abort'] as const)(
    'interrupts and finalizes blocked settings decoding on %s',
    Effect.fnUntraced(
      function* (scenario) {
        const { client, handler, headers } = yield* makeWireTransport(
          Option.some({ username: 'wire_cancellation', role: 'admin' })
        );
        const fixture = yield* PluginFixture;
        const library = yield* Effect.acquireRelease(
          client.library.create({
            payload: createInput(`HTTP ${scenario}`, 'npm:test'),
          }),
          (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
        );
        const started = yield* Latch.make();
        const interrupted = yield* Latch.make();
        const finalized = yield* Latch.make();
        const release = yield* Latch.make();
        const { beforeDecode } = fixture.controls;
        yield* Effect.addFinalizer(() =>
          release.open.pipe(
            Effect.andThen(
              Effect.sync(() => {
                fixture.controls.beforeDecode = beforeDecode;
              })
            )
          )
        );
        fixture.controls.beforeDecode = (request) =>
          request.library.name === `HTTP ${scenario}`
            ? Effect.acquireUseRelease(
                Effect.void,
                () =>
                  started.open.pipe(
                    Effect.andThen(release.await),
                    Effect.onInterrupt(() => interrupted.open.pipe(Effect.asVoid))
                  ),
                () => finalized.open.pipe(Effect.asVoid)
              )
            : Effect.void;
        const payload = {
          ...createInput(`HTTP ${scenario}`, 'npm:test'),
          type: Library.fields.type.make('show'),
          storagePluginSettings: StoragePluginSettingsInput.make({ root: '/cancelled' }),
        };
        // oxlint-disable-next-line effecttsgo/abort-controller-in-effect -- model a caller-owned signal independent of Effect interruption
        const controller = new AbortController();
        const request = yield* (
          scenario === 'client interruption'
            ? client.library.update({ params: library, payload })
            : HttpClientRequest.toWeb(
                HttpClientRequest.put(`http://localhost/api/libraries/${library.id}`).pipe(
                  HttpClientRequest.setHeaders(headers),
                  HttpClientRequest.bodyJsonUnsafe(payload)
                ),
                { signal: controller.signal }
              ).pipe(
                Effect.flatMap((webRequest) => Effect.promise(async () => handler(webRequest)))
              )
        ).pipe(Effect.forkChild);
        yield* started.await;
        if (scenario === 'request abort') {
          controller.abort();
        } else {
          yield* Fiber.interrupt(request);
        }
        yield* interrupted.await;
        yield* finalized.await;
        expect((yield* client.library.get({ params: library })).storagePluginSettings).toEqual({
          prefix: '/initial',
        });
      },
      (effect) => TestClock.withLive(effect.pipe(Effect.timeout('3 seconds')))
    )
  );

  iit.effect(
    'opens default forms for incompatible saved settings so they can be replaced',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_incompatible_settings', role: 'admin' })
      );
      const repository = yield* LibraryRepository;
      const input = {
        ...createInput('Incompatible local settings'),
        storagePluginSettings: StoragePluginSettingsInput.make({ roots: ['/replacement'] }),
      };
      const original = StoragePluginSettingsPersisted.make({ prefix: '/another-plugin' });
      const library = yield* repository.create({ ...input, storagePluginSettings: original });
      const savedForm = yield* client.library.getStoragePluginSettingsForm({ params: library });
      const draftForm = yield* client.library.getDraftStoragePluginSettingsForm({
        payload: { ...input, id: Option.some(library.id) },
      });
      expect(savedForm).toMatchObject([{ name: 'roots', initialValue: [] }]);
      expect(draftForm).toEqual(savedForm);
      const afterPreview = yield* repository.getById(library);
      expect(afterPreview).toEqual(library);
      yield* client.library.update({ params: library, payload: input });
      const updated = yield* client.library.get({ params: library });
      expect(updated.storagePluginSettings).toEqual({ roots: ['/replacement'] });
      yield* client.library.delete({ params: library });
    })
  );

  iit.effect.each([
    [
      'invalid submission',
      422,
      'StoragePluginInvalidSettingsError',
      'Submitted storage plugin settings failed validation',
    ],
    ['operational PUT', 500, 'StoragePluginSettingsError', 'Settings unavailable'],
  ] as const)(
    'distinguishes submitted settings validation from operational failures: %s',
    Effect.fnUntraced(function* ([scenario, status, tag, message]) {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_settings', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const payload = createInput(`HTTP settings ${scenario}`, 'npm:test');
      const library = yield* Effect.acquireRelease(client.library.create({ payload }), (created) =>
        client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const before = yield* client.library.get({ params: library });
      const { settingsError } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          fixture.controls.settingsError = settingsError;
        })
      );
      fixture.controls.settingsError = scenario === 'operational PUT';
      const input = StoragePluginSettingsInput.make({
        root:
          scenario === 'invalid submission' ? { secret: 'submitted-settings-secret' } : '/updated',
      });
      const path = `http://localhost/api/libraries/${library.id}`;
      const response = yield* http.execute(
        HttpClientRequest.put(path).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            ...payload,
            name: 'Rejected settings update',
            type: 'show',
            storagePluginSettings: input,
          })
        )
      );
      expect(response.status).toBe(status);
      const body = yield* response.json;
      expect(body).toEqual({ _tag: tag, message });
      const after = yield* client.library.get({ params: library });
      expect(after).toEqual(before);
    })
  );

  iit.effect.each(['malformed form output', 'malformed persisted output'] as const)(
    'returns a bodyless 500 without changing persisted settings for %s',
    Effect.fnUntraced(function* (scenario) {
      const { client, http } = yield* makeWireTransport(
        Option.some({ username: 'wire_malformed_settings', role: 'admin' })
      );
      const fixture = yield* PluginFixture;
      const library = yield* Effect.acquireRelease(
        client.library.create({
          payload: createInput(`HTTP settings ${scenario}`, 'npm:test'),
        }),
        (created) => client.library.delete({ params: created }).pipe(Effect.orDie)
      );
      const before = yield* client.library.get({ params: library });
      const { invalidForm, invalidPersisted } = fixture.controls;
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          Object.assign(fixture.controls, { invalidForm, invalidPersisted });
        })
      );
      fixture.controls.invalidForm = scenario === 'malformed form output';
      fixture.controls.invalidPersisted = scenario === 'malformed persisted output';
      const path = `http://localhost/api/libraries/${library.id}`;
      const response = yield* http.execute(
        scenario === 'malformed form output'
          ? HttpClientRequest.get(`${path}/plugins/storage/settings-form`)
          : HttpClientRequest.put(path).pipe(
              HttpClientRequest.bodyJsonUnsafe({
                ...createInput(`HTTP settings ${scenario}`, 'npm:test'),
                storagePluginSettings: StoragePluginSettingsInput.make({
                  root: 'submitted-settings-secret',
                }),
              })
            )
      );
      expect(response.status).toBe(500);
      const text = yield* response.text;
      expect(text).toBe('');
      const after = yield* client.library.get({ params: library });
      expect(after).toEqual(before);
    })
  );

  iit.effect(
    'encodes settings JSON and returns bodyless, idempotent deletion',
    Effect.fnUntraced(function* () {
      const { client } = yield* makeWireTransport(
        Option.some({ username: 'wire_admin', role: 'admin' })
      );
      const library = yield* client.library.create({ payload: createInput('HTTP library') });
      const get = yield* client.library.get({ params: library, responseMode: 'response-only' });
      expect(get.headers['content-type']).toContain('application/json');
      const json = yield* get.json;
      expect(json).toMatchObject({
        ...library,
        storagePluginSettings: { roots: [] },
        storagePluginHealth: { status: 'healthy' },
      });
      const list = yield* client.library.list({
        query: { cursor: Option.none(), limit: 1 },
        responseMode: 'response-only',
      });
      const json2 = yield* list.json;
      expect(json2).toEqual({
        items: [expect.objectContaining({ ...library, storagePluginSettings: { roots: [] } })],
        nextCursor: { _tag: 'None' },
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const deleted = yield* client.library.delete({
          params: library,
          responseMode: 'response-only',
        });
        expect(deleted.status).toBe(204);
        const text = yield* deleted.text;
        expect(text).toBe('');
      }
      const missing = yield* client.library.get({ params: library }).pipe(Effect.flip);
      expect(missing).toMatchObject({ _tag: 'LibraryNotFoundError', ...library });
    })
  );

  iit.effect(
    'rejects invalid path and pagination values',
    Effect.fnUntraced(function* () {
      const { http } = yield* makeWireTransport(
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
        const response = yield* http.get(`http://localhost${path}`);
        expect(response.status, path).toBe(400);
      }
    })
  );

  iit.effect.each([
    [Option.none(), 401, 'UnauthorizedError'],
    [Option.some({ username: 'wire_user', role: 'user' } as const), 403, 'ForbiddenError'],
    [Option.some({ username: 'wire_under18', role: 'under18' } as const), 403, 'ForbiddenError'],
  ] as const)(
    'enforces HTTP authentication and admin access (%s)',
    Effect.fnUntraced(function* ([user, status, tag]) {
      const { http } = yield* makeWireTransport(user);
      for (const request of [
        HttpClientRequest.get('http://localhost/api/libraries?limit=1'),
        HttpClientRequest.post('http://localhost/api/libraries').pipe(
          HttpClientRequest.bodyJsonUnsafe(createInput('Denied HTTP creation'))
        ),
      ]) {
        const response = yield* http.execute(request);
        expect(response.status).toBe(status);
        const body = yield* response.json;
        expect(body).toEqual({ _tag: tag });
      }
    })
  );
});
