import { Spinner } from '../spinner';
import * as React from 'react';
import { TextInput, type TextInputProps, View } from 'react-native';

import { cn } from '~/lib/utils';

const Input = ({
  ref,
  className,
  placeholderClassName,
  isLoading = false,
  ...props
}: TextInputProps & {
  ref?: React.RefObject<React.ComponentRef<typeof TextInput>>;
  isLoading?: boolean;
}) => {
  return (
    <View className="border border-input rounded-md flex flex-row items-center justify-center bg-background">
      <TextInput
        ref={ref}
        className={cn(
          'flex-1 web:flex web:w-full bg-background px-3 web:py-2 text-base lg:text-sm native:text-lg text-foreground placeholder:text-muted-foreground web:ring-offset-background file:border-0 file:bg-transparent file:font-medium web:focus-visible:outline-none web:focus-visible:ring-2 web:focus-visible:ring-ring web:focus-visible:ring-offset-2 font-normal',
          props.editable === false && 'opacity-50 web:cursor-not-allowed',
          isLoading ? 'rounded-l-md' : 'rounded-md',
          className
        )}
        placeholderClassName={cn('text-muted-foreground', placeholderClassName)}
        {...props}
      />
      {isLoading && <Spinner className="px-3" size={6} />}
    </View>
  );
};

Input.displayName = 'Input';

export { Input };
