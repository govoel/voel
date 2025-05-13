import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useSelector } from '@xstate/store/react';
import { Link, Stack } from 'expo-router';
import { useRef } from 'react';
import { FlatList, View } from 'react-native';
import { toast } from 'sonner-native';
import { z } from 'zod';

import { FloatingPlayerDodgingLayout } from '~/components/floating-player';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheet } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { ChevronRight } from '~/lib/icons/ChevronRight';
import { instanceStore, useAuthSession } from '~/lib/stores/instance';
import { cn, getInitials } from '~/lib/utils';

const userRole = z.enum(['under18', 'user', 'admin']);

export default function UsersListScreen() {
  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const session = useAuthSession(authClient);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch, isLoading, error } =
    useInfiniteQuery({
      queryKey: ['users'],
      queryFn: async ({ pageParam }) => {
        const res = await authClient.admin.listUsers({
          query: {
            limit: 20,
            offset: pageParam * 20,
          },
        });
        if (res.error) {
          throw res.error;
        }
        return res.data;
      },
      getNextPageParam: (lastPage, allPages, lastPageParam) => {
        const itemsSoFar = lastPageParam * 20 + lastPage.users.length;
        return itemsSoFar < lastPage.total ? lastPageParam + 1 : undefined;
      },
      initialPageParam: 0,
    });

  const allUsers = data?.pages.flatMap((page) => page.users) || [];

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const createUserModalRef = useRef<BottomSheetModal>(null);

  const createUserMutation = useMutation({
    mutationKey: ['users', 'createUser'],
    mutationFn: async (data: Parameters<typeof authClient.admin.createUser>[0]) => {
      const res = await authClient.admin.createUser(data);
      if (res.error) {
        throw res.error;
      }
      return res.data;
    },
    onSuccess: () => {
      toast.success('User created successfully', { description: 'They may proceed to sign in.' });
    },
    onError: (error) => {
      toast.error('Failed to create user', { description: error.message || 'Unknown error' });
    },
  });

  const CreateUserForm = useAppForm({
    defaultValues: {
      username: '',
      email: '',
      name: '',
      password: '',
      confirmPassword: '',
      role: 'under18',
    },
    validators: {
      onChange: z
        .object({
          email: z.string().email('Email is not valid'),
          username: z.string().min(1, 'Username cannot be empty'),
          name: z.string().min(1, 'Name cannot be empty'),
          password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .max(128, 'Password must be at most 128 characters'),
          confirmPassword: z.string().min(1, 'Confirm password cannot be empty'),
          role: userRole,
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Passwords don't match",
          path: ['confirmPassword'],
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      await createUserMutation.mutateAsync({
        email: value.email,
        name: value.name,
        password: value.password,
        role: value.role,
        data: {
          username: value.username,
        },
      });
      createUserModalRef.current?.dismiss();
      createUserMutation.reset();
      formApi.reset();
    },
  });

  return (
    <>
      <Stack.Screen options={{ title: 'Manage Users', headerTitleAlign: 'center' }} />
      <FloatingPlayerDodgingLayout>
        <Button
          variant="secondary"
          onPress={() => {
            createUserModalRef.current?.present();
          }}>
          <Text>Create New User</Text>
        </Button>
        <TitleWithRefetch className="pt-4" refetch={refetch} isLoading={isLoading}>
          Users
        </TitleWithRefetch>
        <Card className="mt-4">
          {error ? (
            <>
              <CardContent className="pt-4">
                <Large>Error loading users</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </>
          ) : session.error ? (
            <>
              <CardContent className="pt-4">
                <Large>Error loading your session</Large>
                <Text className="text-muted-foreground">
                  {session.error.message || 'Unknown error'}
                </Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => session.refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </>
          ) : data && session.data ? (
            <FlatList
              data={allUsers}
              keyExtractor={(item) => item.id.toString()}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <Link
                  href={
                    session.data?.user.id === item.id
                      ? '/settings/profile'
                      : { pathname: '/settings/manage/users/[id]', params: { id: item.id } }
                  }
                  asChild
                  push>
                  <Button
                    variant="ghost"
                    className={cn(
                      'flex-row native:h-20 h-16 justify-between rounded-none bg-secondary/40',
                      index !== 0 ? 'border-t border-foreground/15' : ''
                    )}>
                    <View className="flex-row gap-x-3 items-center">
                      <Avatar
                        className="border border-foreground/15"
                        alt={`${item.username}'s Avatar`}>
                        <AvatarImage
                          source={{
                            uri: item.image ?? undefined,
                          }}
                        />
                        <AvatarFallback>
                          <Text>{getInitials(item.name)}</Text>
                        </AvatarFallback>
                      </Avatar>
                      <View>
                        <Text>{item.username}</Text>
                        <Text className="text-muted-foreground">{item.role}</Text>
                      </View>
                    </View>
                    <ChevronRight className="text-muted-foreground" size="20" />
                  </Button>
                </Link>
              )}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View className="py-4 items-center">
                    <Spinner size={10} />
                  </View>
                ) : null
              }
            />
          ) : (
            <CardContent className="p-12 justify-center items-center">
              <Spinner size={15} />
            </CardContent>
          )}
        </Card>
      </FloatingPlayerDodgingLayout>

      <BottomSheet ref={createUserModalRef}>
        <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
          <Large className="pb-2">Create New User</Large>
          <CreateUserForm.AppForm>
            <CreateUserForm.AppField
              name="email"
              children={(field) => (
                <field.TextField
                  label="Email"
                  inputProps={{
                    autoComplete: 'email',
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'you@domain.tld',
                  }}
                />
              )}
            />
            <CreateUserForm.AppField
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
            <CreateUserForm.AppField
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
            <CreateUserForm.AppField
              name="role"
              children={(field) => (
                <field.RadioGroup
                  label="Role"
                  optionValues={userRole.options}
                  optionLabels={['Under 18', 'User', 'Admin']}
                />
              )}
            />
            <CreateUserForm.AppField
              name="password"
              children={(field) => (
                <field.TextField
                  label="Password"
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
            <CreateUserForm.AppField
              name="confirmPassword"
              children={(field) => (
                <field.TextField
                  label="Confirm Password"
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

            <CreateUserForm.SubmitButton>
              <Text>Create New User</Text>
            </CreateUserForm.SubmitButton>
          </CreateUserForm.AppForm>
        </View>
      </BottomSheet>
    </>
  );
}
