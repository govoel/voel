import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { type ReactNode, useCallback } from 'react';

export const NativewindBottomSheetModal = cssInterop(BottomSheetModal, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});

const BottomSheet = ({
  ref,
  children,
}: { children: ReactNode } & {
  ref?: React.RefObject<BottomSheetModal | null>;
}) => {
  const renderBackdrop = useCallback(
    (props: Exclude<BottomSheetBackdropProps, 'disappearsOnIndex' | 'appearsOnIndex'>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    []
  );
  return (
    <NativewindBottomSheetModal
      ref={ref}
      backdropComponent={renderBackdrop}
      backgroundClassName="bg-background"
      handleIndicatorClassName="bg-foreground">
      <BottomSheetScrollView>{children}</BottomSheetScrollView>
    </NativewindBottomSheetModal>
  );
};
BottomSheet.displayName = 'BottomSheet';

export { BottomSheet };
