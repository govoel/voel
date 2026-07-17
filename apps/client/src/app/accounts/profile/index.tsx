import { Option, Schema } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

import { activeAccountSessionAtom } from '#src/services/accounts/atoms.ts';
import { AccountRole } from '#src/services/database/main/schema.ts';

export class ActiveUserProfile extends Schema.Class<
  ActiveUserProfile,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/ActiveUserProfile')({
  email: Schema.String,
  id: Schema.String,
  name: Schema.String,
  role: Schema.String,
  username: Schema.String,
}) {}

export class ActiveUserProfileLoading extends Schema.TaggedClass<ActiveUserProfileLoading>()(
  'Loading',
  {}
) {}

export class ActiveUserProfileNoActiveUser extends Schema.TaggedClass<ActiveUserProfileNoActiveUser>()(
  'NoActiveUser',
  {}
) {}

export class ActiveUserProfileLoadError extends Schema.TaggedClass<ActiveUserProfileLoadError>()(
  'LoadError',
  {}
) {}

export class ActiveUserProfileLoaded extends Schema.TaggedClass<ActiveUserProfileLoaded>()(
  'Loaded',
  { profile: ActiveUserProfile }
) {}

export type ActiveUserProfileState =
  | ActiveUserProfileLoading
  | ActiveUserProfileNoActiveUser
  | ActiveUserProfileLoadError
  | ActiveUserProfileLoaded;

export const activeUserProfileAtom = activeAccountSessionAtom.pipe(
  Atom.map(
    AsyncResult.matchWithError({
      onInitial: () => new ActiveUserProfileLoading(),
      onError: () => new ActiveUserProfileLoadError(),
      onDefect: () => new ActiveUserProfileLoadError(),
      onSuccess: ({ value }): ActiveUserProfileState =>
        Option.match(value, {
          onNone: () => new ActiveUserProfileNoActiveUser(),
          onSome: (session) => {
            if (session.data === null) {
              return session.isPending
                ? new ActiveUserProfileLoading()
                : new ActiveUserProfileLoadError();
            }

            const { user } = session.data;
            if (user.username === null || user.username === void 0) {
              return new ActiveUserProfileLoadError();
            }

            return new ActiveUserProfileLoaded({
              profile: new ActiveUserProfile({
                email: user.email,
                id: user.id,
                name: user.name,
                role: AccountRole.formatFromNullishString(user.role),
                username: user.username,
              }),
            });
          },
        }),
    })
  )
);
