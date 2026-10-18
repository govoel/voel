import type { SecureFieldProps, TextFieldProps } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  keyboardType,
  textContentType,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';

import type {
  PasswordInputPurpose,
  TextInputPurpose,
} from '#src/components/form/input-presets/index.ts';

export const textInputPresets = {
  name: [textContentType('name')],
  username: [
    keyboardType('ascii-capable'),
    textContentType('username'),
    textInputAutocapitalization('never'),
    autocorrectionDisabled(),
  ],
  email: [
    keyboardType('email-address'),
    textContentType('emailAddress'),
    textInputAutocapitalization('never'),
    autocorrectionDisabled(),
  ],
  url: [
    keyboardType('url'),
    textContentType('URL'),
    textInputAutocapitalization('never'),
    autocorrectionDisabled(),
  ],
} satisfies Record<TextInputPurpose, NonNullable<TextFieldProps['modifiers']>>;

export const passwordInputPresets = {
  currentPassword: [
    textContentType('password'),
    textInputAutocapitalization('never'),
    autocorrectionDisabled(),
  ],
  newPassword: [
    textContentType('newPassword'),
    textInputAutocapitalization('never'),
    autocorrectionDisabled(),
  ],
} satisfies Record<PasswordInputPurpose, NonNullable<SecureFieldProps['modifiers']>>;
