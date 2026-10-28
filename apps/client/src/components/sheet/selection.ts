import { Match, Option } from 'effect';
import { useReducer } from 'react';

/** An opening keeps its selection until native dismissal has completed. */
export const useSheetSelection = <Selection extends string>() =>
  useReducer(
    (
      current: Option.Option<Selection>,
      event:
        | { readonly _tag: 'Open'; readonly selection: Selection }
        | { readonly _tag: 'Dismissed' }
    ) =>
      Match.value(event).pipe(
        Match.tag('Open', ({ selection }) => Option.orElse(current, () => Option.some(selection))),
        Match.tag('Dismissed', () => Option.none<Selection>()),
        Match.exhaustive
      ),
    Option.none<Selection>()
  );
