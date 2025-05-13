import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { type ComponentProps, type ReactNode, useCallback } from 'react';

export const NativewindBottomSheetModal = cssInterop(BottomSheetModal, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});

export const NativewindBottomSheetBackdrop = cssInterop(BottomSheetBackdrop, {
  className: 'style',
});

const BottomSheet = ({
  ref,
  children,
  ...props
}: {
  ref?: React.RefObject<BottomSheetModal | null>;
  children: ReactNode;
} & ComponentProps<typeof BottomSheetModal>) => {
  const renderBackdrop = useCallback(
    (props: Exclude<BottomSheetBackdropProps, 'disappearsOnIndex' | 'appearsOnIndex'>) => (
      <NativewindBottomSheetBackdrop
        {...props}
        className="bg-secondary/70"
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );
  return (
    <NativewindBottomSheetModal
      ref={ref}
      {...props}
      backdropComponent={renderBackdrop}
      backgroundClassName="bg-background"
      handleIndicatorClassName="bg-foreground">
      <BottomSheetScrollView>{children}</BottomSheetScrollView>
    </NativewindBottomSheetModal>
  );
};
BottomSheet.displayName = 'BottomSheet';

export { BottomSheet };
