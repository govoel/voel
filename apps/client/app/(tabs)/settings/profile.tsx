import { useSelector } from '@xstate/store/react';
import React from 'react';
import { Text } from 'react-native';

import { Spinner } from '~/components/spinner';
import { Button } from '~/components/ui/button';
import { Large } from '~/components/ui/typography';

import { instanceStore, useAuthSession } from '~/lib/stores/instance';

export default function ProfileSettingsScreen() {
  const authClient = useSelector(instanceStore, (state) => state.context.authInstance);
  const { data, isPending, error, refetch } = useAuthSession(authClient);

  if (!isPending) {
    return <Spinner size={15} />;
  }

  if (error) {
    return (
      <>
        <Large>Error while loading profile</Large>
        <Text>{error.message}</Text>
        <Button onPress={refetch}>Retry</Button>
      </>
    );
  }
}
