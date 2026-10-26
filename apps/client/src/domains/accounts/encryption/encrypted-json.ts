import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';

import { Encryption } from '#src/domains/accounts/encryption/index.ts';

const EncryptedUtf8 = Schema.String.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transformEffect((ciphertext) =>
      Effect.gen(function* () {
        const encryption = yield* Encryption;
        const plaintext = yield* encryption
          .decrypt({ ciphertext })
          .pipe(
            Effect.catchTag('EncryptionError', (cause) =>
              Effect.fail(new SchemaIssue.Forbidden({ message: 'Unable to decrypt value', cause }))
            )
          );
        return yield* Effect.try({
          try: () => new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
          catch: (cause) => new SchemaIssue.InvalidValue({ message: 'Invalid UTF-8', cause }),
        });
      })
    ),
    encode: SchemaGetter.transformEffect((plaintext) =>
      Effect.gen(function* () {
        const encryption = yield* Encryption;
        return yield* encryption
          .encrypt({ plaintext: new TextEncoder().encode(plaintext) })
          .pipe(
            Effect.catchTag('EncryptionError', (cause) =>
              Effect.fail(new SchemaIssue.Forbidden({ message: 'Unable to encrypt value', cause }))
            )
          );
      })
    ),
  })
);

/** A JSON value in application code, an encrypted string in storage. */
export const encryptedJson = <S extends Schema.Constraint>(schema: S) =>
  EncryptedUtf8.pipe(Schema.decodeTo(Schema.fromJsonString(schema)));
