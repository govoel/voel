import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
} from '#src/components/form/hooks.tsx';
import { SecureField } from '#src/components/form/secure-field/index.ios.tsx';
import { SubmitButton } from '#src/components/form/submit-button/index.ios.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';

export { FormSubmitError } from '#src/components/form/hooks.tsx';

export const { useAppForm, withForm } = createEffectSchemaFormHook({
  fieldContext,
  formContext,
  fieldComponents: { SecureField, TextField },
  formComponents: { SubmitButton },
});
