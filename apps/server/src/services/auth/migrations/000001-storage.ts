import { Effect } from 'effect';
import { SqlClient } from 'effect/sql';

// Immutable v1 snapshot. Do not generate old migrations from the current mapping.
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    create table accounts (
      id text primary key not null,
      active integer not null check (active in (0, 1)),
      security_revision text not null check (length(security_revision) > 0),
      display_name text not null check (length(display_name) between 1 and 128),
      role text not null check (role in ('admin', 'user', 'under18'))
    )
  `;
  yield* sql`
    create table "identifiers" (
      "namespace" text not null,
      "value" text not null,
      "module_id" text,
      "credential_id" text,
      "subject_id" text not null,
      "revision" text not null,
      "verified_at" integer,
      "active" integer not null,
      unique ("namespace", "value"),
      foreign key ("subject_id") references "accounts" ("id"),
      check ("active" in (0, 1)),
      foreign key ("credential_id", "subject_id") references "credentials" ("credential_id", "subject_id") deferrable initially deferred
    )
  `;
  yield* sql`
    create table "credentials" (
      "credential_id" text not null,
      "subject_id" text not null,
      "revision" text not null,
      "active" integer not null,
      unique ("credential_id"),
      foreign key ("subject_id") references "accounts" ("id"),
      check ("active" in (0, 1)),
      unique ("credential_id", "subject_id")
    )
  `;
  // Yielded provisions the password first; credential ownership is checked at commit.
  yield* sql`
    create table "passwords" (
      "module_id" text not null,
      "subject_id" text not null,
      "credential_id" text not null,
      "credential_revision" text not null,
      "verifier_version" text not null,
      "verifier" text not null,
      "normalization" text not null,
      unique ("module_id", "subject_id"),
      unique ("module_id", "credential_id"),
      foreign key ("subject_id") references "accounts" ("id"),
      foreign key ("credential_id", "subject_id") references "credentials" ("credential_id", "subject_id") deferrable initially deferred
    )
  `;
  yield* sql`
    create table "sessions" (
      "session_id" text not null,
      "subject_id" text not null,
      "digest" text not null,
      "security_revision" text not null,
      "issued_at" integer not null,
      "expires_at" integer not null,
      "absolute_expires_at" integer not null,
      "record" text not null,
      unique ("session_id"),
      unique ("digest"),
      foreign key ("subject_id") references "accounts" ("id")
    )
  `;
  yield* sql`
    create table pending (
      module_id text not null,
      kind text not null check (kind in ('Login', 'StepUp')),
      digest text not null unique,
      version text not null,
      flow_id text not null,
      subject_id text not null references accounts (id),
      binding_digest text not null,
      snapshot text not null,
      expires_at integer not null,
      attempt_limit integer not null check (attempt_limit > 0),
      failed_attempts integer not null check (failed_attempts >= 0),
      consumed integer not null check (consumed in (0, 1))
    )
  `;
  yield* sql`
    create index identifiers_subject on identifiers (subject_id)
  `;
  yield* sql`
    create table proofs (
      module_id text not null,
      purpose text not null,
      series_key text not null,
      proof_id text not null,
      binding text not null,
      verifier_key_id text not null,
      verifier_digest text not null,
      issued_at integer not null,
      expires_at integer not null,
      failed_attempts integer not null check (failed_attempts >= 0),
      unique (module_id, purpose, series_key),
      unique (module_id, proof_id)
    )
  `;
  yield* sql`
    create index credentials_subject on credentials (subject_id)
  `;
  yield* sql`
    create index sessions_subject on sessions (subject_id, session_id)
  `;
  yield* sql`
    create index sessions_expiry on sessions (expires_at)
  `;
  yield* sql`
    create index pending_subject on pending (module_id, subject_id)
  `;
  yield* sql`
    create index pending_expiry on pending (module_id, expires_at)
  `;
});
