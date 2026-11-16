import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { Match, Result } from 'effect';
import { useReducer, useRef } from 'react';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { DismissTo } from '#src/components/dismiss-to/index.tsx';
import { InvalidLinkScreen } from '#src/components/invalid-link-screen';
import { LibraryForm } from '#src/domains/library/components/library-form';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const sheetRef = useRef<ModalBottomSheetRef>(null);
  const [saved, librarySaved] = useReducer(() => true, false);
  if (saved) {
    return <DismissTo href={{ pathname: '/accounts/server/libraries/[id]', params: { id } }} />;
  }
  return (
    <AndroidAccountsSheet ref={sheetRef}>
      <LibraryForm
        target={{ _tag: 'Edit', id }}
        title="Edit Library"
        submitLabel="Save"
        onSaved={async () => {
          const sheet = sheetRef.current;
          if (sheet === null) {
            return;
          }
          await sheet.hide();
          librarySaved();
        }}
      />
    </AndroidAccountsSheet>
  );
};

export default function EditLibraryScreen() {
  const params = useRouteParams(LibraryParams);
  return Result.match(params, {
    onFailure: (error) =>
      Match.value(error).pipe(Match.tagsExhaustive({ SchemaError: () => <InvalidLinkScreen /> })),
    onSuccess: ({ id }) => <EditLibrary key={id} id={id} />,
  });
}
