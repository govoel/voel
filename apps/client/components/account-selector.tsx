import type { BottomSheetModal as BottomSheetModalType } from '@gorhom/bottom-sheet';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';

import { authModalStore } from '~/components/auth-modal';
import { Spinner } from '~/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
import { LogIn } from '~/lib/icons/LogIn';
import {
  createInstanceAuthClient,
  instanceStore,
  useAuthInstance,
  useAuthSession,
  useInstanceId,
} from '~/lib/stores/instance';
import { cn, getInitials } from '~/lib/utils';

export const accountSelectorModalStore = createStore({
  context: {
    present: false,
    dismiss: false,
  },
  on: {
    presentAccountSelectorModal: (context) => ({
      present: true,
      dismiss: context.dismiss,
    }),
    resetPresent: (context) => ({
      present: false,
      dismiss: context.dismiss,
    }),
    dismissAccountSelectorModal: (context) => ({
      dismiss: true,
      present: context.present,
    }),
    resetDismiss: (context) => ({
      dismiss: false,
      present: context.present,
    }),
  },
});

export const AccountSelectorAvatar = () => {
  const authInstance = useAuthInstance();
  const instanceId = useInstanceId();
  const { data: localAccountData } = api.accounts.get.useQuery(instanceId);
  const { data: authSessionData, isPending: authSessionIsPending } = useAuthSession(authInstance);

  if (!localAccountData) {
    return (
      <View className="relative">
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
          <LogIn className="text-foreground" />
        </Button>
        {authSessionIsPending && (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
            className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90 rounded-md">
            <Spinner size={3} />
          </Button>
        )}
      </View>
    );
  }

  if (!authSessionData) {
    return (
      <View className="relative">
        <LoggedInUserAvatar user={{ name: localAccountData.name, image: localAccountData.image }} />
        {authSessionIsPending && (
          <Button
            variant="ghost"
            size="icon"
            onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
            className="absolute inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90 rounded-md">
            <Spinner size={3} />
          </Button>
        )}
      </View>
    );
  }

  return (
    <LoggedInUserAvatar
      user={{ name: authSessionData.user.name, image: authSessionData.user.image }}
    />
  );
};

const LoggedInUserAvatar = ({
  user,
}: {
  user: { name: string; image: string | null | undefined };
}) => {
  const userInitials = getInitials(user.name ?? '');
  const syncStatus = useSelector(instanceStore, (state) => state.context.syncStatus);

  return (
    <View
      className={cn(
        'relative border-2 rounded-full',
        syncStatus === 'idle' || syncStatus === 'connecting'
          ? 'border-foreground'
          : syncStatus === 'error'
            ? 'border-red-500'
            : 'border-green-500'
      )}>
      <Avatar
        className="rounded-full border-transparent border-2"
        alt={`${user.name}'s Avatar`}
        asChild>
        <Pressable onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
          <AvatarImage source={{ uri: user.image ?? undefined }} />
          <AvatarFallback>
            <Text>{userInitials}</Text>
          </AvatarFallback>
        </Pressable>
      </Avatar>
      {(syncStatus === 'idle' || syncStatus === 'connecting') && (
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
          className="absolute rounded-full inset-0 flex items-center justify-center w-full h-full bg-muted/80 active:bg-muted/90">
          <Spinner size={3} />
        </Button>
      )}
    </View>
  );
};

export const AccountSelector = () => {
  const bottomSheetModalRef = useRef<BottomSheetModalType>(null);

  const presentModal = useSelector(accountSelectorModalStore, (s) => s.context.present);
  const dismissModal = useSelector(accountSelectorModalStore, (s) => s.context.dismiss);
  useEffect(() => {
    if (presentModal) {
      bottomSheetModalRef.current?.present();
      accountSelectorModalStore.trigger.resetPresent();
    }
  }, [presentModal]);
  useEffect(() => {
    if (dismissModal) {
      bottomSheetModalRef.current?.dismiss();
      accountSelectorModalStore.trigger.resetDismiss();
    }
  }, [dismissModal]);

  return (
    <BottomSheetModal ref={bottomSheetModalRef}>
      <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
        <Large className="pb-2">Switch account</Large>
        <AccountList />
        <Button onPress={() => authModalStore.trigger.presentAuthModal()}>
          <Text>Add account</Text>
        </Button>
      </View>
    </BottomSheetModal>
  );
};

const AccountList = () => {
  const accounts = api.accounts.list.useQuery();

  if (accounts.data) {
    return (
      <>
        {accounts.data.length === 0 ? (
          <View className="flex flex-col items-center justify-center p-8 border-dashed border-2 rounded-md border-muted mb-4">
            <Text className="text-center">No accounts found</Text>
          </View>
        ) : (
          <View className="mb-4 overflow-hidden rounded-md border border-foreground/15">
            {accounts.data.map((account, index) => (
              <Account
                className={index === accounts.data.length - 1 ? '' : 'border-b'}
                key={account.instanceId}
                instanceId={account.instanceId}
                instanceURL={account.instanceURL}
                instanceUserId={account.userId}
                instanceUsername={account.username}
                instanceEmail={account.email}
                instanceName={account.name}
                instanceImage={account.image}
              />
            ))}
          </View>
        )}
      </>
    );
  }

  if (accounts.error) {
    return (
      <View className="mb-4 rounded-md border border-foreground/15 p-4">
        <Text>Could not fetch list of accounts: {accounts.error.message}</Text>
      </View>
    );
  }

  return (
    <View className="flex items-center justify-center mb-4 rounded-md border border-foreground/15 p-12">
      <Spinner size={10} />
    </View>
  );
};

const Account = ({
  className,
  instanceId,
  instanceURL,
  instanceUserId,
  instanceUsername,
  instanceName,
  instanceImage,
}: {
  className?: string;
  instanceId: number;
  instanceURL: string;
  instanceUserId: string;
  instanceUsername: string;
  instanceEmail: string;
  instanceName: string;
  instanceImage?: string;
}) => {
  const authClient = useMemo(
    () => createInstanceAuthClient(instanceId.toString(), instanceURL),
    [instanceId, instanceURL]
  );
  const { data, isPending } = useAuthSession(authClient);

  return (
    <Button
      variant="ghost"
      className={cn(
        'flex-row gap-x-3 native:h-20 h-16 rounded-none border-foreground/15 bg-secondary/40',
        className
      )}
      onPress={() => {
        instanceStore.trigger.recreateAuthInstance({
          instanceId: instanceId.toString(),
          instanceURL,
          instanceUserId,
        });
        accountSelectorModalStore.trigger.dismissAccountSelectorModal();
      }}>
      <Avatar
        className="border border-foreground/15"
        alt={`${isPending ? instanceUsername : (data?.user.name ?? instanceUsername)}'s Avatar`}>
        <AvatarImage
          source={{
            uri: (isPending ? instanceImage : (data?.user.image ?? instanceImage)) ?? undefined,
          }}
        />
        <AvatarFallback>
          <Text>{getInitials(isPending ? instanceName : (data?.user.name ?? instanceName))}</Text>
        </AvatarFallback>
      </Avatar>
      <View className="flex-1">
        <Text>{isPending ? instanceUsername : (data?.user.username ?? instanceUsername)}</Text>
        <Text className="text-muted-foreground">{instanceURL}</Text>
      </View>
    </Button>
  );
};
