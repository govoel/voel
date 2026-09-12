import { Option, Schema, SchemaGetter } from 'effect';

import { AuthAdminUpdateUserInput } from '@repo/auth-api/shared.ts';
import type { AuthUser } from '@repo/auth-api/shared.ts';

import { authFailureMessage } from '#src/components/account-management/atoms.ts';
import { EditorSheet, FormLayout, Panel } from '#src/components/account-management/ui';
import { updateServerUserAtom } from '#src/components/account-management/user-atoms.ts';
import { useAppForm } from '#src/components/form';
import { Text } from '#src/components/text';

class ProfileInput extends AuthAdminUpdateUserInput.mapFields((fields) => ({
  ...fields,
  image: Schema.String.pipe(
    Schema.decodeTo(Schema.NullOr(Schema.String), {
      decode: SchemaGetter.transform((value) => (value === '' ? null : value)),
      encode: SchemaGetter.transform((value) => value ?? ''),
    })
  ),
})) {}

const ProfileForm = ({
  user,
  onSuccess,
}: {
  user: typeof AuthUser.Type;
  onSuccess: () => void | Promise<void>;
}) => {
  const form = useAppForm({
    schema: ProfileInput,
    mutation: updateServerUserAtom,
    defaultValues: {
      userId: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      image: Option.getOrElse(Option.fromNullishOr(user.image), () => ''),
    },
    onFailure: authFailureMessage,
    onSuccess,
  });
  return (
    <form.AppForm>
      <FormLayout
        title="Edit user profile"
        footer={
          <form.SubmitButton>
            <Text>Save profile</Text>
          </form.SubmitButton>
        }>
        <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
        <form.AppField name="username">
          {(field) => <field.TextField label="Username" />}
        </form.AppField>
        <form.AppField name="email">{(field) => <field.TextField label="Email" />}</form.AppField>
        <form.AppField name="image">
          {(field) => <field.TextField label="Profile image URL (empty to remove)" />}
        </form.AppField>
      </FormLayout>
    </form.AppForm>
  );
};

export const UserProfile = ({ user }: { user: typeof AuthUser.Type }) => (
  <Panel title="Profile">
    <EditorSheet title="Edit user profile" contentProps={{ user }}>
      {ProfileForm}
    </EditorSheet>
  </Panel>
);
