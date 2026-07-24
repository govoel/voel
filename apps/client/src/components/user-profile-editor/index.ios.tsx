import { Section } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  buttonStyle,
  frame,
  keyboardType,
  textContentType,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
import { useSelector } from '@tanstack/react-form';

import { Text } from '#src/components/text';
import { useUserProfileForm } from '#src/components/user-profile-editor/form.tsx';
import type { UserProfileEditorComponent } from '#src/components/user-profile-editor/index.ts';

export const UserProfileEditor = (({ onProfileUpdated, profile, updateProfile }) => {
  const form = useUserProfileForm({ onProfileUpdated, profile, updateProfile });
  const isDirty = useSelector(form.store, (state) => state.isDirty);

  return (
    <form.AppForm>
      <Section title="Edit Profile">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label="Name"
              platformProps={{ ios: { modifiers: [textContentType('name')] } }}
            />
          )}
        </form.AppField>

        <form.AppField name="username">
          {(field) => (
            <field.TextField
              label="Username"
              platformProps={{
                ios: {
                  modifiers: [
                    keyboardType('ascii-capable'),
                    textContentType('username'),
                    textInputAutocapitalization('never'),
                    autocorrectionDisabled(),
                  ],
                },
              }}
            />
          )}
        </form.AppField>

        <form.SubmitButton
          disabled={!isDirty}
          platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
          containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
          <Text>Save Changes</Text>
        </form.SubmitButton>
      </Section>
    </form.AppForm>
  );
}) satisfies UserProfileEditorComponent;
