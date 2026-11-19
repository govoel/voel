import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
} from '#src/components/form/hooks.tsx';
import { SecureField } from '#src/components/form/secure-field/index.ios.tsx';
import { SubmitButton } from '#src/components/form/submit-button/index.ios.tsx';
import { TextField } from '#src/components/form/text-field/index.ios.tsx';
import { TextListField } from '#src/components/form/text-list-field/index.ios.tsx';
import { AppRuntime } from '#src/runtime/index.ts';

export const { useAppForm } = createEffectSchemaFormHook({
  runtime: AppRuntime,
  fieldContext,
  formContext,
  fieldComponents: { SecureField, TextField, TextListField },
  formComponents: { SubmitButton },
});
