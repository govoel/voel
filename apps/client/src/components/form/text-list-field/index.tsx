import type { ComponentType } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

/**
 * An editable list of strings. Each entry renders as a `TextField` bound to its own sub-field.
 * On iOS it's a `Section` of its own, so place it in a `FormLayout`'s `sections`. Entries delete
 * with a swipe or, when the list is in edit mode, with the delete buttons it shows instead.
 */
export type TextListFieldComponent = ComponentType<{
  label: string;
  purpose: TextInputPurpose;
  placeholder: string;
}>;

export declare const TextListField: TextListFieldComponent;
