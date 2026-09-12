import { BottomSheet, Button, Host, List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import type { PropsWithChildren, ReactNode } from 'react';

import { Text } from '#src/components/text';
import { Spacing } from '#src/constants/theme.ts';

export const Panel = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <Section title={title}>{children}</Section>
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
  <Button onPress={onPress} modifiers={[disabled(busy)]}>
    <Text>{title}</Text>
  </Button>
);
export const Page = ({ children }: PropsWithChildren) => (
  <Host style={{ flex: 1 }}>
    <List modifiers={[headerProminence('increased'), frame({ maxHeight: Infinity })]}>
      {children}
    </List>
  </Host>
);

/** Keep the trigger in place and discard sensitive form state on dismissal. */
export const EditorSheet = ({
  title,
  children,
}: {
  title: string;
  children: (props: { onSuccess: () => void | Promise<void> }) => ReactNode;
}) => {
  const [presented, setPresented] = useState(false);
  return (
    <BottomSheet
      isPresented={presented}
      onIsPresentedChange={setPresented}
      anchor={
        <Action
          title={title}
          onPress={() => {
            setPresented(true);
          }}
        />
      }>
      {presented
        ? children({
            onSuccess: () => {
              setPresented(false);
            },
          })
        : null}
    </BottomSheet>
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
  <ZStack alignment="bottom">
    <List
      modifiers={[
        headerProminence('increased'),
        frame({ maxHeight: Infinity }),
        padding({ bottom: 80 }),
      ]}>
      <Section
        header={
          <Text variant="h4" modifiers={[padding({ top: Spacing.three })]}>
            {title}
          </Text>
        }>
        {children}
      </Section>
    </List>
    <VStack modifiers={[padding({ horizontal: Spacing.three, bottom: Spacing.three })]}>
      {footer}
    </VStack>
  </ZStack>
);
