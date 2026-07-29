import { useAtomRefresh, useAtomSet, useAtomValue } from '@effect/atom-react';
import { DateTime, Effect, Exit, Match, Option, Redacted, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { useAppForm } from '#src/components/form';
import { activeAccountSessionAtom } from '#src/services/accounts/atoms.ts';
import { CurrentAuthClient } from '#src/services/auth-client/current.ts';
import { AccountRole } from '#src/services/database/main/schema.ts';
import { AppRuntime } from '#src/services/runtime.ts';

export class UserProfileUpdateInput extends Schema.Class<
  UserProfileUpdateInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/index/UserProfileUpdateInput')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
}) {}

export const activeUserProfileAtom = activeAccountSessionAtom.pipe(
  Atom.map((result) =>
    AsyncResult.flatMap(
      // oxlint-disable-next-line unicorn/no-array-method-this-argument
      result,
      Option.match({
        onNone: () => AsyncResult.success(Option.none()),
        onSome: (sessionState) => {
          if (sessionState.data === null) {
            return sessionState.isPending
              ? AsyncResult.initial(true)
              : AsyncResult.fail('ActiveUserProfileUnavailable' as const);
          }

          const { user } = sessionState.data;
          if (user.username === null || user.username === void 0) {
            return AsyncResult.fail('ActiveUserProfileUnavailable' as const);
          }

          return AsyncResult.success(
            Option.some({
              email: user.email,
              id: user.id,
              name: user.name,
              role: AccountRole.formatFromNullishString(user.role),
              username: user.username,
            }),
            { waiting: sessionState.isPending || sessionState.isRefetching }
          );
        },
      })
    )
  )
);

export const activeUserSessionsAtom = AppRuntime.atom((get) =>
  Effect.gen(function* () {
    const activeSession = yield* get.result(activeAccountSessionAtom);

    return yield* Option.match(activeSession, {
      onNone: () => Effect.succeed(Option.none()),
      onSome: (sessionState) => {
        const currentSession = sessionState.data;
        if (currentSession === null) {
          return Effect.succeed(Option.none());
        }

        return CurrentAuthClient.pipe(
          Effect.flatMap((authClient) => authClient.listSessions()),
          Effect.map((sessions) =>
            Option.some({
              currentSessionToken: currentSession.session.token,
              sessions,
            })
          )
        );
      },
    });
  })
);

export type UserSession =
  Option.Option.Value<Atom.Success<typeof activeUserSessionsAtom>> extends {
    readonly sessions: readonly (infer Session)[];
  }
    ? Session
    : never;

export const getUserSessionTitle = (session: UserSession, currentSessionToken: string): string => {
  if (session.token === currentSessionToken) {
    return 'This device';
  }

  const userAgent = session.userAgent?.trim();
  return userAgent !== void 0 && userAgent.length > 0 ? userAgent : 'Unknown device';
};

export const getUserSessionDetails = (session: UserSession): string => {
  const signedInAt = DateTime.fromDateUnsafe(session.createdAt).pipe(
    DateTime.formatLocal({ dateStyle: 'medium', timeStyle: 'short' })
  );
  const ipAddress = session.ipAddress?.trim();

  return ipAddress !== void 0 && ipAddress.length > 0
    ? `Signed in ${signedInAt} · IP ${ipAddress}`
    : `Signed in ${signedInAt}`;
};

const revokeUserSessionAtom = AppRuntime.fn(
  (input: Parameters<typeof CurrentAuthClient.Service.revokeSession>[0]) =>
    CurrentAuthClient.pipe(Effect.flatMap((authClient) => authClient.revokeSession(input)))
);

const revokeAllUserSessionsAtom = AppRuntime.fn(() =>
  CurrentAuthClient.pipe(Effect.flatMap((authClient) => authClient.revokeSessions()))
);

export const useUserSessionActions = () => {
  const revokeSessionState = useAtomValue(revokeUserSessionAtom);
  const revokeAllSessionsState = useAtomValue(revokeAllUserSessionsAtom);
  const runRevokeSession = useAtomSet(revokeUserSessionAtom, { mode: 'promiseExit' });
  const runRevokeAllSessions = useAtomSet(revokeAllUserSessionsAtom, { mode: 'promiseExit' });
  const refreshSessions = useAtomRefresh(activeUserSessionsAtom);

  return {
    hasError:
      AsyncResult.isFailure(revokeSessionState) || AsyncResult.isFailure(revokeAllSessionsState),
    isWaiting:
      AsyncResult.isWaiting(revokeSessionState) || AsyncResult.isWaiting(revokeAllSessionsState),
    revokeSession: async (token: string) => {
      const result = await runRevokeSession({ token });
      if (Exit.isSuccess(result)) {
        refreshSessions();
      }
      return Exit.isSuccess(result);
    },
    revokeAllSessions: async () => {
      const result = await runRevokeAllSessions(void 0);
      return Exit.isSuccess(result);
    },
  };
};

export class PasswordResetInput extends Schema.Class<
  PasswordResetInput,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/index/PasswordResetInput')(
  Schema.Struct({
    currentPassword: Schema.RedactedFromValue(Schema.String, { disallowEncode: true }),
    newPassword: Schema.RedactedFromValue(Schema.String, { disallowEncode: true }),
    confirmPassword: Schema.RedactedFromValue(Schema.String, { disallowEncode: true }),
    revokeOtherSessions: Schema.Boolean,
  }).check(
    Schema.makeFilter(({ confirmPassword, newPassword }) =>
      Redacted.value(confirmPassword) === Redacted.value(newPassword)
        ? true
        : { path: ['confirmPassword'], issue: 'Passwords do not match' }
    )
  )
) {}

const resetCurrentUserPasswordAtom = AppRuntime.fn((input: PasswordResetInput) =>
  CurrentAuthClient.pipe(
    Effect.flatMap((authClient) =>
      authClient.changePassword({
        currentPassword: Redacted.value(input.currentPassword),
        newPassword: Redacted.value(input.newPassword),
        revokeOtherSessions: input.revokeOtherSessions,
      })
    )
  )
);

const updateCurrentUserAtom = AppRuntime.fn(
  (input: Parameters<typeof CurrentAuthClient.Service.updateUser>[0]) =>
    CurrentAuthClient.pipe(Effect.flatMap((authClient) => authClient.updateUser(input)))
);

export const useUserProfileForm = ({
  onSuccess,
  profile,
}: {
  onSuccess: () => Promise<void>;
  profile: typeof UserProfileUpdateInput.Encoded;
}) => {
  const form = useAppForm({
    schema: UserProfileUpdateInput,
    mutation: updateCurrentUserAtom,
    defaultValues: profile,
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          NoCurrentAuthClientError: () => 'No active user is available.',
          CurrentAuthClientRequestError: (requestError) =>
            requestError.details.message ?? 'Unable to update the profile. Try again.',
        })
      ),
    onSuccess: async () => {
      await onSuccess();
    },
  });

  return form;
};

export const usePasswordResetForm = ({ onSuccess }: { onSuccess: () => Promise<void> }) => {
  const form = useAppForm({
    schema: PasswordResetInput,
    mutation: resetCurrentUserPasswordAtom,
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      revokeOtherSessions: true,
    },
    onFailure: ({ error }) =>
      Match.value(error).pipe(
        Match.tagsExhaustive({
          NoCurrentAuthClientError: () => 'No active user is available.',
          CurrentAuthClientRequestError: (requestError) =>
            requestError.details.message ?? 'Unable to reset the password. Try again.',
        })
      ),
    onSuccess: async ({ formApi }) => {
      formApi.reset();
      await onSuccess();
    },
  });

  return form;
};
