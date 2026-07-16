import { List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  buttonStyle,
  frame,
  headerProminence,
  keyboardType,
  padding,
  textContentType,
  textInputAutocapitalization,
} from '@expo/ui/swift-ui/modifiers';
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
      <ZStack alignment="bottom">
        <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
          <Section
            header={
              <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
                Edit Profile
              </Text>
            }>
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
          </Section>
        </List>

        <VStack
          spacing={Spacing.two}
          modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
          <form.SubmitButton
            disabled={!isDirty}
            platformProps={{ ios: { modifiers: [buttonStyle('borderedProminent')] } }}
            containerModifiers={{ ios: [frame({ maxWidth: Infinity })] }}>
            <Text>Save Changes</Text>
          </form.SubmitButton>
        </VStack>
      </ZStack>
    </form.AppForm>
  );
}) satisfies UserProfileEditorComponent;
