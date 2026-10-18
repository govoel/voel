import { useSelector } from '@tanstack/react-form';
import type { ComponentType } from 'react';

import type { AuthUser } from '@repo/auth-api/shared.ts';

import { useFieldContext, useFormContext } from '#src/components/form/hooks.tsx';

export const roles = ['under18', 'user', 'admin'] as const;
export const useRoleField = () => {
  const field = useFieldContext<typeof AuthUser.fields.role.Encoded>();
  const form = useFormContext();
  const disabled = useSelector(form.store, (state) => state.isSubmitting);
  return {
    value: field.state.value,
    disabled,
    handleSelect: (role: (typeof roles)[number]) => {
      field.handleChange(role);
      field.handleBlur();
    },
  };
};

export declare const RoleField: ComponentType;
