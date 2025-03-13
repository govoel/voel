import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { forwardRef, useCallback } from 'react';

export const NativewindBottomSheetModal = cssInterop(BottomSheetModal, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});

const BottomSheet = forwardRef<BottomSheetModal, { children: React.ReactNode }>(
  ({ children }, ref) => {
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
  }
);
BottomSheet.displayName = 'BottomSheet';

export default BottomSheet;
