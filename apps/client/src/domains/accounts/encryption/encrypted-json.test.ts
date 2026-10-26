/* oxlint-disable effecttsgo/strict-effect-provide -- tests are Effect application boundaries */
import { describe, expect, it } from '@effect/vitest';
import { DateTime, Effect, Schema, String } from 'effect';

import { encryptedJson } from '#src/domains/accounts/encryption/encrypted-json.ts';
import { Encryption, EncryptionError } from '#src/domains/accounts/encryption/index.ts';
import { Account } from '#src/domains/accounts/schema.ts';

describe('encrypted JSON columns', () => {
  it.effect(
    'round-trips credential entries through the DbModel field and rejects tampering',
    Effect.fnUntraced(function* () {
      const encode = Schema.encodeEffect(Account.fields.authStorage);
      const decode = Schema.decodeUnknownEffect(Account.fields.authStorage);
      const data = {
        voel_cookie: String.repeat(1000)('秘密🔐'),
        'voel_cookie.0.0': 'chunk',
        voel_session_data: '{}',
      };
      const first = yield* encode(data);
      const second = yield* encode(data);
      expect(first).not.toBe(second);
      expect(first).not.toContain('秘密');
      expect(yield* decode(first)).toEqual(data);
      const tampered = (String.startsWith('A')(first) ? 'B' : 'A') + String.slice(1)(first);
      expect(yield* decode(tampered).pipe(Effect.flip)).toMatchObject({ _tag: 'SchemaError' });
    }, Effect.provide(Encryption.layerTest))
  );

  it.effect(
    'composes with encoded field transformations and validates decrypted JSON',
    Effect.fnUntraced(function* () {
      const codec = encryptedJson(Schema.Struct({ createdAt: Schema.DateTimeUtcFromMillis }));
      const data = { createdAt: DateTime.makeUnsafe(1234) };
      const ciphertext = yield* Schema.encodeEffect(codec)(data);
      expect(yield* Schema.decodeEffect(codec)(ciphertext)).toEqual(data);
      const encryption = yield* Encryption;
      const plaintext = yield* encryption.decrypt({ ciphertext });
      expect(new TextDecoder().decode(plaintext)).toBe('{"createdAt":1234}');
      for (const invalid of ['not JSON', '{"createdAt":"wrong type"}']) {
        const encrypted = yield* encryption.encrypt({
          plaintext: new TextEncoder().encode(invalid),
        });
        expect(yield* Schema.decodeEffect(codec)(encrypted).pipe(Effect.flip)).toMatchObject({
          _tag: 'SchemaError',
        });
      }
      const invalidUtf8 = yield* encryption.encrypt({ plaintext: new Uint8Array([255]) });
      expect(yield* Schema.decodeEffect(codec)(invalidUtf8).pipe(Effect.flip)).toMatchObject({
        _tag: 'SchemaError',
      });
    }, Effect.provide(Encryption.layerTest))
  );

  it.effect(
    'reports crypto failures as schema issues without exposing the plaintext',
    Effect.fnUntraced(function* () {
      const encryption = yield* Encryption;
      const error = EncryptionError.make({ cause: new Error('SecureStore unavailable') });
      const failed = {
        ...encryption,
        encrypt: () => Effect.fail(error),
        decrypt: () => Effect.fail(error),
      };
      const codec = encryptedJson(Schema.String);
      const encodeError = yield* Schema.encodeEffect(codec)('secret credential').pipe(
        Effect.provideService(Encryption, failed),
        Effect.flip
      );
      expect(encodeError.message).toContain('Unable to encrypt value');
      expect(encodeError.message).not.toContain('secret credential');
      const decodeError = yield* Schema.decodeEffect(codec)('ciphertext').pipe(
        Effect.provideService(Encryption, failed),
        Effect.flip
      );
      expect(decodeError.message).toContain('Unable to decrypt value');
    }, Effect.provide(Encryption.layerTest))
  );
});
