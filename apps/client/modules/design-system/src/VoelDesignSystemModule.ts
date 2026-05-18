import { NativeModule, requireNativeModule } from 'expo';

declare class VoelDesignSystemModule extends NativeModule<{}> {
}

export default requireNativeModule<VoelDesignSystemModule>('VoelDesignSystem');
