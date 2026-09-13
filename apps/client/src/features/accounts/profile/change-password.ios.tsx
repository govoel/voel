import { Button, Section } from '@expo/ui/swift-ui';
import { useState } from 'react';

import { FormSheet } from '#src/components/form-sheet';
import { Text } from '#src/components/text';

import { PasswordForm } from './change-password-form.tsx';

export const ChangePassword = () => {
  const [open, setOpen] = useState(false);
  return (
    <Section title="Password">
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        <Text>Change password</Text>
      </Button>
      <FormSheet open={open} onOpenChange={setOpen}>
        {(close) => <PasswordForm onSuccess={close} />}
      </FormSheet>
    </Section>
  );
};
