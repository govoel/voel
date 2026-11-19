import type { ComponentType } from 'react';

import type { TextInputPurpose } from '#src/components/form/input-presets/index.ts';

export type TextListFieldComponent = ComponentType<{
  label: string;
  purpose: TextInputPurpose;
  placeholder: string;
}>;

export declare const TextListField: TextListFieldComponent;
