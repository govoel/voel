import { BottomSheet, Button, Host, List, Section, VStack, ZStack } from '@expo/ui/swift-ui';
import { disabled, frame, headerProminence, padding } from '@expo/ui/swift-ui/modifiers';
import { useState } from 'react';
import type { ComponentType, PropsWithChildren, ReactNode } from 'react';

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
      {presented ? (
        <Content
          {...contentProps}
          onSuccess={() => {
            setPresented(false);
          }}
        />
      ) : null}
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
