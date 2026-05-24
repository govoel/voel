import type { CommonViewModifierProps } from '@expo/ui/swift-ui';
import { requireNativeView } from 'expo';

export type IconProps = CommonViewModifierProps & {
  systemName: string;
};

const NativeIcon: React.ComponentType<IconProps> = requireNativeView(
  'VoelDesignSystem',
  'VoelIcon'
);

export const Icon = (props: IconProps) => <NativeIcon {...props} />;
