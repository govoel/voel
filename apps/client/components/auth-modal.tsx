import {
  type BottomSheetModal as BottomSheetModalType,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import * as SecureStore from 'expo-secure-store';
import React, { type RefObject, useEffect, useRef } from 'react';
import { View } from 'react-native';
import { toast } from 'sonner-native';
import * as z from 'zod';

import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { useAppForm } from '~/components/ui/form';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import { accountsQueryKeys } from '~/lib/api/accounts';
import { queryClient } from '~/lib/api/query-client';
import { mainDb } from '~/lib/db/client';
import {
  createAuthClient,
  instanceStore,
  useAuthInstance,
  useAuthSession,
} from '~/lib/stores/instance';

export const authModalStore = createStore({
  context: {
    present: false,
  },
  on: {
    presentAuthModal: () => ({ present: true }),
    resetPresent: () => ({ present: false }),
  },
});

export function AuthModal() {
  const signInBottomSheetModalRef = useRef<BottomSheetModalType>(null);
  const signUpBottomSheetModalRef = useRef<BottomSheetModalType>(null);

  const authInstance = useAuthInstance();
  const { data, isPending } = useAuthSession(authInstance);

  useEffect(() => {
    if (!isPending && !data) {
      signInBottomSheetModalRef.current?.present();
    }
  }, [isPending, data]);

  const presentModal = useSelector(authModalStore, (s) => s.context.present);
  useEffect(() => {
    if (presentModal) {
      signInBottomSheetModalRef.current?.present();
      authModalStore.trigger.resetPresent();
    }
  }, [presentModal]);

  return (
    <>
      <SignInModal
        signInBottomSheetModalRef={signInBottomSheetModalRef}
        setupServerBottomSheetModalRef={signUpBottomSheetModalRef}
      />

      <SetupNewServerModal bottomSheetModalRef={signUpBottomSheetModalRef} />
    </>
  );
}

function SignInModal({
  signInBottomSheetModalRef,
  setupServerBottomSheetModalRef,
}: {
  signInBottomSheetModalRef: RefObject<BottomSheetModalType | null>;
  setupServerBottomSheetModalRef: RefObject<BottomSheetModalType | null>;
}) {
  const currentInstanceId = useSelector(instanceStore, (state) => state.context.instanceId);
  const currentInstanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);
  const currentInstanceUserId = useSelector(instanceStore, (state) => state.context.instanceUserId);

  const SignInForm = useAppForm({
    defaultValues: {
      baseURL: currentInstanceURL ?? '',
      username: '',
      password: '',
    },
    validators: {
      onChange: z.object({
        baseURL: z.url('URL is not valid'),
        username: z.string().min(1, 'Username cannot be empty'),
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .max(128, 'Password must be at most 128 characters'),
      }),
    },
    onSubmit: async ({ value, formApi }) => {
      const tempAuthStore = new Map<string, string | null>();
      const authClient = createAuthClient(value.baseURL, '', {
        getItem: (k) => tempAuthStore.get(k) ?? null,
        setItem: (k, v) => tempAuthStore.set(k, v),
      });
      const res = await authClient.signIn.username({
        username: value.username,
        password: value.password,
      });
      if (res.error) {
        toast.error('Could not sign you in', { description: res.error.message || 'Unknown error' });
      } else {
        await switchInstance({
          current: {
            instanceId: currentInstanceId,
            instanceUserId: currentInstanceUserId,
            instanceURL: currentInstanceURL,
          },
          switchTo: {
            instanceURL: value.baseURL,
            userId: res.data.user.id,
            username: res.data.user.username ?? value.username,
            email: res.data.user.email,
            name: res.data.user.name,
            image: res.data.user.image ?? undefined,
            updatedAt: res.data.user.updatedAt,
            authStore: tempAuthStore,
          },
        });
        toast.success('Signed in successfully', {
          description: `Welcome back, ${res.data.user.username}`,
        });
        signInBottomSheetModalRef.current?.dismiss();
        formApi.reset();
      }
    },
  });

  return (
    <BottomSheetModal ref={signInBottomSheetModalRef} enableDynamicSizing={true}>
      <BottomSheetScrollView>
        <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 px-6 pb-6 pt-2">
          <Large>Sign In</Large>

          <SignInForm.AppForm>
            <SignInForm.AppField
              name="baseURL"
              children={(field) => (
                <field.TextField
                  label="Instance URL"
                  inputProps={{
                    autoComplete: 'url',
                    inputMode: 'url',
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'http://voel.local',
                  }}
                />
              )}
            />
            <SignInForm.AppField
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
            <SignInForm.AppField
              name="password"
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

            <SignInForm.SubmitButton>
              <Text>Sign In</Text>
            </SignInForm.SubmitButton>

            <Button
              variant="secondary"
              onPress={() => {
                setupServerBottomSheetModalRef.current?.present();
              }}>
              <Text>Setup new server</Text>
            </Button>
          </SignInForm.AppForm>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}

export const initialSyncModalStore = createStore({
  context: {
    present: false,
  },
  on: {
    presentInitialSyncModal: () => ({ present: true }),
    resetPresent: () => ({ present: false }),
  },
});

const switchInstance = async ({
  current,
  switchTo,
}: {
  current: { instanceId: string | null; instanceUserId: string | null; instanceURL: string | null };
  switchTo: {
    userId: string;
    instanceURL: string;
    username: string;
    email: string;
    name: string;
    image?: string;
    updatedAt: Date;
    authStore: Map<string, string | null>;
  };
}) => {
  let instanceId = current.instanceId;
  if (current.instanceUserId !== switchTo.userId || current.instanceURL !== switchTo.instanceURL) {
    let instance = await mainDb
      .selectFrom('accounts')
      .select(['instanceId as id', 'instanceURL as url', 'userId'])
      .where('instanceURL', '=', switchTo.instanceURL)
      .where('userId', '=', switchTo.userId)
      .executeTakeFirst();

    if (!instance) {
      instance = await mainDb
        .insertInto('accounts')
        .values({
          instanceURL: switchTo.instanceURL,
          userId: switchTo.userId,
          username: switchTo.username,
          email: switchTo.email,
          name: switchTo.name,
          image: switchTo.image,
          updatedAt: switchTo.updatedAt.getTime(),
        })
        .returning(['instanceId as id', 'instanceURL as url', 'userId as userId'])
        .executeTakeFirst();

      if (!instance) {
        instanceStore.trigger.setError({ error: 'Failed to insert new instance' });
        return;
      }

      initialSyncModalStore.trigger.presentInitialSyncModal();
    } else {
      await mainDb
        .updateTable('accounts')
        .set({
          username: switchTo.username,
          email: switchTo.email,
          name: switchTo.name,
          image: switchTo.image,
          updatedAt: switchTo.updatedAt.getTime(),
        })
        .where('instanceURL', '=', switchTo.instanceURL)
        .where('userId', '=', switchTo.userId)
        .executeTakeFirst();
    }

    instanceId = instance.id.toString();
  } else {
    await mainDb
      .updateTable('accounts')
      .set({
        username: switchTo.username,
        email: switchTo.email,
        name: switchTo.name,
        image: switchTo.image,
        updatedAt: switchTo.updatedAt.getTime(),
      })
      .where('instanceURL', '=', switchTo.instanceURL)
      .where('userId', '=', switchTo.userId)
      .executeTakeFirst();
  }

  for (const [key, value] of switchTo.authStore.entries()) {
    SecureStore.setItem(`voel_${instanceId}${key}`, value ?? '');
  }

  instanceStore.trigger.recreateAuthInstance({
    instanceId: instanceId!,
    instanceUserId: switchTo.userId,
    instanceURL: switchTo.instanceURL,
  });

  queryClient.invalidateQueries({ queryKey: accountsQueryKeys.all });
};

function SetupNewServerModal({
  bottomSheetModalRef,
}: {
  bottomSheetModalRef: RefObject<BottomSheetModalType | null>;
}) {
  const currentInstanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);

  const SignUpForm = useAppForm({
    defaultValues: {
      baseURL: currentInstanceURL ?? '',
      username: '',
      email: '',
      name: '',
      password: '',
      confirmPassword: '',
    },
    validators: {
      onChange: z
        .object({
          baseURL: z.url('URL is not valid'),
          email: z.email('Email is not valid'),
          username: z.string().min(1, 'Username cannot be empty'),
          name: z.string().min(1, 'Name cannot be empty'),
          password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .max(128, 'Password must be at most 128 characters'),
          confirmPassword: z.string().min(1, 'Confirm password cannot be empty'),
        })
        .refine((data) => data.password === data.confirmPassword, {
          path: ['confirmPassword'],
          error: "Passwords don't match",
        }),
    },
    onSubmit: async ({ value, formApi }) => {
      const tempAuthStore = new Map<string, string | null>();
      const authClient = createAuthClient(value.baseURL, '', {
        getItem: (k) => tempAuthStore.get(k) ?? null,
        setItem: (k, v) => tempAuthStore.set(k, v),
      });
      const res = await authClient.signUp.email({
        name: value.name,
        email: value.email,
        username: value.username,
        password: value.password,
      });

      if (res.error) {
        toast.error('Could not sign you up', { description: res.error.message || 'Unknown error' });
      } else {
        toast.success('Signed up successfully', { description: 'You may proceed to sign in.' });
        bottomSheetModalRef.current?.dismiss();
        formApi.reset();
      }
    },
  });

  return (
    <BottomSheetModal
      ref={bottomSheetModalRef}
      enableDynamicSizing={true}
      enablePanDownToClose={true}>
      <BottomSheetScrollView>
        <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 px-6 pb-6 pt-2">
          <Large>Setup new server</Large>

          <SignUpForm.AppForm>
            <SignUpForm.AppField
              name="baseURL"
              children={(field) => (
                <field.TextField
                  label="Instance URL"
                  inputProps={{
                    autoComplete: 'url',
                    inputMode: 'url',
                    autoCorrect: false,
                    autoCapitalize: 'none',
                    placeholder: 'http://voel.local',
                  }}
                />
              )}
            />
            <SignUpForm.AppField
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
            <SignUpForm.AppField
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
            <SignUpForm.AppField
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
            <SignUpForm.AppField
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
            <SignUpForm.AppField
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

            <SignUpForm.SubmitButton>
              <Text>Sign Up</Text>
            </SignUpForm.SubmitButton>

            <Button
              variant="secondary"
              onPress={() => {
                bottomSheetModalRef.current?.dismiss();
              }}>
              <Text>Back to sign in</Text>
            </Button>
          </SignUpForm.AppForm>
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
}
