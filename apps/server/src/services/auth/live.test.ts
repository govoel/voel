/* oxlint-disable effecttsgo/strict-effect-provide -- scoped integration application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { Auth, Hooks, Password, Sessions } from '@yielded/auth';
import { Context, Deferred, Effect, Fiber, FileSystem, Layer, Redacted, Schema } from 'effect';
import { SqlClient } from 'effect/sql';
import { describe, expect, it } from 'vitest';

import { makeAppAuth } from '#src/services/auth/app.ts';
import { YieldedAuthLive } from '#src/services/auth/live.ts';

const AppAuth = makeAppAuth({ resetUrl: 'https://auth.test/reset' });

const password = 'river orchard café telescope';
let requestSequence = 0;
const input = ({ email = 'admin@example.com', secret = password, displayName = 'Admin' } = {}) => {
  requestSequence += 1;
  return {
    requestId: `registration-${requestSequence}`,
    email,
    newPassword: secret,
    registration: { displayName },
  };
};

// Explicit test-only corpus; outages fail closed through the maintained check.
const screening = Layer.succeed(Password.CompromisedPasswords, {
  check: (secret) => {
    const value = Redacted.value(secret);
    if (value.includes('offline')) {
      return Effect.fail(Password.PasswordCheckUnavailable.make({}));
    }
    return Effect.succeed(
      value.includes('compromised')
        ? { _tag: 'Rejected' as const, reason: 'compromised' as const }
        : { _tag: 'Allowed' as const }
    );
  },
});
const filename = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return `${yield* fs.makeTempDirectoryScoped()}/auth.db`;
}).pipe(Effect.provide(BunFileSystem.layer));

// Each acquisition has a separate memo map, scope and physical Turso pool.
const acquire = Effect.fnUntraced(function* ({ path }: { readonly path: string }) {
  const context = yield* Layer.build(
    YieldedAuthLive.layer({ auth: AppAuth, filename: path }).pipe(Layer.provide(screening))
  );
  return {
    auth: Context.get(context, AppAuth),
    sql: Context.get(context, SqlClient.SqlClient),
    context,
  };
});
const request = ({ credential }: { readonly credential?: Redacted.Redacted } = {}) =>
  Auth.AuthRequest.of({
    invocation: { _tag: 'Guest' },
    credentials: credential === void 0 ? {} : { session: credential },
    credentialCommandSink: () => Effect.void,
  });
const bootstrap = ({
  auth,
  value = input(),
}: {
  readonly auth: typeof AppAuth.Service;
  readonly value?: ReturnType<typeof input>;
}) => auth.bootstrapServer(value).pipe(Effect.provideService(Auth.AuthRequest, request()));
const login = Effect.fnUntraced(function* ({
  auth,
  value = input(),
}: {
  readonly auth: typeof AppAuth.Service;
  readonly value?: ReturnType<typeof input>;
}) {
  const commands: Array<Parameters<Auth.AuthRequest['Service']['credentialCommandSink']>[0]> = [];
  const result = yield* auth
    .passwordSignIn({ email: value.email, password: value.newPassword })
    .pipe(
      Effect.provideService(Auth.AuthRequest, {
        ...request(),
        credentialCommandSink: (batch) =>
          Effect.sync(() => {
            commands.push(batch);
          }),
      })
    );
  expect(result._tag).toBe('Authenticated');
  if (result._tag === 'Authenticated') {
    expect(result.session.claims).toEqual({
      ...value.registration,
      email: value.email,
      role: 'admin',
    });
  }
  const issued = commands
    .flat()
    .find((command) => command._tag === 'Issue' && command.slot === 'session');
  if (issued?._tag !== 'Issue') {
    throw new Error('No private session delivery');
  }
  return { result, credential: issued.credential };
});
const tables = [
  'accounts',
  'identifiers',
  'passwords',
  'credentials',
  'sessions',
  'pending',
  'proofs',
];
const accountCount = (sql: SqlClient.SqlClient) =>
  sql`
    select
      count(*) as count
    from
      accounts
  `.pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ count: Schema.Int })]))
    ),
    Effect.map(([row]) => row.count)
  );
const counts = Effect.fnUntraced(function* (sql: SqlClient.SqlClient) {
  const result: Array<number> = [];
  for (const table of tables) {
    const [row] = yield* sql`
      select
        count(*) as count
      from
        ${sql(table)}
    `.pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Tuple([Schema.Struct({ count: Schema.Int })]))
      )
    );
    result.push(row.count);
  }
  return result;
});
const snapshot = Effect.fnUntraced(function* (sql: SqlClient.SqlClient) {
  const rows = [];
  for (const table of tables.slice(0, 4)) {
    rows.push(
      yield* sql`
        select
          *
        from
          ${sql(table)}
      `
    );
  }
  return rows;
});

describe('managed email/password auth over real Turso and Bun Argon2', () => {
  it('keeps maintained credential writes ordered and application display names nonunique', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire({ path: yield* filename });
          yield* runtime.sql`create table write_order (seq integer primary key, name text)`;
          for (const table of tables.slice(0, 4)) {
            yield* runtime.sql.unsafe(
              `create trigger trace_${table} after insert on ${table} begin insert into write_order(name) values ('${table}'); end`
            );
          }
          yield* bootstrap(runtime);
          const order = yield* runtime.sql`
            select
              name
            from
              write_order
            order by
              seq
          `.pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ name: Schema.String })))
            )
          );
          expect(order.map((row) => row.name)).toEqual(tables.slice(0, 4));
          yield* runtime.sql`
            insert into
              accounts
            values
              ('other', 1, 'revision', 'Admin', 'user')
          `;
          expect(yield* accountCount(runtime.sql)).toBe(2);
          yield* login(runtime);
        })
      )
    );
  });

  it('maps persisted account claims and refuses malformed stored display names', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire({ path: yield* filename });
          yield* bootstrap(runtime);
          yield* runtime.sql`
            update accounts
            set
              display_name = 'Stored Name',
              role = 'user'
          `;
          const result = yield* runtime.auth
            .passwordSignIn({ email: 'ADMIN@example.com', password })
            .pipe(Effect.provideService(Auth.AuthRequest, request()));
          expect(result._tag).toBe('Authenticated');
          if (result._tag === 'Authenticated') {
            expect(result.session.claims).toEqual({
              displayName: 'Stored Name',
              email: 'admin@example.com',
              role: 'user',
            });
          }
          // Deliberate DB-corruption injection: schema validation must still fail closed.
          yield* runtime.sql`pragma ignore_check_constraints = ON`;
          yield* runtime.sql`
            update accounts
            set
              display_name = ''
          `;
          expect(
            yield* runtime.auth
              .passwordSignIn({ email: 'admin@example.com', password })
              .pipe(Effect.provideService(Auth.AuthRequest, request()), Effect.result)
          ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'PasswordUnavailable' } });
          expect(yield* counts(runtime.sql)).toEqual([1, 1, 1, 1, 1, 0, 0]);
        })
      )
    );
  });

  it('fails closed on structural DB unavailability and recovers with a fresh pool', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* filename;
          const runtime = yield* acquire({ path });
          // Initialize the lazy maintained graph before injecting unavailability.
          expect(
            yield* runtime.auth
              .passwordSignIn({ email: 'unknown@example.com', password })
              .pipe(Effect.provideService(Auth.AuthRequest, request()), Effect.result)
          ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'PasswordRejected' } });
          yield* runtime.sql`alter table accounts rename to temporarily_unavailable`;
          expect(yield* bootstrap(runtime).pipe(Effect.result)).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'PasswordUnavailable' },
          });
          yield* runtime.sql`alter table temporarily_unavailable rename to accounts`;
          expect(yield* counts(runtime.sql)).toEqual([0, 0, 0, 0, 0, 0, 0]);
          expect(yield* bootstrap(yield* acquire({ path }))).toEqual({
            _tag: 'RegistrationAccepted',
          });
        })
      )
    );
  });

  it('accepts without auto-session; built-in sign-in persists claims and sessions reopen/revoke', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* filename;
          const value = input();
          const first = yield* Effect.scoped(
            Effect.gen(function* () {
              const runtime = yield* acquire({ path });
              expect(
                yield* runtime.auth.bootstrapServer(value).pipe(
                  Effect.provideService(Auth.AuthRequest, {
                    ...request(),
                    credentialCommandSink: () => Effect.die('Bootstrap must not issue credentials'),
                  })
                )
              ).toEqual({ _tag: 'RegistrationAccepted' });
              expect(yield* counts(runtime.sql)).toEqual([1, 1, 1, 1, 0, 0, 0]);
              const [row] = yield* runtime.sql`
                select
                  verifier,
                  normalization
                from
                  passwords
              `.pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(
                    Schema.Tuple([
                      Schema.Struct({ verifier: Schema.String, normalization: Schema.String }),
                    ])
                  )
                )
              );
              expect(row.verifier.startsWith('$argon2id$v=19$')).toBe(true);
              expect(row.normalization).toBe('NFC');
              return yield* login({ ...runtime, value });
            })
          );
          const reopened = yield* acquire({ path });
          const session = yield* reopened.auth
            .getSession()
            .pipe(
              Effect.provideService(Auth.AuthRequest, request({ credential: first.credential }))
            );
          expect(session?.claims).toEqual({
            displayName: 'Admin',
            email: value.email,
            role: 'admin',
          });
          const [record] = yield* reopened.sql`
            select
              record
            from
              sessions
          `.pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.Tuple([
                  Schema.Struct({ record: Schema.fromJsonString(AppAuth.sessions.Session) }),
                ])
              )
            )
          );
          expect(record.record.claims).toEqual(session?.claims);
          expect(
            yield* reopened.auth
              .passwordSignIn({ email: value.email, password: 'wrong orchard telescope river' })
              .pipe(Effect.provideService(Auth.AuthRequest, request()), Effect.result)
          ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'PasswordRejected' } });
          yield* reopened.auth
            .signOut()
            .pipe(
              Effect.provideService(Auth.AuthRequest, request({ credential: first.credential }))
            );
          expect(
            yield* reopened.auth
              .getSession()
              .pipe(
                Effect.provideService(Auth.AuthRequest, request({ credential: first.credential }))
              )
          ).toBeNull();
        })
      )
    );
  });

  for (const sameEmail of [false, true]) {
    it(`serializes independent pools with ${sameEmail ? 'same' : 'different'} emails without overwriting credentials`, async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const path = yield* filename;
            const a = yield* acquire({ path });
            const b = yield* acquire({ path });
            expect(a.sql).not.toBe(b.sql);
            const ready = yield* Deferred.make<true>();
            const release = yield* Deferred.make<true>();
            const advisory: Array<number> = [];
            const attempt = (runtime: typeof a, value: ReturnType<typeof input>) =>
              Effect.gen(function* () {
                advisory.push(yield* accountCount(runtime.sql));
                if (advisory.length === 2) {
                  yield* Deferred.succeed(ready, true);
                }
                yield* Deferred.await(release);
                return yield* bootstrap({ ...runtime, value }).pipe(Effect.result);
              });
            const alice = input({ email: 'alice@example.com', displayName: 'Alice' });
            const bob = input({
              email: sameEmail ? alice.email : 'bob@example.com',
              secret: 'different lunar orchard telescope',
              displayName: 'Bob',
            });
            const fa = yield* Effect.forkChild(attempt(a, alice));
            const fb = yield* Effect.forkChild(attempt(b, bob));
            yield* Deferred.await(ready);
            expect(advisory).toEqual([0, 0]);
            yield* Deferred.succeed(release, true);
            const results = [yield* Fiber.join(fa), yield* Fiber.join(fb)];
            expect(results.some((result) => result._tag === 'Success')).toBe(true);
            for (const result of results) {
              if (result._tag === 'Failure') {
                expect(result.failure._tag).toBe('PasswordUnavailable');
              } else {
                expect(result.success).toEqual({ _tag: 'RegistrationAccepted' });
              }
            }
            if (!sameEmail) {
              expect(results.filter((result) => result._tag === 'Success')).toHaveLength(1);
            }
            expect(yield* counts(a.sql)).toEqual([1, 1, 1, 1, 0, 0, 0]);
            const [account] = yield* a.sql`
              select
                display_name
              from
                accounts
            `.pipe(
              Effect.flatMap(
                Schema.decodeUnknownEffect(
                  Schema.Tuple([Schema.Struct({ display_name: Schema.String })])
                )
              )
            );
            const winner = account.display_name === 'Alice' ? alice : bob;
            const loser = winner === alice ? bob : alice;
            const before = yield* snapshot(a.sql);
            expect(yield* bootstrap({ ...b, value: loser }).pipe(Effect.result)).toMatchObject(
              sameEmail
                ? { _tag: 'Success', success: { _tag: 'RegistrationAccepted' } }
                : { _tag: 'Failure', failure: { _tag: 'PasswordUnavailable' } }
            );
            expect(yield* bootstrap({ ...b, value: winner })).toEqual({
              _tag: 'RegistrationAccepted',
            });
            expect(yield* snapshot(a.sql)).toEqual(before);
            yield* login({ ...b, value: winner });
            if (sameEmail) {
              expect(
                yield* b.auth
                  .passwordSignIn({ email: loser.email, password: loser.newPassword })
                  .pipe(Effect.provideService(Auth.AuthRequest, request()), Effect.result)
              ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'PasswordRejected' } });
            }
          })
        )
      );
    });
  }

  it('accepts both stale same-email requests but never replaces the first password or displayName', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* filename;
          const a = yield* acquire({ path });
          const b = yield* acquire({ path });
          const first = input({ displayName: 'First' });
          const second = input({
            displayName: 'Second',
            secret: 'second different lunar orchard telescope',
          });
          expect(
            yield* Effect.all([accountCount(a.sql), accountCount(b.sql)], {
              concurrency: 'unbounded',
            })
          ).toEqual([0, 0]);
          expect(yield* bootstrap({ ...a, value: first })).toEqual({
            _tag: 'RegistrationAccepted',
          });
          const before = yield* snapshot(a.sql);
          expect(yield* bootstrap({ ...b, value: second })).toEqual({
            _tag: 'RegistrationAccepted',
          });
          expect(yield* snapshot(a.sql)).toEqual(before);
          yield* login({ ...b, value: first });
          expect(
            yield* b.auth
              .passwordSignIn({ email: second.email, password: second.newPassword })
              .pipe(Effect.provideService(Auth.AuthRequest, request()), Effect.result)
          ).toMatchObject({ _tag: 'Failure', failure: { _tag: 'PasswordRejected' } });
        })
      )
    );
  });

  it('counts inactive nonadmin accounts as closed setup', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire({ path: yield* filename });
          yield* runtime.sql`
            insert into
              accounts
            values
              ('existing', 0, 'revision', 'Inactive', 'user')
          `;
          expect(yield* bootstrap(runtime).pipe(Effect.result)).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'PasswordUnavailable' },
          });
          expect(yield* counts(runtime.sql)).toEqual([1, 0, 0, 0, 0, 0, 0]);
        })
      )
    );
  });

  for (const { secret, tag } of [
    { secret: 'known-compromised orchard telescope river', tag: 'NewPasswordRejected' },
    { secret: 'corpus-offline orchard telescope river', tag: 'PasswordCheckUnavailable' },
    { secret: 'short', tag: 'NewPasswordRejected' },
  ]) {
    it(`fails screening with ${tag} and zero writes`, async () => {
      await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const runtime = yield* acquire({ path: yield* filename });
            expect(
              yield* bootstrap({ ...runtime, value: input({ secret }) }).pipe(Effect.result)
            ).toMatchObject({ _tag: 'Failure', failure: { _tag: tag } });
            expect(yield* counts(runtime.sql)).toEqual([0, 0, 0, 0, 0, 0, 0]);
          })
        )
      );
    });
  }

  it('rolls back a deferred FK failure at COMMIT and retries successfully in the same runtime', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const runtime = yield* acquire({ path: yield* filename });
          yield* runtime.sql`create table fault_parent (id text primary key)`;
          yield* runtime.sql`create table fault_child (id text references fault_parent(id) deferrable initially deferred)`;
          yield* runtime.sql`create trigger credential_fault after insert on credentials begin insert into fault_child values ('missing'); end`;
          expect(yield* bootstrap(runtime).pipe(Effect.result)).toMatchObject({
            _tag: 'Failure',
            failure: { _tag: 'PasswordUnavailable' },
          });
          expect(yield* counts(runtime.sql)).toEqual([0, 0, 0, 0, 0, 0, 0]);
          expect(
            yield* runtime.sql`
            select
              *
            from
              fault_child
          `
          ).toEqual([]);
          yield* runtime.sql`drop trigger credential_fault`;
          expect(yield* bootstrap(runtime)).toEqual({ _tag: 'RegistrationAccepted' });
          yield* login(runtime);
        })
      )
    );
  });

  it('prepares real hashing while another pool holds the writer lock; only commit waits', async () => {
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const path = yield* filename;
          const a = yield* acquire({ path });
          const b = yield* acquire({ path });
          // Public supported planning API, using the actual production environment.
          const completion = AppAuth.sessions
            .completionLayer()
            .pipe(
              Layer.provideMerge(
                AppAuth.sessions.layer(Sessions.stateful().policy(AppAuth.sessions.moduleId))
              )
            );
          const context = yield* Layer.build(
            AppAuth.strategies.password.layer.pipe(
              Layer.provideMerge(completion),
              Layer.provideMerge(AppAuth.strategies.password.reset.emailLayer),
              Layer.provideMerge(Hooks.LifecycleHooks.empty)
            )
          ).pipe(Effect.provide(a.context));
          const methods = Context.get(context, AppAuth.strategies.password.Passwords);
          const locked = yield* Deferred.make<true>();
          const unlock = yield* Deferred.make<true>();
          const lock = yield* Effect.forkChild(
            b.sql.withTransaction(
              Deferred.succeed(locked, true).pipe(Effect.andThen(Deferred.await(unlock)))
            )
          );
          yield* Deferred.await(locked);
          const plan = yield* methods
            .planRegister(
              yield* Schema.decodeEffect(
                AppAuth.strategies.password.operations.Register.rpc.payloadSchema
              )(input())
            )
            .pipe(Effect.timeout('2 seconds'));
          let completed = false;
          const committing = yield* Effect.forkChild(
            plan.commit.pipe(
              Effect.flatMap((receipt) => receipt.read),
              Effect.provide(a.context),
              Effect.tap(() =>
                Effect.sync(() => {
                  completed = true;
                })
              )
            )
          );
          yield* Effect.sleep('50 millis');
          expect(completed).toBe(false);
          expect(yield* accountCount(b.sql)).toBe(0);
          yield* Deferred.succeed(unlock, true);
          yield* Fiber.join(lock);
          expect(yield* Fiber.join(committing)).toEqual({ _tag: 'RegistrationAccepted' });
        })
      )
    );
  });
});
