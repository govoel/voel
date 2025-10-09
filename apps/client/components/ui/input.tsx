import { Spinner } from '../spinner';
import { BottomSheetTextInput, useBottomSheetInternal } from '@gorhom/bottom-sheet';
import * as React from 'react';
import { Platform, TextInput, type TextInputProps, View } from 'react-native';

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
  const bsInternal = useBottomSheetInternal(true);

  const InputComponent = bsInternal ? BottomSheetTextInput : TextInput;

  return (
    <View className="flex flex-row items-center justify-center rounded-md">
      <InputComponent
        className={cn(
          'flex h-10 w-full min-w-0 flex-1 flex-row items-center border-input bg-background px-3 py-1 text-base font-normal leading-5 text-foreground shadow-sm shadow-black/5 sm:h-9',
          props.editable === false &&
            cn(
              'opacity-50',
              Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
            ),
          isLoading ? 'rounded-l-md border border-r-0' : 'rounded-md border border-r',
          Platform.select({
            web: cn(
              'outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground md:text-sm',
              'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
              'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
            ),
            native: 'placeholder:text-muted-foreground/50',
          }),
          className
        )}
        {...props}
      />
      {isLoading && (
        <Spinner
          className="flex h-full items-center justify-center rounded-r-md border border-l-0 border-input px-3"
          size={6}
        />
      )}
    </View>
  );
};

Input.displayName = 'Input';

export { Input };
