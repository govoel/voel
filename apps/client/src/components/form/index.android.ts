import {
  createEffectSchemaFormHook,
  fieldContext,
  formContext,
} from '#src/components/form/hooks.tsx';
import { SecureField } from '#src/components/form/secure-field/index.android.tsx';
import { SubmitButton } from '#src/components/form/submit-button/index.android.tsx';
import { TextField } from '#src/components/form/text-field/index.android.tsx';
import { TextListField } from '#src/components/form/text-list-field/index.android.tsx';
import { AppRuntime } from '#src/runtime/index.ts';

export const { useAppForm, useAppFormGroup } = createEffectSchemaFormHook({
  runtime: AppRuntime,
  fieldContext,
  formContext,
  fieldComponents: { SecureField, TextField, TextListField },
  formComponents: { SubmitButton },
});
