import { Effect, Match, Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { useAppForm } from '#src/components/form';
import { activeAccountSessionAtom } from '#src/services/accounts/atoms.ts';
import { withPredefinedStates } from '#src/services/atom-devtools.ts';
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
  ),
  withPredefinedStates(() => [
    {
      id: 'loading',
      label: 'Loading',
      atom: Atom.make(() => AsyncResult.initial(true)),
    },
    {
      id: 'no-active-user',
      label: 'No active user',
      atom: Atom.make(() => AsyncResult.success(Option.none())),
    },
    {
      id: 'loaded',
      label: 'Loaded profile',
      atom: Atom.make(() =>
        AsyncResult.success(
          Option.some({
            email: 'reader@example.com',
            id: 'predefined-user',
            name: 'Alex Reader',
            role: 'Admin' as const,
            username: 'alex',
          })
        )
      ),
    },
    {
      id: 'unavailable',
      label: 'Unavailable profile',
      atom: Atom.make(() => AsyncResult.fail('ActiveUserProfileUnavailable' as const)),
    },
  ]),
  Atom.withLabel('activeUserProfileAtom')
);

const updateCurrentUserAtom = AppRuntime.fn(
  (input: Parameters<typeof CurrentAuthClient.Service.updateUser>[0]) =>
    CurrentAuthClient.pipe(Effect.flatMap((authClient) => authClient.updateUser(input)))
).pipe(Atom.withLabel('updateCurrentUserAtom'));

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
