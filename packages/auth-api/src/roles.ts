import { adminAc, defaultAc, userAc } from 'better-auth/plugins/admin/access';

import type { AuthUser } from '#src/shared.ts';

// Also prevents ban fields from being written through generic admin user endpoints.
const adminRole = defaultAc.newRole({
  ...adminAc.statements,
  user: adminAc.statements.user.filter((action) => action !== 'ban'),
});

// Under-18 accounts have the same administrative permissions as ordinary users.
export const authRoles = { admin: adminRole, user: userAc, under18: userAc } satisfies Record<
  typeof AuthUser.fields.role.Encoded,
  typeof userAc | typeof adminRole
>;
