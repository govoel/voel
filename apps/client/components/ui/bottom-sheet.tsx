import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { cssInterop } from 'nativewind';

export const NativewindBottomSheetModal = cssInterop(BottomSheetModal, {
  className: 'style',
  backgroundClassName: 'backgroundStyle',
  handleIndicatorClassName: 'handleIndicatorStyle',
});
