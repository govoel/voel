import { createFormHook } from '@tanstack/react-form';

import { fieldContext, formContext } from '#src/components/form/hooks.ts';
import { SecureField } from '#src/components/form/secure-field/index.ios.tsx';
import { SubmitButton } from '#src/components/form/submit-button/index.ios.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';

export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { SecureField, TextField },
  formComponents: { SubmitButton },
});
