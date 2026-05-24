export type ViewEvent<Name extends string, Data> = Record<
  Name,
  Data extends object
    ? ((event: { nativeEvent: Data }) => void) | undefined
    : (() => void) | undefined
>;

interface ModifierConfig {
  $type: string;
  [key: string]: unknown;
  eventListener?: (args: unknown) => void;
}

interface GlobalEvent {
  onGlobalEvent: (event: { nativeEvent: GlobalEventPayload }) => void;
}

type GlobalEventPayload = Record<string, Record<string, unknown>>;

export const createViewModifierEventListener = (modifiers: ModifierConfig[]) => {
  const eventListeners = new Map<string, (args: unknown) => void>();

  for (const modifier of modifiers) {
    if (modifier.eventListener) {
      eventListeners.set(modifier.$type, modifier.eventListener);
    }
  }

  return {
    onGlobalEvent: ({ nativeEvent }) => {
      for (const [eventName, params] of Object.entries(nativeEvent)) {
        eventListeners.get(eventName)?.(params);
      }
    },
  } satisfies GlobalEvent;
};
