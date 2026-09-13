import { DateTime, Option, Predicate, Schema } from 'effect';

import { AuthUser } from '@repo/auth-api/shared.ts';
import type { AuthAdminUserDetails } from '@repo/auth-api/shared.ts';

import { roleLabels } from './role-options.ts';

export const userDetailRows = (user: typeof AuthAdminUserDetails.Type) => [
  { label: 'User ID', value: user.id },
  { label: 'Username', value: `@${user.username}` },
  { label: 'Name', value: user.name },
  { label: 'Email', value: user.email },
  { label: 'Email verified', value: user.emailVerified ? 'Yes' : 'No' },
  { label: 'Role', value: roleLabels[Schema.encodeSync(AuthUser.fields.role)(user.role)] },
  {
    label: 'Profile image',
    value: Option.getOrElse(Option.fromNullishOr(user.image), () => 'None'),
  },
  { label: 'Created', value: DateTime.formatIso(user.createdAt) },
  { label: 'Updated', value: DateTime.formatIso(user.updatedAt) },
  { label: 'Banned', value: user.banned === true ? 'Yes' : 'No' },
  { label: 'Ban reason', value: user.banReason ?? 'None' },
  {
    label: 'Ban expires',
    value: !Predicate.isNotNullish(user.banExpires) ? 'Never' : DateTime.formatIso(user.banExpires),
  },
];
