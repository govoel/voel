import { Session } from '../../profile';
import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserWithRole } from 'better-auth/plugins';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { toast } from 'sonner-native';
import { z } from 'zod';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { Gavel } from '~/lib/icons/Gavel';
import { useAuthInstance } from '~/lib/stores/instance';
import { getInitials } from '~/lib/utils';

const userRole = z.enum(['under18', 'user', 'admin']);

const banUserValidator = z.object({
  banReason: z.string().min(1, 'Ban reason is required'),
  banExpiresIn: z
    .number({
      message: 'Ban duration must be a positive integer',
      coerce: true,
    })
    .int('Ban duration must be a positive integer')
    .positive('Ban duration must be a positive integer')
    .optional(),
});

export default function ManageUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const authInstance = useAuthInstance();

  const {
    data: user,
    refetch: userRefetch,
    isFetching: userIsFetching,
    error: userError,
  } = useQuery({
    queryKey: ['users', id],
    queryFn: async () => {
      const res = await authInstance.admin.listUsers({
        query: {
          limit: 1,
          offset: 0,
          filterField: 'id',
          filterValue: id,
          filterOperator: 'eq',
        },
      });

      if (res.error) {
        throw res.error;
      }

      if (res.data.users.length !== 1) {
        throw new Error('User not found');
      }

      return res.data.users[0];
    },
  });

  const {
    data: sessions,
    refetch: sessionsRefetch,
    isFetching: sessionsIsFetching,
    error: sessionsError,
  } = useQuery({
    queryKey: ['sessions', id],
    queryFn: async () => {
      const res = await authInstance.admin.listUserSessions({ userId: id });

      if (res.error) {
        throw res.error;
      }

      return res.data.sessions;
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Manage User', headerTitleAlign: 'center' }} />
      <FloatingPlayerDodgingLayout>
        <TitleWithRefetch className="pb-4" refetch={userRefetch} isFetching={userIsFetching}>
          User Info
        </TitleWithRefetch>

        {user ? (
          <Profile user={user} />
        ) : userError ? (
          <Card>
            <CardContent className="pt-4">
              <Large>Error loading profile</Large>
              <Text className="text-muted-foreground">{userError.message || 'Unknown error'}</Text>
            </CardContent>
            <CardFooter>
              <Button className="w-full" onPress={() => userRefetch()}>
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

        <TitleWithRefetch
          className="pt-4"
          refetch={sessionsRefetch}
          isFetching={sessionsIsFetching}>
          Sessions
        </TitleWithRefetch>

        {sessions ? (
          <FlatList
            data={sessions}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Session
                session={item}
                userId={id}
                revokeSession={(token) =>
                  authInstance.admin.revokeUserSession({ sessionToken: token })
                }
              />
            )}
            ListEmptyComponent={() => (
              <View className="mt-4 flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
                <Text className="text-center">No sessions found</Text>
              </View>
            )}
          />
        ) : sessionsError ? (
          <Card className="mt-4">
            <CardContent className="pt-4">
              <Large>Error loading user&rsquo;s sessions</Large>
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
        ) : (
          <Card className="mt-4">
            <CardContent className="p-12 justify-center items-center">
              <Spinner size={15} />
            </CardContent>
          </Card>
        )}
      </FloatingPlayerDodgingLayout>
    </>
  );
}

const Profile = ({ user }: { user: UserWithRole }) => {
  const authInstance = useAuthInstance();
  const router = useRouter();
  const queryClient = useQueryClient();

  const setRoleModalRef = useRef<BottomSheetModalType>(null);
  const setRoleMutation = useMutation({
    mutationKey: ['users', user.id, 'setRole'],
    mutationFn: async (role: z.infer<typeof userRole>) => {
      const res = await authInstance.admin.setRole({ userId: user.id, role });
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('Role updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update role', {
        description: error.message || 'Unknown error',
      });
    },
  });
  const SetRoleForm = useAppForm({
    defaultValues: {
      role: (user.role ?? 'under18') as z.infer<typeof userRole>,
    },
    validators: {
      onChange: z.object({
        role: userRole,
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      await setRoleMutation.mutateAsync(value.role);
      setRoleModalRef.current?.dismiss();
      setRoleMutation.reset();
      formApi.reset();
    },
  });

  const banUserModalRef = useRef<BottomSheetModalType>(null);
  const banUserMutation = useMutation({
    mutationKey: ['users', user.id, 'ban'],
    mutationFn: async ({
      banReason,
      banExpiresIn,
    }: {
      banReason: string;
      banExpiresIn?: number;
    }) => {
      const res = await authInstance.admin.banUser({ userId: user.id, banReason, banExpiresIn });
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('User banned successfully');
    },
    onError: (error) => {
      toast.error('Failed to ban user', {
        description: error.message || 'Unknown error',
      });
    },
  });
  const BanUserForm = useAppForm({
    defaultValues: {
      banReason: '',
    } as { banReason: string; banExpiresIn?: number },
    validators: {
      onChange: banUserValidator,
    },
    onSubmit: async ({ value, formApi }) => {
      await banUserMutation.mutateAsync(banUserValidator.parse(value));
      banUserModalRef.current?.dismiss();
      banUserMutation.reset();
      formApi.reset();
    },
  });

  const unbanUserModalRef = useRef<BottomSheetModalType>(null);
  const unbanUserMutation = useMutation({
    mutationKey: ['users', user.id, 'unban'],
    mutationFn: async () => {
      const res = await authInstance.admin.unbanUser({ userId: user.id });
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('User unbanned successfully');
    },
    onError: (error) => {
      toast.error('Failed to unban user', {
        description: error.message || 'Unknown error',
      });
    },
  });
  const UnbanUserForm = useAppForm({
    onSubmit: async ({ value, formApi }) => {
      await unbanUserMutation.mutateAsync();
      unbanUserModalRef.current?.dismiss();
      unbanUserMutation.reset();
      formApi.reset();
    },
  });

  const changePasswordModalRef = useRef<BottomSheetModalType>(null);
  const changePasswordMutation = useMutation({
    mutationKey: ['users', user.id, 'changePassword'],
    mutationFn: async (newPassword: string) => {
      const res = await authInstance.admin.setUserPassword({ userId: user.id, newPassword });
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
      newPassword: '',
      confirmNewPassword: '',
    },
    validators: {
      onChange: z
        .object({
          newPassword: z
            .string()
            .min(8, 'New password must be at least 8 characters')
            .max(128, 'New password must be at most 128 characters'),
          confirmNewPassword: z.string().min(1, 'Confirm password cannot be empty'),
        })
        .refine((data) => data.newPassword === data.confirmNewPassword, {
          message: "Passwords don't match",
          path: ['confirmNewPassword'],
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      await changePasswordMutation.mutateAsync(value.newPassword);
      changePasswordModalRef.current?.dismiss();
      changePasswordMutation.reset();
      formApi.reset();
    },
  });

  const deleteUserModalRef = useRef<BottomSheetModalType>(null);
  const deleteUserMutation = useMutation({
    mutationKey: ['users', 'delete'],
    mutationFn: async () => {
      const res = await authInstance.admin.removeUser({ userId: user.id });
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('User deleted successfully');
    },
    onError: (error) => {
      toast.error('Failed to delete user', {
        description: error.message || 'Unknown error',
      });
    },
  });
  const DeleteUserForm = useAppForm({
    onSubmit: async ({ formApi }) => {
      await deleteUserMutation.mutateAsync();
      deleteUserModalRef.current?.dismiss();
      deleteUserMutation.reset();
      queryClient.removeQueries({ queryKey: ['users', user.id] });
      formApi.reset();
      router.dismissTo('/settings/manage/users');
    },
  });

  return (
    <>
      {user.banned && (
        <Alert className="mb-4" icon={Gavel} variant="destructive">
          <AlertTitle>User is banned</AlertTitle>
          {user.banReason && user.banExpires ? (
            <AlertDescription>
              User was banned with reason &ldquo;{user.banReason}&rdquo;, and the ban expires on{' '}
              {user.banExpires.toLocaleString()}.
            </AlertDescription>
          ) : null}
          {user.banReason && !user.banExpires ? (
            <AlertDescription>
              User was banned with reason &ldquo;{user.banReason}&rdquo;, and the ban never expires.
            </AlertDescription>
          ) : null}
          {!user.banReason && user.banExpires ? (
            <AlertDescription>
              User&rsquo;s ban expires on {user.banExpires.toLocaleString()}.
            </AlertDescription>
          ) : null}
          {!user.banReason && !user.banExpires ? (
            <AlertDescription>User&rsquo;s ban never expires.</AlertDescription>
          ) : null}
        </Alert>
      )}
      <Card>
        <CardContent className="p-6 flex flex-row gap-3 group items-center justify-center">
          <Avatar alt={`${user.name}'s Avatar`}>
            <AvatarImage
              source={{
                uri: user.image ?? undefined,
              }}
            />
            <AvatarFallback>
              <Text>{getInitials(user.name)}</Text>
            </AvatarFallback>
          </Avatar>
          <View className="flex-1">
            <Text>{user.username}</Text>
            <Text className="text-muted-foreground">{user.role}</Text>
          </View>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button
            className="w-full"
            variant="secondary"
            size="sm"
            onPress={() => {
              setRoleModalRef.current?.present();
            }}>
            <Text className="text-secondary-foreground">Change Role</Text>
          </Button>
          {user.banned ? (
            <Button
              className="w-full"
              variant="secondary"
              size="sm"
              onPress={() => {
                unbanUserModalRef.current?.present();
              }}>
              <Text className="text-secondary-foreground">Unban User</Text>
            </Button>
          ) : (
            <Button
              className="w-full"
              variant="secondary"
              size="sm"
              onPress={() => {
                banUserModalRef.current?.present();
              }}>
              <Text className="text-secondary-foreground">Ban User</Text>
            </Button>
          )}
          <Button
            className="w-full"
            variant="secondary"
            size="sm"
            onPress={() => {
              changePasswordModalRef.current?.present();
            }}>
            <Text>Change Password</Text>
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            size="sm"
            onPress={() => {
              deleteUserModalRef.current?.present();
            }}>
            <Text>Delete User</Text>
          </Button>
        </CardFooter>
      </Card>

      <BottomSheetModal ref={setRoleModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Set Role</Large>
          <SetRoleForm.AppForm>
            <SetRoleForm.AppField
              name="role"
              children={(field) => (
                <field.RadioGroup
                  label="Role"
                  optionLabels={['Under 18', 'User', 'Admin']}
                  optionValues={userRole.options}
                />
              )}
            />
            <SetRoleForm.SubmitButton>
              <Text>Set Role</Text>
            </SetRoleForm.SubmitButton>
          </SetRoleForm.AppForm>
        </View>
      </BottomSheetModal>

      <BottomSheetModal ref={banUserModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Ban User</Large>

          <BanUserForm.AppForm>
            <BanUserForm.AppField
              name="banReason"
              children={(field) => (
                <field.TextField
                  label="Ban Reason"
                  inputProps={{
                    placeholder: 'Spamming',
                  }}
                />
              )}
            />
            <BanUserForm.AppField
              name="banExpiresIn"
              children={(field) => (
                <field.TextField
                  label="Ban Duration (seconds)"
                  inputProps={{
                    inputMode: 'numeric',
                    placeholder: 'If empty, ban never expires',
                  }}
                />
              )}
            />
            <BanUserForm.SubmitButton>
              <Text>Ban User</Text>
            </BanUserForm.SubmitButton>
          </BanUserForm.AppForm>
        </View>
      </BottomSheetModal>

      <BottomSheetModal ref={unbanUserModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Unban User</Large>
          <Text className="pb-4">Are you sure you want to unban this user?</Text>
          <UnbanUserForm.AppForm>
            <UnbanUserForm.SubmitButton>
              <Text>Unban User</Text>
            </UnbanUserForm.SubmitButton>
          </UnbanUserForm.AppForm>
        </View>
      </BottomSheetModal>

      <BottomSheetModal ref={changePasswordModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Change Password</Large>

          <ChangePasswordForm.AppForm>
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

      <BottomSheetModal ref={deleteUserModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Delete User</Large>

          <Text className="pb-4">Are you sure you want to delete this user?</Text>

          <DeleteUserForm.AppForm>
            <DeleteUserForm.SubmitButton>
              <Text>Delete User</Text>
            </DeleteUserForm.SubmitButton>
          </DeleteUserForm.AppForm>
        </View>
      </BottomSheetModal>
    </>
  );
};
