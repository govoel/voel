import { Bytes, Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';
import { Aead, SecureRandom } from 'effect/crypto';

import { AccountEncryptionKey } from '#src/domains/accounts/encryption/key.ts';

const EncryptedUtf8 = Schema.Uint8ArrayFromBase64.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect(
      Effect.fnUntraced(function* (combined: Uint8Array) {
        const plaintext = yield* Effect.gen(function* () {
          const key = yield* AccountEncryptionKey.use((keys) => keys.get);
          const aead = yield* Aead.Aead;
          return yield* aead.decrypt(key, combined.subarray(key.algorithm.nonceLength), {
            nonce: combined.subarray(0, key.algorithm.nonceLength),
          });
        }).pipe(
          Effect.catchTag(['AccountEncryptionKeyError', 'CryptoError'], (cause) =>
            Effect.fail(new SchemaIssue.Forbidden({ message: 'Unable to decrypt value', cause }))
          )
        );
        return yield* Effect.try({
          try: () => new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
          catch: (cause) => new SchemaIssue.InvalidValue({ message: 'Invalid UTF-8', cause }),
        });
      })
    ),
    encode: SchemaGetter.transformEffect(
      Effect.fnUntraced(
        function* (plaintext: string) {
          const key = yield* AccountEncryptionKey.use((keys) => keys.get);
          const aead = yield* Aead.Aead;
          const random = yield* SecureRandom.SecureRandom;
          const nonce = yield* random.randomBytes(key.algorithm.nonceLength);
          const ciphertext = yield* aead.encrypt(key, new TextEncoder().encode(plaintext), {
            nonce,
          });
          return Bytes.concat([nonce, ciphertext]);
        },
        (effect) =>
          effect.pipe(
            Effect.catchTag(['AccountEncryptionKeyError', 'CryptoError'], (cause) =>
              Effect.fail(new SchemaIssue.Forbidden({ message: 'Unable to encrypt value', cause }))
            )
          )
      )
    ),
  })
);

export const Encrypted = {
  /** A JSON value in application code, an encrypted string in storage. */
  Json: <S extends Schema.Constraint>(schema: S) =>
    EncryptedUtf8.pipe(Schema.decodeTo(Schema.fromJsonString(schema))),
};
