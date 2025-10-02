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
    <View className="rounded-md flex flex-row items-center justify-center">
      <InputComponent
        className={cn(
          'flex-1 border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9 font-normal',
          props.editable === false &&
            cn(
              'opacity-50',
              Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
            ),
          isLoading ? 'rounded-l-md border border-r-0' : 'border rounded-md',
          Platform.select({
            web: cn(
              'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
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
          className="px-3 border border-l-0 border-input h-full rounded-r-md flex items-center justify-center"
          size={6}
        />
      )}
    </View>
  );
};

Input.displayName = 'Input';

export { Input };
