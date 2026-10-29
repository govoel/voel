import { Data, Option } from 'effect';
import { useReducer } from 'react';

type SheetSelectionEvent<Selection extends string> = Data.TaggedEnum<{
  Open: { readonly selection: Selection };
  // oxlint-disable-next-line typescript/no-generated-empty-object-type -- Dismissed intentionally has no payload.
  Dismissed: Record<never, never>;
}>;

/** An opening keeps its selection until native dismissal has completed. */
export const useSheetSelection = <Selection extends string>() => {
  const Event = Data.taggedEnum<SheetSelectionEvent<Selection>>();
  const [selected, dispatch] = useReducer(
    (current: Option.Option<Selection>, event: SheetSelectionEvent<Selection>) =>
      Event.$match(event, {
        Open: ({ selection }) => Option.orElse(current, () => Option.some(selection)),
        Dismissed: () => Option.none<Selection>(),
      }),
    Option.none<Selection>()
  );
  return [selected, dispatch, Event] as const;
};
