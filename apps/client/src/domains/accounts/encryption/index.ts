import { Context, Duration, Effect, Exit, Layer, Result, Schema } from 'effect';
import { decode as decodeBase64, encode as encodeBase64 } from 'effect/encoding/Base64';

export class EncryptionError extends Schema.TaggedError<
  EncryptionError,
  { readonly brand: unique symbol }
>('voel/domains/accounts/encryption/EncryptionError')('EncryptionError', {
  cause: Schema.Defect(),
}) {}

const keyName = 'voel.encryption.aes-key';

/** AES-GCM encryption backed by a key kept in SecureStore. */
export class Encryption extends Context.Service<Encryption>()(
  'voel/domains/accounts/encryption/Encryption',
  {
    make: Effect.fnUntraced(function* <Key>({
      loadKey,
      encrypt,
      decrypt,
    }: {
      readonly loadKey: Effect.Effect<Key, EncryptionError>;
      readonly encrypt: (input: {
        readonly key: Key;
        readonly plaintext: Uint8Array;
      }) => Effect.Effect<string, EncryptionError>;
      readonly decrypt: (input: {
        readonly key: Key;
        readonly ciphertext: string;
      }) => Effect.Effect<Uint8Array, EncryptionError>;
    }) {
      // Keep callers attached until native key creation/persistence has finished.
      const getKey = Effect.uninterruptible(
        yield* loadKey.pipe(
          Effect.cachedWithTTL((exit) => (Exit.isSuccess(exit) ? Duration.infinity : Duration.zero))
        )
      );
      return {
        encrypt: Effect.fnUntraced(function* ({ plaintext }: { readonly plaintext: Uint8Array }) {
          return yield* encrypt({ key: yield* getKey, plaintext });
        }),
        decrypt: Effect.fnUntraced(function* ({ ciphertext }: { readonly ciphertext: string }) {
          return yield* decrypt({ key: yield* getKey, ciphertext });
        }),
      };
    }),
  }
) {
  public static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const crypto = yield* Effect.promise(async () => import('expo-crypto'));
      const secureStore = yield* Effect.promise(async () => import('expo-secure-store'));
      return yield* Encryption.make({
        loadKey: Effect.tryPromise({
          try: async () => {
            const stored = await secureStore.getItemAsync(keyName);
            if (stored !== null) {
              return crypto.AESEncryptionKey.import(stored, 'base64');
            }
            const key = await crypto.AESEncryptionKey.generate();
            await secureStore.setItemAsync(keyName, await key.encoded('base64'));
            return key;
          },
          catch: (cause) => EncryptionError.make({ cause }),
        }),
        encrypt: ({ key, plaintext }) =>
          Effect.tryPromise({
            try: async () => {
              const sealed = await crypto.aesEncryptAsync(plaintext, key);
              return sealed.combined('base64');
            },
            catch: (cause) => EncryptionError.make({ cause }),
          }),
        decrypt: ({ key, ciphertext }) =>
          Effect.tryPromise({
            try: async () =>
              crypto.aesDecryptAsync(crypto.AESSealedData.fromCombined(ciphertext), key),
            catch: (cause) => EncryptionError.make({ cause }),
          }),
      });
    })
  );

  /** Real AES-GCM for Bun tests, with the same nonce/ciphertext/tag representation as Expo. */
  public static readonly layerTest: Layer.Layer<Encryption> = Layer.effect(
    this,
    Encryption.make({
      loadKey: Effect.tryPromise({
        try: async () =>
          crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
            'encrypt',
            'decrypt',
          ]),
        catch: (cause) => EncryptionError.make({ cause }),
      }),
      encrypt: ({ key, plaintext }) =>
        Effect.tryPromise({
          try: async () => {
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const bytes = new Uint8Array(
              await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
            );
            const combined = new Uint8Array(iv.length + bytes.length);
            combined.set(iv);
            combined.set(bytes, iv.length);
            return encodeBase64(combined);
          },
          catch: (cause) => EncryptionError.make({ cause }),
        }),
      decrypt: ({ key, ciphertext }) =>
        Effect.tryPromise({
          try: async () => {
            const combined = Result.getOrThrow(decodeBase64(ciphertext));
            return new Uint8Array(
              await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: combined.slice(0, 12) },
                key,
                combined.slice(12)
              )
            );
          },
          catch: (cause) => EncryptionError.make({ cause }),
        }),
    })
  );
}
