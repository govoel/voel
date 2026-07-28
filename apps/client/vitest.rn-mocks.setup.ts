import { vi } from 'vitest';

vi.mock('react-native', () => ({
  AppState: { addEventListener: () => ({ remove: () => void 0 }) },
  Platform: { OS: 'ios' },
}));
vi.mock('expo-constants', () => ({
  default: { expoConfig: { scheme: 'voel' }, platform: { scheme: 'voel' } },
}));
vi.mock('expo-linking', () => ({
  createURL: (path: string) => `voel://${path}`,
}));
vi.mock('expo-network', () => ({
  addNetworkStateListener: () => ({ remove: () => void 0 }),
}));
