import { NativeModule, requireNativeModule } from 'expo';

declare class VoelDesignSystemModule extends NativeModule<Record<never, never>> {}

export default requireNativeModule<VoelDesignSystemModule>('VoelDesignSystem');
