import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
} from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';
import { type ComponentProps, type ReactNode, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { top, bottom } = useSafeAreaInsets();

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
    // @ts-expect-error cssInterop has some broken types
    <NativewindBottomSheetModal
      ref={ref}
      {...props}
      detached
      className="mx-3"
      backdropComponent={renderBackdrop}
      backgroundClassName="bg-background"
      handleIndicatorClassName="bg-foreground"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      topInset={top}
      bottomInset={bottom}>
      {children}
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
  const { top, bottom } = useSafeAreaInsets();

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
    // @ts-expect-error cssInterop has some broken types
    <NativewindBottomSheet
      ref={ref}
      {...props}
      detached
      className="mx-3"
      backdropComponent={renderBackdrop}
      backgroundClassName="bg-background"
      handleIndicatorClassName="bg-foreground"
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      topInset={top}
      bottomInset={bottom}>
      {children}
    </NativewindBottomSheet>
  );
}

export { BottomSheetModalImpl as BottomSheetModal, BottomSheetImpl as BottomSheet };
