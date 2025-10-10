import {
  type BottomSheetModal as BottomSheetModalType,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { createStore } from '@xstate/store';
import { useSelector } from '@xstate/store/react';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { authModalStore, initialSyncModalStore } from '~/components/auth-modal';
import { LogIn } from '~/components/icons/LogIn';
import { Spinner } from '~/components/spinner';
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar';
import { BottomSheetModal } from '~/components/ui/bottom-sheet';
import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { Large } from '~/components/ui/typography';

import api from '~/lib/api';
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
            className="absolute inset-0 flex size-9 items-center justify-center rounded-md bg-muted/80 active:bg-muted/90">
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
            className="absolute inset-0 flex size-9 items-center justify-center rounded-md bg-muted/80 active:bg-muted/90">
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
    <Pressable
      onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
      className={cn(
        'relative rounded-full border-2',
        syncStatus === 'idle' || syncStatus === 'connecting'
          ? 'border-foreground'
          : syncStatus === 'error'
            ? 'border-red-500'
            : syncStatus === 'processing'
              ? 'border-primary'
              : 'border-green-500'
      )}>
      <Avatar className="rounded-full border-2 border-transparent" alt={`${user.name}'s Avatar`}>
        <AvatarImage source={{ uri: user.image ?? undefined }} />
        <AvatarFallback>
          <Text>{userInitials}</Text>
        </AvatarFallback>
      </Avatar>
      {syncStatus === 'processing' ? <SyncCount /> : null}
      {(syncStatus === 'idle' || syncStatus === 'connecting') && (
        <Button
          variant="ghost"
          size="icon"
          onPress={() => accountSelectorModalStore.trigger.presentAccountSelectorModal()}
          className="absolute inset-0 flex size-9 items-center justify-center rounded-full bg-muted/80 active:bg-muted/90">
          <Spinner size={3} />
        </Button>
      )}
    </Pressable>
  );
};

const SyncCount = () => {
  const [syncCount, setSyncCount] = useState(() => instanceStore.getSnapshot().context.syncCount);

  const latestRef = useRef(syncCount);
  const rafId = useRef(0);
  const rafScheduled = useRef(false);
  useEffect(() => {
    const flush = (time: number) => {
      rafScheduled.current = false;
      setSyncCount(latestRef.current);
    };

    const schedule = () => {
      if (rafScheduled.current) return;
      rafScheduled.current = true;
      rafId.current = requestAnimationFrame(flush);
    };

    const { unsubscribe } = instanceStore
      .select((state) => state.syncCount)
      .subscribe((count) => {
        latestRef.current = count;
        schedule();
      });

    return () => {
      unsubscribe();
      if (rafId.current) {
        cancelAnimationFrame(rafId.current);
      }
    };
  }, []);

  return (
    <View className="absolute -bottom-1 -right-1 min-w-5 max-w-7 rounded-full bg-primary p-0.5">
      <Text className="text-center text-xs">{syncCount}</Text>
    </View>
  );
};

export const AccountSelector = () => {
  const bottomSheetModalRef = useRef<BottomSheetModalType>(null);
  const activityIndicatorTipsModalRef = useRef<BottomSheetModalType>(null);

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
    <>
      <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
        <BottomSheetScrollView>
          <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 p-6">
            <Large>Switch account</Large>
            <AccountList />
            <Button onPress={() => authModalStore.trigger.presentAuthModal()}>
              <Text>Add account</Text>
            </Button>
            <Button
              variant="secondary"
              onPress={() => activityIndicatorTipsModalRef.current?.present()}>
              <Text>View avatar indicator tips</Text>
            </Button>
          </View>
        </BottomSheetScrollView>
      </BottomSheetModal>

      <AvatarIndicatorTipsModal bottomSheetModalRef={activityIndicatorTipsModalRef} />

      <InitialSyncModal />
    </>
  );
};

const InitialSyncModal = () => {
  const bottomSheetModalRef = useRef<BottomSheetModalType>(null);

  const presentModal = useSelector(initialSyncModalStore, (s) => s.context.present);
  useEffect(() => {
    if (presentModal) {
      bottomSheetModalRef.current?.present();
      initialSyncModalStore.trigger.resetPresent();
    }
  }, [presentModal]);

  return (
    <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
      <BottomSheetScrollView>
        <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 px-6 pb-6 pt-2">
          <Large>Initial sync in progress</Large>
          <Text className="text-muted-foreground">
            Your account is currently syncing. This may take a while depending on the size of your
            account. You can continue to use the app while the sync is in progress.
          </Text>

          <Large>Avatar indicators</Large>
          <AvatarIndicatorTips />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

const AvatarIndicatorTipsModal = ({
  bottomSheetModalRef,
}: {
  bottomSheetModalRef: RefObject<BottomSheetModalType | null>;
}) => {
  return (
    <BottomSheetModal ref={bottomSheetModalRef} enableDynamicSizing={true}>
      <BottomSheetScrollView>
        <View className="mx-auto w-full max-w-[400px] flex-col gap-1.5 px-6 pb-6">
          <Large>Avatar indicator tips</Large>

          <AvatarIndicatorTips />
        </View>
      </BottomSheetScrollView>
    </BottomSheetModal>
  );
};

const AvatarIndicatorTips = () => {
  return (
    <>
      <View className="flex-row gap-x-2">
        <View className="flex-1 items-center gap-y-2 rounded-md border border-foreground/15 bg-secondary/40 p-2">
          <View>
            <View className="relative rounded-full border-2 border-foreground">
              <Avatar className="rounded-full border-2 border-transparent" alt="Tip's Avatar">
                <AvatarFallback>
                  <Text>TIP</Text>
                </AvatarFallback>
              </Avatar>
              <View className="absolute inset-0 flex h-full w-full items-center justify-center rounded-full bg-muted/80 active:bg-muted/90">
                <Spinner size={3} />
              </View>
            </View>
          </View>
          <Text className="text-center">Attempting connection to realtime sync</Text>
        </View>

        <View className="flex-1 items-center gap-y-2 rounded-md border border-foreground/15 bg-secondary/40 p-2">
          <View>
            <View className="relative rounded-full border-2 border-green-500">
              <Avatar className="rounded-full border-2 border-transparent" alt="Tip's Avatar">
                <AvatarFallback>
                  <Text>TIP</Text>
                </AvatarFallback>
              </Avatar>
            </View>
          </View>

          <Text className="text-center">Connected and waiting for realtime updates</Text>
        </View>
      </View>

      <View className="flex-row gap-x-2">
        <View className="flex-1 items-center gap-y-2 rounded-md border border-foreground/15 bg-secondary/40 p-2">
          <View>
            <View className="relative rounded-full border-2 border-red-500">
              <Avatar className="rounded-full border-2 border-transparent" alt="Tip's Avatar">
                <AvatarFallback>
                  <Text>TIP</Text>
                </AvatarFallback>
              </Avatar>
            </View>
          </View>

          <Text className="text-center">Error connecting to realtime sync</Text>
        </View>

        <View className="flex-1 items-center gap-y-2 rounded-md border border-foreground/15 bg-secondary/40 p-2">
          <View>
            <View className="relative rounded-full border-2 border-primary">
              <Avatar className="rounded-full border-2 border-transparent" alt="Tip's Avatar">
                <AvatarFallback>
                  <Text>TIP</Text>
                </AvatarFallback>
              </Avatar>

              <View className="absolute -bottom-1 -right-1 min-w-5 max-w-7 rounded-full bg-primary p-0.5">
                <Text className="text-center text-xs">99</Text>
              </View>
            </View>
          </View>

          <Text className="text-center">Processing 99 realtime updates</Text>
        </View>
      </View>
    </>
  );
};

const AccountList = () => {
  const accounts = api.accounts.list.useQuery();

  if (accounts.data) {
    return (
      <>
        {accounts.data.length === 0 ? (
          <View className="mb-4 flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted p-8">
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
    <View className="mb-4 flex items-center justify-center rounded-md border border-foreground/15 p-12">
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
        'native:h-20 h-16 flex-row gap-x-3 rounded-none border-foreground/15 bg-secondary/40',
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
