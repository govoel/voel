import { Host } from '@expo/ui/swift-ui';
import { Match, Result } from 'effect';
import { Stack } from 'expo-router';
import { useReducer } from 'react';

import { LibraryParams } from '#src/app/accounts/(selected)/server/libraries/[id]/index.ts';
import { DismissTo } from '#src/components/dismiss-to/index.tsx';
import { InvalidLinkScreen } from '#src/components/invalid-link-screen';
import { LibraryForm } from '#src/domains/library/components/library-form';
import { useRouteParams } from '#src/hooks/use-route-params.ts';

const EditLibrary = ({ id }: typeof LibraryParams.Type) => {
  const [saved, librarySaved] = useReducer(() => true, false);
  if (saved) {
    return <DismissTo href={{ pathname: '/accounts/server/libraries/[id]', params: { id } }} />;
  }
  return (
    <>
      <Stack.Screen.Title>Edit Library</Stack.Screen.Title>
      <Host style={{ flex: 1 }}>
        <LibraryForm
          target={{ _tag: 'Edit', id }}
          submitLabel="Save changes"
          onSaved={librarySaved}
        />
      </Host>
    </>
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
