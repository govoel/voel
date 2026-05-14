import { expect, it } from '@effect/vitest';
import { Context, Effect, Layer, Option, Schema, SchemaGetter } from 'effect';
import { Headers } from 'effect/unstable/http';
import { RpcClient, RpcMiddleware, RpcTest } from 'effect/unstable/rpc';

import type { TestHelpers } from '@repo/auth-api/server.ts';
import { Api } from '@repo/spec-api';
import { DatabaseNoSuchElementError } from '@repo/spec-api/database/index.js';
import { LibraryTable, MediaTypes } from '@repo/spec-api/database/library.ts';
import { AuthMiddleware, Unauthorized } from '@repo/spec-api/middlewares/auth.ts';

import { LibraryHandlers } from '#src/groups/library.ts';
import { AdminMiddlewareLive, Auth, AuthMiddlewareLive } from '#src/services/auth.ts';
import { ApiConfig } from '#src/services/config.ts';
import { DatabaseLive } from '#src/services/database/index.ts';
import { LibraryRepository } from '#src/services/database/repos/library.ts';

const AuthClientPassthrough = RpcMiddleware.layerClient(AuthMiddleware, ({ next, request }) =>
  next(request)
);

type AuthRole = 'admin' | 'under18';

interface TestUserSpec {
  readonly role: AuthRole;
  readonly email?: string;
  readonly name?: string;
  readonly username?: string;
}

interface TestUsersWithoutDefaultAdmin {
  readonly defaultadmin?: never;
}

type TestUsersWithDefaultAdmin<Users extends Readonly<Record<string, TestUserSpec>>> = Users & {
  readonly defaultadmin: TestUserSpec;
};

type TestSessionHeadersFor<Users extends Readonly<Record<string, TestUserSpec>>> = {
  readonly [Name in keyof TestUsersWithDefaultAdmin<Users>]: Headers.Headers;
};

const isTestHelpers = (value: unknown): value is TestHelpers =>
  typeof value === 'object' &&
  value !== null &&
  'createUser' in value &&
  'saveUser' in value &&
  'deleteUser' in value &&
  'getAuthHeaders' in value;

class TestHelpersUnavailable extends Schema.TaggedErrorClass<TestHelpersUnavailable>()(
  '@repo/server/groups/library.test/TestHelpersUnavailable',
  {}
) {}

const getTestHelpers = Effect.fnUntraced(function* (auth: Auth['Service']) {
  const context = yield* Effect.tryPromise(async () => auth.$context).pipe(Effect.orDie);

  if (!('test' in context) || !isTestHelpers(context.test)) {
    return yield* new TestHelpersUnavailable();
  }

  return context.test;
});

const makeTestSessions = <const Users extends Readonly<Record<string, TestUserSpec>>>(
  users: Users & TestUsersWithoutDefaultAdmin
) => {
  class TestSessionHeaders extends Context.Service<
    TestSessionHeaders,
    TestSessionHeadersFor<Users>
  >()('@repo/server/groups/library.test/TestSessionHeaders') {}

  const layer = Layer.effect(
    TestSessionHeaders,
    Effect.gen(function* () {
      const auth = yield* Auth;
      const test = yield* getTestHelpers(auth);
      const userIds: string[] = [];
      const sessionHeaderEntries: [string, Headers.Headers][] = [];
      const createSessionHeaders = Effect.fnUntraced(function* (name: string, spec: TestUserSpec) {
        const username = spec.username ?? name;
        const user = test.createUser({
          email: spec.email ?? `${name}@library.test.localhost`,
          name: spec.name ?? `Library ${name}`,
          username,
          displayUsername: username,
          role: spec.role,
        });
        const savedUser = yield* Effect.tryPromise(async () => test.saveUser(user)).pipe(
          Effect.orDie
        );
        userIds.push(savedUser.id);

        const headers = yield* Effect.tryPromise(async () =>
          test.getAuthHeaders({ userId: savedUser.id })
        ).pipe(Effect.orDie);
        return Headers.fromInput(headers);
      });

      sessionHeaderEntries.push([
        'defaultadmin',
        yield* createSessionHeaders('defaultadmin', {
          role: 'admin',
          email: 'defaultadmin@library.test.localhost',
          name: 'Default Admin',
          username: 'defaultadmin',
        }),
      ]);

      for (const [name, spec] of Object.entries(users)) {
        sessionHeaderEntries.push([name, yield* createSessionHeaders(name, spec)]);
      }

      yield* Effect.addFinalizer(() =>
        Effect.forEach(
          userIds,
          (userId) => Effect.tryPromise(async () => test.deleteUser(userId)).pipe(Effect.orDie),
          { discard: true }
        )
      );

      return TestSessionHeaders.of(
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
        Object.fromEntries(sessionHeaderEntries) as TestSessionHeadersFor<Users>
      );
    })
  );

  return { TestSessionHeaders, layer } as const;
};

const makeTestLayer = <const Users extends Readonly<Record<string, TestUserSpec>>>(
  users: Users & TestUsersWithoutDefaultAdmin
) => {
  const testSessions = makeTestSessions(users);
  const authLayers = Layer.mergeAll(AuthMiddlewareLive, testSessions.layer).pipe(
    Layer.provide(Auth.layer)
  );
  const layer = LibraryHandlers.pipe(
    Layer.provideMerge(Layer.mergeAll(authLayers, AdminMiddlewareLive)),
    Layer.provideMerge(AuthClientPassthrough),
    Layer.provideMerge(LibraryRepository.layer),
    Layer.provideMerge(DatabaseLive),
    Layer.provideMerge(ApiConfig.layerTest())
  );

  return { ...testSessions, layer } as const;
};

const forceBrandLibraryId = Schema.decodeEffect(
  Schema.Number.pipe(
    Schema.decodeTo(LibraryTable.fields.id, {
      decode: SchemaGetter.transform((i) => i),
      encode: SchemaGetter.transform((i) => i),
    })
  )
);

const makeLibraryClient = (headers: Headers.Headers) =>
  RpcTest.makeClient(Api).pipe(
    Effect.map((client) => ({
      libraryDelete: (...args: Parameters<typeof client.libraryDelete>) =>
        client.libraryDelete(...args).pipe(RpcClient.withHeaders(headers)),
      libraryGet: (...args: Parameters<typeof client.libraryGet>) =>
        client.libraryGet(...args).pipe(RpcClient.withHeaders(headers)),
      libraryList: (...args: Parameters<typeof client.libraryList>) =>
        client.libraryList(...args).pipe(RpcClient.withHeaders(headers)),
      libraryUpsert: (...args: Parameters<typeof client.libraryUpsert>) =>
        client.libraryUpsert(...args).pipe(RpcClient.withHeaders(headers)),
    }))
  );

const LibraryAuthorizationTest = makeTestLayer({});

it.layer(LibraryAuthorizationTest.layer)('library authorization', (iit) => {
  iit.effect(
    'should reject unauthenticated library mutations',
    Effect.fnUntraced(function* () {
      const client = yield* RpcTest.makeClient(Api);

      const upsertResult = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: 'movie',
          name: 'Unauthorized Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      const deleteResult = yield* client
        .libraryDelete({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      expect(upsertResult).toBeInstanceOf(Unauthorized);
      expect(deleteResult).toBeInstanceOf(Unauthorized);
    })
  );
});

const LibraryTest = makeTestLayer({});

it.layer(LibraryTest.layer)('library', (iit) => {
  iit.effect(
    'should list active libraries',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'List Movie Library',
        absolutePaths: ['/movie/list-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: 'List Show Library',
        absolutePaths: ['/show/list-path-1', '/show/list-path-2'],
      });
      const result3 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'List Audiobook Library',
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result2.id });

      const result = yield* client.libraryList({ cursor: Option.none(), limit: 50 });

      expect(result).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'List Movie Library',
            absolutePaths: ['/movie/list-path'],
          },
          {
            id: result3.id,
            type: 'audiobook',
            name: 'List Audiobook Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect(
    'should paginate active libraries by cursor',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const marker = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Cursor Marker Library',
        absolutePaths: [],
      });
      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Movie Library',
        absolutePaths: ['/movie/page-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'show',
        name: 'Page Show Library',
        absolutePaths: ['/show/page-path'],
      });
      const result3 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'Page Audiobook Library',
        absolutePaths: ['/audiobook/page-path'],
      });
      const result4 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Page Extra Movie Library',
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result2.id });

      const page1 = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 2 });

      expect(page1).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'Page Movie Library',
            absolutePaths: ['/movie/page-path'],
          },
          {
            id: result3.id,
            type: 'audiobook',
            name: 'Page Audiobook Library',
            absolutePaths: ['/audiobook/page-path'],
          },
        ],
        nextCursor: Option.some(result3.id),
      });

      const page2 = yield* client.libraryList({ cursor: page1.nextCursor, limit: 2 });

      expect(page2).toEqual({
        items: [
          {
            id: result4.id,
            type: 'movie',
            name: 'Page Extra Movie Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });

      const pageAfterFirst = yield* client.libraryList({
        cursor: Option.some(result1.id),
        limit: 1,
      });

      expect(pageAfterFirst).toEqual({
        items: [
          {
            id: result3.id,
            type: 'audiobook',
            name: 'Page Audiobook Library',
            absolutePaths: ['/audiobook/page-path'],
          },
        ],
        nextCursor: Option.some(result3.id),
      });
    })
  );

  iit.effect(
    'should return an empty page after the last library',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Empty Page Movie Library',
        absolutePaths: [],
      });

      const result = yield* client.libraryList({ cursor: Option.some(result1.id), limit: 10 });

      expect(result).toEqual({
        items: [],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect(
    'should list a page larger than the active library count',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const marker = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Large Page Cursor Marker Library',
        absolutePaths: [],
      });
      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: 'Large Page Movie Library',
        absolutePaths: ['/movie/large-page-path'],
      });
      const result2 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'audiobook',
        name: 'Large Page Audiobook Library',
        absolutePaths: [],
      });

      const result = yield* client.libraryList({ cursor: Option.some(marker.id), limit: 100 });

      expect(result).toEqual({
        items: [
          {
            id: result1.id,
            type: 'movie',
            name: 'Large Page Movie Library',
            absolutePaths: ['/movie/large-page-path'],
          },
          {
            id: result2.id,
            type: 'audiobook',
            name: 'Large Page Audiobook Library',
            absolutePaths: [],
          },
        ],
        nextCursor: Option.none(),
      });
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type}`,
          absolutePaths: [`/${type}/path`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type}`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([`/${type}/path`]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library with no paths',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} None`,
          absolutePaths: [],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type} None`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should create a %s library with multiple paths',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Multi`,
          absolutePaths: [`/${type}/path1`, `/${type}/path2`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result.name).toBe(`My ${type} Multi`);
      expect(result.type).toBe(type);
      expect(result.absolutePaths).toEqual([`/${type}/path1`, `/${type}/path2`]);
      expect(result.id).toBeTypeOf('number');
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'should soft delete a %s library and recreate it',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Delete`,
        absolutePaths: [`/${type}/path-delete`],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Delete`,
          absolutePaths: [`/${type}/path-delete`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe(`My ${type} Delete`);
      expect(result2.type).toBe(type);
      expect(result2.absolutePaths).toEqual([`/${type}/path-delete`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    '%s library paths should not get deleted on upsert',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Paths`,
          absolutePaths: [`/${type}/path-old`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));
      expect(result1.absolutePaths).toEqual([`/${type}/path-old`]);

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Paths`,
          absolutePaths: [`/${type}/path-new`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.absolutePaths).toEqual([`/${type}/path-new`]);

      const result3 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} Path Delete`,
          absolutePaths: [],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result3.id).toBe(result1.id);
      expect(result3.name).toBe(`My ${type} Path Delete`);
      expect(result3.type).toBe(type);
      expect(result3.absolutePaths).toEqual([]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    'name changes for %s library is supported',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type,
          name: `My ${type} Old Name`,
          absolutePaths: [`/${type}/path-name`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result1.name).toBe(`My ${type} Old Name`);

      const result2 = yield* client
        .libraryUpsert({
          id: Option.some(result1.id),
          type,
          name: `My ${type} New Name`,
          absolutePaths: [`/${type}/path-name`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.name).toBe(`My ${type} New Name`);
      expect(result2.type).toBe(type);
      expect(result2.absolutePaths).toEqual([`/${type}/path-name`]);
    })
  );

  iit.effect.each(MediaTypes.literals)(
    '%s library type should change on upsert, with associated tables cleaned up',
    Effect.fnUntraced(function* (type) {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type,
        name: `My ${type} Type`,
        absolutePaths: [`/${type}/path-type`],
      });

      const differentType = type === 'movie' ? 'show' : 'movie';

      const result2 = yield* client
        .libraryUpsert({
          id: Option.none(),
          type: differentType,
          name: `My ${type} Type`,
          absolutePaths: [`/${type}/path-type`],
        })
        .pipe(Effect.flatMap(({ id }) => client.libraryGet({ id })));

      expect(result2.id).toBe(result1.id);
      expect(result2.type).toBe(differentType);

      // TODO: Verify associated tables are cleaned up based on the library type
    })
  );

  iit.effect(
    'should fail to get a non-existent library',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result = yield* client
        .libraryGet({ id: yield* forceBrandLibraryId(999_999) })
        .pipe(Effect.flip);

      expect(result).toBeInstanceOf(DatabaseNoSuchElementError);
    })
  );

  iit.effect(
    'should fail to get a deleted library',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result1 = yield* client.libraryUpsert({
        id: Option.none(),
        type: 'movie',
        name: `Deleted Library`,
        absolutePaths: [],
      });

      yield* client.libraryDelete({ id: result1.id });

      const result2 = yield* client.libraryGet({ id: result1.id }).pipe(Effect.flip);

      expect(result2).toBeInstanceOf(DatabaseNoSuchElementError);
    })
  );

  iit.effect(
    'should succeed in deleting a non-existent library',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      yield* client.libraryDelete({ id: yield* forceBrandLibraryId(999_999) });
    })
  );

  iit.effect(
    'should fail to upsert with a non-existent id',
    Effect.fnUntraced(function* () {
      const sessions = yield* LibraryTest.TestSessionHeaders;
      const client = yield* makeLibraryClient(sessions.defaultadmin);

      const result = yield* client
        .libraryUpsert({
          id: Option.some(yield* forceBrandLibraryId(999_999)),
          type: 'movie',
          name: 'Ghost Library',
          absolutePaths: [],
        })
        .pipe(Effect.flip);

      expect(result).toBeInstanceOf(DatabaseNoSuchElementError);
    })
  );
});
