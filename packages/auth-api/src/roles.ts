import { adminAc, userAc } from 'better-auth/plugins/admin/access';

import type { AuthUser } from '#src/shared.ts';

// Under-18 accounts have the same administrative permissions as ordinary users.
export const authRoles = { admin: adminAc, user: userAc, under18: userAc } satisfies Record<
  typeof AuthUser.fields.role.Encoded,
  typeof userAc | typeof adminAc
>;
