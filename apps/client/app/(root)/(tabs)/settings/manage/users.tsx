import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { Link, Stack } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';
import * as z from 'zod';

import { useFloatingPlayerPaddingClass } from '~/components/floating-player';
import { ChevronRight } from '~/components/icons/ChevronRight';
import { Spinner } from '~/components/spinner';
import { TitleWithRefetch } from '~/components/title-with-refetch';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardFooter } from '~/components/ui/card';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { useAuthInstance, useAuthSession } from '~/lib/stores/instance';
import { cn, getInitials } from '~/lib/utils';

const userRole = z.enum(['under18', 'user', 'admin']);

export default function UsersListScreen() {
  const authInstance = useAuthInstance();
  const session = useAuthSession(authInstance);
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
    isFetching,
    error,
    isFetchNextPageError,
  } = useInfiniteQuery({
    queryKey: ['users'],
    queryFn: async ({ pageParam }) => {
      const res = await authInstance.admin.listUsers({
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
    select: (data) => data.pages.flatMap((page) => page.users),
  });

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const createUserModalRef = useRef<BottomSheetModalType>(null);

  const createUserMutation = useMutation({
    mutationKey: ['users', 'createUser'],
    mutationFn: async (data: Parameters<typeof authInstance.admin.createUser>[0]) => {
      const res = await authInstance.admin.createUser(data);
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
      role: userRole.enum.under18 as z.infer<typeof userRole>,
    },
    validators: {
      onChange: z
        .object({
          email: z.email('Email is not valid'),
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
          path: ['confirmPassword'],
          error: "Passwords don't match",
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      await createUserMutation.mutateAsync({
        email: value.email,
        name: value.name,
        password: value.password,
        // @ts-expect-error: Better-Auth isn't able to figure out under18 is a valid role
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
      <FlashList
        data={data}
        onEndReached={handleLoadMore}
        keyExtractor={(item) => item.id.toString()}
        contentContainerClassName={useFloatingPlayerPaddingClass()}
        ListHeaderComponent={
          <>
            <Button
              variant="secondary"
              onPress={() => {
                createUserModalRef.current?.present();
              }}>
              <Text>Create New User</Text>
            </Button>

            <TitleWithRefetch className="pt-4" refetch={refetch} isFetching={isFetching}>
              Users
            </TitleWithRefetch>

            {session.error ? (
              <Card className="mt-4">
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
              </Card>
            ) : (!error && !data) || !session.data ? (
              <Card className="mt-4">
                <CardContent className="p-12 justify-center items-center">
                  <Spinner size={15} />
                </CardContent>
              </Card>
            ) : null}
          </>
        }
        ItemSeparatorComponent={() => <View className="border-t border-foreground/15" />}
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
                'flex-row native:h-20 h-16 justify-between rounded-none bg-secondary/40 border-foreground/15 border-x',
                index === 0 ? 'rounded-tl-md rounded-tr-md mt-4 border-t' : '',
                index === data!.length - 1 ? 'rounded-bl-md rounded-br-md border-b' : ''
              )}>
              <View className="flex-row gap-x-3 items-center">
                <Avatar
                  className="border border-foreground/15"
                  alt={
                    /* @ts-expect-error: Better-Auth isn't able to figure out username is present with the username plugin enabled */
                    `${item.username}'s Avatar`
                  }>
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
                  {/* @ts-expect-error: Better-Auth isn't able to figure out username is present with the username plugin enabled */}
                  <Text>{item.username}</Text>
                  <Text className="text-muted-foreground">{item.role}</Text>
                </View>
              </View>
              <ChevronRight className="text-muted-foreground" size="20" />
            </Button>
          </Link>
        )}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className="py-4 items-center">
              <Spinner size={10} />
            </View>
          ) : isFetchNextPageError ? (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <Large>Error loading more users</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => handleLoadMore()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          ) : null
        }
        ListEmptyComponent={
          error ? (
            <Card className="mt-4">
              <CardContent className="pt-4">
                <Large>Error loading users</Large>
                <Text className="text-muted-foreground">{error.message || 'Unknown error'}</Text>
              </CardContent>
              <CardFooter>
                <Button className="w-full" onPress={() => refetch()}>
                  <Text>Retry</Text>
                </Button>
              </CardFooter>
            </Card>
          ) : data?.length === 0 ? (
            <View className="flex flex-col items-center justify-center px-8 py-16 border-dashed border-2 rounded-md border-muted mb-4 w-full">
              <Text className="text-center">No users found</Text>
            </View>
          ) : null
        }
      />

      <BottomSheetModal ref={createUserModalRef} enableDynamicSizing={true}>
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
      </BottomSheetModal>
    </>
  );
}
