import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { type ComponentProps, type ReactNode, useCallback } from 'react';

const NativewindBottomSheetModal = cssInterop(BottomSheetModal, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});

const NativewindBottomSheetBackdrop = cssInterop(BottomSheetBackdrop, {
  className: 'style',
});

function BottomSheetModalImpl({
  ref,
  children,
  ...props
}: {
  ref?: React.RefObject<BottomSheetModal | null>;
  children: ReactNode;
} & ComponentProps<typeof BottomSheetModal>) {
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
}

const NativewindBottomSheet = cssInterop(BottomSheet, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});

function BottomSheetImpl({
  ref,
  children,
  ...props
}: {
  ref?: React.RefObject<BottomSheetModal | null>;
  children: ReactNode;
} & ComponentProps<typeof BottomSheetModal>) {
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
    <NativewindBottomSheet
      ref={ref}
      {...props}
      backdropComponent={renderBackdrop}
      backgroundClassName="bg-background"
      handleIndicatorClassName="bg-foreground">
      <BottomSheetScrollView>{children}</BottomSheetScrollView>
    </NativewindBottomSheet>
  );
}

export { BottomSheetModalImpl as BottomSheetModal, BottomSheetImpl as BottomSheet };
