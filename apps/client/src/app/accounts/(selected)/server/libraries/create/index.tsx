import { LibraryEditorScreen } from '#src/components/library-editor';
import { LibraryEditorSource } from '#src/domains/library/editor.ts';

const source = LibraryEditorSource.Create();

export default function CreateLibraryScreen() {
  return <LibraryEditorScreen source={source} />;
}
