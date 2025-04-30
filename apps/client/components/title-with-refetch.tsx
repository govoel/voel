import { Button } from './ui/button';
import { Large } from './ui/typography';
import { DefaultError, QueryObserverBaseResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { RefreshCw } from '~/lib/icons/RefreshCw';
import { cn } from '~/lib/utils';

export function TitleWithRefetch<TData = unknown, TError = DefaultError>({
  className,
  refetch,
  isLoading,
  children,
}: {
  className?: string;
  refetch: QueryObserverBaseResult<TData, TError>['refetch'] | (() => void);
  isLoading: QueryObserverBaseResult<TData, TError>['isLoading'];
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
        disabled={isLoading}>
        <RefreshCw className="text-foreground" size="14" />
      </Button>
    </View>
  );
}
