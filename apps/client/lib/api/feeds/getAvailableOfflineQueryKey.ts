// To avoid this require cycle: modules/voel-audio/index.ts -> modules/voel-audio/src/VoelAudioModule.ts -> lib/api/feeds/index.ts -> modules/voel-audio/index.ts
export const getAvailableOfflineQueryKey = ['instance', 'feeds', 'getAvailableOffline'];
