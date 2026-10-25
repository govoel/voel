import { Context, Effect, Layer, Result, Schema } from 'effect';
import { decode as decodeBase64, encode as encodeBase64 } from 'effect/encoding/Base64';

import { AccountCredentialsError } from '#src/domains/accounts/errors.ts';
import { AuthStorageData, EncryptedAuthStorage } from '#src/domains/accounts/schema.ts';

const StorageJson = Schema.fromJsonString(AuthStorageData);
const encode = Schema.encodeEffect(StorageJson);
const decode = Schema.decodeUnknownEffect(StorageJson);
const keyName = 'voel.account-credentials.aes-key';

/** Encrypt only credentials; the database's account identity is authenticated as AAD. */
export class AuthEncryption extends Context.Service<AuthEncryption>()(
  'voel/domains/accounts/auth-client/encryption/AuthEncryption',
  {
    make: ({
      prepare,
      encrypt,
      decrypt,
    }: {
      readonly prepare: () => Promise<void>;
      readonly encrypt: (input: {
        readonly plaintext: Uint8Array;
        readonly context: Uint8Array;
      }) => Promise<string>;
      readonly decrypt: (input: {
        readonly ciphertext: string;
        readonly context: Uint8Array;
      }) => Promise<Uint8Array>;
    }) =>
      Effect.sync(() => ({
        prepare: Effect.tryPromise({
          try: prepare,
          catch: (cause) => AccountCredentialsError.make({ cause }),
        }),
        encrypt: Effect.fnUntraced(function* ({
          data,
          context,
        }: {
          readonly data: typeof AuthStorageData.Type;
          readonly context: string;
        }) {
          const plaintext = yield* encode(data).pipe(
            Effect.catchTag('SchemaError', (cause) => AccountCredentialsError.make({ cause }))
          );
          const encrypted = yield* Effect.tryPromise({
            try: async () =>
              encrypt({
                plaintext: new TextEncoder().encode(plaintext),
                context: new TextEncoder().encode(context),
              }),
            catch: (cause) => AccountCredentialsError.make({ cause }),
          });
          return EncryptedAuthStorage.make(encrypted);
        }),
        decrypt: Effect.fnUntraced(function* ({
          data,
          context,
        }: {
          readonly data: typeof EncryptedAuthStorage.Type;
          readonly context: string;
        }) {
          const plaintext = yield* Effect.tryPromise({
            try: async () =>
              decrypt({ ciphertext: data, context: new TextEncoder().encode(context) }),
            catch: (cause) => AccountCredentialsError.make({ cause }),
          });
          const json = yield* Effect.try({
            try: () => new TextDecoder('utf-8', { fatal: true }).decode(plaintext),
            catch: (cause) => AccountCredentialsError.make({ cause }),
          });
          return yield* decode(json).pipe(
            Effect.catchTag('SchemaError', (cause) => AccountCredentialsError.make({ cause }))
          );
        }),
      })),
  }
) {
  public static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const crypto = yield* Effect.promise(async () => import('expo-crypto'));
      const secureStore = yield* Effect.promise(async () => import('expo-secure-store'));
      // Share concurrent initialization, but allow a failed SecureStore access to retry.
      let pending: Promise<InstanceType<typeof crypto.AESEncryptionKey>> | null = null;
      const getKey = async () =>
        (pending ??= (async () => {
          const stored = await secureStore.getItemAsync(keyName);
          if (stored !== null) {
            return crypto.AESEncryptionKey.import(stored, 'base64');
          }
          const key = await crypto.AESEncryptionKey.generate();
          await secureStore.setItemAsync(keyName, await key.encoded('base64'));
          return key;
        })().catch((error: unknown) => {
          pending = null;
          throw error;
        }));
      return yield* AuthEncryption.make({
        prepare: async () => {
          await getKey();
        },
        encrypt: async ({ plaintext, context }) => {
          const sealed = await crypto.aesEncryptAsync(plaintext, await getKey(), {
            additionalData: context,
          });
          return sealed.combined('base64');
        },
        decrypt: async ({ ciphertext, context }) =>
          crypto.aesDecryptAsync(crypto.AESSealedData.fromCombined(ciphertext), await getKey(), {
            additionalData: context,
          }),
      });
    })
  );

  /** Real AES-GCM for Bun tests, with the same nonce/ciphertext/tag representation as Expo. */
  public static readonly layerTest = Layer.effect(
    this,
    Effect.gen(function* () {
      const key = yield* Effect.promise(async () =>
        crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
      );
      return yield* AuthEncryption.make({
        prepare: async () => {
          /* This test key is already initialized. */
        },
        encrypt: async ({ plaintext, context }) => {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const bytes = new Uint8Array(
            await crypto.subtle.encrypt(
              { name: 'AES-GCM', iv, additionalData: context },
              key,
              plaintext
            )
          );
          const combined = new Uint8Array(iv.length + bytes.length);
          combined.set(iv);
          combined.set(bytes, iv.length);
          return encodeBase64(combined);
        },
        decrypt: async ({ ciphertext, context }) => {
          const combined = Result.getOrThrow(decodeBase64(ciphertext));
          return new Uint8Array(
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: combined.slice(0, 12), additionalData: context },
              key,
              combined.slice(12)
            )
          );
        },
      });
    })
  );
}
