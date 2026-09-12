import { Button, Column, LazyColumn, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import { AndroidAccountsSheet } from '#src/components/android-sheet/index.tsx';
import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const Panel = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <Column verticalArrangement={{ spacedBy: Spacing.two }} modifiers={[fillMaxWidth()]}>
    <Text variant="h4">{title}</Text>
    {children}
  </Column>
);
export const Action = ({
  title,
  onPress,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
}) => (
  <Button onClick={onPress} enabled={!busy} modifiers={[fillMaxWidth()]}>
    <Text>{title}</Text>
  </Button>
);
export const Page = ({ children }: PropsWithChildren) => (
  <AndroidAccountsSheet>
    <LazyColumn
      verticalArrangement={{ spacedBy: Spacing.three }}
      contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}>
      {children}
    </LazyColumn>
  </AndroidAccountsSheet>
);

export const EditorSheet = ({
  title,
  children,
}: {
  title: string;
  children: (props: { onSuccess: () => void | Promise<void> }) => ReactNode;
}) => {
  const [presented, setPresented] = useState(false);
  const [sheet, setSheet] = useState<ModalBottomSheetRef | null>(null);
  return (
    <>
      <Action
        title={title}
        onPress={() => {
          setPresented(true);
        }}
      />
      {presented ? (
        <ModalBottomSheet
          ref={setSheet}
          skipPartiallyExpanded
          onDismissRequest={() => {
            setPresented(false);
          }}>
          {children({
            onSuccess: async () => {
              await sheet?.hide();
              setPresented(false);
            },
          })}
        </ModalBottomSheet>
      ) : null}
    </>
  );
};

export const FormLayout = ({
  title,
  children,
  footer,
}: PropsWithChildren<{
  title: string;
  footer: ReactNode;
}>) => (
  <LazyColumn
    contentPadding={{ start: Spacing.three, end: Spacing.three, bottom: Spacing.three }}
    verticalArrangement={{ spacedBy: Spacing.two }}>
    <Text variant="h3">{title}</Text>
    {children}
    <Column modifiers={[fillMaxWidth(), padding(0, Spacing.two, 0, 0)]}>{footer}</Column>
  </LazyColumn>
);
