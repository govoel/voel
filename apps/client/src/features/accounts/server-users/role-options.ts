import type { AuthUser } from '@repo/auth-api/shared.ts';

export const roleLabels = {
  under18: 'Under 18',
  user: 'User',
  admin: 'Administrator',
} satisfies Record<typeof AuthUser.fields.role.Encoded, string>;
