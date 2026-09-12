import { Button, Column, LazyColumn, ModalBottomSheet } from '@expo/ui/jetpack-compose';
import type { ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, padding } from '@expo/ui/jetpack-compose/modifiers';
import { useRef, useState } from 'react';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

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

export const EditorSheet = <Props extends object>({
  title,
  children: Content,
  contentProps,
}: {
  title: string;
  children: ComponentType<Props & { onSuccess: () => void | Promise<void> }>;
  contentProps: Props;
}) => {
  const [presented, setPresented] = useState(false);
  const sheet = useRef<ModalBottomSheetRef>(null);
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
          ref={sheet}
          skipPartiallyExpanded
          onDismissRequest={() => {
            setPresented(false);
          }}>
          <Content
            {...contentProps}
            onSuccess={async () => {
              await sheet.current?.hide();
              setPresented(false);
            }}
          />
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
