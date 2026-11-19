import type { ComponentType } from 'react';

import type { Library } from '@repo/spec-api/domains/library/schema.ts';

import type { LibraryFormTarget } from '#src/domains/library/components/library-form/target.ts';

export type LibraryFormComponent = ComponentType<{
  readonly target: LibraryFormTarget;
  readonly title?: string;
  readonly submitLabel: string;
  readonly onSaved: (library: {
    readonly id: typeof Library.fields.id.Type;
  }) => void | Promise<void>;
}>;

export declare const LibraryForm: LibraryFormComponent;
