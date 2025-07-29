import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { SnapshotFromStore } from '@xstate/store';
import type { Session as BetterAuthSession } from 'better-auth/types';
import { Stack } from 'expo-router';
import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { toast } from 'sonner-native';
import * as z from 'zod';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { Badge } from '~/components/ui/badge';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { instanceStore, useAuthInstance, useAuthSession } from '~/lib/stores/instance';
import { getInitials } from '~/lib/utils';

export default function ProfileSettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Your Profile', headerTitleAlign: 'center' }} />
      <FloatingPlayerDodgingLayout>
        <Profile />
        <SessionsList />
      </FloatingPlayerDodgingLayout>
    </>
  );
}

const Profile = () => {
  const editProfileModalRef = useRef<BottomSheetModalType>(null);
  const changePasswordModalRef = useRef<BottomSheetModalType>(null);
  const authInstance = useAuthInstance();
  const { data, error, refetch, isPending } = useAuthSession(authInstance);

  const editProfileMutation = useMutation({
    mutationFn: async (data: Parameters<typeof authInstance.updateUser>[0]) => {
      const res = await authInstance.updateUser(data);
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('Profile updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update profile', {
        description: error.message || 'Unknown error',
      });
    },
  });

  const EditProfileForm = useAppForm({
    defaultValues: {
      name: data?.user.name ?? '',
      username: data?.user.username ?? '',
    },
    validators: {
      onChange: z.object({
        username: z.string().min(1, 'Username cannot be empty'),
        name: z.string().min(1, 'Name cannot be empty'),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      await editProfileMutation.mutateAsync(value);
      refetch();
      editProfileModalRef.current?.dismiss();
      editProfileMutation.reset();
      formApi.reset();
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: Parameters<typeof authInstance.changePassword>[0]) => {
      const res = await authInstance.changePassword(data);
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('Password updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update password', {
        description: error.message || 'Unknown error',
      });
    },
  });

  const ChangePasswordForm = useAppForm({
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
    validators: {
      onChange: z
        .object({
          currentPassword: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .max(128, 'Password must be at most 128 characters'),
          newPassword: z
            .string()
            .min(8, 'New password must be at least 8 characters')
            .max(128, 'New password must be at most 128 characters'),
          confirmNewPassword: z.string().min(1, 'Confirm password cannot be empty'),
        })
        .refine((data) => data.newPassword === data.confirmNewPassword, {
          path: ['confirmNewPassword'],
          error: "Passwords don't match",
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      await changePasswordMutation.mutateAsync({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: true,
      });
      refetch();
      changePasswordModalRef.current?.dismiss();
      changePasswordMutation.reset();
      formApi.reset();
    },
  });

  return (
    <>
      <TitleWithRefetch className="pb-4" refetch={refetch} isFetching={isPending}>
        User Info
      </TitleWithRefetch>

      {data ? (
        <Card>
          <CardContent className="pt-4 flex flex-row gap-3 group items-center justify-center">
            <Avatar alt={`${data.user.name}'s Avatar`}>
              <AvatarImage
                source={{
                  uri: data.user.image ?? undefined,
                }}
              />
              <AvatarFallback>
                <Text>{getInitials(data.user.name)}</Text>
              </AvatarFallback>
            </Avatar>
            <View className="flex-1">
              <Text>{data.user.username}</Text>
              <Text className="text-muted-foreground">{data.user.role}</Text>
            </View>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button
              className="w-full"
              variant="secondary"
              size="sm"
              onPress={() => editProfileModalRef.current?.present()}>
              <Text className="text-secondary-foreground">Edit Profile</Text>
            </Button>
            <Button
              className="w-full"
              variant="secondary"
              size="sm"
              onPress={() => changePasswordModalRef.current?.present()}>
              <Text>Change Password</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="pt-4">
            <Large>Error loading profile</Large>
            <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onPress={() => refetch()}>
              <Text>Retry</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-12 justify-center items-center">
            <Spinner size={15} />
          </CardContent>
        </Card>
      )}

      <BottomSheetModal ref={editProfileModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Edit Profile</Large>
          <EditProfileForm.AppForm>
            <EditProfileForm.AppField
              name="name"
              children={(field) => (
                <field.TextField
                  label="Name"
                  inputProps={{
                    autoComplete: 'name',
                    autoCorrect: false,
                    placeholder: 'One and only you',
                  }}
                />
              )}
            />
            <EditProfileForm.AppField
              name="username"
              children={(field) => (
                <field.TextField
                  label="Username"
                  inputProps={{
                    autoComplete: 'username',
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'you',
                  }}
                />
              )}
            />
            <EditProfileForm.SubmitButton>
              <Text>Save Changes</Text>
            </EditProfileForm.SubmitButton>
          </EditProfileForm.AppForm>
        </View>
      </BottomSheetModal>

      <BottomSheetModal ref={changePasswordModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Change Password</Large>

          <ChangePasswordForm.AppForm>
            <ChangePasswordForm.AppField
              name="currentPassword"
              children={(field) => (
                <field.TextField
                  label="Password"
                  inputProps={{
                    autoComplete: 'current-password',
                    secureTextEntry: true,
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'ha!NiceTry',
                  }}
                />
              )}
            />
            <ChangePasswordForm.AppField
              name="newPassword"
              children={(field) => (
                <field.TextField
                  label="New Password"
                  inputProps={{
                    autoComplete: 'new-password',
                    secureTextEntry: true,
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'ha!NiceTry',
                  }}
                />
              )}
            />
            <ChangePasswordForm.AppField
              name="confirmNewPassword"
              children={(field) => (
                <field.TextField
                  label="Confirm New Password"
                  inputProps={{
                    autoComplete: 'new-password',
                    secureTextEntry: true,
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'ha!NiceTry',
                  }}
                />
              )}
            />
            <ChangePasswordForm.SubmitButton>
              <Text>Change Password</Text>
            </ChangePasswordForm.SubmitButton>
          </ChangePasswordForm.AppForm>
        </View>
      </BottomSheetModal>
    </>
  );
};

const SessionsList = () => {
  const authInstance = useAuthInstance();
  const {
    data: currentSession,
    error: currentSessionError,
    refetch: currentSessionRefetch,
  } = useAuthSession(authInstance);

  const {
    data: sessions,
    error: sessionsError,
    refetch: sessionsRefetch,
    isFetching: sessionsIsFetching,
  } = useQuery({
    queryKey: ['sessions', currentSession?.user.id],
    queryFn: async () => {
      const response = await authInstance.listSessions();
      if (response.error) throw response.error;
      return response.data;
    },
  });

  return (
    <>
      <TitleWithRefetch className="pt-4" refetch={sessionsRefetch} isFetching={sessionsIsFetching}>
        Sessions
      </TitleWithRefetch>

      {sessions && currentSession ? (
        <FlatList
          data={sessions}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Session
              session={item}
              userId={currentSession.user.id}
              currentSessionToken={currentSession.session.token}
              revokeSession={(token) => authInstance.revokeSession({ token })}
            />
          )}
        />
      ) : sessionsError ? (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <Large>Error loading list of sessions</Large>
            <Text className="text-muted-foreground">
              {sessionsError.message || 'Unknown error'}
            </Text>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onPress={() => sessionsRefetch()}>
              <Text>Retry</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : currentSessionError ? (
        <Card className="mt-4">
          <CardContent className="pt-4">
            <Large>Error loading current session</Large>
            <Text className="text-muted-foreground">
              {currentSessionError.message || 'Unknown error'}
            </Text>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onPress={() => currentSessionRefetch()}>
              <Text>Retry</Text>
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="mt-4">
          <CardContent className="p-12 justify-center items-center">
            <Spinner size={15} />
          </CardContent>
        </Card>
      )}
    </>
  );
};

export const Session = ({
  session,
  userId,
  currentSessionToken,
  revokeSession,
}: {
  session: BetterAuthSession;
  userId: string;
  currentSessionToken?: string;
  revokeSession: (
    token: string
  ) =>
    | ReturnType<
        SnapshotFromStore<typeof instanceStore>['context']['authInstance']['revokeSession']
      >
    | ReturnType<
        SnapshotFromStore<
          typeof instanceStore
        >['context']['authInstance']['admin']['revokeUserSession']
      >;
}) => {
  const revokeSessionMutation = useMutation({
    mutationKey: ['sessions', userId, 'revoke'],
    mutationFn: async ({ token }: { token: string }) => {
      if (currentSessionToken === token) {
        throw new Error('Cannot revoke current session');
      }

      const response = await revokeSession(token);
      if (response?.error) {
        throw response.error;
      }
    },
    onSuccess: () => {
      toast.success('Session revoked successfully');
    },
    onError: (error) => {
      toast.error('Failed to revoke session', { description: error.message || 'Unknown error' });
    },
  });

  const RevokeSessionForm = useAppForm({
    onSubmit: async ({ formApi }) => {
      await revokeSessionMutation.mutateAsync({ token: session.token });
      revokeSessionMutation.reset();
      formApi.reset();
    },
  });

  return (
    <Card key={session.id} className="mt-4">
      <CardHeader>
        <View className="flex flex-row flex-nowrap items-center gap-x-2">
          <CardTitle>
            {(session.ipAddress ?? '').length > 0 ? session.ipAddress : 'Unknown IP Address'}
          </CardTitle>

          {new Date() > session.expiresAt ? (
            <Badge variant="destructive">
              <Text>Expired</Text>
            </Badge>
          ) : null}
        </View>
        <CardDescription>
          {(session.userAgent ?? '').length > 0 ? session.userAgent : 'Unknown User Agent'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Text>Created at: {session.createdAt.toLocaleString()}</Text>
        <Text>Updated at: {session.updatedAt.toLocaleString()}</Text>
        <Text>Expires at: {session.expiresAt.toLocaleString()}</Text>
        <View className="mt-4">
          <RevokeSessionForm.AppForm>
            <RevokeSessionForm.SubmitButton
              variant="secondary"
              size="sm"
              disabled={currentSessionToken === session.token}>
              <Text>Revoke Session</Text>
            </RevokeSessionForm.SubmitButton>
          </RevokeSessionForm.AppForm>
        </View>
      </CardContent>
    </Card>
  );
};
