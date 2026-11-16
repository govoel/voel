import type { ComponentType } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

/** An editable list of strings. Each entry renders as a `TextField` bound to its own sub-field. */
export type TextListFieldComponent = ComponentType<{
  label: string;
  purpose: TextInputPurpose;
  placeholder: string;
}>;

export declare const TextListField: TextListFieldComponent;
