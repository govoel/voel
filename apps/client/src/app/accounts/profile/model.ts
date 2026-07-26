import { Schema } from 'effect';

export class UserProfileUpdate extends Schema.Class<
  UserProfileUpdate,
  { readonly brand: unique symbol }
>('voel/app/accounts/profile/model/UserProfileUpdate')({
  name: Schema.String.check(Schema.isNonEmpty({ message: 'Name is required' })),
  username: Schema.String.check(Schema.isNonEmpty({ message: 'Username is required' })),
}) {}
