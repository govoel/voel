import { Schema } from 'effect';

export class UserProfileUpdate extends Schema.Class<
  UserProfileUpdate,
  { readonly brand: unique symbol }
>('voel/components/user-profile-editor/schema/UserProfileUpdate')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(
    Schema.isMinLength(3, { message: 'Username must be at least 3 characters' }),
    Schema.isMaxLength(30, { message: 'Username must be at most 30 characters' }),
    Schema.isPattern(/^[a-zA-Z0-9_.]+$/u, {
      message: 'Username can only contain letters, numbers, underscores, and periods',
    })
  ),
}) {}
