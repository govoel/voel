/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { BunFileSystem } from '@effect/platform-bun';
import { describe, expect, it } from '@effect/vitest';
import { Schema as AuthSchema, Identity, Password, Sessions } from '@yielded/auth';
import type { Hooks } from '@yielded/auth';
import {
  Cause,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Schema,
} from 'effect';
import { SqlClient, SqlError } from 'effect/sql';

import { SqliteMigrator } from '@repo/effect-turso';

import { AppAuth } from '#src/services/auth/app.ts';
import {
  Persistence,
  YieldedAuthMigrations,
  YieldedAuthPersistence,
  authStorage,
} from '#src/services/auth/persistence.ts';

const makeFilename = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const dir = yield* fs.makeTempDirectoryScoped();
  return `${dir}/auth.db`;
}).pipe(Effect.provide(BunFileSystem.layer));

const subjectId = AuthSchema.SubjectId.make('admin');
const { moduleId } = AppAuth.strategies.account.persistence;
const credentialId = 'admin-password';
const identifier = Identity.LoginIdentifier.make({ namespace: 'username', value: 'admin' });

// Fixture provisioning only; production bootstrap/sign-in are deliberately not implemented.
const seed = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      yield* sql`
        insert into
          accounts (id, active, security_revision, display_name, role)
        values
          (
            ${subjectId},
            1,
            'security-1',
            'Admin',
            'admin'
          )
      `;
      yield* sql`
        insert into
          identifiers (
            namespace,
            value,
            subject_id,
            revision,
            verified_at,
            active
          )
        values
          (
            'username',
            'admin',
            ${subjectId},
            'binding-1',
            null,
            1
          ),
          (
            'email',
            'admin@example.com',
            ${subjectId},
            'email-1',
            null,
            1
          )
      `;
      // Match yielded registration/addPasswordIn: password precedes authority credential.
      yield* sql`
        insert into
          passwords (
            module_id,
            subject_id,
            credential_id,
            credential_revision,
            verifier_version,
            verifier,
            normalization
          )
        values
          (
            ${moduleId},
            ${subjectId},
            ${credentialId},
            'credential-1',
            'verifier-1',
            'fixture-verifier',
            'NFC'
          )
      `;
      yield* sql`
        insert into
          credentials (credential_id, subject_id, revision, active)
        values
          (
            ${credentialId},
            ${subjectId},
            'credential-1',
            1
          )
      `;
    })
  );
});

const makeSessionInput = Effect.gen(function* () {
  const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
  const authority = yield* Sessions.AuthenticationAuthority;
  // Persistence's commit clock is the database engine, not vitest's TestClock.
  const sql = yield* SqlClient.SqlClient;
  const [clock] = yield* sql`
    select
      cast(
        round((julianday('now') - 2440587.5) * 86400000) as integer
      ) as now
  `.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ now: Schema.Int }))))
  );
  if (!clock) {
    throw new Error('Missing engine clock');
  }
  const now = DateTime.makeUnsafe(clock.now);
  const { revision } = yield* authority.capture(subjectId, [credentialId]);
  const evidence = Sessions.AuthenticationEvidence.make({
    revision,
    flowId: Sessions.AuthenticationFlowId.make('flow-1'),
    bindingDigest: AuthSchema.TokenDigest.make('binding-digest'),
    proofs: [
      {
        method: moduleId,
        credentialId,
        factors: ['knowledge'],
        userVerified: false,
        phishingResistant: false,
        verifiedAt: now,
      },
    ],
  });
  const claims = yield* Schema.decodeEffect(AppAuth.claims)({
    username: 'admin',
    email: 'admin@example.com',
    role: 'admin',
  });
  return {
    evidence,
    now,
    session: {
      subjectId,
      securityRevision: revision.securityRevision,
      claims,
      digest: AuthSchema.TokenDigest.make('digest-1'),
      credentialVersion: Sessions.SessionCredentialVersion.make('a'.repeat(43)),
      provenance: { evidence },
      assurance: { method: moduleId, factors: ['knowledge'], authenticatedAt: now },
      issuedAt: now,
      expiresAt: DateTime.add(now, { minutes: 10 }),
      absoluteExpiresAt: DateTime.add(now, { hours: 1 }),
    },
  } satisfies Parameters<typeof sessions.establish>[0];
});

const counts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  return {
    sessions: yield* sql`
      select
        count(*) as count
      from
        sessions
    `,
    pending: yield* sql`
      select
        count(*) as count
      from
        pending
    `,
  };
});

const emptyCounts = { sessions: [{ count: 0 }], pending: [{ count: 0 }] };

describe('yielded auth persistence over Turso', () => {
  it.effect(
    'looks up eligible passwords and conditionally rehashes without changing authority',
    () =>
      Effect.gen(function* () {
        const filename = yield* makeFilename;
        yield* Effect.gen(function* () {
          yield* seed;
          const passwords = yield* Password.PasswordPersistence;
          const sql = yield* SqlClient.SqlClient;
          const captured = Option.getOrThrow(
            yield* passwords.findCredential({ moduleId, identifier })
          );
          expect(captured.credentialId).toBe(credentialId);
          expect(
            Option.isNone(
              yield* passwords.findCredential({
                moduleId,
                identifier: Identity.LoginIdentifier.make({
                  namespace: 'username',
                  value: 'missing',
                }),
              })
            )
          ).toBe(true);
          expect(
            Option.isNone(
              yield* passwords.findCredential({
                moduleId,
                identifier,
                subjectId: AuthSchema.SubjectId.make('other'),
              })
            )
          ).toBe(true);
          const nextVerifier = Redacted.make(
            Password.EncodedPasswordHash.make('rehashed-verifier')
          );
          yield* passwords.rehashIfCurrent({ credential: captured, nextVerifier });
          const maintained = Option.getOrThrow(
            yield* passwords.findCredential({ moduleId, identifier })
          );
          expect(Redacted.value(maintained.verifier)).toBe('rehashed-verifier');
          expect(maintained.verifierVersion).not.toBe(captured.verifierVersion);
          expect(maintained.revision).toEqual(captured.revision);
          expect(maintained.credentialRevision).toBe(captured.credentialRevision);
          yield* passwords.rehashIfCurrent({
            credential: captured,
            nextVerifier: Redacted.make(Password.EncodedPasswordHash.make('stale-rehash')),
          });
          expect(
            Option.getOrThrow(yield* passwords.findCredential({ moduleId, identifier }))
          ).toEqual(maintained);
          yield* sql`
            update identifiers
            set
              active = 0
            where
              namespace = 'username'
          `;
          expect(Option.isNone(yield* passwords.findCredential({ moduleId, identifier }))).toBe(
            true
          );
          yield* sql`
            update accounts
            set
              active = 0
            where
              id = ${subjectId}
          `;
          expect(Option.isNone(yield* passwords.readForSubject({ moduleId, subjectId }))).toBe(
            true
          );
        }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
      })
  );

  it.effect(
    'consumes shared pending state with issuance and rolls consumption back on failed writes',
    () =>
      Effect.gen(function* () {
        const filename = yield* makeFilename;
        yield* Effect.gen(function* () {
          yield* seed;
          const sql = yield* SqlClient.SqlClient;
          const pending = yield* AppAuth.sessions.PendingAuthentication;
          const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
          const input = yield* makeSessionInput;
          const record = yield* (yield* pending.create(
            {
              digest: AuthSchema.TokenDigest.make('pending-digest'),
              evidence: input.evidence,
              claims: input.session.claims,
              expiresAt: input.session.expiresAt,
              attemptLimit: 2,
            },
            input.now,
            (value, journal) => journal.prepare(value)
          )).read;
          const completion = {
            ...input,
            pending: {
              digest: record.digest,
              version: record.version,
              flowId: record.evidence.flowId,
              bindingDigest: record.evidence.bindingDigest,
            },
          };
          yield* sql`
            create trigger reject_yielded_session before insert on sessions begin
            select
              raise (abort, 'forced write failure');

            end
          `;
          expect(
            (yield* Effect.flip(
              sessions.establish(completion, (value, journal) => journal.prepare(value))
            ))._tag
          ).toBe('SessionUnavailable');
          expect((yield* pending.read({ digest: record.digest, now: input.now })).record).toEqual(
            record
          );
          expect(yield* counts).toEqual({ sessions: [{ count: 0 }], pending: [{ count: 1 }] });
          yield* sql`
            drop trigger reject_yielded_session
          `;
          const established = yield* (yield* sessions.establish(completion, (value, journal) =>
            journal.prepare(value)
          )).read;
          expect(
            (yield* sessions.verify({ digest: established.digest, now: input.now })).subjectId
          ).toBe(subjectId);
          expect(
            (yield* Effect.flip(pending.read({ digest: record.digest, now: input.now })))._tag
          ).toBe('PendingAuthenticationInvalid');
          expect(
            (yield* Effect.flip(
              sessions.establish(
                {
                  ...completion,
                  session: {
                    ...input.session,
                    digest: AuthSchema.TokenDigest.make('pending-replay'),
                  },
                },
                (value, journal) => journal.prepare(value)
              )
            ))._tag
          ).toBe('PendingAuthenticationInvalid');
          expect(yield* counts).toEqual({ sessions: [{ count: 1 }], pending: [{ count: 1 }] });
          const rejected = yield* (yield* pending.create(
            {
              ...record,
              digest: AuthSchema.TokenDigest.make('budget-digest'),
            },
            input.now,
            (value, journal) => journal.prepare(value)
          )).read;
          for (let attempt = 0; attempt < rejected.attemptLimit; attempt += 1) {
            expect(
              yield* (yield* pending.reject(
                { digest: rejected.digest, now: input.now },
                (value, journal) => journal.prepare(value)
              )).read
            ).toEqual({ _tag: 'Rejected' });
          }
          expect(
            (yield* Effect.flip(pending.read({ digest: rejected.digest, now: input.now })))._tag
          ).toBe('PendingAuthenticationInvalid');
        }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
      })
  );

  it.effect('commits password-first provisioning with matching credential ownership', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        // The fixture creates the password before the corresponding credential.
        yield* seed;
        const passwords = yield* Password.PasswordPersistence;
        const snapshot = yield* passwords.readForSubject({ moduleId, subjectId });
        expect(Option.isSome(snapshot)).toBe(true);
        if (Option.isSome(snapshot)) {
          expect(snapshot.value.credentialId).toBe(credentialId);
          expect(snapshot.value.revision.subjectId).toBe(subjectId);
        }
        const sql = yield* SqlClient.SqlClient;
        expect(
          yield* sql`
            pragma foreign_key_check
          `
        ).toEqual([]);
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('rejects unresolved or mismatched password ownership at commit and rolls back', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        for (const mismatched of [false, true]) {
          let completedBody = false;
          const result = yield* Effect.exit(
            sql.withTransaction(
              Effect.gen(function* () {
                yield* sql`
                  insert into
                    accounts (id, active, security_revision, display_name, role)
                  values
                    ('admin', 1, 'r', 'Admin', 'admin'),
                    ('other', 1, 'r', 'Other', 'user')
                `;
                yield* sql`
                  insert into
                    passwords (
                      module_id,
                      subject_id,
                      credential_id,
                      credential_revision,
                      verifier_version,
                      verifier,
                      normalization
                    )
                  values
                    (
                      ${moduleId},
                      ${subjectId},
                      ${credentialId},
                      'r',
                      'v',
                      'hash',
                      'NFC'
                    )
                `;
                if (mismatched) {
                  // The credential exists, but belongs to a different existing account.
                  yield* sql`
                    insert into
                      credentials (credential_id, subject_id, revision, active)
                    values
                      (${credentialId}, 'other', 'r', 1)
                  `;
                }
                completedBody = true;
              })
            )
          );
          expect(completedBody).toBe(true);
          expect(result._tag).toBe('Failure');
          if (result._tag === 'Failure') {
            // Effect SqlClient represents failed COMMIT as a defect, then rolls back.
            const error = Cause.squash(result.cause);
            expect(Schema.is(SqlError.SqlError)(error)).toBe(true);
            if (Schema.is(SqlError.SqlError)(error)) {
              expect(error.reason._tag).toBe('ConstraintError');
            }
          }
          expect(
            yield* sql`
              select
                *
              from
                accounts
            `
          ).toEqual([]);
          expect(
            yield* sql`
              select
                *
              from
                passwords
            `
          ).toEqual([]);
          expect(
            yield* sql`
              select
                *
              from
                credentials
            `
          ).toEqual([]);
          expect(
            yield* sql`
              pragma foreign_key_check
            `
          ).toEqual([]);
        }
        // The same client remains usable for a correct provisioning transaction.
        yield* seed;
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('creates the fresh schema, reapplies and reopens persisted sessions', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* seed;
          const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
          const receipt = yield* sessions.establish(yield* makeSessionInput, (value, journal) =>
            journal.prepare(value)
          );
          yield* receipt.read;
          expect(yield* SqliteMigrator.run(YieldedAuthMigrations.options)).toEqual([]);
        }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })))
      );

      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
        expect(
          (yield* sessions.verify({
            digest: AuthSchema.TokenDigest.make('digest-1'),
            now: yield* DateTime.now,
          })).claims.username
        ).toBe('admin');
        expect(
          yield* sql`
            select
              migration_id,
              name
            from
              effect_sql_migrations
          `
        ).toEqual([{ migration_id: 1, name: 'storage' }]);
        expect(
          yield* sql`
            select
              display_name,
              role
            from
              accounts
            where
              id = 'admin'
          `
        ).toEqual([{ display_name: 'Admin', role: 'admin' }]);
        expect(
          yield* sql`
            pragma foreign_key_check
          `
        ).toEqual([]);
        expect(yield* SqliteMigrator.run(YieldedAuthMigrations.options)).toEqual([]);
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('provides session issuance without flow dedup and CAS rotation/revocation', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        yield* seed;
        const passwords = yield* Password.PasswordPersistence;
        const snapshot = yield* passwords.readForSubject({ moduleId, subjectId });
        expect(Option.isSome(snapshot)).toBe(true);
        if (Option.isSome(snapshot)) {
          expect(snapshot.value.credentialId).toBe(credentialId);
          expect(Redacted.value(snapshot.value.verifier)).toBe('fixture-verifier');
        }
        const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
        const input = yield* makeSessionInput;
        const expiredEvidence = {
          ...input.evidence,
          proofs: [
            {
              ...input.evidence.proofs[0],
              verifiedAt: DateTime.makeUnsafe(
                DateTime.toEpochMillis(input.now) - Duration.toMillis(Duration.minutes(6))
              ),
            },
          ] as const,
        };
        expect(
          (yield* Effect.flip(
            sessions.establish(
              {
                ...input,
                evidence: expiredEvidence,
                session: { ...input.session, provenance: { evidence: expiredEvidence } },
              },
              (value, journal) => journal.prepare(value)
            )
          ))._tag
        ).toBe('StaleAuthentication');
        const original = yield* (yield* sessions.establish(input, (value, journal) =>
          journal.prepare(value)
        )).read;
        expect(
          (yield* sessions.verify({ digest: original.digest, now: input.now })).subjectId
        ).toBe(subjectId);
        expect(
          (yield* (yield* AppAuth.sessions.SessionRepository).list({
            subjectId,
            now: input.now,
            limit: 10,
          })).sessions
        ).toHaveLength(1);
        // Methods own proof single-use now; session storage does not deduplicate flows.
        const independent = yield* (yield* sessions.establish(
          {
            ...input,
            session: { ...input.session, digest: AuthSchema.TokenDigest.make('independent') },
          },
          (value, journal) => journal.prepare(value)
        )).read;
        expect(independent.sessionId).not.toBe(original.sessionId);
        yield* (yield* sessions.revoke(
          { subjectId, sessionId: independent.sessionId },
          (value, journal) => journal.prepare(value)
        )).read;

        const rotation = {
          record: original,
          nextDigest: AuthSchema.TokenDigest.make('digest-2'),
          nextCredentialVersion: Sessions.SessionCredentialVersion.make('b'.repeat(43)),
          nextExpiresAt: input.session.expiresAt,
          now: input.now,
        };
        const attempts = yield* Effect.all(
          [
            Effect.result(sessions.rotate(rotation, (value, journal) => journal.prepare(value))),
            Effect.result(
              sessions.rotate(
                { ...rotation, nextDigest: AuthSchema.TokenDigest.make('digest-3') },
                (value, journal) => journal.prepare(value)
              )
            ),
          ],
          { concurrency: 'unbounded' }
        );
        const winners = attempts.filter((result) => result._tag === 'Success');
        expect(winners).toHaveLength(1);
        expect(attempts.filter((result) => result._tag === 'Failure')).toHaveLength(1);
        if (winners[0]?._tag !== 'Success') {
          throw new Error('No rotation winner');
        }
        const rotated = yield* winners[0].success.read;
        expect(
          (yield* Effect.flip(sessions.verify({ digest: original.digest, now: input.now })))._tag
        ).toBe('SessionInvalid');
        expect(
          (yield* sessions.verify({ digest: rotated.digest, now: input.now })).credentialVersion
        ).toBe(rotated.credentialVersion);
        expect(
          yield* (yield* sessions.revokeDigest(rotated.digest, (value, journal) =>
            journal.prepare(value)
          )).read
        ).toBe(true);
        expect(
          (yield* Effect.flip(sessions.verify({ digest: rotated.digest, now: input.now })))._tag
        ).toBe('SessionInvalid');
        expect(
          yield* (yield* sessions.revokeDigest(rotated.digest, (value, journal) =>
            journal.prepare(value)
          )).read
        ).toBe(false);
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('rolls back failed prepares/writes and rejects stale or ambient authentication', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        yield* seed;
        const sql = yield* SqlClient.SqlClient;
        const sessions = yield* AppAuth.sessions.StatefulSessionPersistence;
        const input = yield* makeSessionInput;
        const receipts: Array<Hooks.PreparedCommit<unknown>> = [];
        const failed = yield* Effect.exit(
          sessions.establish(input, (value, journal) => {
            receipts.push(journal.prepare(value));
            throw new Error('failed preparation');
          })
        );
        expect(failed._tag).toBe('Failure');
        const [receipt] = receipts;
        if (!receipt) {
          throw new Error('Preparation did not run');
        }
        const discarded = yield* Effect.result(receipt.read);
        expect(discarded._tag).toBe('Failure');
        if (discarded._tag === 'Failure') {
          expect(discarded.failure._tag).toBe('CommitDiscarded');
        }
        expect(yield* counts).toEqual(emptyCounts);

        yield* sql`
          create trigger reject_yielded_session before insert on sessions begin
          select
            raise (abort, 'forced write failure');

          end
        `;
        expect(
          (yield* Effect.flip(
            sessions.establish(input, (value, journal) => journal.prepare(value))
          ))._tag
        ).toBe('SessionUnavailable');
        expect(yield* counts).toEqual(emptyCounts);
        yield* sql`
          drop trigger reject_yielded_session
        `;

        // Root auth ports must not silently join a caller-owned transaction.
        expect(
          (yield* Effect.flip(
            sql.withTransaction(
              sessions.establish(input, (value, journal) => journal.prepare(value))
            )
          ))._tag
        ).toBe('SessionUnavailable');
        expect(yield* counts).toEqual(emptyCounts);
        yield* sql`
          update credentials
          set
            revision = 'credential-2'
          where
            credential_id = ${credentialId}
        `;
        expect(
          (yield* Effect.flip(
            sessions.establish(input, (value, journal) => journal.prepare(value))
          ))._tag
        ).toBe('StaleAuthentication');
        expect(yield* counts).toEqual(emptyCounts);
        yield* sql`
          update credentials
          set
            revision = 'credential-1'
          where
            credential_id = ${credentialId}
        `;
        yield* sql`
          update accounts
          set
            security_revision = 'security-2'
          where
            id = ${subjectId}
        `;
        expect(
          (yield* Effect.flip(
            sessions.establish(input, (value, journal) => journal.prepare(value))
          ))._tag
        ).toBe('StaleAuthentication');
        expect(yield* counts).toEqual(emptyCounts);
        const fresh = yield* makeSessionInput;
        const current = yield* (yield* sessions.establish(fresh, (value, journal) =>
          journal.prepare(value)
        )).read;
        yield* (yield* sessions.revokeAll(
          { subjectId, expectedSecurityRevision: current.securityRevision },
          (value, journal) => journal.prepare(value)
        )).read;
        expect(
          (yield* Effect.flip(sessions.verify({ digest: current.digest, now: fresh.now })))._tag
        ).toBe('SessionInvalid');
        expect(
          (yield* Effect.flip(
            sessions.establish(fresh, (value, journal) => journal.prepare(value))
          ))._tag
        ).toBe('StaleAuthentication');
        const final = yield* makeSessionInput;
        const finalSession = yield* (yield* sessions.establish(
          {
            ...final,
            session: { ...final.session, digest: AuthSchema.TokenDigest.make('final-digest') },
          },
          (value, journal) => journal.prepare(value)
        )).read;
        yield* sql`
          update accounts
          set
            active = 0
          where
            id = ${subjectId}
        `;
        expect(
          (yield* Effect.flip(sessions.verify({ digest: finalSession.digest, now: final.now })))
            ._tag
        ).toBe('SessionInvalid');
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('enforces unique identifiers and credential ownership on every pooled connection', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        yield* seed;
        const sql = yield* SqlClient.SqlClient;
        // reserve pins the first physical connection, forcing the query onto another.
        yield* Effect.scoped(
          Effect.gen(function* () {
            yield* sql.reserve;
            expect(
              yield* sql`
                pragma foreign_keys
              `
            ).toEqual([{ foreign_keys: 1 }]);
            const orphan = yield* Effect.flip(sql`
              insert into
                credentials (credential_id, subject_id, revision, active)
              values
                ('orphan', 'missing', 'r', 1)
            `);
            expect(orphan.reason._tag).toBe('ConstraintError');
          })
        );
        const duplicate = yield* Effect.flip(sql`
          insert into
            identifiers (namespace, value, subject_id, revision, active)
          values
            (
              'username',
              'admin',
              ${subjectId},
              'r',
              1
            )
        `);
        expect(duplicate.reason._tag).toBe('UniqueViolation');
        yield* sql`
          insert into
            accounts (id, active, security_revision, display_name, role)
          values
            ('other', 1, 'r', 'Other', 'user')
        `;
        // Nullable links permit password identifiers; populated links must belong
        // to the identifier's subject, not just reference any existing credential.
        yield* sql`
          insert into
            identifiers (
              namespace,
              value,
              module_id,
              credential_id,
              subject_id,
              revision,
              active
            )
          values
            (
              'linked',
              'admin',
              ${moduleId},
              ${credentialId},
              ${subjectId},
              'r',
              1
            )
        `;
        const linkedMismatch = yield* Effect.flip(sql`
          insert into
            identifiers (
              namespace,
              value,
              module_id,
              credential_id,
              subject_id,
              revision,
              active
            )
          values
            (
              'linked',
              'other',
              ${moduleId},
              ${credentialId},
              'other',
              'r',
              1
            )
        `);
        expect(linkedMismatch.reason._tag).toBe('ConstraintError');
        const mismatch = yield* Effect.flip(sql`
          insert into
            passwords (
              module_id,
              subject_id,
              credential_id,
              credential_revision,
              verifier_version,
              verifier,
              normalization
            )
          values
            (
              'other-module',
              'other',
              ${credentialId},
              'r',
              'v',
              'hash',
              'NFC'
            )
        `);
        expect(mismatch.reason._tag).toBe('ConstraintError');
        expect(
          yield* sql`
            pragma foreign_key_check
          `
        ).toEqual([]);
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );

  it.effect('rolls back a failed versioned migration and validates physical unique keys', () =>
    Effect.gen(function* () {
      const filename = yield* makeFilename;
      yield* Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        const failedLoader = SqliteMigrator.fromRecord({
          '000002_failure': Effect.gen(function* () {
            yield* sql`
              create table failed_migration (id text)
            `;
            return yield* Sessions.SessionUnavailable.make({});
          }),
        });
        // Effect's migrator represents a failed migration body as a defect.
        expect((yield* Effect.exit(SqliteMigrator.run({ loader: failedLoader })))._tag).toBe(
          'Failure'
        );
        expect(
          yield* sql`
            select
              name
            from
              sqlite_master
            where
              name = 'failed_migration'
          `
        ).toEqual([]);
        expect(
          yield* sql`
            select
              migration_id
            from
              effect_sql_migrations
          `
        ).toEqual([{ migration_id: 1 }]);
        expect(yield* SqliteMigrator.run(YieldedAuthMigrations.options)).toEqual([]);
        yield* sql`
          alter table pending
          rename to old_pending
        `;
        yield* sql`
          create table pending as
          select
            *
          from
            old_pending
        `;
        // beta.30 initializes/validates lazily on the first maintained port call.
        const error = yield* Effect.flip(
          Effect.gen(function* () {
            return yield* (yield* Password.PasswordPersistence).readForSubject({
              moduleId,
              subjectId,
            });
          }).pipe(
            Effect.provide(
              Layer.fresh(
                Persistence.layer.pipe(Layer.provide(Persistence.Config.layer(authStorage)))
              )
            )
          )
        );
        expect(error._tag).toBe('PasswordUnavailable');
      }).pipe(Effect.provide(YieldedAuthPersistence.layer({ filename })));
    })
  );
});
