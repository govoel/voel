// To avoid this require cycle: modules/voel-audio/index.ts -> modules/voel-audio/src/VoelAudioModule.ts -> lib/api/feeds/index.ts -> modules/voel-audio/index.ts
export const feedsQueryKeys = {
  all: (instanceId: string) => ['instance', instanceId, 'feeds'] as const,
  getAvailableOffline: (instanceId: string) =>
    [...feedsQueryKeys.all(instanceId), 'availableOffline'] as const,
  getContinueListening: (instanceId: string) =>
    [...feedsQueryKeys.all(instanceId), 'continueListening'] as const,
};
