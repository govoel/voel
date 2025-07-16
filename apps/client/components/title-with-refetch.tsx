import type { DefaultError, QueryObserverBaseResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { RefreshCw } from '~/components/icons/RefreshCw';
import { Button } from '~/components/ui/button';
import { Large } from '~/components/ui/typography';

import { cn } from '~/lib/utils';

export function TitleWithRefetch<TData = unknown, TError = DefaultError>({
  className,
  refetch,
  isFetching,
  children,
}: {
  className?: string;
  refetch: QueryObserverBaseResult<TData, TError>['refetch'] | (() => void);
  isFetching: QueryObserverBaseResult<TData, TError>['isFetching'];
  children: ReactNode;
}) {
  return (
    <View className={cn('flex flex-row justify-between items-center', className)}>
      <Large className="flex-1">{children}</Large>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onPress={() => {
          refetch();
        }}
        disabled={isFetching}>
        <RefreshCw className="text-foreground" size="14" />
      </Button>
    </View>
  );
}
