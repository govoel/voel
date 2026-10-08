import { AuthPersistence } from '@yielded/auth-persistence';

// Logical columns are yielded roles; physical names belong to the application.
const subjects = AuthPersistence.table({
  name: 'accounts',
  columns: {
    id: { name: 'id', type: 'text' },
    active: { name: 'active', type: 'boolean' },
    securityRevision: { name: 'security_revision', type: 'text' },
    displayName: { name: 'display_name', type: 'text' },
    role: { name: 'role', type: 'text' },
  },
  unique: [['id']],
});

const identifiers = AuthPersistence.table({
  name: 'identifiers',
  columns: {
    namespace: { name: 'namespace', type: 'text' },
    value: { name: 'value', type: 'text' },
    moduleId: { name: 'module_id', type: 'text', nullable: true },
    credentialId: { name: 'credential_id', type: 'text', nullable: true },
    subjectId: { name: 'subject_id', type: 'text' },
    revision: { name: 'revision', type: 'text' },
    verifiedAt: { name: 'verified_at', type: 'integer', nullable: true },
    active: { name: 'active', type: 'boolean' },
  },
  unique: [['namespace', 'value']],
});

const credentials = AuthPersistence.table({
  name: 'credentials',
  columns: {
    credentialId: { name: 'credential_id', type: 'text' },
    subjectId: { name: 'subject_id', type: 'text' },
    revision: { name: 'revision', type: 'text' },
    active: { name: 'active', type: 'boolean' },
  },
  unique: [['credentialId']],
});

const passwords = AuthPersistence.table({
  name: 'passwords',
  columns: {
    moduleId: { name: 'module_id', type: 'text' },
    subjectId: { name: 'subject_id', type: 'text' },
    credentialId: { name: 'credential_id', type: 'text' },
    credentialRevision: { name: 'credential_revision', type: 'text' },
    verifierVersion: { name: 'verifier_version', type: 'text' },
    verifier: { name: 'verifier', type: 'text' },
    normalization: { name: 'normalization', type: 'text' },
  },
  unique: [
    ['moduleId', 'subjectId'],
    ['moduleId', 'credentialId'],
  ],
});

const sessions = AuthPersistence.table({
  name: 'sessions',
  columns: {
    sessionId: { name: 'session_id', type: 'text' },
    subjectId: { name: 'subject_id', type: 'text' },
    digest: { name: 'digest', type: 'text' },
    securityRevision: { name: 'security_revision', type: 'text' },
    issuedAt: { name: 'issued_at', type: 'integer' },
    expiresAt: { name: 'expires_at', type: 'integer' },
    absoluteExpiresAt: { name: 'absolute_expires_at', type: 'integer' },
    record: { name: 'record', type: 'text' },
  },
  unique: [['sessionId'], ['digest']],
});

const pending = AuthPersistence.table({
  name: 'pending',
  columns: {
    moduleId: { name: 'module_id', type: 'text' },
    kind: { name: 'kind', type: 'text' },
    digest: { name: 'digest', type: 'text' },
    version: { name: 'version', type: 'text' },
    flowId: { name: 'flow_id', type: 'text' },
    subjectId: { name: 'subject_id', type: 'text' },
    bindingDigest: { name: 'binding_digest', type: 'text' },
    snapshot: { name: 'snapshot', type: 'text' },
    expiresAt: { name: 'expires_at', type: 'integer' },
    attemptLimit: { name: 'attempt_limit', type: 'integer' },
    failedAttempts: { name: 'failed_attempts', type: 'integer' },
    consumed: { name: 'consumed', type: 'boolean' },
  },
  unique: [['digest']],
});

export const AuthTables = { subjects, identifiers, credentials, passwords, sessions, pending };
