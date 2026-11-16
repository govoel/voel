import type { ComponentType } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

export type TextListFieldComponent = ComponentType<{
  label: string;
  placeholder: string;
  purpose: TextInputPurpose;
}>;

export declare const TextListField: TextListFieldComponent;
