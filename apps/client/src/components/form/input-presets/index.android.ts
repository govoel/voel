import type { TextFieldProps } from '@expo/ui/jetpack-compose';

import type {
  PasswordInputPurpose,
  TextInputPurpose,
} from '#src/components/form/input-presets/index.ts';

export const textInputPresets = {
  name: { capitalization: 'words', keyboardType: 'text' },
  username: { keyboardType: 'ascii', capitalization: 'none', autoCorrectEnabled: false },
  email: { keyboardType: 'email', capitalization: 'none', autoCorrectEnabled: false },
  url: { keyboardType: 'uri', capitalization: 'none', autoCorrectEnabled: false },
} satisfies Record<TextInputPurpose, NonNullable<TextFieldProps['keyboardOptions']>>;

// Compose uses the password keyboard for both purposes; iOS distinguishes autofill content types.
export const passwordInputPresets = {
  currentPassword: { keyboardType: 'password', capitalization: 'none', autoCorrectEnabled: false },
  newPassword: { keyboardType: 'password', capitalization: 'none', autoCorrectEnabled: false },
} satisfies Record<PasswordInputPurpose, NonNullable<TextFieldProps['keyboardOptions']>>;
