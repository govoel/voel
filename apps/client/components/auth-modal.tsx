import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetModalProvider,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import React, { Dispatch, SetStateAction } from 'react';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner-native';
import { z } from 'zod';

import { NativewindBottomSheetModal } from '~/components/ui/bottom-sheet';
import { useAppForm } from '~/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs';
import { Text } from '~/components/ui/text';

import { createAuthClient, instanceStore, useAuthSession } from '~/lib/stores/instance';

export const authModalStore = createStore({
  context: {
    present: 0,
  },
  on: {
    presentAuthModal: (context) => ({ present: context.present + 1 }),
  },
});

export function AuthModal() {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const [bottomSheetTab, setBottomSheetTab] = useState('sign-in');
  const renderBackdrop = useCallback(
    (props: Exclude<BottomSheetBackdropProps, 'disappearsOnIndex' | 'appearsOnIndex'>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );

  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const { data, isPending } = useAuthSession(authClient);

  useEffect(() => {
    if (!isPending && !data) {
      bottomSheetModalRef.current?.present();
    }
  }, [isPending, data]);

  const presentModal = useSelector(authModalStore, (s) => s.context.present);
  useEffect(() => {
    if (presentModal > 0) {
      bottomSheetModalRef.current?.present();
    }
  }, [presentModal]);

  return (
    <BottomSheetModalProvider>
      <NativewindBottomSheetModal
        ref={bottomSheetModalRef}
        backdropComponent={renderBackdrop}
        backgroundClassName="bg-background"
        handleIndicatorClassName="bg-foreground">
        <BottomSheetScrollView>
          <Tabs
            value={bottomSheetTab}
            onValueChange={setBottomSheetTab}
            className="mx-auto w-full max-w-[400px] flex-col gap-1.5 p-6">
            <TabsList className="mb-4 w-full flex-row">
              <TabsTrigger value="sign-in" className="flex-1">
                <Text>Sign In</Text>
              </TabsTrigger>
              <TabsTrigger value="sign-up" className="flex-1">
                <Text>Sign Up</Text>
              </TabsTrigger>
            </TabsList>
            <TabsContent value="sign-in">
              <SignInTab bottomSheetModalRef={bottomSheetModalRef} />
            </TabsContent>

            <TabsContent value="sign-up">
              <SignUpTab setTab={setBottomSheetTab} />
            </TabsContent>
          </Tabs>
        </BottomSheetScrollView>
      </NativewindBottomSheetModal>
    </BottomSheetModalProvider>
  );
}

function SignInTab({ bottomSheetModalRef }: { bottomSheetModalRef: RefObject<BottomSheetModal> }) {
  const currentInstanceURL = useSelector(instanceStore, (state) => state.context.instanceURL);

  const SignInForm = useAppForm({
    defaultValues: {
      baseURL: currentInstanceURL ?? '',
      username: '',
      password: '',
    },
    validators: {
      onChange: z.object({
        baseURL: z.string().url('URL is not valid'),
        username: z.string().min(1, 'Username cannot be empty'),
        password: z
          .string()
          .min(8, 'Password must be at least 8 characters')
          .max(128, 'Password must be at most 128 characters'),
      }),
    },
    onSubmit: async ({ value }) => {
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
        toast.error('Could not sign you in', { description: res.error.message });
      } else {
        instanceStore.trigger.setCurrentInstance({
          instanceURL: value.baseURL,
          userID: res.data.user.id,
          username: res.data.user.username,
          email: res.data.user.email,
          name: res.data.user.name,
          image: res.data.user.image ?? undefined,
          authStore: tempAuthStore,
        });
        toast.success('Signed in successfully', {
          description: `Welcome back, ${res.data.user.name}`,
        });
        bottomSheetModalRef.current?.dismiss();
      }
    },
  });

  return (
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
              placeholder: 'http://apricotta.local',
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
    </SignInForm.AppForm>
  );
}

function SignUpTab({ setTab }: { setTab: Dispatch<SetStateAction<string>> }) {
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
          baseURL: z.string().url('URL is not valid'),
          email: z.string().email('Email is not valid'),
          username: z.string().min(1, 'Username cannot be empty'),
          name: z.string().min(1, 'Name cannot be empty'),
          password: z
            .string()
            .min(8, 'Password must be at least 8 characters')
            .max(128, 'Password must be at most 128 characters'),
          confirmPassword: z.string().min(1, 'Confirm password cannot be empty'),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: "Passwords don't match",
          path: ['confirmPassword'],
        }),
    },
    onSubmit: async ({ value }) => {
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
        toast.error('Could not sign you up', { description: res.error.message });
      } else {
        toast.success('Signed up successfully', { description: 'You may proceed to sign in.' });
        setTab('sign-in');
      }
    },
  });

  return (
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
              placeholder: 'http://apricotta.local',
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
    </SignUpForm.AppForm>
  );
}
