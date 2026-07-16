import { Column } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useSelector } from '@tanstack/react-form';

import { Text } from '#src/components/text';
import { useUserProfileForm } from '#src/components/user-profile-editor/form.tsx';
import type { UserProfileEditorComponent } from '#src/components/user-profile-editor/index.ts';
import { Spacing } from '#src/constants/theme.ts';

export const UserProfileEditor = (({ onProfileUpdated, profile, updateProfile }) => {
  const form = useUserProfileForm({ onProfileUpdated, profile, updateProfile });
  const isDirty = useSelector(form.store, (state) => state.isDirty);

  return (
    <form.AppForm>
      <Column verticalArrangement={{ spacedBy: Spacing.two }}>
        <Text variant="h3">Edit Profile</Text>

        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label="Name"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: { capitalization: 'words' },
                },
              }}
            />
          )}
        </form.AppField>

        <form.AppField name="username">
          {(field) => (
            <field.TextField
              label="Username"
              platformProps={{
                android: {
                  modifiers: [fillMaxWidth()],
                  keyboardOptions: {
                    keyboardType: 'ascii',
                    capitalization: 'none',
                    autoCorrectEnabled: false,
                  },
                },
              }}
            />
          )}
        </form.AppField>

        <form.SubmitButton
          disabled={!isDirty}
          platformProps={{ android: { modifiers: [fillMaxWidth()] } }}>
          <Text>Save Changes</Text>
        </form.SubmitButton>
      </Column>
    </form.AppForm>
  );
}) satisfies UserProfileEditorComponent;
