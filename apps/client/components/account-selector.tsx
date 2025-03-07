import { authModalStore } from './auth-modal';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Text } from './ui/text';
import { Large } from './ui/typography';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';

import BottomSheet from '~/components/ui/bottom-sheet';

import api from '~/lib/api';
import { LogIn } from '~/lib/icons/LogIn';
import { createInstanceAuthClient, instanceStore, useAuthSession } from '~/lib/stores/instance';
import { cn } from '~/lib/utils';

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
};

export const accountSelectorModalStore = createStore({
  context: {
    present: 0,
  },
  on: {
    presentAccountSelectorModal: (context) => ({ present: context.present + 1 }),
  },
});

export const AccountSelectorAvatar = () => {
  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const { data, isPending } = useAuthSession(authClient);
  const userInitials = getInitials(data?.user.name ?? '');

  if (isPending) {
    return null;
  }

  if (!data) {
    return (
      <Button
        variant="ghost"
        size="icon"
        onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
        <LogIn className="text-foreground" />
      </Button>
    );
  }

  return (
    <Avatar alt={`${data?.user.name}'s Avatar`} asChild>
      <Pressable onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}>
        <AvatarImage source={{ uri: data?.user.image ?? undefined }} />
        <AvatarFallback>
          <Text>{userInitials}</Text>
        </AvatarFallback>
      </Pressable>
    </Avatar>
  );
};

export const AccountSelector = () => {
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const presentModal = useSelector(accountSelectorModalStore, (s) => s.context.present);
  useEffect(() => {
    if (presentModal > 0) {
      bottomSheetModalRef.current?.present();
    }
  }, [presentModal]);

  return (
    <BottomSheet ref={bottomSheetModalRef}>
      <View className="p-6 mx-auto w-full max-w-[400px] flex-col gap-1.5">
        <Large className="pb-2">Switch account</Large>
        <AccountList />
        <Button onPress={() => authModalStore.trigger.presentAuthModal()}>
          <Text>Add account</Text>
        </Button>
      </View>
    </BottomSheet>
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
                className={index === accounts.data.length - 1 ? 'border-b' : ''}
                key={account.instanceID}
                instanceID={account.instanceID}
                instanceURL={account.instanceURL}
                instanceUserID={account.userID}
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

  if (accounts.isError) {
    return <Text>Could not fetch list of accounts: {accounts.error.message}</Text>;
  }

  return <Text>Loading...</Text>;
};

const Account = ({
  className,
  instanceID,
  instanceURL,
  instanceUserID,
  instanceUsername,
  instanceEmail,
  instanceName,
  instanceImage,
}: {
  className?: string;
  instanceID: number;
  instanceURL: string;
  instanceUserID: string;
  instanceUsername: string;
  instanceEmail: string;
  instanceName: string;
  instanceImage?: string;
}) => {
  const authClient = useMemo(
    () => createInstanceAuthClient(instanceID.toString(), instanceURL),
    [instanceID, instanceURL]
  );
  const { data, isPending, error } = useAuthSession(authClient);

  if (error) {
    return <Text>Error: {error.message}</Text>;
  }

  return (
    <Button
      variant="ghost"
      className={cn(
        'flex-row gap-3 native:h-20 h-16 rounded-none border-foreground/15 bg-secondary/40',
        className
      )}
      onPress={() =>
        instanceStore.trigger.recreateAuthInstance({
          instanceID: instanceID.toString(),
          instanceURL,
          instanceUserID,
        })
      }>
      <Avatar
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
