import type { ComponentType } from 'react';

export type LibraryEditorUnavailableComponent = ComponentType<{ readonly mode: 'create' | 'edit' }>;
export declare const LibraryEditorUnavailable: LibraryEditorUnavailableComponent;
