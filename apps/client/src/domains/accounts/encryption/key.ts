import { Context, Duration, Effect, Exit, Layer, Schema } from 'effect';
import { Aead } from 'effect/crypto';

export class AccountEncryptionKeyError extends Schema.TaggedError<
  AccountEncryptionKeyError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/encryption/key/AccountEncryptionKeyError')('AccountEncryptionKeyError', {
  cause: Schema.Defect(),
}) {}

const keyName = 'voel.encryption.aes-key';
class KeyCodec extends Schema.Opaque<KeyCodec, { readonly brand: unique symbol }>()(
  Schema.Uint8ArrayFromBase64.pipe(
    Schema.decodeTo(Schema.AeadKeyFromBytes(Aead.aes256Gcm, { allowEncode: true }))
  )
) {
  public static readonly decodeEffect = Schema.decodeEffect(this);
  public static readonly encodeEffect = Schema.encodeEffect(this);
}

/** Owns lazy key initialization and its success-only cache for one layer instance. */
export class AccountEncryptionKey extends Context.Service<AccountEncryptionKey>()(
  'voel/domains/accounts/encryption/key/AccountEncryptionKey',
  {
    make: Effect.fnUntraced(function* ({
      loadKey,
    }: {
      readonly loadKey: Effect.Effect<Aead.Key<Aead.AesGcm>, AccountEncryptionKeyError>;
    }) {
      const cached = yield* loadKey.pipe(
        Effect.cachedWithTTL((exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero))
      );
      // Complete persistence before releasing even a cancelled caller. Failed loads retry.
      return { get: Effect.uninterruptible(cached) };
    }),
  }
) {
  public static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const aead = yield* Aead.Aead;
      const secureStore = yield* Effect.promise(async () => import('expo-secure-store'));
      return yield* AccountEncryptionKey.make({
        loadKey: Effect.gen(function* () {
          const stored = yield* Effect.tryPromise({
            try: async () => secureStore.getItemAsync(keyName),
            catch: (cause) => AccountEncryptionKeyError.make({ cause }),
          });
          if (stored !== null) {
            return yield* KeyCodec.decodeEffect(stored).pipe(
              // Schema issues can include their input; never attach stored key material to errors.
              Effect.catchTag('SchemaError', () =>
                AccountEncryptionKeyError.make({
                  cause: new Error('Invalid stored encryption key'),
                })
              )
            );
          }
          const key = yield* aead
            .generateKey(Aead.aes256Gcm)
            .pipe(
              Effect.catchTag('CryptoError', (cause) => AccountEncryptionKeyError.make({ cause }))
            );
          const encoded = yield* KeyCodec.encodeEffect(KeyCodec.make(key)).pipe(
            Effect.catchTag('SchemaError', (cause) => AccountEncryptionKeyError.make({ cause }))
          );
          yield* Effect.tryPromise({
            try: async () => secureStore.setItemAsync(keyName, encoded),
            catch: (cause) => AccountEncryptionKeyError.make({ cause }),
          });
          return key;
        }),
      });
    })
  );
}
