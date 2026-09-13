import { Button, Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';

import { FormSheet } from '#src/components/form-sheet';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

import { PasswordForm } from './change-password-form.tsx';

export const ChangePassword = () => {
  const [open, setOpen] = useState(false);
  return (
    <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
      <Text variant="h4">Password</Text>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        modifiers={[fillMaxWidth()]}>
        <Text>Change password</Text>
      </Button>
      <FormSheet open={open} onOpenChange={setOpen}>
        {(close) => <PasswordForm onSuccess={close} />}
      </FormSheet>
    </Column>
  );
};
